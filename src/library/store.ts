import { create } from 'zustand'
import { db, type BookRecord, type ProgressRecord } from './db'

interface LibraryState {
  books: BookRecord[]
  progress: Record<string, ProgressRecord>
  loaded: boolean
  scanning: { done: number; total: number } | null
}

export const useLibrary = create<LibraryState>(() => ({
  books: [],
  progress: {},
  loaded: false,
  scanning: null,
}))

/** Orden del carrusel: lo último que leíste primero, luego lo más nuevo. */
const byRecent = (a: BookRecord, b: BookRecord) =>
  (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt || a.title.localeCompare(b.title)

export async function refreshLibrary() {
  const [books, progress] = await Promise.all([
    db.books.filter(b => !b.missing).toArray(),
    db.progress.toArray(),
  ])
  books.sort(byRecent)
  useLibrary.setState({
    books,
    progress: Object.fromEntries(progress.map(p => [p.bookId, p])),
    loaded: true,
  })
}
