import Dexie, { type Table } from 'dexie'
import type { Palette } from './palette'
import { guessSeries, seriesKeyOf } from './series'

export type BookFormat = 'epub' | 'pdf'

export interface BookRecord {
  /** SHA-256 del archivo: el mismo libro tiene el mismo id en cualquier dispositivo. */
  id: string
  format: BookFormat
  path: string
  fileName: string
  size: number
  title: string
  author: string
  language?: string
  /** Páginas (PDF) o páginas estimadas (EPUB); da el grosor del libro. */
  pages: number
  /** La portada está guardada aparte (tabla covers) para que la lista de libros pese poco. */
  hasCover?: boolean
  /** ancho / alto de la portada */
  coverAspect: number
  /** Serie (de los datos del libro o deducida del título) y número de tomo. */
  series?: string
  seriesIndex?: number
  seriesKey?: string
  palette: Palette
  addedAt: number
  lastOpenedAt?: number
  /** El archivo ya no está en ninguna carpeta (se conserva el progreso por si vuelve). */
  missing?: boolean
}

/** Índice de archivos para no volver a leer los que no cambiaron. */
export interface FileRecord {
  path: string
  size: number
  mtime: number
  /** id del libro, o '!error' si no se pudo leer */
  bookId: string
}

export interface ProgressRecord {
  bookId: string
  /** CFI (EPUB) o número de página (PDF) */
  location: string
  fraction: number
  chapter?: string
  updatedAt: number
}

export type HighlightColor = 'amarillo' | 'verde' | 'azul' | 'rosa' | 'lila'

/** Subrayado (y nota opcional) dentro de un libro. */
export interface AnnotationRecord {
  id: string
  bookId: string
  /** EPUB: CFI del texto subrayado. PDF: "page:N". */
  anchor: string
  /** PDF: rectángulos del subrayado en la página, en proporción (0–1): [x, y, ancho, alto]. */
  rects?: [number, number, number, number][]
  color: HighlightColor
  text: string
  note?: string
  chapter?: string
  /** Posición en el libro (0–1), para ordenar. */
  fraction: number
  createdAt: number
  updatedAt: number
  /** Borrado lógico: así el borrado también se sincroniza entre dispositivos. */
  deleted?: boolean
}

export interface CoverRecord {
  id: string
  blob: Blob
}

class MitziDB extends Dexie {
  books!: Table<BookRecord, string>
  files!: Table<FileRecord, string>
  progress!: Table<ProgressRecord, string>
  annotations!: Table<AnnotationRecord, string>
  covers!: Table<CoverRecord, string>

  constructor() {
    super('mitzi')
    this.version(1).stores({
      books: 'id, path, lastOpenedAt, addedAt',
      files: 'path, bookId',
      progress: 'bookId, updatedAt',
    })
    this.version(2).stores({
      annotations: 'id, bookId, updatedAt',
    })
    // las portadas pasan a su propia tabla y cada libro guarda su serie
    this.version(3)
      .stores({
        books: 'id, path, lastOpenedAt, addedAt, seriesKey',
        covers: 'id',
      })
      .upgrade(async tx => {
        const books = tx.table('books')
        const covers = tx.table('covers')
        for (const b of (await books.toArray()) as (BookRecord & { cover?: Blob })[]) {
          if (b.cover) await covers.put({ id: b.id, blob: b.cover })
          const guess = b.series ? null : guessSeries(b.title)
          const { cover, ...rest } = b
          const series = b.series ?? guess?.series
          await books.put({
            ...rest,
            hasCover: !!cover,
            series,
            seriesIndex: b.seriesIndex ?? guess?.index,
            seriesKey: series ? seriesKeyOf(series) : undefined,
          })
        }
      })
  }
}

export const db = new MitziDB()
