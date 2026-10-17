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
  /** Nombre legible de una carpeta (en Android las carpetas son URIs). */
  folderLabel?(folder: string): string
  scan(): Promise<BookFile[]>
  readFile(path: string): Promise<ArrayBuffer>
  onLibraryChanged(cb: () => void): () => void
  /** Copia a la biblioteca archivos arrastrados a la ventana. Devuelve cuántos copió. */
  importDropped(files: File[]): Promise<number>
  toggleFullscreen(): Promise<boolean>
  onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  keepAwake(on: boolean): Promise<void>
  /** Oculta las barras del sistema (Android) para leer a pantalla completa. */
  setImmersive?(on: boolean): Promise<void>
  /** Pide la frecuencia de pantalla más alta mientras hay animación (Android). */
  setHighRefresh?(on: boolean): Promise<void>
  /** Botón "atrás" del sistema (Android). */
  onBackButton?(cb: () => void): () => void
  exitApp?(): void
}
