import { app, BrowserWindow, dialog, ipcMain, net, powerSaveBlocker, protocol, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LibraryService } from './library.js'

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
  "connect-src 'self' blob: data: https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
].join('; ')

protocol.registerSchemesAsPrivileged([
  { scheme: 'mitzi', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let wakeLockId: number | null = null

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

  // Los enlaces externos de los libros se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
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
  app.quit()
})
