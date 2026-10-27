import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { lookup } from '../lookup'
import type { AnnotationRecord, BookmarkRecord, HighlightColor } from '../../library/db'
import { isTouchDevice, platform } from '../../platform'
import { Icon } from '../../ui/Icon'
import type { ThemeColors } from '../comfort/contrast'

export const HIGHLIGHT_COLORS: { id: HighlightColor; label: string }[] = [
  { id: 'amarillo', label: 'Amarillo' },
  { id: 'verde', label: 'Verde' },
  { id: 'azul', label: 'Azul' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'lila', label: 'Lila' },
]

const MENU_W = 300
/** espacio para las manijas de selección de Android, que cuelgan debajo del texto */
const HANDLES = 40

/** Coloca un menú flotante encima (o debajo) del texto, sin salirse de la pantalla. */
function floatingStyle(rect: DOMRect, height = 52, width = MENU_W): CSSProperties {
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
  if (isTouchDevice) {
    // Android pone su propio menú arriba: el nuestro va abajo, sin tapar las manijas;
    // si no cabe (selección hasta el final de la página), arriba; y si tampoco, en la orilla de arriba
    const below = rect.bottom + HANDLES
    const above = rect.top - height - 70
    const top = below + height < window.innerHeight - 8 ? below : above > 8 ? above : 8
    return { left, top, width }
  }
  const below = rect.top < height + 70
  const top = below ? Math.min(rect.bottom + 12, window.innerHeight - height - 12) : rect.top - height - 10
  return { left, top, width }
}

function ColorDots({ theme, current, onPick }: { theme: ThemeColors; current?: HighlightColor; onPick(c: HighlightColor): void }) {
  return (
    <div className="color-dots">
      {HIGHLIGHT_COLORS.map(c => (
        <button
          key={c.id}
          className="color-dot"
          data-on={current === c.id}
          style={{ background: theme.highlights[c.id] }}
          title={c.label}
          aria-label={`Subrayar en ${c.label.toLowerCase()}`}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  )
}

interface SelectionMenuProps {
  rect: DOMRect
  text: string
  theme: ThemeColors
  onHighlight(color: HighlightColor): void
  onNote(): void
  /** compartir como imagen (tarjeta para redes) */
  onShare?(): void
}

/** Aparece al seleccionar texto: subrayar en un color, agregar nota, copiar o compartir. */
export function SelectionMenu({ rect, text, theme, onHighlight, onNote, onShare }: SelectionMenuProps) {
  // el ancho depende de cuántos botones hay (Definir solo con una o dos palabras): se mide
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (ref.current) setSize({ w: ref.current.offsetWidth, h: ref.current.offsetHeight })
  }, [text, onShare])
  // el menú toma el ancho de sus botones (en el teléfono, si no caben, en dos filas);
  // la medida sirve para colocarlo sin salirse de la pantalla
  const style: CSSProperties = {
    ...floatingStyle(rect, size?.h ?? 52, size?.w ?? MENU_W),
    width: 'max-content',
    maxWidth: window.innerWidth - 16,
    visibility: size ? undefined : 'hidden',
  }
  return (
    <div ref={ref} className="float-menu" style={style} role="toolbar" aria-label="Subrayar">
      <ColorDots theme={theme} onPick={onHighlight} />
      <span className="float-sep" />
      <button className="float-action" onClick={onNote} title="Agregar nota">
        <Icon name="note" size={19} />
      </button>
      <button className="float-action" onClick={() => navigator.clipboard?.writeText(text)} title="Copiar">
        <Icon name="copy" size={19} />
      </button>
      {/* una o dos palabras: buscar en el diccionario */}
      {text.trim().split(/\s+/).length <= 2 && (
        <button className="float-action" onClick={() => lookup(text, 'define')} title="Definir">
          <Icon name="book" size={19} />
        </button>
      )}
      <button className="float-action" onClick={() => lookup(text, 'translate')} title="Traducir">
        <Icon name="translate" size={19} />
      </button>
      {onShare && (
        <button className="float-action" onClick={onShare} title="Compartir como imagen">
          <Icon name="share" size={19} />
        </button>
      )}
    </div>
  )
}

interface PopoverProps {
  annotation: AnnotationRecord
  rect: DOMRect
  theme: ThemeColors
  onColor(color: HighlightColor): void
  onEditNote(): void
  onDelete(): void
}

/** Al tocar un subrayado: cambiar color, ver o editar la nota, borrar. */
export function AnnotationPopover({ annotation, rect, theme, onColor, onEditNote, onDelete }: PopoverProps) {
  const height = annotation.note ? 110 : 52
  return (
    <div className="float-menu column" style={floatingStyle(rect, height)} role="dialog" aria-label="Subrayado">
      <div className="float-row">
        <ColorDots theme={theme} current={annotation.color} onPick={onColor} />
        <span className="float-sep" />
        <button className="float-action" onClick={onEditNote} title={annotation.note ? 'Editar nota' : 'Agregar nota'}>
          <Icon name="note" size={19} />
        </button>
        <button className="float-action" onClick={onDelete} title="Borrar subrayado">
          <Icon name="trash" size={19} />
        </button>
      </div>
      {annotation.note && <p className="float-note">{annotation.note}</p>}
    </div>
  )
}

interface NoteEditorProps {
  annotation: AnnotationRecord
  onSave(note: string): void
  onClose(): void
}

export function NoteEditor({ annotation, onSave, onClose }: NoteEditorProps) {
  const [note, setNote] = useState(annotation.note ?? '')
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => area.current?.focus(), [])
  return (
    <div className="note-backdrop" onClick={onClose}>
      <div className="note-editor" role="dialog" aria-label="Nota" onClick={e => e.stopPropagation()}>
        <blockquote>{annotation.text}</blockquote>
        <textarea
          ref={area}
          value={note}
          placeholder="Escribe tu nota…"
          rows={5}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave(note.trim())
          }}
        />
        <div className="note-actions">
          <button className="reader-pill" onClick={onClose}>
            Cancelar
          </button>
          <button className="reader-pill primary" onClick={() => onSave(note.trim())}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export function annotationsToMarkdown(title: string, author: string, list: AnnotationRecord[]) {
  const lines = [`# ${title}`, author ? `*${author}*` : '', '']
  let chapter: string | undefined
  for (const a of list) {
    if (a.chapter && a.chapter !== chapter) {
      chapter = a.chapter
      lines.push(`## ${chapter}`, '')
    }
    lines.push(...a.text.split('\n').map(l => `> ${l}`))
    if (a.note) lines.push('', a.note)
    lines.push('')
  }
  return lines.join('\n')
}

