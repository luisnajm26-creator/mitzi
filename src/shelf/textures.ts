import * as THREE from 'three'
import { clamp, isDark, mix } from '../lib/color'
import { db, type BookRecord } from '../library/db'
import { loadImage } from '../library/metadata'

export const BOOK_HEIGHT = 2.1
const MAX_COVER_PX = 1024
const TITLE_FONT = '"Literata Variable", Georgia, serif'
const UI_FONT = '"Nunito Variable", system-ui, sans-serif'

export interface BookDims {
  width: number
  height: number
  depth: number
}

export function bookDims(book: BookRecord): BookDims {
  const aspect = clamp(book.coverAspect || 0.68, 0.5, 0.9)
  return {
    width: BOOK_HEIGHT * aspect,
    height: BOOK_HEIGHT,
    depth: clamp(0.06 + book.pages * 0.0008, 0.09, 0.42),
  }
}

// ---------- recursos compartidos por todos los libros ----------

let shared: { edgeSide: THREE.Texture; edgeTop: THREE.Texture; shadow: THREE.Texture } | null = null

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return [canvas, canvas.getContext('2d')!] as const
}

/** Cantos de las hojas: papel crema con líneas finas. */
function paperEdges(vertical: boolean) {
  const [canvas, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#f1eadb'
  ctx.fillRect(0, 0, 256, 256)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 256; i += 1 + Math.floor(rand() * 2)) {
    ctx.fillStyle = `rgba(120, 100, 70, ${0.05 + rand() * 0.12})`
    if (vertical) ctx.fillRect(i, 0, 1, 256)
    else ctx.fillRect(0, i, 256, 1)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Sombra suave (un rectángulo desenfocado) que se pone en el piso bajo cada libro. */
function softShadow() {
  const [canvas, ctx] = makeCanvas(256, 256)
  ctx.filter = 'blur(22px)'
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.roundRect(56, 56, 144, 144, 24)
  ctx.fill()
  return new THREE.CanvasTexture(canvas)
}

export function getShared() {
  shared ??= { edgeSide: paperEdges(true), edgeTop: paperEdges(false), shadow: softShadow() }
  return shared
}

// ---------- texturas propias de cada libro ----------

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…')
  }
  return lines
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** Portada generada para libros sin imagen de portada. */
function generatedCover(book: BookRecord, aspect: number) {
  const w = 640
  const h = Math.round(w / aspect)
  const [canvas, ctx] = makeCanvas(w, h)
  const { primary, secondary, dark } = book.palette
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, primary)
  grad.addColorStop(1, mix(secondary, dark, 0.35))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  const ink = isDark(primary) ? '#fbf7ef' : '#1d1a22'
  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 3
  ctx.strokeRect(30, 30, w - 60, h - 60)
  ctx.globalAlpha = 1
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.font = `600 58px ${TITLE_FONT}`
  const lines = wrapLines(ctx, book.title, w - 120, 5)
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.36 + i * 70))
  if (book.author) {
    ctx.font = `500 30px ${UI_FONT}`
    ctx.globalAlpha = 0.85
    ctx.fillText(ellipsize(ctx, book.author, w - 120), w / 2, h * 0.82)
  }
  return canvas
}

/** Lomo: color de la portada, sombreado redondeado y el título a lo largo. */
function spineCanvas(book: BookRecord, dims: BookDims) {
  const h = 1024
  const w = Math.max(64, Math.round((h * dims.depth) / dims.height))
  const [canvas, ctx] = makeCanvas(w, h)
  const { primary, dark, light } = book.palette
  ctx.fillStyle = primary
  ctx.fillRect(0, 0, w, h)
  const shade = ctx.createLinearGradient(0, 0, w, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0.35)')
  shade.addColorStop(0.35, 'rgba(255,255,255,0.10)')
  shade.addColorStop(0.65, 'rgba(255,255,255,0.04)')
  shade.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h)

  const ink = isDark(primary) ? light : dark
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.7
  ctx.fillRect(0, h * 0.05, w, 3)
  ctx.fillRect(0, h * 0.95, w, 3)
  ctx.globalAlpha = 1

  ctx.save()
  ctx.translate(w / 2, 0)
  ctx.rotate(Math.PI / 2)
  ctx.textBaseline = 'middle'
  const size = Math.min(46, w * 0.42)
  ctx.font = `600 ${size}px ${TITLE_FONT}`
  ctx.fillText(ellipsize(ctx, book.title, h * 0.62), h * 0.1, 0)
  if (book.author) {
    ctx.font = `500 ${size * 0.62}px ${UI_FONT}`
    ctx.textAlign = 'right'
    ctx.globalAlpha = 0.85
    ctx.fillText(ellipsize(ctx, book.author, h * 0.2), h * 0.91, 0)
  }
  ctx.restore()
  return canvas
}

function canvasTexture(canvas: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}

