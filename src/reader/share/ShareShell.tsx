import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../../app/back'
import type { Palette } from '../../library/palette'
import { platform } from '../../platform'
import { Icon } from '../../ui/Icon'
import type { ThemeColors } from '../comfort/contrast'
import { canvasToPng } from './card'
import { DESIGNS, FORMATS, type CardDesign, type CardFormat } from './designs'
import './share.css'

const PREFS = 'mitzi-tarjeta'

export interface SharePrefs {
  design: string
  format: CardFormat
  cover: boolean
}

function loadPrefs(): SharePrefs {
  const base: SharePrefs = { design: DESIGNS[0].id, format: 'historia', cover: false }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return base
  }
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'cita'

interface Props {
  title: string
  /** nombre del archivo PNG */
  fileName: string
  theme: ThemeColors
  palette: Palette
  /** hay portada que se pueda mostrar */
  hasCover: boolean
  /** dibuja la tarjeta con el diseño, formato y portada elegidos */
  render(design: CardDesign, prefs: SharePrefs): Promise<HTMLCanvasElement>
  /** cambia cuando cambia lo que se dibuja (además del diseño y el formato) */
  renderKey: string
  /** controles propios arriba de «Diseño» (p. ej. semana o mes) */
  children?: ReactNode
  note?: ReactNode
  /** fuera del lector no hay colores de tema: se usan los de la app */
  appColors?: boolean
  onClose(): void
}

/**
 * Vista previa de una tarjeta para compartir (cita o estadísticas), con diseño y formato a
 * elegir, y los botones para compartirla, guardarla o copiarla según la plataforma.
 */
export function ShareShell({ title, fileName, theme, palette, hasCover, render, renderKey, children, note, appColors, onClose }: Props) {
  useBackHandler(true, onClose)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const png = useRef<Blob | null>(null)
  const draw = useRef(render)
  draw.current = render

  const update = (patch: Partial<SharePrefs>) =>
    setPrefs(p => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS, JSON.stringify(next))
      } catch {
        // no es grave
      }
      return next
    })

  // se vuelve a dibujar con cada cambio de diseño, formato, portada o contenido
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setStatus(null)
    ;(async () => {
      const design = DESIGNS.find(d => d.id === prefs.design) ?? DESIGNS[0]
      const blob = await canvasToPng(await draw.current(design, prefs))
      if (cancelled) return
      png.current = blob
      url = URL.createObjectURL(blob)
      setPreview(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [prefs, renderKey])

  const run = async (action: () => Promise<unknown>, done?: string) => {
    if (!png.current) return
    try {
      const result = await action()
      if (done && result !== false) setStatus(done)
    } catch (e) {
      // cerrar el menú de compartir sin elegir nada no es un error
      if (e instanceof Error && e.name === 'AbortError') return
      if (e instanceof Error && e.name === 'NotAllowedError') setStatus('El navegador no dejó copiar la imagen: usa Descargar.')
      else setStatus('No se pudo. Inténtalo de nuevo.')
    }
  }

  const file = () => new File([png.current!], fileName, { type: 'image/png' })
  const canWebShare =
    platform.kind === 'web' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], fileName, { type: 'image/png' })] })
  const canWebCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  const share = platform.shareImage
    ? () => run(() => platform.shareImage!(png.current!, fileName))
    : canWebShare
      ? () => run(() => navigator.share({ files: [file()] }))
      : null
  const save = platform.saveImage
    ? () => run(() => platform.saveImage!(png.current!, fileName), 'Imagen guardada')
    : platform.kind === 'web'
      ? () =>
          run(async () => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(png.current!)
            a.download = fileName
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          }, 'Imagen descargada')
      : null
  const copy = platform.copyImage
    ? () => run(() => platform.copyImage!(png.current!), 'Copiada: pégala donde quieras')
    : platform.kind === 'web' && canWebCopy
      ? () => run(() => navigator.clipboard.write([new ClipboardItem({ 'image/png': png.current! })]), 'Copiada: pégala donde quieras')
      : null

  const sheet = (
    <div className="share-backdrop" data-app-colors={appColors} onClick={onClose}>
      <div className="share-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="share-header">
          <h2>{title}</h2>
          <button className="reader-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="share-body">
          <div className="share-preview" data-format={prefs.format}>
            {preview ? <img src={preview} alt="Vista previa de la tarjeta" /> : <span className="share-loading" />}
          </div>

          <div className="share-controls">
            {children}

            <span className="share-label">Diseño</span>
            <div className="share-designs">
              {DESIGNS.map(d => {
                const c = d.colors(theme, palette)
                return (
                  <button key={d.id} data-on={d.id === prefs.design} onClick={() => update({ design: d.id })} aria-pressed={d.id === prefs.design}>
                    <span className="share-swatch" style={{ background: `linear-gradient(${c.bgTop}, ${c.bgBottom})`, color: c.text }}>
                      <span style={{ color: c.accent }}>“</span>Aa
                    </span>
                    {d.name}
                  </button>
                )
              })}
            </div>

            <span className="share-label">Formato</span>
            <div className="segment-buttons">
              {(Object.keys(FORMATS) as CardFormat[]).map(f => (
                <button key={f} data-on={f === prefs.format} onClick={() => update({ format: f })}>
                  {FORMATS[f].name}
                </button>
              ))}
            </div>

            {hasCover && (
              <label className="control toggle share-cover">
                <span className="control-label">
                  Mostrar la portada
                  <small>La portada tiene derechos de su editorial: úsala con cuidado</small>
                </span>
                <input type="checkbox" role="switch" checked={prefs.cover} onChange={e => update({ cover: e.target.checked })} />
                <span className="switch" aria-hidden />
              </label>
            )}

            {note}

            <div className="share-actions">
              {share && (
                <button className="share-main" onClick={share} disabled={!preview}>
                  <Icon name="share" size={19} /> Compartir
                </button>
              )}
              {save && (
                <button className={share ? '' : 'share-main'} onClick={save} disabled={!preview}>
                  <Icon name="download" size={19} /> {platform.kind === 'web' ? 'Descargar' : 'Guardar imagen'}
                </button>
              )}
              {copy && (
                <button onClick={copy} disabled={!preview}>
                  <Icon name="copy" size={19} /> Copiar
                </button>
              )}
            </div>
            {status && (
              <p className="share-status" role="status">
                {status}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
  // en el lector va dentro de .reader (toma sus colores); en la biblioteca, en un portal: los
  // paneles tienen desenfoque, que encierra a lo «fixed» dentro de ellos
  return appColors ? createPortal(sheet, document.body) : sheet
}
