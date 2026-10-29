import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, net, powerSaveBlocker, protocol, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LibraryService } from './library.js'
import { installUpdate } from './updater.js'
import { SyncServer, syncRequest } from './sync.js'
import type { UpdateInfo } from '../shared/native-api.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(here, '..', '..')
const distDir = path.join(appRoot, 'dist')
const devServerUrl = process.env.VITE_DEV_SERVER_URL

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  // localhost: servidor de voz en la misma PC (voces naturales)
  "connect-src 'self' blob: data: https://api.github.com http://localhost:* http://127.0.0.1:* https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
].join('; ')

protocol.registerSchemesAsPrivileged([
  { scheme: 'mitzi', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let wakeLockId: number | null = null
const syncServer = new SyncServer()

const library = new LibraryService(
  path.join(app.getPath('userData'), 'biblioteca.json'),
  path.join(app.getPath('documents'), 'Mitzi Libros'),
  app.isPackaged ? [] : [path.join(appRoot, 'libros-prueba')],
)

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: 'Mitzi',
    backgroundColor: '#0d0b12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('enter-full-screen', () => win?.webContents.send('window:fullscreen-changed', true))
  win.on('leave-full-screen', () => win?.webContents.send('window:fullscreen-changed', false))
  win.on('closed', () => (win = null))

  // Los enlaces externos (de los libros o de «Acerca de») se abren en el navegador o en
  // la app de correo, nunca dentro de Mitzi.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:\/\/|mailto:)/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('mitzi://')
    if (!allowed) event.preventDefault()
  })

  if (devServerUrl) win.loadURL(devServerUrl)
  else win.loadURL('mitzi://app/index.html')
}

function registerIpc() {
  ipcMain.handle('library:get-folders', () => library.getFolders())
  ipcMain.handle('library:add-folder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Elige una carpeta con libros',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return false
    await library.addFolder(result.filePaths[0])
    return true
  })
  ipcMain.handle('library:remove-folder', (_e, folder: string) => library.removeFolder(folder))
  ipcMain.handle('library:reveal', (_e, folder: string) => {
    if (library.folders.includes(folder)) return shell.openPath(folder)
  })
  ipcMain.handle('library:scan', () => library.scan())
  ipcMain.handle('library:read', (_e, file: string) => library.readBook(file))
  ipcMain.handle('library:import', (_e, files: string[]) => library.importFiles(files))
  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!win) return false
    const next = !win.isFullScreen()
    win.setFullScreen(next)
    return next
  })
  ipcMain.handle('update:install', (e, info: UpdateInfo) => installUpdate(info, fraction => e.sender.send('update:progress', fraction)))
  // tarjetas para compartir citas: guardar como PNG o copiar al portapapeles
  ipcMain.handle('image:save', async (_e, bytes: Uint8Array, name: string) => {
    const options = { defaultPath: path.join(app.getPath('pictures'), name), filters: [{ name: 'Imagen PNG', extensions: ['png'] }] }
    const { canceled, filePath } = await (win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options))
    if (canceled || !filePath) return false
    await writeFile(filePath, bytes)
    return true
  })
  // Electron 44 usa el portapapeles al estilo web (ClipboardItem con un Blob)
  ipcMain.handle('image:copy', (_e, bytes: Uint8Array) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(bytes)], { type: 'image/png' }) })]))
  // sincronizar por Wi-Fi: el servidor solo vive mientras la pantalla muestra el código
  ipcMain.handle('sync:start', (e, port: number) => syncServer.start(port, (id, body) => e.sender.send('sync:incoming', id, body)))
  ipcMain.handle('sync:reply', (_e, id: number, ok: boolean, body: string) => syncServer.reply(id, ok, body))
  ipcMain.handle('sync:stop', () => syncServer.stop())
  ipcMain.handle('sync:request', (_e, hosts: string[], port: number, body: string) => syncRequest(hosts, port, body))
  ipcMain.handle('power:keep-awake', (_e, on: boolean) => {
    if (on && wakeLockId === null) wakeLockId = powerSaveBlocker.start('prevent-display-sleep')
    if (!on && wakeLockId !== null) {
      powerSaveBlocker.stop(wakeLockId)
      wakeLockId = null
    }
  })
}

function serveApp() {
  protocol.handle('mitzi', async request => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(distDir, decodeURIComponent(pathname)))
    if (!file.startsWith(distDir)) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(file).toString())
    if (!file.endsWith('.html')) return response
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(response.body, { status: response.status, headers })
  })
}

app.whenReady().then(async () => {
  serveApp()
  registerIpc()
  await library.init(() => win?.webContents.send('library:changed'))
  createWindow()
})

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('window-all-closed', () => {
  library.dispose()
  void syncServer.stop()
  app.quit()
})
