import { FONTS, type FontId } from '../comfort/fonts'
import { FORMATS, WATERMARK, type CardColors, type CardFormat } from './designs'

/**
 * Dibuja la tarjeta de una cita en un canvas: comillas, la cita con la letra del lector,
 * el libro y la marca de Mitzi. Todo en el dispositivo, sin servidor.
 */
export interface CardInput {
  text: string
  title: string
  author: string
  colors: CardColors
  format: CardFormat
  fontId: FontId
  /** portada (opcional; apagada por defecto por los derechos de autor) */
  cover?: { source: CanvasImageSource; width: number; height: number }
}

/** Más palabras que esto ya no caben bien: se recorta con «…». */
export const LONG_QUOTE_WORDS = 60

const loaded = new Map<FontId, Promise<void>>()

/** El canvas solo usa letras ya cargadas en la página (no las del iframe del libro). */
export function loadFont(id: FontId) {
  let p = loaded.get(id)
  if (!p) {
    const font = FONTS[id]
    p = Promise.all(
      font.faces.map(f => {
        const face = new FontFace(font.family, `url("${new URL(f.url, document.baseURI).href}")`, { style: f.style, weight: f.weight })
        document.fonts.add(face)
        return face.load()
      }),
    )
      .then(() => undefined)
      .catch(() => undefined) // sin la letra se usa la de respaldo
    loaded.set(id, p)
  }
  return p
}

let icon: Promise<HTMLImageElement | null> | null = null
export function loadIcon() {
  icon ??= new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = './icon.svg'
  })
  return icon
}

/** Parte el texto en renglones que caben en `width` (respeta los saltos de párrafo). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ').filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= width || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

/**
 * El texto de la selección, limpio. Un salto simple es fin de renglón (los PDF lo traen
 * en cada uno) y se vuelve espacio; solo un renglón en blanco separa párrafos.
 * Si la cita empieza o termina a media frase, lleva «…».
 */
export function cleanQuote(text: string) {
  let quote = text
    .replace(/\u00ad/g, '')
    .replace(/\r/g, '')
    // palabra partida al final del renglón: «algu-» + «nas» → «algunas»
    .replace(/(\p{L})-\n(?=\p{Ll})/gu, '$1')
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  if (/^\p{Ll}/u.test(quote)) quote = '…' + quote
  if (/[\p{L}\d,;:]$/u.test(quote)) quote = quote.replace(/[,;:]$/, '') + '…'
  return quote
}

/** Fondo de todas las tarjetas: degradado suave y una luz desde arriba. */
export function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, c: CardColors) {
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, c.bgTop)
  bg.addColorStop(1, c.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.8)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.10)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
}

/** Marca de Mitzi abajo, centrada en `y`: así quien vea la imagen sabe de dónde salió. */
export function paintBrand(ctx: CanvasRenderingContext2D, W: number, y: number, family: string, c: CardColors, logo: HTMLImageElement | null) {
  ctx.font = `600 30px ${family}`
  const labelW = ctx.measureText(WATERMARK).width
  const iconS = logo ? 52 : 0
  const bx = (W - (iconS + (iconS ? 16 : 0) + labelW)) / 2
  if (logo) ctx.drawImage(logo, bx, y - iconS / 2, iconS, iconS)
  ctx.fillStyle = c.muted
  ctx.textBaseline = 'middle'
  ctx.fillText(WATERMARK, bx + iconS + (iconS ? 16 : 0), y + 1)
}

/** La letra elegida en el lector, ya cargada, como valor de `font-family` para el canvas. */
export async function cardFamily(id: FontId) {
  const fontId: FontId = id === 'publisher' ? 'literata' : id
  await Promise.all([loadFont(fontId), document.fonts.load(`700 40px '${FONTS[fontId].family}'`).catch(() => {})])
  return `'${FONTS[fontId].family}', ${FONTS[fontId].fallback}`
}

