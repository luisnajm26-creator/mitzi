import { mix } from '../../lib/color'
import type { ShareStats } from '../../library/statsSummary'
import { formatMinutes } from '../pace'
import type { FontId } from '../comfort/fonts'
import { cardFamily, loadIcon, paintBackground, paintBrand, wrap } from './card'
import { FORMATS, type CardColors, type CardFormat } from './designs'

/**
 * Tarjeta de «Tu lectura» para compartir: el total del periodo en grande, la gráfica (barras de
 * la semana o calendario del mes), unos pocos datos y el libro que más leíste. Usa los mismos
 * diseños, letra y marca que las tarjetas de citas.
 */
export interface StatsCardInput {
  stats: ShareStats
  colors: CardColors
  format: CardFormat
  fontId: FontId
  /** portada del libro más leído (opcional, como en las citas) */
  cover?: { source: CanvasImageSource; width: number; height: number }
}

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Rectángulo con esquinas redondeadas (roundRect no existe en los navegadores internos viejos). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
  ctx.fill()
}

/** Cuatro tonos del color de acento sobre el fondo: más intenso cuanto más leíste ese día. */
function levelColor(c: CardColors, minutes: number, goal: number) {
  const empty = mix(c.bgBottom, c.text, 0.08)
  if (minutes < 1) return empty
  const full = goal > 0 ? goal : 30
  const t = minutes < full * 0.34 ? 0.35 : minutes < full * 0.67 ? 0.6 : minutes < full ? 0.82 : 1
  return mix(empty, c.accent, t)
}

