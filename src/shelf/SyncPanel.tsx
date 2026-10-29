import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { platform } from '../platform'
import { formatCode, newCode } from '../sync/crypto'
import { answerSync, describeResult, lastSync, parseManual, parseQr, qrText, SYNC_PORT, syncWith, type SyncTarget } from '../sync/session'
import { Icon } from '../ui/Icon'

/** El código QR dibujado como SVG (cuadritos negros sobre blanco, para que cualquier cámara lo lea). */
function QrCode({ text }: { text: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    return { d, size: n + 8 }
  }, [text])
  return (
    <svg className="sync-qr" viewBox={`0 0 ${path.size} ${path.size}`} shapeRendering="crispEdges" role="img" aria-label="Código QR para sincronizar">
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#15111f" />
    </svg>
  )
}

const ago = (at: number) => {
  const min = Math.round((Date.now() - at) / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(at).toLocaleDateString('es', { day: 'numeric', month: 'long' })
}

/** PC: abre el servidor y muestra el código hasta que el otro dispositivo se conecte. */
function HostCard() {
  const [target, setTarget] = useState<SyncTarget | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const code = useRef('')

  useEffect(() => () => void platform.syncStop?.(), [])

  const start = async () => {
    setError(null)
    setStatus(null)
    code.current = newCode()
    try {
      const { hosts, port } = await platform.syncServe!(SYNC_PORT, async body => {
        setStatus('Recibiendo…')
        try {
          const done = await answerSync(code.current, body)
          setStatus(`Listo: sincronizado con ${done.name === 'PC' ? 'otra PC' : 'tu Android'}. ${describeResult(done.result)}`)
          return done.reply
        } catch (e) {
          setStatus('Alguien intentó conectarse con un código equivocado.')
          throw e
        }
      })
      if (!hosts.length) throw new Error('Esta PC no está conectada a ninguna red')
      setTarget({ hosts, port, code: code.current })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const stop = () => {
    void platform.syncStop?.()
    setTarget(null)
    setStatus(null)
  }

  if (!target)
    return (
      <section className="sync-card">
        <h3>
          <Icon name="wifi" size={18} /> Esperar en esta PC
        </h3>
        <p className="sheet-note">Muestra un código para que tu teléfono o tablet lo escanee. Los dos deben estar en la misma red Wi-Fi.</p>
        <button className="read-button" onClick={start}>
          Mostrar código
        </button>
        {error && <p className="sync-error">{error}</p>}
      </section>
    )

  return (
    <section className="sync-card">
      <h3>
        <Icon name="wifi" size={18} /> Esperando en esta PC
      </h3>
      <div className="sync-host">
        <QrCode text={qrText(target)} />
        <div className="sync-manual">
          <p className="sheet-note">En el otro dispositivo: Configuración › Sincronizar › Escanear código. O escribe:</p>
          <dl>
            <dt>Dirección</dt>
            <dd>
              <code>
                {target.hosts[0]}
                {target.port !== SYNC_PORT ? `:${target.port}` : ''}
              </code>
            </dd>
            <dt>Código</dt>
            <dd>
              <code className="sync-code">{formatCode(target.code)}</code>
            </dd>
          </dl>
          {target.hosts.length > 1 && <p className="sync-hint">Si no conecta, prueba con: {target.hosts.slice(1).join(' · ')}</p>}
        </div>
      </div>
      {status && <p className="sync-status">{status}</p>}
      <p className="sync-hint">
        Si Windows pregunta, permite que Mitzi use las redes privadas. Si tu Wi-Fi está como «red pública» en Windows, el teléfono no
        podrá conectarse. El código deja de servir al cerrar esta pantalla o a los 10 minutos.
      </p>
      <button className="ghost-button small" onClick={stop}>
        Dejar de esperar
      </button>
    </section>
  )
}

/** Cámara + jsQR: busca un código de Mitzi en lo que ve la cámara. */
function Scanner({ onFound, onCancel }: { onFound(target: SyncTarget): void; onCancel(): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ;(async () => {
      try {
        // jsQR se carga solo cuando se abre la cámara
        const [{ default: jsQR }, media] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }),
        ])
        stream = media
        if (stopped || !video.current) return
        video.current.srcObject = media
        await video.current.play()
        const scan = () => {
          if (stopped) return
          const v = video.current
          if (v && ctx && v.videoWidth) {
            // a menor tamaño se decodifica más rápido; el código ocupa buena parte de la imagen
            const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight))
            canvas.width = Math.round(v.videoWidth * scale)
            canvas.height = Math.round(v.videoHeight * scale)
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
            const target = found && parseQr(found.data)
            if (target) {
              onFound(target)
              return
            }
          }
          timer = setTimeout(scan, 180)
        }
        scan()
      } catch (e) {
        const name = e instanceof DOMException ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Mitzi no tiene permiso para usar la cámara. Puedes darlo en los ajustes del teléfono, o escribir el código.'
            : 'No se pudo abrir la cámara. Escribe el código que muestra la PC.',
        )
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onFound])

  return (
    <div className="sync-scanner">
      {error ? (
        <p className="sync-error">{error}</p>
      ) : (
        <div className="sync-view">
          <video ref={video} playsInline muted />
          <span className="sync-frame" aria-hidden />
        </div>
      )}
      <button className="ghost-button small" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

/** Del lado que se conecta (teléfono, tablet u otra PC): escanear o escribir el código. */
function JoinCard() {
  const [mode, setMode] = useState<'idle' | 'scan' | 'type'>('idle')
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const canScan = !!navigator.mediaDevices?.getUserMedia

  const run = async (target: SyncTarget) => {
    setMode('idle')
    setBusy(true)
    setStatus({ ok: true, text: 'Sincronizando…' })
    try {
      const done = await syncWith(target)
      setStatus({ ok: true, text: `Listo: sincronizado con tu ${done.name}. ${describeResult(done.result)}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({
        ok: false,
        text: /coincide/.test(message)
          ? 'El código no coincide. Revísalo en la PC.'
          : `No se pudo conectar con la PC (${message}). ¿Están en la misma red Wi-Fi y la PC muestra el código?`,
      })
    } finally {
      setBusy(false)
    }
  }
  const found = useRef(run)
  found.current = run
  const onFound = useMemo(() => (t: SyncTarget) => void found.current(t), [])
  const manual = parseManual(address, code)

  return (
    <section className="sync-card">
      <h3>
        <Icon name="sync" size={18} /> Conectar con una PC
      </h3>
      <p className="sheet-note">En la PC abre Configuración › Sincronizar › Mostrar código.</p>
      {mode === 'scan' && <Scanner onFound={onFound} onCancel={() => setMode('idle')} />}
      {mode === 'type' && (
        <form
          className="sync-form"
          onSubmit={e => {
            e.preventDefault()
            if (manual) void run(manual)
          }}
        >
          <label>
            Dirección
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="192.168.1.20" inputMode="decimal" spellCheck={false} />
          </label>
          <label>
            Código
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="K7QM-3XPA" autoCapitalize="characters" spellCheck={false} />
          </label>
          <button className="read-button small" type="submit" disabled={!manual || busy}>
            Sincronizar
          </button>
        </form>
      )}
      {mode === 'idle' && (
        <div className="settings-actions">
          {canScan && (
            <button className="read-button" onClick={() => setMode('scan')} disabled={busy}>
              <Icon name="camera" size={18} /> Escanear código
            </button>
          )}
          <button className="ghost-button" onClick={() => setMode('type')} disabled={busy}>
            Escribir el código
          </button>
        </div>
      )}
      {status && <p className={status.ok ? 'sync-status' : 'sync-error'}>{status.text}</p>}
    </section>
  )
}

/** En Configuración: sincronizar con otro dispositivo de la misma red Wi-Fi. */
export function SyncContent() {
  const last = lastSync()
  return (
    <div className="sync">
      <p className="sheet-note">
        Pasa tu avance, subrayados, notas, marcadores, colecciones y estadísticas entre tus equipos, directo por tu Wi-Fi: sin
        cuentas ni internet, y cifrado con el código de la PC. Los libros no se copian; cada uno se reconoce aunque esté en otra
        carpeta.
      </p>
      {platform.syncServe && <HostCard />}
      {platform.syncRequest && <JoinCard />}
      {!platform.syncServe && !platform.syncRequest && <p className="sheet-note">En el navegador no se puede sincronizar.</p>}
      {last && (
        <p className="sync-hint">
          Última vez: {ago(last.at)}, con {last.name === 'PC' ? 'una PC' : 'un Android'}.
        </p>
      )}
    </div>
  )
}
