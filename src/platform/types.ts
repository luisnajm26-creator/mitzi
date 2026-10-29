import type { BookFile, LibraryFolders, UpdateInfo } from '../../shared/native-api'

export type { BookFile, LibraryFolders, UpdateInfo }

export interface ScanResult {
  files: BookFile[]
  /** false si alguna carpeta no se pudo leer (sin permiso, desconectada…). */
  complete: boolean
}

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
  scan(): Promise<ScanResult>
  /** El libro como archivo (en Android queda en disco, no en memoria). */
  readBlob(path: string): Promise<Blob>
  onLibraryChanged(cb: () => void): () => void
  /** Copia a la biblioteca archivos arrastrados a la ventana. Devuelve cuántos copió. */
  importDropped(files: File[]): Promise<number>
  toggleFullscreen(): Promise<boolean>
  onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  keepAwake(on: boolean): Promise<void>
  /** Abre un enlace (https o mailto) fuera de la app: navegador o app de correo. */
  openExternal(url: string): void
  /** Un toque de vibración muy leve (Android; respeta la configuración del teléfono). */
  haptic?(): void
  /** Ofrece el texto a las apps que saben procesarlo (Android). false si no hay ninguna. */
  lookupText?(text: string): Promise<boolean>
  /**
   * Descarga una versión nueva, comprueba su huella y la instala (PC y Android).
   * 'needs-permission': Android pidió permitir que Mitzi instale apps.
   */
  installUpdate?(info: UpdateInfo, onProgress: (fraction: number) => void): Promise<'installing' | 'needs-permission'>
  /** Abre el menú de compartir del sistema con una imagen (Android). */
  shareImage?(png: Blob, name: string): Promise<void>
  /** Guarda una imagen donde elija el usuario (PC). false si canceló. */
  saveImage?(png: Blob, name: string): Promise<boolean>
  /** Copia una imagen al portapapeles (PC). */
  copyImage?(png: Blob): Promise<void>
  /** Oculta las barras del sistema (Android) para leer a pantalla completa. */
  setImmersive?(on: boolean): Promise<void>
  /** Pide la frecuencia de pantalla más alta mientras hay animación (Android). */
  setHighRefresh?(on: boolean): Promise<void>
  /** Botón "atrás" del sistema (Android). */
  onBackButton?(cb: () => void): () => void
  exitApp?(): void
  /**
   * Espera sincronizaciones de otro dispositivo en la red local (PC). `onRequest` recibe lo que
   * llegó y devuelve la respuesta; si lanza un error (código equivocado) se responde que no.
   */
  syncServe?(port: number, onRequest: (body: string) => Promise<string>): Promise<{ hosts: string[]; port: number }>
  syncStop?(): Promise<void>
  /** Manda una sincronización a otra PC de la red local; prueba cada dirección. */
  syncRequest?(hosts: string[], port: number, body: string): Promise<string>
}
