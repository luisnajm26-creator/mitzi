import type { BookFile, LibraryFolders, Platform } from './types'

interface DevListing {
  folder: string
  books: BookFile[]
}

const fetchListing = async (): Promise<DevListing> => {
  const res = await fetch('/__mitzi/books')
  return res.json()
}

/**
 * Versión para navegador. En desarrollo lee los libros de `libros-prueba/`
 * a través del servidor de Vite; fuera de desarrollo la biblioteca empieza vacía.
 */
export function createWebPlatform(): Platform {
  const dev = import.meta.env.DEV
  let wakeLock: WakeLockSentinel | null = null

  return {
    kind: 'web',
    canManageFolders: false,
    async getFolders(): Promise<LibraryFolders> {
      if (!dev) return { folders: [], defaultFolder: null }
      const { folder } = await fetchListing()
      return { folders: [folder], defaultFolder: folder }
    },
    addFolder: async () => false,
    removeFolder: async () => {},
    revealFolder: async () => {},
    async scan() {
      if (!dev) return { files: [], complete: true }
      return { files: (await fetchListing()).books, complete: true }
    },
    async readBlob(path) {
      const res = await fetch(`/__mitzi/book?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error(`No se pudo leer ${path}`)
      return res.blob()
    },
    onLibraryChanged(cb) {
      const hot = import.meta.hot
      if (!hot) return () => {}
      hot.on('mitzi:library-changed', cb)
      return () => hot.off('mitzi:library-changed', cb)
    },
    importDropped: async () => 0,
    openExternal: url => void window.open(url, '_blank', 'noopener'),
    async toggleFullscreen() {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return false
      }
      await document.documentElement.requestFullscreen()
      return true
    },
    onFullscreenChanged(cb) {
      const listener = () => cb(!!document.fullscreenElement)
      document.addEventListener('fullscreenchange', listener)
      return () => document.removeEventListener('fullscreenchange', listener)
    },
    async keepAwake(on) {
      try {
        if (on && !wakeLock) wakeLock = await navigator.wakeLock.request('screen')
        if (!on && wakeLock) {
          await wakeLock.release()
          wakeLock = null
        }
      } catch {
        // el navegador puede negarlo; no es crítico
      }
    },
  }
}
