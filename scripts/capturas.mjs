// Capturas para el README: abre Mitzi (servidor de desarrollo, con los libros de
// `npm run demo`) en una ventana invisible, la maneja como una persona y guarda PNG en docs/capturas/.
// Uso: npm run demo, npm run dev y, en otra terminal:  npx electron scripts/capturas.mjs
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs', 'capturas')
const URL = process.env.MITZI_URL ?? 'http://localhost:5173'
const wait = ms => new Promise(r => setTimeout(r, ms))

/**
 * Una ventana fuera de pantalla del tamaño pedido (en píxeles CSS), dibujada más grande para
 * que se vea nítida (la ventana no puede ser más alta que el monitor: la escala se ajusta).
 */
async function open(width, height) {
  const zoom = Math.min(2, 1040 / height)
  const win = new BrowserWindow({
    width: Math.round(width * zoom),
    height: Math.round(height * zoom),
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, zoomFactor: zoom },
  })
  win.webContents.setFrameRate(60)
  // a veces la primera carga se corta (recarga del servidor de desarrollo): se reintenta
  for (let i = 0; i < 3; i++) {
    try {
      await win.loadURL(URL)
      break
    } catch {
      await wait(2000)
    }
  }
  // Chromium recuerda el zoom por sitio (lo comparten todas las ventanas): se fija para esta
  win.webContents.setZoomFactor(zoom)
  await wait(9000) // carrusel 3D y portadas
  return win
}

const js = (win, code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`)
const key = (win, keyCode) => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
}
async function shot(win, name) {
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(out, name), image.toPNG())
  console.log('  ', name)
}

/** Gira el carrusel hasta el libro cuyo título contiene `text`. */
async function pick(win, text) {
  // primero hacia la derecha y, si no está, hacia la izquierda (el orden cambia con lo último leído)
  for (const dir of ['Right', 'Left']) {
    for (let i = 0; i < 8; i++) {
      const title = await js(win, `return document.querySelector('.shelf-title')?.textContent ?? ''`)
      if (title.toLowerCase().includes(text)) return
      key(win, dir)
      await wait(1000)
    }
  }
}

const click = (win, selector) => js(win, `document.querySelector(${JSON.stringify(selector)})?.click()`)
const button = (win, label) =>
  js(win, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})?.click()`)

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })

  // ---- PC ----  (SOLO=pc o SOLO=telefono para hacer solo una parte)
  if (process.env.SOLO !== 'telefono') {
  const pc = await open(1440, 860)
  // un libro del medio, con libros a los dos lados
  await pick(pc, 'cuaderno')
  // el libro del centro gira: varias tomas para elegir la que muestre la portada
  for (let i = 1; i <= 8; i++) {
    await wait(700)
    await shot(pc, `biblioteca-${i}.png`)
  }

  await button(pc, 'Buscar')
  await wait(1500)
  await shot(pc, 'explorador.png')
  key(pc, 'Escape')
  await wait(1200)

  await pick(pc, 'faro')
  await js(pc, `[...document.querySelectorAll('button')].find(b => /^(Leer|Continuar)$/.test(b.textContent.trim()))?.click()`)
  await wait(5000)
  for (let i = 0; i < 2; i++) {
    key(pc, 'Right')
    await wait(1500)
  }
  await shot(pc, 'lector.png')

  // la hoja congelada en varios puntos del giro
  for (const k of [0.25, 0.55, 0.75]) {
    await js(pc, `window.__mitziFlipFreeze = ${k}`)
    key(pc, 'Right')
    await wait(1800)
    await shot(pc, `pasar-pagina-${Math.round(k * 100)}.png`)
    await js(pc, `window.__mitziFlipFreeze = undefined`)
    await wait(1500)
  }
  pc.destroy()
  }

  // ---- teléfono ----
  if (process.env.SOLO !== 'pc') {
  // tamaño típico de un Android; sin el botón de pantalla completa, que en Android no existe
  const phone = await open(412, 915)
  await phone.webContents.insertCSS('[aria-label^="Pantalla completa"] { display: none !important; }')
  await pick(phone, 'jard')
  for (let i = 1; i <= 8; i++) {
    await wait(700)
    await shot(phone, `telefono-biblioteca-${i}.png`)
  }
  await js(phone, `[...document.querySelectorAll('button')].find(b => /^(Leer|Continuar)$/.test(b.textContent.trim()))?.click()`)
  await wait(5000)
  key(phone, 'Right')
  await wait(1500)
  // tema Lavanda desde «Lectura cómoda»
  await button(phone, 'Ajustes de lectura')
  await wait(800)
  await button(phone, 'Lavanda')
  await wait(600)
  await shot(phone, 'telefono-ajustes.png')
  await click(phone, '.panel-close')
  await wait(1200)
  await shot(phone, 'telefono-lector.png')

  // tarjeta para compartir: se dibuja igual que en la app
  const png = await js(
    phone,
    `const card = await import('/src/reader/share/card.ts')
     const d = await import('/src/reader/share/designs.ts')
     const palette = { primary: '#7c5cc4', secondary: '#c48a5c', dark: '#2a2140', light: '#efe6ff' }
     const canvas = await card.renderCard({
       text: card.cleanQuote('A veces un libro te encuentra justo cuando lo necesitas, y entonces ya no sabes si lo estabas leyendo o si él te estaba leyendo a ti.'),
       title: 'El faro de las palabras', author: 'Libro de prueba de Mitzi',
       colors: d.DESIGNS[1].colors(null, palette), format: 'historia', fontId: 'literata' })
     return canvas.toDataURL('image/png')`,
  )
  fs.writeFileSync(path.join(out, 'cita.png'), Buffer.from(png.split(',')[1], 'base64'))
  console.log('   cita.png')
  phone.destroy()
  }

  console.log(`Capturas en ${path.relative(root, out)}`)
  app.quit()
})