export async function renderStatsCard(input: StatsCardInput): Promise<HTMLCanvasElement> {
  const family = await cardFamily(input.fontId)
  const logo = await loadIcon()
  const { stats: s, colors: c } = input
  const { width: W, height: H } = FORMATS[input.format]
  const story = input.format === 'historia'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  paintBackground(ctx, W, H, c)

  const pad = story ? 110 : 84
  const innerW = W - pad * 2
  let y = story ? 150 : 92
  ctx.textBaseline = 'top'

  // encabezado: qué es y de cuándo
  ctx.fillStyle = c.accent
  ctx.font = `700 ${story ? 34 : 28}px ${family}`
  ctx.fillText(s.heading.toUpperCase().split('').join(String.fromCharCode(8202)), pad, y)
  y += story ? 54 : 42
  ctx.fillStyle = c.muted
  ctx.font = `italic 400 ${story ? 36 : 30}px ${family}`
  ctx.fillText(s.range, pad, y)
  y += story ? 100 : 62

  // el total, en grande
  ctx.fillStyle = c.text
  ctx.font = `600 ${story ? 132 : 104}px ${family}`
  ctx.fillText(s.totalMinutes >= 1 ? formatMinutes(s.totalMinutes) : '0 min', pad - 4, y)
  y += story ? 150 : 116
  ctx.fillStyle = c.muted
  ctx.font = `400 ${story ? 36 : 30}px ${family}`
  ctx.fillText(s.perDay >= 1 ? `leyendo · ${formatMinutes(s.perDay)} al día` : 'leyendo', pad, y)
  y += story ? 110 : 66

  // la gráfica
  if (s.kind === 'semana') {
    const chartH = story ? 400 : 210
    const labelH = story ? 56 : 44
    const gap = story ? 26 : 22
    const barW = (innerW - gap * 6) / 7
    const peak = Math.max(s.goal, ...s.bars.map(b => b.minutes), 1)
    const base = y + chartH
    s.bars.forEach((b, i) => {
      const x = pad + i * (barW + gap)
      ctx.fillStyle = mix(c.bgBottom, c.text, 0.08)
      roundRect(ctx, x, y, barW, chartH, 14)
      if (b.minutes >= 0.5) {
        const h = Math.max(14, (b.minutes / peak) * chartH)
        ctx.fillStyle = b.current ? c.accent : mix(c.accent, c.bgBottom, 0.25)
        roundRect(ctx, x, base - h, barW, h, 14)
      }
      ctx.fillStyle = b.current ? c.text : c.muted
      ctx.font = `${b.current ? 700 : 400} ${story ? 32 : 26}px ${family}`
      ctx.textAlign = 'center'
      ctx.fillText(b.label, x + barW / 2, base + (story ? 18 : 12))
      ctx.textAlign = 'left'
    })
    // la meta: una línea punteada
    if (s.goal > 0) {
      ctx.strokeStyle = mix(c.text, c.bgBottom, 0.45)
      ctx.lineWidth = 3
      ctx.setLineDash([12, 10])
      const gy = base - (s.goal / peak) * chartH
      ctx.beginPath()
      ctx.moveTo(pad, gy)
      ctx.lineTo(pad + innerW, gy)
      ctx.stroke()
      ctx.setLineDash([])
    }
    y = base + labelH + (story ? 70 : 34)
  } else {
    const cols = 7
    const gap = story ? 14 : 8
    const rows = Math.ceil(s.calendar.length / cols)
    // en la cuadrada el calendario va a la izquierda y los datos a la derecha; en la historia,
    // cuadros de 92 px como mucho para que quepan seis semanas y el libro más leído
    const calW = story ? Math.min(innerW, 7 * 92 + 6 * gap) : Math.round(innerW * 0.5)
    const cell = (calW - gap * (cols - 1)) / cols
    ctx.font = `700 ${story ? 28 : 22}px ${family}`
    ctx.textAlign = 'center'
    WEEK.forEach((d, i) => {
      ctx.fillStyle = c.muted
      ctx.fillText(d, pad + i * (cell + gap) + cell / 2, y)
    })
    y += story ? 52 : 36
    s.calendar.forEach((d, i) => {
      if (!d) return
      const x = pad + (i % cols) * (cell + gap)
      const cy = y + Math.floor(i / cols) * (cell + gap)
      ctx.fillStyle = d.future ? 'rgba(0, 0, 0, 0)' : levelColor(c, d.minutes, s.goal)
      if (!d.future) roundRect(ctx, x, cy, cell, cell, story ? 16 : 10)
      if (story) {
        ctx.fillStyle = d.minutes >= 1 && !d.future ? c.bgBottom : c.muted
        ctx.font = `600 24px ${family}`
        ctx.fillText(String(d.day), x + cell / 2, cy + cell / 2 - 12)
      }
    })
    ctx.textAlign = 'left'
    const calH = rows * cell + (rows - 1) * gap
    if (story) y += calH + 60
    else {
      // datos a la derecha del calendario
      let fy = y - 36
      const fx = pad + calW + 56
      for (const f of s.facts.slice(0, 3)) {
        ctx.fillStyle = c.text
        ctx.font = `600 52px ${family}`
        ctx.fillText(f.value, fx, fy)
        ctx.fillStyle = c.muted
        ctx.font = `400 26px ${family}`
        ctx.fillText(f.label, fx, fy + 62)
        fy += 118
      }
      y += calH + 40
    }
  }

  // datos: en la historia, dos columnas; en la cuadrada de la semana, una fila
  if (story || s.kind === 'semana') {
    // en el mes, el calendario ocupa mucho: con libro más leído van solo dos datos
    const facts = story ? (s.kind === 'mes' && s.topBook ? s.facts.slice(0, 2) : s.facts) : s.facts.slice(0, 3)
    const perRow = story ? 2 : facts.length
    const colW = innerW / Math.max(1, perRow)
    facts.forEach((f, i) => {
      const x = pad + (i % perRow) * colW
      const fy = y + Math.floor(i / perRow) * (story ? 130 : 0)
      ctx.fillStyle = c.text
      ctx.font = `600 ${story ? 64 : 48}px ${family}`
      ctx.fillText(f.value, x, fy)
      ctx.fillStyle = c.muted
      ctx.font = `400 ${story ? 32 : 25}px ${family}`
      ctx.fillText(f.label, x, fy + (story ? 76 : 58))
    })
    y += story ? Math.ceil(facts.length / perRow) * 130 + 40 : 110
  }

  // el libro que más leíste (solo en la historia, y si cabe arriba de la marca)
  const brandY = H - pad - (story ? 52 : 20)
  if (story && s.topBook && y + 300 < brandY - 50) {
    ctx.fillStyle = c.accent
    ctx.fillRect(pad, y, 84, 5)
    y += 44
    ctx.fillStyle = c.muted
    ctx.font = `700 26px ${family}`
    ctx.fillText('LO QUE MÁS LEÍ', pad, y)
    y += 50
    let textX = pad
    if (input.cover) {
      const coverH = 200
      const coverW = Math.round((coverH * input.cover.width) / input.cover.height)
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 8
      ctx.drawImage(input.cover.source, pad, y, coverW, coverH)
      ctx.restore()
      textX += coverW + 36
    }
    ctx.fillStyle = c.text
    ctx.font = `700 42px ${family}`
    const title = wrap(ctx, s.topBook.book.title, pad + innerW - textX)
    title.slice(0, 2).forEach((line, i) => ctx.fillText(i === 1 && title.length > 2 ? line + '…' : line, textX, y + i * 54))
    let ty = y + Math.min(2, title.length) * 54 + 6
    if (s.topBook.book.author) {
      ctx.fillStyle = c.muted
      ctx.font = `italic 400 32px ${family}`
      ctx.fillText(wrap(ctx, s.topBook.book.author, pad + innerW - textX)[0] ?? '', textX, ty)
      ty += 46
    }
    ctx.fillStyle = c.accent
    ctx.font = `600 32px ${family}`
    ctx.fillText(formatMinutes(s.topBook.minutes), textX, ty)
  }

  paintBrand(ctx, W, brandY, family, c, logo)
  return canvas
}