interface NotesPanelProps {
  title: string
  author: string
  annotations: AnnotationRecord[]
  bookmarks: BookmarkRecord[]
  theme: ThemeColors
  onGo(a: AnnotationRecord): void
  onEdit(a: AnnotationRecord): void
  onDelete(a: AnnotationRecord): void
  onGoBookmark(b: BookmarkRecord): void
  onDeleteBookmark(b: BookmarkRecord): void
  onClose(): void
}

export function NotesPanel({ title, author, annotations, bookmarks, theme, onGo, onEdit, onDelete, onGoBookmark, onDeleteBookmark, onClose }: NotesPanelProps) {
  const [copied, setCopied] = useState(false)
  const markdown = () => annotationsToMarkdown(title, author, annotations)
  const copy = async () => {
    await navigator.clipboard?.writeText(markdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  const save = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title} - notas.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return (
    <aside className="reader-panel notes-panel" role="dialog" aria-label="Marcadores, subrayados y notas">
      <header className="panel-header">
        <h2>Marcadores y notas</h2>
        <button className="panel-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>
      {bookmarks.length > 0 && (
        <>
          <h3 className="notes-section">Marcadores</h3>
          <ol className="notes-list">
            {bookmarks.map(b => (
              <li key={b.id} className="bookmark-item">
                <button className="note-go" onClick={() => onGoBookmark(b)}>
                  <span className="note-chapter">
                    {b.label ?? 'Marcador'} · {Math.round(b.fraction * 100)}%
                  </span>
                  {b.excerpt && <span className="note-text">{b.excerpt}</span>}
                </button>
                <div className="note-tools">
                  <button onClick={() => onDeleteBookmark(b)} title="Quitar marcador" aria-label="Quitar marcador">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <h3 className="notes-section">Subrayados y notas</h3>
        </>
      )}
      {annotations.length === 0 ? (
        <p className="panel-hint">
          Selecciona un texto y elige un color para subrayarlo. Tus subrayados y notas aparecerán aquí. Para marcar una página, toca el marcador de
          la barra de arriba.
        </p>
      ) : (
        <>
          <div className="notes-export">
            <button className="reader-pill" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar como Markdown'}
            </button>
            {platform.kind !== 'android' && (
              <button className="reader-pill" onClick={save}>
                Guardar .md
              </button>
            )}
          </div>
          <ol className="notes-list">
            {annotations.map(a => (
              <li key={a.id} style={{ '--mark': theme.highlights[a.color] } as CSSProperties}>
                <button className="note-go" onClick={() => onGo(a)}>
                  {a.chapter && <span className="note-chapter">{a.chapter}</span>}
                  <span className="note-text">{a.text}</span>
                  {a.note && <span className="note-body">{a.note}</span>}
                </button>
                <div className="note-tools">
                  <button onClick={() => onEdit(a)} title={a.note ? 'Editar nota' : 'Agregar nota'} aria-label="Nota">
                    <Icon name="note" size={18} />
                  </button>
                  <button onClick={() => onDelete(a)} title="Borrar" aria-label="Borrar">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  )
}
