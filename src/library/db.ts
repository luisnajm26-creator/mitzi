import Dexie, { type Table } from 'dexie'
import type { Palette } from './palette'
import type { BookFormat } from './formats'
import { guessSeries, seriesKeyOf } from './series'

export type { BookFormat }

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
  /** veces que se buscó la portada con un método mejor (para no repetirlo) */
  coverTry?: number
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
  /** si no se pudo leer: nombre del archivo y el motivo, para mostrarlo */
  name?: string
  error?: string
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

/** Lo leído en un día (estadísticas y meta diaria). */
export interface ReadingDay {
  /** 2026-10-21 */
  day: string
  minutes: number
  pages: number
  /** ids de los libros que se leyeron ese día */
  books: string[]
}

/** Marcador de página: para volver a una página sin subrayar nada. */
export interface BookmarkRecord {
  id: string
  bookId: string
  /** CFI (EPUB) o número de página (PDF) donde empieza la página marcada */
  location: string
  fraction: number
  /** capítulo o «Página N» */
  label?: string
  /** el comienzo del texto de esa página, para reconocerla en la lista */
  excerpt?: string
  createdAt: number
}

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
  bookmarks!: Table<BookmarkRecord, string>
  readingDays!: Table<ReadingDay, string>

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
    // marcadores de página
    this.version(4).stores({
      bookmarks: 'id, bookId',
    })
    // estadísticas: un registro por día
    this.version(5).stores({
      readingDays: 'day',
    })
  }
}

export const db = new MitziDB()
