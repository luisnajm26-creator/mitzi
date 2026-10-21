import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { db, type BookRecord } from '../library/db'
import { filterBooks, groupBooks, statusOf, useLibraryQuery, type CarouselFilter, type FormatFilter, type GroupBy, type SortBy, type StatusFilter } from '../library/query'
import { FORMAT_LABELS, type BookFormat } from '../library/formats'
import { useLibrary } from '../library/store'
import { handleBack, useBackHandler } from '../app/back'
import { isDark, mix } from '../lib/color'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Picker'
import './explorer.css'

/** Un solo observador para todas las portadas: se cargan cuando entran en pantalla. */
const visibleCallbacks = new WeakMap<Element, () => void>()
let observer: IntersectionObserver | null = null
function watchVisible(el: Element, cb: () => void) {
  observer ??= new IntersectionObserver(
    entries => {
      for (const e of entries)
        if (e.isIntersecting) {
          visibleCallbacks.get(e.target)?.()
          observer?.unobserve(e.target)
        }
    },
    { rootMargin: '300px' },
  )
  visibleCallbacks.set(el, cb)
  observer.observe(el)
  return () => observer?.unobserve(el)
}

function useCoverUrl(book: BookRecord, ref: RefObject<HTMLElement | null>) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !book.hasCover) return
    let objectUrl: string | null = null
    let cancelled = false
    const stop = watchVisible(el, () => {
      db.covers.get(book.id).then(c => {
        if (cancelled || !c) return
        objectUrl = URL.createObjectURL(c.blob)
        setUrl(objectUrl)
      })
    })
    return () => {
      cancelled = true
      stop()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [book.id, book.hasCover, ref])
  return url
}

/** Portada dibujada con los colores del libro, para los que no traen una (como en el carrusel). */
function GeneratedCover({ book }: { book: BookRecord }) {
  const { primary, secondary, dark } = book.palette
  return (
    <span
      className="tile-generated"
      style={{
        background: `linear-gradient(155deg, ${primary}, ${mix(secondary, dark, 0.35)})`,
        color: isDark(primary) ? '#fbf7ef' : '#1d1a22',
      }}
    >
      <span className="tile-generated-title">{book.title}</span>
      <span className="tile-generated-rule" />
      {book.author && <span className="tile-generated-author">{book.author}</span>}
    </span>
  )
}