export async function renderCard(input: CardInput): Promise<HTMLCanvasElement> {
  const family = await cardFamily(input.fontId)
  const logo = await loadIcon()

  const { width: W, height: H } = FORMATS[input.format]
  const story = input.format === 'historia'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const c = input.colors

  paintBackground(ctx, W, H, c)

  const pad = story ? 120 : 96
  const textW = W - pad * 2
  const brandH = 64
  const room = H - pad * 2 - brandH - (story ? 120 : 40)

  // datos del libro: título (hasta dos renglones) y autor
  const coverH = input.cover ? (story ? 190 : 150) : 0
  const coverW = input.cover ? Math.round((coverH * input.cover.width) / input.cover.height) : 0
  const infoX = coverW ? coverW + 36 : 0
  ctx.font = `700 ${story ? 42 : 36}px ${family}`
  const allTitle = wrap(ctx, input.title, textW - infoX)
  const titleLines = allTitle.slice(0, 2)
  // título de más de dos renglones: se corta con «…» sin pasarse del ancho
  if (allTitle.length > 2) {
    let last = titleLines[1]
    while (last.includes(' ') && ctx.measureText(last + '…').width > textW - infoX) last = last.slice(0, last.lastIndexOf(' '))
    titleLines[1] = last.replace(/[\s,;:.—-]+$/, '') + '…'
  }
  const titleH = titleLines.length * (story ? 54 : 46)
  const authorH = input.author ? (story ? 50 : 44) : 0
  const infoH = Math.max(coverH, titleH + authorH)

  const markH = story ? 150 : 120
  const gap = story ? 70 : 52

  // la cita: la letra más grande que quepa; si ni con la mínima cabe, se recorta
  let words = input.text.split(' ')
  let size = story ? 74 : 62
  const min = story ? 38 : 32
  let lines: string[] = []
  const fits = (s: number, text: string) => {
    ctx.font = `400 ${s}px ${family}`
    lines = wrap(ctx, text, textW)
    return markH + lines.length * s * 1.42 + gap + infoH <= room
  }
  while (size > min && !fits(size, input.text)) size -= 2
  if (!fits(size, input.text)) {
    while (words.length > 3 && !fits(size, words.join(' ') + '…')) words = words.slice(0, -1)
    fits(size, words.join(' ').replace(/[\s,;:.—-]+$/, '') + '…')
  }
  const lineH = size * 1.42
  const groupH = markH + lines.length * lineH + gap + infoH
  let y = pad + (story ? 60 : 10) + (room - groupH) / 2

  // comillas grandes
  ctx.fillStyle = c.accent
  ctx.font = `700 ${story ? 260 : 210}px ${family}`
  ctx.textBaseline = 'top'
  ctx.fillText('“', pad - 8, y - (story ? 30 : 24))
  y += markH

  ctx.fillStyle = c.text
  ctx.font = `400 ${size}px ${family}`
  ctx.textBaseline = 'alphabetic'
  for (const line of lines) {
    ctx.fillText(line, pad, y + size)
    y += lineH
  }

  // línea y libro
  y += gap - 20
  ctx.fillStyle = c.accent
  ctx.fillRect(pad, y, 84, 5)
  y += 40
  if (input.cover) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    ctx.drawImage(input.cover.source, pad, y, coverW, coverH)
    ctx.restore()
  }
  const infoY = y + (infoH - titleH - authorH) / 2
  ctx.fillStyle = c.text
  ctx.font = `700 ${story ? 42 : 36}px ${family}`
  ctx.textBaseline = 'top'
  titleLines.forEach((line, i) => ctx.fillText(line, pad + infoX, infoY + i * (story ? 54 : 46)))
  if (input.author) {
    ctx.fillStyle = c.muted
    ctx.font = `italic 400 ${story ? 34 : 30}px ${family}`
    const author = wrap(ctx, input.author, textW - infoX)[0] ?? ''
    ctx.fillText(author, pad + infoX, infoY + titleH + 8)
  }

  paintBrand(ctx, W, H - pad - brandH / 2 - (story ? 20 : 0), family, c, logo)

  return canvas
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'))
