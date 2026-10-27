import { App } from '@capacitor/app'
import { Capacitor, registerPlugin, SystemBars, type PluginListenerHandle } from '@capacitor/core'
import type { BookFile, Platform } from './types'

interface MitziLibraryPlugin {
  getFolders(): Promise<{ folders: string[] }>
  pickFolder(): Promise<{ added: boolean }>
  removeFolder(options: { uri: string }): Promise<void>
  scan(): Promise<{ files: BookFile[]; failed?: string[] }>
  readFile(options: { path: string }): Promise<{ path: string }>
  setKeepAwake(options: { on: boolean }): Promise<void>
  setHighRefresh(options: { on: boolean }): Promise<void>
  openUrl(options: { url: string }): Promise<void>
  processText(options: { text: string }): Promise<{ handled: boolean }>
  haptic(): Promise<void>
  shareImage(options: { data: string; name: string }): Promise<void>
  installUpdate(options: { url: string; sumsUrl: string; name: string }): Promise<{ status: 'installing' | 'needs-permission' }>
  addListener(event: 'libraryChanged', cb: () => void): Promise<PluginListenerHandle>
  addListener(event: 'updateProgress', cb: (e: { fraction: number }) => void): Promise<PluginListenerHandle>
}

/** Plugin nativo propio (android/app/src/main/java/.../MitziLibraryPlugin.java). */
const Library = registerPlugin<MitziLibraryPlugin>('MitziLibrary')

const listen = (add: () => Promise<PluginListenerHandle>) => {
  const handle = add()
  return () => {
    handle.then(h => h.remove())
  }
}

/** "content://…/tree/primary%3ALibros" → "Almacenamiento interno/Libros" */
function folderLabel(uri: string) {
  const tree = decodeURIComponent(uri.split('/tree/')[1] ?? uri)
  const [volume, ...rest] = tree.split(':')
  const path = rest.join(':')
  const root = volume === 'primary' ? 'Almacenamiento interno' : `Tarjeta ${volume}`
  return path ? `${root}/${path}` : root
}

export function createAndroidPlatform(): Platform {
  let immersive = false
  return {
    kind: 'android',
    canManageFolders: true,
    async getFolders() {
      const { folders } = await Library.getFolders()
      return { folders, defaultFolder: null }
    },
    async addFolder() {
      const { added } = await Library.pickFolder()
      return added
    },
    removeFolder: uri => Library.removeFolder({ uri }),
    revealFolder: async () => {},
    folderLabel,
    async scan() {
      const { files, failed } = await Library.scan()
      return { files, complete: !failed?.length }
    },
    async readBlob(path) {
      // el plugin copia el libro a la caché de la app; se pide como Blob para no cargarlo en memoria
      const { path: local } = await Library.readFile({ path })
      const res = await fetch(Capacitor.convertFileSrc(local))
      if (!res.ok) throw new Error(`No se pudo leer ${path}`)
      return res.blob()
    },
    onLibraryChanged(cb) {
      const off = listen(() => Library.addListener('libraryChanged', cb))
      // al volver a la app (p. ej. tras copiar libros) se revisan las carpetas
      const offResume = listen(() => App.addListener('resume', cb))
      return () => {
        off()
        offResume()
      }
    },
    importDropped: async () => 0,
    openExternal: url => void Library.openUrl({ url }).catch(() => {}),
    haptic: () => void Library.haptic().catch(() => {}),
    async shareImage(png, name) {
      // el puente de Capacitor solo pasa texto: la imagen viaja en base64
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(png)
      })
      await Library.shareImage({ data, name })
    },
    lookupText: text =>
      Library.processText({ text })
        .then(r => r.handled)
        .catch(() => false),
    async installUpdate(info, onProgress) {
      const handle = await Library.addListener('updateProgress', e => onProgress(e.fraction))
      try {
        const { status } = await Library.installUpdate({ url: info.url, sumsUrl: info.sumsUrl, name: info.name })
        return status
      } finally {
        handle.remove()
      }
    },
    async toggleFullscreen() {
      await this.setImmersive?.(!immersive)
      return immersive
    },
    onFullscreenChanged: () => () => {},
    keepAwake: on => Library.setKeepAwake({ on }),
    async setImmersive(on) {
      immersive = on
      if (on) await SystemBars.hide()
      else await SystemBars.show()
    },
    setHighRefresh: on => Library.setHighRefresh({ on }).catch(() => {}),
    onBackButton: cb => listen(() => App.addListener('backButton', cb)),
    exitApp: () => App.exitApp(),
  }
}
