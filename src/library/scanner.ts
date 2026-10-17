import { sha256 } from '@noble/hashes/sha2.js'
import { platform } from '../platform'
import type { BookFile, ScanResult } from '../platform/types'
import { db, type BookRecord } from './db'
import { extractBook, findEpubCover, formatOf } from './metadata'
import { seriesKeyOf } from './series'
import { refreshLibrary, useLibrary } from './store'

const ERROR_ID = '!error'
/** Un libro que tarda más que esto se deja para después (no traba el resto). */
const FILE_TIMEOUT = 90_000
const HASH_CHUNK = 4 * 1024 * 1024

let running: Promise<void> | null = null
let again = false
/** Los libros que fallaron se reintentan una vez por cada vez que se abre la app. */
let retriedErrors = false

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

/** Vuelve a intentar los libros que no se pudieron leer. */
export function retryFailed() {
  retriedErrors = false
  return syncLibrary()
}

const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const toHex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * SHA-256 del archivo: es el id del libro en cualquier dispositivo. En el teléfono
 * se calcula por bloques de 4 MB para no tener el libro entero en memoria.
 */
async function hashBlob(blob: Blob) {
  if (platform.kind !== 'android' && blob.size < 64 * 1024 * 1024)
    return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
  const h = sha256.create()
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK) {
    h.update(new Uint8Array(await blob.slice(offset, offset + HASH_CHUNK).arrayBuffer()))
    await pause() // deja respirar a la interfaz entre bloques
  }
  return toHex(h.digest())
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Tardó demasiado: ${what}`)), ms)),
  ])
}

async function syncOnce() {
  let scan: ScanResult
  try {
    scan = await platform.scan()
  } catch (e) {
    console.warn('No se pudieron recorrer las carpetas', e)
    return
  }
  const { files, complete } = scan
  const currentPaths = new Set(files.map(f => f.path))
  const index = new Map((await db.files.toArray()).map(f => [f.path, f]))

  // si alguna carpeta no se pudo leer, no se borra nada: sus libros no "desaparecen"
  if (complete) {
    const stale = [...index.keys()].filter(p => !currentPaths.has(p))
    if (stale.length) await db.files.bulkDelete(stale)
  }

  /** bookId → ruta donde está ahora */
  const present = new Map<string, string>()
  const todo: BookFile[] = []
  const retry = !retriedErrors
  retriedErrors = true
  for (const file of files) {
    const known = index.get(file.path)
    const unchanged = known && known.size === file.size && known.mtime === file.mtime
    if (unchanged && known.bookId !== ERROR_ID) present.set(known.bookId, file.path)
    else if ((!unchanged || retry) && formatOf(file.name)) todo.push(file)
  }

  if (todo.length) useLibrary.setState({ scanning: { done: 0, total: todo.length } })
  let lastRefresh = performance.now()
  for (const [i, file] of todo.entries()) {
    let bookId = ERROR_ID
    let error: string | undefined
    try {
      bookId = await withTimeout(importFile(file), FILE_TIMEOUT, file.name)
      present.set(bookId, file.path)
    } catch (e) {
      console.warn('No se pudo leer el libro', file.path, e)
      error = e instanceof Error ? e.message || e.name : String(e)
    }
    await db.files.put({ path: file.path, size: file.size, mtime: file.mtime, bookId, ...(error ? { name: file.name, error } : {}) })
    useLibrary.setState({ scanning: { done: i + 1, total: todo.length } })
    // los libros van apareciendo mientras se leen, sin redibujar la biblioteca a cada rato
    if (performance.now() - lastRefresh > 1500) {
      await refreshLibrary()
      lastRefresh = performance.now()
    }
    await pause(30)
  }

  if (complete) {
    await db.transaction('rw', db.books, async () => {
      for (const book of await db.books.toArray()) {
        const path = present.get(book.id)
        if (!path && !book.missing) await db.books.update(book.id, { missing: true })
        else if (path && (book.missing || book.path !== path)) await db.books.update(book.id, { missing: false, path })
      }
    })
  } else {
    // escaneo parcial: solo se reactivan los que sí se encontraron
    for (const [id, path] of present) await db.books.update(id, { missing: false, path })
  }
  await refreshLibrary()
  await fillMissingCovers()
}

/** Versión de la búsqueda de portadas: al mejorarla, los libros sin portada se revisan otra vez. */
const COVER_TRY = 1

/** Libros que se importaron sin portada: se busca otra vez con la búsqueda nueva, sin apuro. */
async function fillMissingCovers() {
  const pending = await db.books.filter(b => !b.hasCover && !b.missing && b.format === 'epub' && (b.coverTry ?? 0) < COVER_TRY).toArray()
  let found = false
  for (const book of pending) {
    try {
      const blob = await withTimeout(platform.readBlob(book.path), FILE_TIMEOUT, book.fileName)
      const cover = await withTimeout(findEpubCover(new File([blob], book.fileName)), FILE_TIMEOUT, book.fileName)
      if (cover) {
        await db.covers.put({ id: book.id, blob: cover.blob })
        await db.books.update(book.id, { hasCover: true, coverAspect: cover.aspect, palette: cover.palette ?? book.palette, coverTry: COVER_TRY })
        found = true
      } else await db.books.update(book.id, { coverTry: COVER_TRY })
    } catch (e) {
      console.warn('No se pudo buscar la portada', book.fileName, e)
    }
    await pause(30)
  }
  if (found) await refreshLibrary()
}

async function importFile(file: BookFile): Promise<string> {
  const format = formatOf(file.name)!
  // como archivo (Blob) y no como bloque de memoria: el libro puede pesar decenas de MB
  const blob = await platform.readBlob(file.path)
  const id = await hashBlob(blob)
  const existing = await db.books.get(id)
  if (existing) {
    if (existing.path !== file.path || existing.missing)
      await db.books.update(id, { path: file.path, fileName: file.name, missing: false })
    return id
  }
  const { cover, ...meta } = await extractBook(new File([blob], file.name), format)
  const record: BookRecord = {
    id,
    format,
    path: file.path,
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
    ...meta,
    hasCover: !!cover,
    coverTry: COVER_TRY,
    seriesKey: meta.series ? seriesKeyOf(meta.series) : undefined,
  }
  // la portada se guarda aparte: la lista de libros queda liviana aunque haya miles
  if (cover) await db.covers.put({ id, blob: cover })
  await db.books.put(record)
  return id
}
