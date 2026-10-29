import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useAppSettings } from '../app/settings'
import { platform } from '../platform'
import { syncNow, useSyncClient } from '../sync/auto'
import { formatCode } from '../sync/crypto'
import { beginPairing, endPairing, unlinkGuest, useSyncHost } from '../sync/host'
import { useLinks } from '../sync/links'
import { describeResult, pairWith, parseManual, parseQr, qrText, SYNC_PORT, type SyncTarget } from '../sync/session'
import { Toggle } from '../ui/controls'
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

/** La PC: sus equipos vinculados, el código para vincular otro y quedarse en la bandeja. */
function HostCard() {
  const guests = useLinks(s => s.guests)
  const { listening, hosts, port, pairing, last, error } = useSyncHost()
  const keepInTray = useAppSettings(s => s.keepInTray)
  const setApp = useAppSettings(s => s.set)
  const [asking, setAsking] = useState<string | null>(null)

  return (
    <section className="sync-card">
      <h3>
        <Icon name="wifi" size={18} /> Esta PC
      </h3>
      {guests.length > 0 ? (
        <>
          <p className="sheet-note">
            {listening
              ? 'Atenta a tus equipos: se sincronizan solos al abrir Mitzi, al volver a ella y al cerrar un libro, si están en la misma red Wi-Fi.'
              : 'Abriendo…'}
          </p>
          <ul className="folder-list sync-links">
            {guests.map(g => (
              <li key={g.id}>
                <span className="collection-name">
                  <strong>{g.label}</strong>
                  <small>{g.lastSync ? `Sincronizado ${ago(g.lastSync)}` : 'Vinculado'}</small>
                </span>
                <button
                  className="ghost-button small settings-danger"
                  data-state={asking === g.id ? 'ask' : 'idle'}
                  onClick={() => (asking === g.id ? unlinkGuest(g.id) : setAsking(g.id))}
                  onBlur={() => setAsking(null)}
                >
                  {asking === g.id ? '¿Desvincular?' : 'Desvincular'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !pairing && (
          <p className="sheet-note">
            Vincula tu teléfono o tablet una sola vez: desde ahí se sincronizan solos cuando estén en la misma red Wi-Fi y Mitzi esté
            abierta en esta PC.
          </p>
        )
      )}

      {pairing ? (
        <>
          <div className="sync-host">
            <QrCode text={qrText({ hosts, port, code: pairing.code })} />
            <div className="sync-manual">
              <p className="sheet-note">En el teléfono o la tablet: Configuración › Sincronizar › Escanear código. O escribe:</p>
              <dl>
                <dt>Dirección</dt>
                <dd>
                  <code>
                    {hosts[0] ?? '—'}
                    {port !== SYNC_PORT ? `:${port}` : ''}
                  </code>
                </dd>
                <dt>Código</dt>
                <dd>
                  <code className="sync-code">{formatCode(pairing.code)}</code>
                </dd>
              </dl>
              {hosts.length > 1 && <p className="sync-hint">Si no conecta, prueba con: {hosts.slice(1).join(' · ')}</p>}
            </div>
          </div>
          <p className="sync-hint">
            Solo se escanea una vez por equipo. El código deja de servir a los 10 minutos. Si Windows pregunta, permite que Mitzi use las
            redes privadas; si tu Wi-Fi está como «red pública» en Windows, el teléfono no podrá conectarse.
          </p>
          <button className="ghost-button small" onClick={endPairing}>
            Cancelar
          </button>
        </>
      ) : (
        <div className="settings-actions">
          <button className="read-button" onClick={() => void beginPairing()}>
            <Icon name="plus" size={18} /> Vincular un equipo
          </button>
        </div>
      )}
      {error && <p className="sync-error">{error}</p>}
      {last && <p className={last.ok ? 'sync-status' : 'sync-error'}>{last.text}</p>}

      <Toggle
        label="Mantener Mitzi en la bandeja al cerrar"
        hint="Al cerrar la ventana, Mitzi sigue junto al reloj y tus equipos se pueden sincronizar"
        checked={keepInTray}
        onChange={v => setApp({ keepInTray: v })}
      />
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

/** El teléfono o la tablet: vincularse con la PC (escaneando o escribiendo el código) o, si ya está, su estado. */
function JoinCard() {
  const host = useLinks(s => s.host)
  const setHost = useLinks(s => s.setHost)
  const { busy, last } = useSyncClient()
  const [mode, setMode] = useState<'idle' | 'scan' | 'type'>('idle')
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const canScan = !!navigator.mediaDevices?.getUserMedia

  const run = async (target: SyncTarget) => {
    setMode('idle')
    setPairing(true)
    setStatus({ ok: true, text: 'Vinculando…' })
    try {
      const done = await pairWith(target)
      setStatus({ ok: true, text: `Listo: vinculado con ${done.label}. ${describeResult(done.result)}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({
        ok: false,
        text: /coincide/.test(message)
          ? 'El código no coincide. Revísalo en la PC.'
          : `No se pudo conectar con la PC (${message}). ¿Están en la misma red Wi-Fi y la PC muestra el código?`,
      })
    } finally {
      setPairing(false)
    }
  }
  const found = useRef(run)
  found.current = run
  const onFound = useMemo(() => (t: SyncTarget) => void found.current(t), [])
  const manual = parseManual(address, code)

  if (host)
    return (
      <section className="sync-card">
        <h3>
          <Icon name="sync" size={18} /> Vinculado con {host.label}
        </h3>
        <p className="sheet-note">
          Se sincroniza solo al abrir Mitzi, al volver a ella y al cerrar un libro, cuando los dos están en la misma red Wi-Fi y Mitzi
          está abierta en la PC.
        </p>
        {host.lastSync && <p className="sync-hint">Última vez: {ago(host.lastSync)}.</p>}
        {(status ?? last) && <p className={(status ?? last)!.ok ? 'sync-status' : 'sync-error'}>{(status ?? last)!.text}</p>}
        <div className="settings-actions">
          <button
            className="read-button"
            disabled={busy}
            onClick={() => {
              setStatus(null)
              void syncNow('manual').catch(() => {})
            }}
          >
            <Icon name="sync" size={18} /> {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button
            className="ghost-button small settings-danger"
            data-state={asking ? 'ask' : 'idle'}
            onClick={() => (asking ? setHost(null) : setAsking(true))}
            onBlur={() => setAsking(false)}
          >
            {asking ? '¿Desvincular?' : 'Desvincular'}
          </button>
        </div>
      </section>
    )

  return (
    <section className="sync-card">
      <h3>
        <Icon name="sync" size={18} /> Vincular con una PC
      </h3>
      <p className="sheet-note">
        Una sola vez: en la PC abre Configuración › Sincronizar › Vincular un equipo, y escanea el código. Después se sincronizan solos.
      </p>
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
          <button className="read-button small" type="submit" disabled={!manual || pairing}>
            Vincular
          </button>
        </form>
      )}
      {mode === 'idle' && (
        <div className="settings-actions">
          {canScan && (
            <button className="read-button" onClick={() => setMode('scan')} disabled={pairing}>
              <Icon name="camera" size={18} /> Escanear código
            </button>
          )}
          <button className="ghost-button" onClick={() => setMode('type')} disabled={pairing}>
            Escribir el código
          </button>
        </div>
      )}
      {status && <p className={status.ok ? 'sync-status' : 'sync-error'}>{status.text}</p>}
    </section>
  )
}

/** En Configuración: vincular equipos y ver cómo va la sincronización. */
export function SyncContent() {
  const guests = useLinks(s => s.guests.length)
  return (
    <div className="sync">
      <p className="sheet-note">
        Pasa tu avance, subrayados, notas, marcadores, colecciones y estadísticas entre tus equipos, directo por tu Wi-Fi: sin cuentas
        ni internet, y cifrado. La PC es el centro: el teléfono y la tablet se ponen al día a través de ella. Los libros no se copian;
        cada uno se reconoce aunque esté en otra carpeta.
      </p>
      {platform.syncServe && <HostCard />}
      {/* en la PC también se puede vincular con otra PC, pero casi nunca hace falta: va plegado */}
      {platform.syncRequest &&
        (platform.syncServe ? (
          !guests && (
            <details className="about-credits">
              <summary>¿Esta PC con otra PC?</summary>
              <JoinCard />
            </details>
          )
        ) : (
          <JoinCard />
        ))}
      {!platform.syncServe && !platform.syncRequest && <p className="sheet-note">En el navegador no se puede sincronizar.</p>}
    </div>
  )
}
