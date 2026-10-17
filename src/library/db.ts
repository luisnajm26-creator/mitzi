import Dexie, { type Table } from 'dexie'
import type { Palette } from './palette'

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
  cover?: Blob
  /** ancho / alto de la portada */
  coverAspect: number
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

class MitziDB extends Dexie {
  books!: Table<BookRecord, string>
  files!: Table<FileRecord, string>
  progress!: Table<ProgressRecord, string>
  annotations!: Table<AnnotationRecord, string>

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
  }
}

export const db = new MitziDB()
