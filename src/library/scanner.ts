import { platform } from '../platform'
import type { BookFile } from '../platform/types'
import { db, type BookRecord } from './db'
import { extractBook, formatOf } from './metadata'
import { seriesKeyOf } from './series'
import { refreshLibrary, useLibrary } from './store'

const ERROR_ID = '!error'

let running: Promise<void> | null = null
let again = false

/**
 * Compara las carpetas con lo que ya conocemos: lee solo los archivos nuevos o
 * modificados y marca como ausentes los que desaparecieron. Si llega otra
 * petición mientras corre, se repite al terminar.
 */
export function syncLibrary(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again)
  })().finally(() => {
    running = null
    useLibrary.setState({ scanning: null })
  })
  return running
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function syncOnce() {
  let files: BookFile[]
  try {
    files = await platform.scan()
  } catch (e) {
    console.warn('No se pudieron recorrer las carpetas', e)
    return
  }
  const currentPaths = new Set(files.map(f => f.path))
  const index = new Map((await db.files.toArray()).map(f => [f.path, f]))

  const stale = [...index.keys()].filter(p => !currentPaths.has(p))
  if (stale.length) await db.files.bulkDelete(stale)

  /** bookId → ruta donde está ahora */
  const present = new Map<string, string>()
  const todo: BookFile[] = []
  for (const file of files) {
    const known = index.get(file.path)
    if (known && known.size === file.size && known.mtime === file.mtime) {
      if (known.bookId !== ERROR_ID) present.set(known.bookId, file.path)
    } else if (formatOf(file.name)) todo.push(file)
  }

  if (todo.length) useLibrary.setState({ scanning: { done: 0, total: todo.length } })
  for (const [i, file] of todo.entries()) {
    let bookId = ERROR_ID
    try {
      bookId = await importFile(file)
      present.set(bookId, file.path)
    } catch (e) {
      console.warn('No se pudo leer el libro', file.path, e)
    }
    await db.files.put({ path: file.path, size: file.size, mtime: file.mtime, bookId })
    useLibrary.setState({ scanning: { done: i + 1, total: todo.length } })
    // los libros van apareciendo uno por uno mientras se leen
    await refreshLibrary()
  }

  await db.transaction('rw', db.books, async () => {
    for (const book of await db.books.toArray()) {
      const path = present.get(book.id)
      if (!path && !book.missing) await db.books.update(book.id, { missing: true })
      else if (path && (book.missing || book.path !== path)) await db.books.update(book.id, { missing: false, path })
    }
  })
  await refreshLibrary()
}

async function importFile(file: BookFile): Promise<string> {
  const format = formatOf(file.name)!
  const buffer = await platform.readFile(file.path)
  const id = await sha256(buffer)
  const existing = await db.books.get(id)
  if (existing) {
    if (existing.path !== file.path || existing.missing)
      await db.books.update(id, { path: file.path, fileName: file.name, missing: false })
    return id
  }
  const { cover, ...meta } = await extractBook(new File([buffer], file.name), format)
  const record: BookRecord = {
    id,
    format,
    path: file.path,
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
    ...meta,
    hasCover: !!cover,
    seriesKey: meta.series ? seriesKeyOf(meta.series) : undefined,
  }
  // la portada se guarda aparte: la lista de libros queda liviana aunque haya miles
  if (cover) await db.covers.put({ id, blob: cover })
  await db.books.put(record)
  return id
}
