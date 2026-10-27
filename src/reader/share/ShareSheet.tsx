import { useEffect, useRef, useState } from 'react'
import { useBackHandler } from '../../app/back'
import { db, type BookRecord } from '../../library/db'
import { decodeImage } from '../../library/metadata'
import { platform } from '../../platform'
import { Icon } from '../../ui/Icon'
import type { ThemeColors } from '../comfort/contrast'
import type { FontId } from '../comfort/fonts'
import { canvasToPng, cleanQuote, LONG_QUOTE_WORDS, renderCard } from './card'
import { DESIGNS, FORMATS, type CardFormat } from './designs'
import './share.css'

const PREFS = 'mitzi-tarjeta'

interface Prefs {
  design: string
  format: CardFormat
  cover: boolean
}

function loadPrefs(): Prefs {
  const base: Prefs = { design: DESIGNS[0].id, format: 'historia', cover: false }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return base
  }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'cita'

interface Props {
  text: string
  book: BookRecord
  theme: ThemeColors
  fontId: FontId
  onClose(): void
}

/** Vista previa de la tarjeta de una cita, con diseño y formato a elegir, y cómo compartirla. */
export function ShareSheet({ text, book, theme, fontId, onClose }: Props) {
  useBackHandler(true, onClose)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const png = useRef<Blob | null>(null)
  const quote = cleanQuote(text)
  const long = quote.split(/\s+/).length > LONG_QUOTE_WORDS
  const name = `mitzi-${slug(book.title)}.png`

  const update = (patch: Partial<Prefs>) =>
    setPrefs(p => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS, JSON.stringify(next))
      } catch {
        // no es grave
      }
      return next
    })

  // se vuelve a dibujar con cada cambio de diseño, formato o portada
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    ;(async () => {
      const design = DESIGNS.find(d => d.id === prefs.design) ?? DESIGNS[0]
      let cover: Awaited<ReturnType<typeof decodeImage>> | null = null
      if (prefs.cover && book.hasCover) {
        const row = await db.covers.get(book.id)
        if (row) cover = await decodeImage(row.blob).catch(() => null)
      }
      const canvas = await renderCard({
        text: quote,
        title: book.title,
        author: book.author,
        colors: design.colors(theme, book.palette),
        format: prefs.format,
        fontId,
        cover: cover ?? undefined,
      })
      cover?.close()
      const blob = await canvasToPng(canvas)
      if (cancelled) return
      png.current = blob
      url = URL.createObjectURL(blob)
      setPreview(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [prefs, quote, book, theme, fontId])

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

  const file = () => new File([png.current!], name, { type: 'image/png' })
  const canWebShare = platform.kind === 'web' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], name, { type: 'image/png' })] })
  const canWebCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  const share = platform.shareImage
    ? () => run(() => platform.shareImage!(png.current!, name))
    : canWebShare
      ? () => run(() => navigator.share({ files: [file()] }))
      : null
  const save = platform.saveImage
    ? () => run(() => platform.saveImage!(png.current!, name), 'Imagen guardada')
    : platform.kind === 'web'
      ? () =>
          run(async () => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(png.current!)
            a.download = name
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          }, 'Imagen descargada')
      : null
  const copy = platform.copyImage
    ? () => run(() => platform.copyImage!(png.current!), 'Copiada: pégala donde quieras')
    : platform.kind === 'web' && canWebCopy
      ? () => run(() => navigator.clipboard.write([new ClipboardItem({ 'image/png': png.current! })]), 'Copiada: pégala donde quieras')
      : null

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Compartir cita">
        <header className="share-header">
          <h2>Compartir cita</h2>
          <button className="reader-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="share-body">
          <div className="share-preview" data-format={prefs.format}>
            {preview ? <img src={preview} alt="Vista previa de la tarjeta" /> : <span className="share-loading" />}
          </div>

          <div className="share-controls">
            <span className="share-label">Diseño</span>
            <div className="share-designs">
              {DESIGNS.map(d => {
                const c = d.colors(theme, book.palette)
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

            {book.hasCover && (
              <label className="control toggle share-cover">
                <span className="control-label">
                  Mostrar la portada
                  <small>La portada tiene derechos de su editorial: úsala con cuidado</small>
                </span>
                <input type="checkbox" role="switch" checked={prefs.cover} onChange={e => update({ cover: e.target.checked })} />
                <span className="switch" aria-hidden />
              </label>
            )}

            {long && <p className="share-note">Las citas cortas lucen más: lo que no quepa se recorta con «…».</p>}

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
}
