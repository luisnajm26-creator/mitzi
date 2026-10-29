// GIF del README: el libro abierto y la hoja que gira, grabados de la app real.
// Uso: npm run demo, npm run dev y, en otra terminal:  npx electron scripts/gif-hoja.mjs
// Graba con el giro más lento (window.__mitziFlipSlow, solo en desarrollo) para tener muchos
// cuadros y luego elige los que tocan para que en el GIF dure lo que se quiera.
// La ventana es real (fuera de la pantalla), no «offscreen»: sin GPU, las copias de la hoja que
// gira se dibujan mal (textos encimados) y el GIF no se parecería a la app.
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import gifenc from 'gifenc'

const { GIFEncoder, applyPalette, quantize } = gifenc

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(root, 'docs', 'capturas', 'hoja.gif')
const URL = process.env.MITZI_URL ?? 'http://localhost:5173'
const wait = ms => new Promise(r => setTimeout(r, ms))

// fuera de la pantalla, Windows la daría por tapada y dejaría de dibujarla
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const WIDTH = 1280
const HEIGHT = 760
/** ancho del GIF en píxeles */
const GIF_WIDTH = 640
/** el giro se graba así de lento… */
const SLOW = 8
/** …y en el GIF dura esto (el real son 720 ms: un poco más lento se aprecia mejor) */
const FLIP_MS = 1300
const FPS = 20
/** quieto entre giros, para leer la página */
const HOLD_MS = 1400
const FLIPS = 2

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    x: -WIDTH - 400,
    y: 0,
    width: WIDTH,
    height: HEIGHT,
    show: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    useContentSize: true,
    webPreferences: { backgroundThrottling: false },
  })
  for (let i = 0; i < 3; i++) {
    try {
      await win.loadURL(URL)
      break
    } catch {
      await wait(2000)
    }
  }
  win.webContents.setZoomFactor(1)
  await wait(9000)

  const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`)
  const key = keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  }

  // abre «El faro de las palabras» y avanza a una página con texto
  for (const dir of ['Right', 'Left'])
    for (let i = 0; i < 8; i++) {
      const title = await js(`return document.querySelector('.shelf-title')?.textContent ?? ''`)
      if (title.toLowerCase().includes('faro')) break
      key(dir)
      await wait(1000)
    }
  await js(`[...document.querySelectorAll('button')].find(b => /^(Leer|Continuar)$/.test(b.textContent.trim()))?.click()`)
  await wait(5000)
  for (let i = 0; i < 2; i++) {
    key('Right')
    await wait(1500)
  }
  // sin barras encima del libro
  await win.webContents.insertCSS('.reader-top, .reader-bottom, .reader-chrome { opacity: 0 !important; }')
  await wait(2500)

  // graba capturas seguidas mientras dure el giro, cada una con su hora
  let recording = null
  const record = async until => {
    while (performance.now() < until) {
      const at = performance.now()
      const image = await win.webContents.capturePage()
      recording.push({ at, image: image.resize({ width: GIF_WIDTH, quality: 'good' }) })
    }
  }

  const gifFrames = []
  const still = async () => {
    const image = (await win.webContents.capturePage()).resize({ width: GIF_WIDTH, quality: 'good' })
    gifFrames.push({ image, delay: HOLD_MS })
  }

  await js(`window.__mitziFlipSlow = ${SLOW}`)
  for (let f = 0; f < FLIPS; f++) {
    await still()
    recording = []
    const start = performance.now()
    key('Right')
    await record(start + 720 * SLOW + 1200)
    const frames = recording
    recording = null
    // los cuadros que caen en cada instante del GIF (el más cercano a esa hora)
    const count = Math.round((FLIP_MS / 1000) * FPS)
    const flipStart = frames.find(fr => fr.at > start)?.at ?? start
    for (let i = 0; i <= count; i++) {
      const t = flipStart + (i / count) * 720 * SLOW
      let best = frames[0]
      for (const fr of frames) if (Math.abs(fr.at - t) < Math.abs(best.at - t)) best = fr
      gifFrames.push({ image: best.image, delay: 1000 / FPS })
    }
    console.log(`  giro ${f + 1}: ${frames.length} cuadros grabados`)
  }
  await js(`window.__mitziFlipSlow = undefined`)

  // una paleta para todo el GIF (sacada de varios cuadros): así los colores no parpadean
  const size = gifFrames[0].image.getSize()
  const rgba = img => {
    const bgra = img.toBitmap()
    const out = new Uint8Array(bgra.length)
    for (let i = 0; i < bgra.length; i += 4) {
      out[i] = bgra[i + 2]
      out[i + 1] = bgra[i + 1]
      out[i + 2] = bgra[i]
      out[i + 3] = 255
    }
    return out
  }
  const pixels = gifFrames.map(f => rgba(f.image))
  const sample = new Uint8Array(pixels.filter((_, i) => i % 6 === 0).reduce((n, p) => n + p.length, 0))
  let offset = 0
  pixels.forEach((p, i) => {
    if (i % 6 === 0) {
      sample.set(p, offset)
      offset += p.length
    }
  })
  const palette = quantize(sample, 256)
  const gif = GIFEncoder()
  pixels.forEach((p, i) => {
    gif.writeFrame(applyPalette(p, palette), size.width, size.height, { palette: i === 0 ? palette : undefined, delay: gifFrames[i].delay, repeat: 0 })
  })
  gif.finish()
  fs.writeFileSync(outFile, gif.bytes())
  console.log(`${path.relative(root, outFile)}: ${gifFrames.length} cuadros, ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB`)
  win.destroy()
  app.quit()
})
