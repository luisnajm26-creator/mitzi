import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, net, powerSaveBlocker, protocol, shell, Tray } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LibraryService } from './library.js'
import { installUpdate } from './updater.js'
import os from 'node:os'
import { discover, SyncServer, syncRequest } from './sync.js'
import type { UpdateInfo } from '../shared/native-api.js'
import { CSP_HEADER } from '../shared/csp.js'
import { appFile } from './serve.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(here, '..', '..')
const distDir = path.join(appRoot, 'dist')
const devServerUrl = process.env.VITE_DEV_SERVER_URL
const linux = process.platform === 'linux'
const iconPath = path.join(appRoot, 'resources', 'icon.png')

// En Linux, Chromium solo usa las voces del sistema (speech-dispatcher, que Ubuntu trae) si se
// le pide; sin esto, la lectura en voz alta no encuentra ninguna voz.
if (linux) app.commandLine.appendSwitch('enable-speech-dispatcher')

// En Wayland, Chromium avisa que su modo nativo no es compatible con Vulkan y la biblioteca 3D
// se ve mal (bordes dentados, portadas borrosas). Con X11 (XWayland) se ve bien. Quien quiera
// otro modo puede pasar --ozone-platform=... al abrir Mitzi.
// Chromium elige el modo gráfico antes de que corra este código: un appendSwitch aquí llega tarde
// (la ventana queda en Wayland y la GPU en X11, y el proceso de GPU se cae). Por eso Mitzi se
// vuelve a abrir una sola vez con la opción en la línea de comandos; con ella ya no entra aquí.
if (linux && process.env.XDG_SESSION_TYPE === 'wayland' && !process.argv.some(arg => arg.startsWith('--ozone-platform'))) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] })
  app.exit(0)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'mitzi', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let wakeLockId: number | null = null
const syncServer = new SyncServer()
let tray: Tray | null = null
/** Al cerrar la ventana, Mitzi queda en la bandeja (así sigue atendiendo a los equipos vinculados). */
let keepInTray = false
let quitting = false

function showWindow() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function setTray(on: boolean) {
  keepInTray = on
  if (on && !tray) {
    // Windows dibuja el ícono de la bandeja a 16 px; la barra de Ubuntu, a unos 22-24 px
    const size = linux ? 24 : 16
    const icon = nativeImage.createFromPath(iconPath).resize({ width: size, height: size })
    tray = new Tray(icon)
    tray.setToolTip('Mitzi')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Mitzi', click: showWindow },
        { type: 'separator' },
        {
          label: 'Salir',
          click: () => {
            quitting = true
            app.quit()
          },
        },
      ]),
    )
    // en Ubuntu la bandeja no avisa del clic (solo abre el menú): ahí se usa «Abrir Mitzi»
    tray.on('click', showWindow)
  }
  if (!on && tray) {
    tray.destroy()
    tray = null
  }
}

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
    // en Windows el ícono sale del .exe; en Linux la ventana lo necesita aparte
    ...(linux ? { icon: iconPath } : {}),
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
  win.on('close', event => {
    if (!keepInTray || quitting) return
    // se esconde en vez de cerrarse: la página sigue viva y sigue sincronizando
    event.preventDefault()
    win?.hide()
  })

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
  ipcMain.handle('sync:start', (e, port: number, me: { id: string; label: string }) =>
    syncServer.start(port, me, (id, body, remote) => e.sender.send('sync:incoming', id, body, remote)),
  )
  ipcMain.handle('sync:reply', (_e, id: number, ok: boolean, body: string) => syncServer.reply(id, ok, body))
  ipcMain.handle('sync:stop', () => syncServer.stop())
  ipcMain.handle('sync:request', (_e, hosts: string[], port: number, body: string) => syncRequest(hosts, port, body))
  ipcMain.handle('sync:discover', (_e, port: number) => discover(port))
  ipcMain.handle('app:label', () => os.hostname())
  ipcMain.handle('app:tray', (_e, on: boolean) => setTray(on))
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
    const file = appFile(distDir, new URL(request.url).pathname)
    // nosniff en todas: el navegador no adivina el tipo (un .txt no se ejecuta como script)
    if (!file) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } })
    const response = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(response.headers)
    headers.set('X-Content-Type-Options', 'nosniff')
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', CSP_HEADER)
    return new Response(response.body, { status: response.status, headers })
  })
}

app.whenReady().then(async () => {
  serveApp()
  registerIpc()
  await library.init(() => win?.webContents.send('library:changed'))
  createWindow()
})

app.on('second-instance', () => showWindow())

app.on('before-quit', () => (quitting = true))

app.on('window-all-closed', () => {
  library.dispose()
  void syncServer.stop()
  app.quit()
})
