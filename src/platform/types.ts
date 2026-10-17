import type { BookFile, LibraryFolders } from '../../shared/native-api'

export type { BookFile, LibraryFolders }

/** Lo que cada plataforma (PC, Android, navegador) sabe hacer por la app. */
export interface Platform {
  kind: 'electron' | 'web' | 'android'
  /** Si se pueden agregar o quitar carpetas de libros desde la app. */
  canManageFolders: boolean
  getFolders(): Promise<LibraryFolders>
  addFolder(): Promise<boolean>
  removeFolder(folder: string): Promise<void>
  revealFolder(folder: string): Promise<void>
  scan(): Promise<BookFile[]>
  readFile(path: string): Promise<ArrayBuffer>
  onLibraryChanged(cb: () => void): () => void
  /** Copia a la biblioteca archivos arrastrados a la ventana. Devuelve cuántos copió. */
  importDropped(files: File[]): Promise<number>
  toggleFullscreen(): Promise<boolean>
  onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  keepAwake(on: boolean): Promise<void>
}
