import { create } from 'zustand'
import type { BookRecord, CollectionRecord, ProgressRecord } from './db'
import { booksIn } from './collections'
import { normalize } from './series'

export type StatusFilter = 'todos' | 'leyendo' | 'sin-empezar' | 'terminados'
import type { BookFormat } from './formats'

export type FormatFilter = 'todos' | BookFormat
export type GroupBy = 'serie' | 'autor' | 'coleccion' | 'ninguno'
export type SortBy = 'recientes' | 'titulo' | 'autor' | 'agregados'

export interface LibraryQuery {
  text: string
  status: StatusFilter
  format: FormatFilter
  group: GroupBy
  sort: SortBy
}

/** Lo que se muestra en el carrusel: todo, o solo una serie, un autor o una colección. */
export interface CarouselFilter {
  kind: 'serie' | 'autor' | 'coleccion'
  /** clave de la serie o del autor, o id de la colección */
  key: string
  label: string
}

interface QueryState {
  query: LibraryQuery
  carousel: CarouselFilter | null
  setQuery(patch: Partial<LibraryQuery>): void
  setCarousel(filter: CarouselFilter | null): void
}

export const useLibraryQuery = create<QueryState>(set => ({
  query: { text: '', status: 'todos', format: 'todos', group: 'serie', sort: 'recientes' },
  carousel: null,
  setQuery: patch => set(s => ({ query: { ...s.query, ...patch } })),
  setCarousel: carousel => set({ carousel }),
}))

export type Progress = Record<string, ProgressRecord>

export function statusOf(book: BookRecord, progress: Progress): Exclude<StatusFilter, 'todos'> {
  const f = progress[book.id]?.fraction ?? 0
  if (f >= 0.98) return 'terminados'
  if (f > 0.005) return 'leyendo'
  return 'sin-empezar'
}

const authorKey = (b: BookRecord) => normalize(b.author) || '~'
const recency = (b: BookRecord, progress: Progress) => Math.max(b.lastOpenedAt ?? 0, progress[b.id]?.updatedAt ?? 0, b.addedAt)

/** Busca en título, autor y serie, sin importar tildes ni mayúsculas; cada palabra debe aparecer. */
export function filterBooks(books: BookRecord[], progress: Progress, q: LibraryQuery) {
  const words = normalize(q.text).split(/\s+/).filter(Boolean)
  return books.filter(b => {
    if (q.format !== 'todos' && b.format !== q.format) return false
    if (q.status !== 'todos' && statusOf(b, progress) !== q.status) return false
    if (!words.length) return true
    const hay = normalize(`${b.title} ${b.author} ${b.series ?? ''} ${b.fileName}`)
    return words.every(w => hay.includes(w))
  })
}

export function sortBooks(books: BookRecord[], progress: Progress, sort: SortBy) {
  const list = [...books]
  const byTitle = (a: BookRecord, b: BookRecord) => a.title.localeCompare(b.title, 'es', { numeric: true })
  if (sort === 'titulo') list.sort(byTitle)
  else if (sort === 'autor') list.sort((a, b) => authorKey(a).localeCompare(authorKey(b), 'es') || byTitle(a, b))
  else if (sort === 'agregados') list.sort((a, b) => b.addedAt - a.addedAt)
  else list.sort((a, b) => recency(b, progress) - recency(a, progress))
  return list
}

/** Tomos de una serie en orden: 1, 2, 3… */
export const byVolume = (a: BookRecord, b: BookRecord) =>
  (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity) || a.title.localeCompare(b.title, 'es', { numeric: true })

export interface BookGroup {
  key: string
  label: string
  kind: CarouselFilter['kind'] | null
  books: BookRecord[]
}

/**
 * Agrupa por serie (solo si hay 2 tomos o más; el resto va a "Libros sueltos"), por autor o por
 * colección (un libro puede salir en varias). Los grupos se ordenan como los libros.
 */
export function groupBooks(books: BookRecord[], progress: Progress, q: LibraryQuery, collections: CollectionRecord[] = []): BookGroup[] {
  const sorted = sortBooks(books, progress, q.sort)
  if (q.group === 'ninguno') return [{ key: 'todos', label: 'Todos los libros', kind: null, books: sorted }]
  if (q.group === 'coleccion') {
    const placed = new Set<string>()
    const groups: BookGroup[] = collections.map(c => {
      const ids = new Set(booksIn(c))
      const list = sorted.filter(b => ids.has(b.id))
      for (const b of list) placed.add(b.id)
      return { key: c.id, label: c.name, kind: 'coleccion', books: list }
    })
    const rest = sorted.filter(b => !placed.has(b.id))
    return [...groups.filter(g => g.books.length), ...(rest.length ? [{ key: '~sin', label: 'Sin colección', kind: null, books: rest }] : [])]
  }

  const map = new Map<string, BookRecord[]>()
  for (const b of sorted) {
    const key = q.group === 'serie' ? (b.seriesKey ?? '') : authorKey(b)
    map.set(key, [...(map.get(key) ?? []), b])
  }

  const groups: BookGroup[] = []
  const loose: BookRecord[] = []
  for (const [key, list] of map) {
    if (q.group === 'serie' && (!key || list.length < 2)) {
      loose.push(...list)
      continue
    }
    if (q.group === 'serie') {
      // el nombre más repetido entre los tomos ("Re:Zero [LN]" vs "Re Zero [LN]")
      const names = new Map<string, number>()
      for (const b of list) names.set(b.series!, (names.get(b.series!) ?? 0) + 1)
      const label = [...names].sort((a, b) => b[1] - a[1])[0][0]
      groups.push({ key, label, kind: 'serie', books: [...list].sort(byVolume) })
    } else {
      groups.push({ key, label: list[0].author || 'Autor desconocido', kind: key === '~' ? null : 'autor', books: list })
    }
  }
  if (q.sort === 'titulo' || q.sort === 'autor') groups.sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }))
  if (loose.length) groups.push({ key: '~sueltos', label: 'Libros sueltos', kind: null, books: loose })
  return groups
}

/** Libros del carrusel según el filtro activo (una serie va en orden de tomos). */
export function carouselBooks(books: BookRecord[], filter: CarouselFilter | null, collections: CollectionRecord[] = []) {
  if (!filter) return books
  if (filter.kind === 'serie') return books.filter(b => b.seriesKey === filter.key).sort(byVolume)
  if (filter.kind === 'coleccion') {
    const c = collections.find(c => c.id === filter.key)
    const ids = new Set(c ? booksIn(c) : [])
    return books.filter(b => ids.has(b.id))
  }
  return books.filter(b => authorKey(b) === filter.key)
}
