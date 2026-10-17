import type { MitziNativeApi } from '../../shared/native-api'
import type { Platform } from './types'

export function createElectronPlatform(api: MitziNativeApi): Platform {
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
  }
}
