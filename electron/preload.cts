import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MitziNativeApi } from '../shared/native-api.js'

const listen = <T extends unknown[]>(channel: string, cb: (...args: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MitziNativeApi = {
  getFolders: () => ipcRenderer.invoke('library:get-folders'),
  addFolder: () => ipcRenderer.invoke('library:add-folder'),
  removeFolder: folder => ipcRenderer.invoke('library:remove-folder', folder),
  revealFolder: folder => ipcRenderer.invoke('library:reveal', folder),
  scan: () => ipcRenderer.invoke('library:scan'),
  readBook: path => ipcRenderer.invoke('library:read', path),
  importFiles: paths => ipcRenderer.invoke('library:import', paths),
  pathForFile: file => webUtils.getPathForFile(file),
  onLibraryChanged: cb => listen('library:changed', cb),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  onFullscreenChanged: cb => listen<[boolean]>('window:fullscreen-changed', cb),
  keepAwake: on => ipcRenderer.invoke('power:keep-awake', on),
  installUpdate: info => ipcRenderer.invoke('update:install', info),
  onUpdateProgress: cb => listen<[number]>('update:progress', cb),
  saveImage: (bytes, name) => ipcRenderer.invoke('image:save', bytes, name),
  copyImage: bytes => ipcRenderer.invoke('image:copy', bytes),
}

contextBridge.exposeInMainWorld('mitziNative', api)