/** Primera página (portadilla): papel crema con el título, como la de un libro impreso. */
function firstPageCanvas(book: BookRecord, aspect: number) {
  const w = 640
  const h = Math.round(w / aspect)
  const [canvas, ctx] = makeCanvas(w, h)
  ctx.fillStyle = '#f6f1e6'
  ctx.fillRect(0, 0, w, h)
  // sombra suave cerca del lomo
  const gutter = ctx.createLinearGradient(0, 0, w * 0.18, 0)
  gutter.addColorStop(0, 'rgba(80, 60, 30, 0.22)')
  gutter.addColorStop(1, 'rgba(80, 60, 30, 0)')
  ctx.fillStyle = gutter
  ctx.fillRect(0, 0, w * 0.18, h)
  ctx.fillStyle = '#3b342b'
  ctx.textAlign = 'center'
  ctx.font = `600 46px ${TITLE_FONT}`
  const lines = wrapLines(ctx, book.title, w - 160, 4)
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.34 + i * 56))
  ctx.fillStyle = book.palette.primary
  ctx.fillRect(w / 2 - 40, h * 0.34 + lines.length * 56 - 10, 80, 3)
  if (book.author) {
    ctx.fillStyle = '#6b6152'
    ctx.font = `500 26px ${UI_FONT}`
    ctx.fillText(ellipsize(ctx, book.author, w - 160), w / 2, h * 0.34 + lines.length * 56 + 40)
  }
  ctx.fillStyle = '#9a8f7e'
  ctx.font = `600 20px ${UI_FONT}`
  ctx.fillText('MITZI', w / 2, h * 0.92)
  return canvas
}

/** Guardas: el papel de color del interior de la tapa. */
function endpaperCanvas(book: BookRecord) {
  const [canvas, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = mix(book.palette.light, book.palette.primary, 0.3)
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = mix(book.palette.light, book.palette.primary, 0.48)
  for (let y = 0; y < 256; y += 32)
    for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
      ctx.beginPath()
      ctx.arc(x + 8, y + 8, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  return canvas
}

export interface BookPart {
  geometry: THREE.BoxGeometry
  /** BoxGeometry: [+x, -x, +y, -y, +z, -z] */
  materials: THREE.Material[]
  position: [number, number, number]
}

/**
 * Libro de tapa dura por piezas: la tapa gira sobre el lomo para abrirse.
 * `pivot` es la bisagra (borde del lomo, al frente); la tapa se dibuja relativa a ella.
 */
export interface BookModel {
  cover: BookPart
  pivot: [number, number, number]
  spine: BookPart
  back: BookPart
  block: BookPart
  ready: Promise<void>
  dispose(): void
}

export function createBookModel(book: BookRecord, dims: BookDims, anisotropy: number): BookModel {
  const { edgeSide, edgeTop } = getShared()
  const { width: w, height: h, depth: d } = dims
  const t = Math.min(0.026, d * 0.14) // grosor de las tapas
  const owned: THREE.Texture[] = []
  const tex = (canvas: HTMLCanvasElement) => {
    const texture = canvasTexture(canvas, anisotropy)
    owned.push(texture)
    return texture
  }

  const placeholder = tex(generatedCover(book, w / h))
  const coverMat = new THREE.MeshPhysicalMaterial({ map: placeholder, roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.28 })
  const spineTex = tex(spineCanvas(book, dims))
  const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.55 })
  const board = new THREE.MeshStandardMaterial({ color: mix(book.palette.primary, book.palette.dark, 0.45), roughness: 0.6 })
  const endpaperTex = tex(endpaperCanvas(book))
  const endpaper = new THREE.MeshStandardMaterial({ map: endpaperTex, roughness: 0.9 })
  const pageTex = tex(firstPageCanvas(book, w / h))
  const page = new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.92 })
  const paper = new THREE.MeshStandardMaterial({ color: '#f1eadb', roughness: 0.95 })
  const side = new THREE.MeshStandardMaterial({ map: edgeSide, roughness: 0.95 })
  const top = new THREE.MeshStandardMaterial({ map: edgeTop, roughness: 0.95 })

  const blockW = w - t - 0.018
  const blockH = h - 0.05
  const blockD = Math.max(0.01, d - 2 * t)
  const geometries = [
    new THREE.BoxGeometry(w, h, t),
    new THREE.BoxGeometry(t, h, d),
    new THREE.BoxGeometry(w, h, t),
    new THREE.BoxGeometry(blockW, blockH, blockD),
  ]

  let disposed = false
  const ready = (async () => {
    // con las fuentes cargadas, el lomo y las páginas se redibujan bien
    await document.fonts.ready
    if (disposed) return
    spineTex.image = spineCanvas(book, dims)
    spineTex.needsUpdate = true
    pageTex.image = firstPageCanvas(book, w / h)
    pageTex.needsUpdate = true
    const cover = book.hasCover ? await db.covers.get(book.id) : undefined
    if (!cover) {
      placeholder.image = generatedCover(book, w / h)
      placeholder.needsUpdate = true
      return
    }
    try {
      const img = await loadImage(cover.blob)
      if (disposed) return
      const scale = Math.min(1, MAX_COVER_PX / img.naturalHeight)
      const [canvas, ctx] = makeCanvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      coverMat.map = tex(canvas)
    } catch {
      // portada dañada: se queda la generada
    }
  })()

  return {
    pivot: [-w / 2, 0, d / 2 - t / 2],
    cover: { geometry: geometries[0], materials: [board, board, board, board, coverMat, endpaper], position: [w / 2, 0, 0] },
    spine: { geometry: geometries[1], materials: [board, spineMat, board, board, board, board], position: [-w / 2 + t / 2, 0, 0] },
    back: { geometry: geometries[2], materials: [board, board, board, board, endpaper, board], position: [0, 0, -d / 2 + t / 2] },
    block: {
      geometry: geometries[3],
      materials: [side, paper, top, top, page, paper],
      position: [-w / 2 + t + blockW / 2, 0, 0],
    },
    ready,
    dispose() {
      disposed = true
      for (const t of owned) t.dispose()
      for (const g of geometries) g.dispose()
      for (const m of [coverMat, spineMat, board, endpaper, page, paper, side, top]) m.dispose()
    },
  }
}
