import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { db, type BookRecord } from '../library/db'
import { filterBooks, groupBooks, statusOf, useLibraryQuery, type CarouselFilter, type GroupBy, type SortBy, type StatusFilter } from '../library/query'
import { useLibrary } from '../library/store'
import { Icon } from '../ui/Icon'
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

const Tile = memo(function Tile({ book, fraction, showVolume, onPick }: { book: BookRecord; fraction: number; showVolume: boolean; onPick(id: string): void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const url = useCoverUrl(book, ref)
  return (
    <button ref={ref} className="tile" onClick={() => onPick(book.id)} title={book.title}>
      <span className="tile-cover" style={{ background: `linear-gradient(160deg, ${book.palette.primary}, ${book.palette.dark})` }}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="tile-fallback">{book.title}</span>}
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

  useEffect(() => {
    // en teléfonos el teclado tapa media pantalla: solo se enfoca solo en PC
    if (matchMedia('(pointer: fine)').matches) input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

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
        <div className="explorer-selects">
          <label>
            Formato
            <select value={query.format} onChange={e => setQuery({ format: e.target.value as typeof query.format })}>
              <option value="todos">Todos</option>
              <option value="epub">EPUB</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label>
            Agrupar
            <select value={query.group} onChange={e => setQuery({ group: e.target.value as GroupBy })}>
              <option value="serie">Por serie</option>
              <option value="autor">Por autor</option>
              <option value="ninguno">Sin agrupar</option>
            </select>
          </label>
          <label>
            Ordenar
            <select value={query.sort} onChange={e => setQuery({ sort: e.target.value as SortBy })}>
              <option value="recientes">Leídos recientemente</option>
              <option value="titulo">Título</option>
              <option value="autor">Autor</option>
              <option value="agregados">Agregados recientemente</option>
            </select>
          </label>
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
