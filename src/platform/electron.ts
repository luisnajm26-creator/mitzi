import type { MitziNativeApi } from '../../shared/native-api'
import type { Platform } from './types'

/** Electron antepone «Error invoking remote method…»: se deja solo el motivo. */
const cleanIpcError = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function createElectronPlatform(api: MitziNativeApi): Platform {
  let offSync: (() => void) | null = null
  return {
    kind: 'electron',
    canManageFolders: true,
    getFolders: () => api.getFolders(),
    addFolder: () => api.addFolder(),
    removeFolder: folder => api.removeFolder(folder),
    revealFolder: folder => api.revealFolder(folder),
    scan: async () => ({ files: await api.scan(), complete: true }),
    async readBlob(path) {
      const bytes = await api.readBook(path)
      return new Blob([bytes as Uint8Array<ArrayBuffer>])
    },
    onLibraryChanged: cb => api.onLibraryChanged(cb),
    importDropped(files) {
      const paths = files.map(f => api.pathForFile(f)).filter(Boolean)
      return paths.length ? api.importFiles(paths) : Promise.resolve(0)
    },
    toggleFullscreen: () => api.toggleFullscreen(),
    onFullscreenChanged: cb => api.onFullscreenChanged(cb),
    keepAwake: on => api.keepAwake(on),
    // la ventana principal manda los enlaces externos al navegador (ver electron/main.ts)
    openExternal: url => void window.open(url, '_blank'),
    saveImage: async (png, name) => api.saveImage(new Uint8Array(await png.arrayBuffer()), name),
    copyImage: async png => api.copyImage(new Uint8Array(await png.arrayBuffer())),
    async syncServe(port, me, onRequest) {
      offSync?.()
      offSync = api.onSyncIncoming(async (id, body, remote) => {
        try {
          await api.syncReply(id, true, await onRequest(body, remote))
        } catch {
          await api.syncReply(id, false, '')
        }
      })
      return api.syncStart(port, me)
    },
    async syncStop() {
      offSync?.()
      offSync = null
      await api.syncStop()
    },
    syncDiscover: () => api.syncDiscover(47123),
    deviceLabel: () => api.deviceLabel(),
    setTray: on => void api.setTray(on),
    async syncRequest(hosts, port, body) {
      try {
        return await api.syncRequest(hosts, port, body)
      } catch (e) {
        throw new Error(cleanIpcError(e))
      }
    },
    async installUpdate(info, onProgress) {
      const off = api.onUpdateProgress(onProgress)
      try {
        return await api.installUpdate(info)
      } catch (e) {
        throw new Error(cleanIpcError(e))
      } finally {
        off()
      }
    },
  }
}
