import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useAppSettings } from '../app/settings'
import { platform } from '../platform'
import { setStatus as setPeerStatus, syncNow, useSyncClient } from '../sync/auto'
import { formatCode } from '../sync/crypto'
import { beginPairing, endPairing, initHost, unlinkPeer, useSyncHost } from '../sync/host'
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

/** Los equipos vinculados, con cuándo se sincronizó cada uno; y «Sincronizar ahora». */
function PeersCard() {
  const peers = useLinks(s => s.peers)
  const { busy, status } = useSyncClient()
  const [asking, setAsking] = useState<string | null>(null)
  if (!peers.length) return null
  return (
    <section className="sync-card">
      <h3>
        <Icon name="sync" size={18} /> Tus equipos
      </h3>
      <ul className="folder-list sync-links">
        {peers.map(p => {
          const st = status[p.id]
          return (
            <li key={p.id}>
              <span className="collection-name">
                <strong>{p.label}</strong>
                <small className={st && !st.ok ? 'sync-error' : undefined}>
                  {st && !st.ok ? st.text : p.lastSync ? `Sincronizado ${ago(p.lastSync)}` : 'Vinculado'}
                </small>
              </span>
              <button
                className="ghost-button small settings-danger"
                data-state={asking === p.id ? 'ask' : 'idle'}
                onClick={() => (asking === p.id ? unlinkPeer(p.id) : setAsking(p.id))}
                onBlur={() => setAsking(null)}
              >
                {asking === p.id ? '¿Desvincular?' : 'Desvincular'}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="settings-actions">
        <button className="read-button" disabled={busy} onClick={() => void syncNow('manual')}>
          <Icon name="sync" size={18} /> {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>
    </section>
  )
}

/** Vincular otro equipo: mostrar el código de este, o escanear (o escribir) el del otro. */
function LinkCard() {
  const { hosts, port, pairing, last, error } = useSyncHost()
  const [mode, setMode] = useState<'idle' | 'scan' | 'type'>('idle')
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [linking, setLinking] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const canScan = !!navigator.mediaDevices?.getUserMedia && !!platform.syncRequest

  const run = async (target: SyncTarget) => {
    setMode('idle')
    setLinking(true)
    setStatus({ ok: true, text: 'Vinculando…' })
    try {
      const done = await pairWith(target)
      if (done.peerId) setPeerStatus(done.peerId, { ok: true, text: describeResult(done.result), at: Date.now() })
      // ya hay un equipo vinculado: este también empieza a atender
      initHost()
      setStatus({ ok: true, text: `Listo: vinculado con ${done.label}. ${describeResult(done.result)}` })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({
        ok: false,
        text: /coincide/.test(message)
          ? 'El código no coincide. Revísalo en el otro equipo.'
          : `No se pudo conectar (${message}). ¿Están en la misma red Wi-Fi y el otro muestra su código?`,
      })
    } finally {
      setLinking(false)
    }
  }
  const found = useRef(run)
  found.current = run
  const onFound = useMemo(() => (t: SyncTarget) => void found.current(t), [])
  const manual = parseManual(address, code)

  return (
    <section className="sync-card">
      <h3>
        <Icon name="plus" size={18} /> Vincular otro equipo
      </h3>
      {pairing ? (
        <>
          <div className="sync-host">
            <QrCode text={qrText({ hosts, port, code: pairing.code })} />
            <div className="sync-manual">
              <p className="sheet-note">En el otro equipo: Configuración › Sincronizar › Escanear código. O escribe:</p>
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
            Solo se escanea una vez por equipo y el código deja de servir a los 10 minutos.
            {platform.kind === 'electron' &&
              ' Si Windows pregunta, permite que Mitzi use las redes privadas; si tu Wi-Fi está como «red pública» en Windows, los otros equipos no podrán conectarse.'}
          </p>
          <button className="ghost-button small" onClick={endPairing}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <p className="sheet-note">
            Una sola vez por equipo: muestra el código en uno y escanéalo (o escríbelo) en el otro. Los dos deben estar en la misma red
            Wi-Fi.
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
              <button className="read-button small" type="submit" disabled={!manual || linking}>
                Vincular
              </button>
            </form>
          )}
          {mode === 'idle' && (
            <div className="settings-actions">
              {platform.syncServe && (
                <button className="read-button" onClick={() => void beginPairing()} disabled={linking}>
                  Mostrar mi código
                </button>
              )}
              {canScan && (
                <button className="ghost-button" onClick={() => setMode('scan')} disabled={linking}>
                  <Icon name="camera" size={18} /> Escanear código
                </button>
              )}
              {platform.syncRequest && (
                <button className="ghost-button" onClick={() => setMode('type')} disabled={linking}>
                  Escribir el código
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="sync-error">{error}</p>}
      {(status ?? last) && <p className={(status ?? last)!.ok ? 'sync-status' : 'sync-error'}>{(status ?? last)!.text}</p>}
    </section>
  )
}

/** PC: quedarse en la bandeja. Android: seguir atenta en segundo plano (apagado de inicio). */
function StayAwake() {
  const keepInTray = useAppSettings(s => s.keepInTray)
  const background = useAppSettings(s => s.backgroundSync)
  const setApp = useAppSettings(s => s.set)
  if (!platform.setTray && !platform.setBackgroundSync) return null
  return (
    <section className="sync-card">
      {platform.setTray && (
        <Toggle
          label="Mantener Mitzi en la bandeja al cerrar"
          hint="Al cerrar la ventana, Mitzi sigue junto al reloj y tus equipos se pueden sincronizar con esta PC"
          checked={keepInTray}
          onChange={v => setApp({ keepInTray: v })}
        />
      )}
      {platform.setBackgroundSync && (
        <>
          <Toggle
            label="Seguir atenta en segundo plano"
            hint="Tus otros equipos se pueden sincronizar con este aunque Mitzi no esté a la vista. Deja un aviso fijo y gasta un poco más de batería"
            checked={background}
            onChange={v => setApp({ backgroundSync: v })}
          />
          {background && (
            <p className="sync-hint">
              Con la pantalla apagada, Android duerme el Wi-Fi y no siempre responde: se ponen al día al volver a usarlo. En Huawei,
              además: Ajustes › Batería › Inicio de aplicaciones › Mitzi › Administrar manualmente, y activa «Ejecutar en segundo plano».
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** En Configuración: vincular equipos y ver cómo va la sincronización. */
export function SyncContent() {
  return (
    <div className="sync">
      <p className="sheet-note">
        Pasa tu avance, subrayados, notas, marcadores, colecciones y estadísticas entre tus equipos, directo por tu Wi-Fi: sin cuentas
        ni internet, y cifrado. Vincula cada equipo una vez; desde ahí se ponen al día solos al abrir Mitzi y al cerrar un libro, con
        todos los que estén en la red con Mitzi abierta. Lo de uno pasa a los demás en cadena. Los libros no se copian.
      </p>
      {platform.syncServe || platform.syncRequest ? (
        <>
          <PeersCard />
          <LinkCard />
          <StayAwake />
        </>
      ) : (
        <p className="sheet-note">En el navegador no se puede sincronizar.</p>
      )}
    </div>
  )
}
