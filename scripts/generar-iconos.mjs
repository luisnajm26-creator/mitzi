// Genera los íconos PNG de Mitzi (Android y PC) a partir de los SVG.
// Uso: npx electron scripts/generar-iconos.mjs
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const res = path.join(root, 'android', 'app', 'src', 'main', 'res')
const full = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8')
const foreground = fs.readFileSync(path.join(root, 'resources', 'icon-foreground.svg'), 'utf8')

/** Dibuja un SVG a `size` px con Chromium y devuelve el PNG. */
async function render(win, svg, size, round = false) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}"
      style="display:block;${round ? 'border-radius:50%' : ''}"></body></html>`
  win.setContentSize(size, size)
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise(r => setTimeout(r, 120))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
  }

  // Android: ícono clásico (48 dp) y capa frontal del adaptable (108 dp)
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(res, `mipmap-${name}`)
    write(path.join(dir, 'ic_launcher.png'), await render(win, full, 48 * scale))
    write(path.join(dir, 'ic_launcher_round.png'), await render(win, full, 48 * scale, true))
    write(path.join(dir, 'ic_launcher_foreground.png'), await render(win, foreground, 108 * scale))
  }
  // PC (electron-builder convierte el PNG a .ico)
  write(path.join(root, 'resources', 'icon.png'), await render(win, full, 512))
  console.log('Íconos generados')
  app.quit()
})
