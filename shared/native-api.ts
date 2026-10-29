/** Un archivo de libro encontrado en alguna carpeta de la biblioteca. */
export interface BookFile {
  /** Ruta absoluta (PC) o identificador del archivo en la plataforma. */
  path: string
  name: string
  size: number
  mtime: number
}

export interface LibraryFolders {
  folders: string[]
  /** Carpeta donde se copian los libros arrastrados a la ventana. */
  defaultFolder: string | null
}

/** Una versión nueva publicada en GitHub Releases. */
export interface UpdateInfo {
  version: string
  /** nombre del archivo (Mitzi-Setup-x.y.z.exe o Mitzi-x.y.z.apk) */
  name: string
  url: string
  /** SHA256SUMS.txt de la misma versión: la huella que debe tener la descarga */
  sumsUrl: string
  notes: string
  pageUrl: string
}

/** Puente que el preload de Electron expone como `window.mitziNative`. */
export interface MitziNativeApi {
  getFolders(): Promise<LibraryFolders>
  addFolder(): Promise<boolean>
  removeFolder(folder: string): Promise<void>
  revealFolder(folder: string): Promise<void>
  scan(): Promise<BookFile[]>
  readBook(path: string): Promise<Uint8Array>
  importFiles(paths: string[]): Promise<number>
  pathForFile(file: File): string
  onLibraryChanged(cb: () => void): () => void
  toggleFullscreen(): Promise<boolean>
  onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  keepAwake(on: boolean): Promise<void>
  installUpdate(info: UpdateInfo): Promise<'installing'>
  onUpdateProgress(cb: (fraction: number) => void): () => void
  /** Guarda una imagen PNG donde elija el usuario. false si canceló. */
  saveImage(bytes: Uint8Array, name: string): Promise<boolean>
  copyImage(bytes: Uint8Array): Promise<void>
  /** Abre el servidor de sincronización en la red local; devuelve sus direcciones y puerto. */
  syncStart(port: number): Promise<{ hosts: string[]; port: number }>
  syncStop(): Promise<void>
  /** La respuesta a un pedido que llegó por `onSyncIncoming` (ok = false: código equivocado). */
  syncReply(id: number, ok: boolean, body: string): Promise<void>
  onSyncIncoming(cb: (id: number, body: string) => void): () => void
  syncRequest(hosts: string[], port: number, body: string): Promise<string>
}