const Tile = memo(function Tile({ book, fraction, showVolume, onPick }: { book: BookRecord; fraction: number; showVolume: boolean; onPick(id: string): void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const url = useCoverUrl(book, ref)
  return (
    <button ref={ref} className="tile" onClick={() => onPick(book.id)} title={book.title}>
      <span className="tile-cover" style={{ background: book.palette.dark }}>
        {url ? <img src={url} alt="" draggable={false} /> : !book.hasCover && <GeneratedCover book={book} />}
        {showVolume && book.seriesIndex !== undefined && <span className="tile-volume">{book.seriesIndex}</span>}
        {fraction > 0.005 && (
          <span className="tile-progress">
            <span style={{ width: `${Math.min(100, fraction * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="tile-title">{book.title}</span>
      {book.author && <span className="tile-author">{book.author}</span>}
    </button>
  )
})

const STATUS: { id: StatusFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'leyendo', label: 'Leyendo' },
  { id: 'sin-empezar', label: 'Sin empezar' },
  { id: 'terminados', label: 'Terminados' },
]

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: 'serie', label: 'Por serie' },
  { value: 'autor', label: 'Por autor' },
  { value: 'ninguno', label: 'Sin agrupar' },
]

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'recientes', label: 'Leídos recientemente' },
  { value: 'titulo', label: 'Título' },
  { value: 'autor', label: 'Autor' },
  { value: 'agregados', label: 'Agregados recientemente' },
]


interface Props {
  onClose(): void
  /** Lleva el carrusel a este libro. */
  onPick(bookId: string): void
  /** Muestra solo una serie o un autor en el carrusel. */
  onShowGroup(filter: CarouselFilter): void
}

/** Explorar la biblioteca: buscar, filtrar y ver los libros agrupados por serie o autor. */
export function Explorer({ onClose, onPick, onShowGroup }: Props) {
  const books = useLibrary(s => s.books)
  const progress = useLibrary(s => s.progress)
  const query = useLibraryQuery(s => s.query)
  const setQuery = useLibraryQuery(s => s.setQuery)
  const input = useRef<HTMLInputElement>(null)
  // el gesto atrás (o Esc) cierra primero un menú abierto y luego el explorador
  useBackHandler(true, onClose)

  useEffect(() => {
    // en teléfonos el teclado tapa media pantalla: solo se enfoca solo en PC
    if (matchMedia('(pointer: fine)').matches) input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // solo los formatos que hay en la biblioteca
  const formats = useMemo(() => {
    const present = new Set(books.map(b => b.format))
    return [
      { value: 'todos' as FormatFilter, label: 'Todos' },
      ...(Object.keys(FORMAT_LABELS) as BookFormat[]).filter(f => present.has(f)).map(f => ({ value: f as FormatFilter, label: FORMAT_LABELS[f] })),
    ]
  }, [books])
  const matches = useMemo(() => filterBooks(books, progress, query), [books, progress, query])
  const groups = useMemo(() => groupBooks(matches, progress, query), [matches, progress, query])
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { todos: books.length, leyendo: 0, 'sin-empezar': 0, terminados: 0 }
    for (const b of books) c[statusOf(b, progress)]++
    return c
  }, [books, progress])

  return (
    <div className="explorer" role="dialog" aria-label="Explorar la biblioteca">
      <header className="explorer-top">
        <div className="search-box">
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={query.text}
            onChange={e => setQuery({ text: e.target.value })}
            placeholder="Buscar por título, autor o serie"
            aria-label="Buscar"
            enterKeyHint="search"
          />
          {query.text && (
            <button className="search-clear" onClick={() => setQuery({ text: '' })} aria-label="Borrar búsqueda">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>

      <div className="explorer-filters">
        <div className="chips" role="radiogroup" aria-label="Estado">
          {STATUS.map(s => (
            <button key={s.id} role="radio" aria-checked={query.status === s.id} data-on={query.status === s.id} onClick={() => setQuery({ status: s.id })}>
              {s.label}
              <span className="chip-count">{counts[s.id]}</span>
            </button>
          ))}
        </div>
        <div className="explorer-pickers">
          <Picker label="Agrupar" icon="layers" value={query.group} options={GROUPS} onChange={group => setQuery({ group })} />
          <Picker label="Ordenar" icon="sort" value={query.sort} options={SORTS} onChange={sort => setQuery({ sort })} />
          {formats.length > 2 && <Picker label="Formato" icon="file" value={query.format} options={formats} onChange={format => setQuery({ format })} />}
        </div>
      </div>

      <div className="explorer-body">
        {groups.length === 0 && <p className="explorer-empty">No hay libros que coincidan con la búsqueda.</p>}
        {groups.map(g => (
          <section key={g.key} className="explorer-group">
            {query.group !== 'ninguno' && (
              <header>
                <h3>{g.label}</h3>
                <span className="group-count">
                  {g.books.length} {g.books.length === 1 ? 'libro' : 'libros'}
                </span>
                {g.kind && (
                  <button className="ghost-button small" onClick={() => onShowGroup({ kind: g.kind!, key: g.key, label: g.label })}>
                    Ver en el carrusel
                  </button>
                )}
              </header>
            )}
            <div className="tile-grid">
              {g.books.map(b => (
                <Tile key={b.id} book={b} fraction={progress[b.id]?.fraction ?? 0} showVolume={g.kind === 'serie'} onPick={onPick} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
