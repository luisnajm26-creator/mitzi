import { create } from 'zustand'
import { db, type BookRecord, type ProgressRecord } from './db'

interface LibraryState {
  books: BookRecord[]
  progress: Record<string, ProgressRecord>
  loaded: boolean
  scanning: { done: number; total: number } | null
  /** archivos que no se pudieron leer, con el motivo */
  failed: { name: string; reason: string }[]
}

export const useLibrary = create<LibraryState>(() => ({
  books: [],
  progress: {},
  loaded: false,
  scanning: null,
  failed: [],
}))

/** Orden del carrusel: lo último que leíste primero, luego lo más nuevo. */
const byRecent = (a: BookRecord, b: BookRecord) =>
  (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt || a.title.localeCompare(b.title)

/** Nombre legible de una ruta o de una dirección content:// de Android. */
const fileName = (path: string) => decodeURIComponent(path).split(/[\\/:]/).pop() || path

export async function refreshLibrary() {
  const [books, progress, failed] = await Promise.all([
    db.books.filter(b => !b.missing).toArray(),
    db.progress.toArray(),
    db.files.filter(f => f.bookId === '!error').toArray(),
  ])
  books.sort(byRecent)
  useLibrary.setState({
    books,
    progress: Object.fromEntries(progress.map(p => [p.bookId, p])),
    failed: failed.map(f => ({ name: f.name ?? fileName(f.path), reason: f.error ?? 'Motivo desconocido' })),
    loaded: true,
  })
}
