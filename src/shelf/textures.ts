import * as THREE from 'three'
import { clamp, isDark, mix } from '../lib/color'
import type { BookRecord } from '../library/db'
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

export interface BookMaterials {
  materials: THREE.Material[]
  /** Se resuelve cuando la portada real ya está cargada. */
  ready: Promise<void>
  dispose(): void
}

/** Materiales en el orden de BoxGeometry: [+x canto, -x lomo, +y arriba, -y abajo, +z portada, -z contraportada]. */
export function createBookMaterials(book: BookRecord, dims: BookDims, anisotropy: number): BookMaterials {
  const { edgeSide, edgeTop } = getShared()
  const owned: THREE.Texture[] = []

  const placeholder = canvasTexture(generatedCover(book, dims.width / dims.height), anisotropy)
  owned.push(placeholder)
  const cover = new THREE.MeshPhysicalMaterial({
    map: placeholder,
    roughness: 0.48,
    clearcoat: 0.6,
    clearcoatRoughness: 0.28,
  })

  const spineTex = canvasTexture(spineCanvas(book, dims), anisotropy)
  owned.push(spineTex)
  const spine = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.55 })
  const back = new THREE.MeshStandardMaterial({ color: mix(book.palette.primary, book.palette.dark, 0.45), roughness: 0.6 })
  const side = new THREE.MeshStandardMaterial({ map: edgeSide, roughness: 0.95 })
  const top = new THREE.MeshStandardMaterial({ map: edgeTop, roughness: 0.95 })

  let disposed = false
  const ready = (async () => {
    // con las fuentes cargadas, el lomo y la portada generada se redibujan bien
    await document.fonts.ready
    if (disposed) return
    spineTex.image = spineCanvas(book, dims)
    spineTex.needsUpdate = true
    if (!book.cover) {
      placeholder.image = generatedCover(book, dims.width / dims.height)
      placeholder.needsUpdate = true
      return
    }
    try {
      const img = await loadImage(book.cover)
      if (disposed) return
      const scale = Math.min(1, MAX_COVER_PX / img.naturalHeight)
      const [canvas, ctx] = makeCanvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const texture = canvasTexture(canvas, anisotropy)
      owned.push(texture)
      cover.map = texture
    } catch {
      // portada dañada: se queda la generada
    }
  })()

  return {
    materials: [side, spine, top, top, cover, back],
    ready,
    dispose() {
      disposed = true
      for (const t of owned) t.dispose()
      for (const m of [cover, spine, back, side, top]) m.dispose()
    },
  }
}
