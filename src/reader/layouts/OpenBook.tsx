import { lchToHex, mix, toLch } from '../../lib/color'
import type { Palette } from '../../library/palette'
import type { ThemeColors } from '../comfort/contrast'

export interface BookGeometry {
  /** Área de las dos páginas, en px dentro del lector. */
  left: number
  top: number
  width: number
  height: number
  pageWidth: number
  /** Grosor máximo (px) del bloque de hojas: depende de cuántas páginas tiene el libro. */
  stackMax: number
}

/**
 * Libro abierto a pantalla completa en pantallas horizontales (PC, tablet).
 * Devuelve null cuando conviene una sola página (pantalla angosta o vertical).
 */
export function computeBookGeometry(w: number, h: number, pageAspect: number, pages: number): BookGeometry | null {
  if (w < 700 || w / h < 1.15) return null
  const stackMax = Math.round(Math.min(24, Math.max(5, (pages / 900) * 24)))
  const marginY = Math.max(16, h * 0.04)
  const sideRoom = stackMax + 30
  let height = h - marginY * 2 - stackMax * 0.6 - 16
  let pageWidth = height * pageAspect
  const maxPageWidth = (w - sideRoom * 2 - 16) / 2
  if (pageWidth > maxPageWidth) {
    pageWidth = maxPageWidth
    height = pageWidth / pageAspect
  }
  const width = pageWidth * 2
  return {
    left: Math.round((w - width) / 2),
    top: Math.round((h - height) / 2 - stackMax * 0.3),
    width: Math.round(width),
    height: Math.round(height),
    pageWidth,
    stackMax,
  }
}

/** Colores del libro y de la mesa según el tema: en oscuro el libro sigue pareciendo de papel. */
export function bookColors(palette: Palette, theme: ThemeColors) {
  const p = toLch(palette.primary)
  const page = toLch(theme.bg)
  const tint = Math.min(p.c, 0.05)
  if (theme.dark) {
    // mesa un poco más clara que la hoja y tapa sobria del color de la portada
    return {
      deskA: lchToHex({ l: Math.min(0.34, page.l + 0.2), c: tint * 0.8, h: p.h }),
      deskB: lchToHex({ l: Math.min(0.18, page.l + 0.08), c: tint * 0.5, h: p.h }),
      board: lchToHex({ l: 0.24, c: Math.min(p.c, 0.07), h: p.h }),
      boardEdge: lchToHex({ l: 0.32, c: Math.min(p.c, 0.07), h: p.h }),
      paperA: lchToHex({ l: page.l + 0.13, c: page.c * 0.6, h: page.h }),
      paperB: lchToHex({ l: page.l + 0.2, c: page.c * 0.6, h: page.h }),
      line: 'rgba(0, 0, 0, 0.35)',
    }
  }
  return {
    deskA: mix(palette.dark, theme.bg, 0.12),
    deskB: mix(palette.dark, '#000000', 0.55),
    board: lchToHex({ l: 0.36, c: Math.min(p.c, 0.1), h: p.h }),
    boardEdge: lchToHex({ l: 0.46, c: Math.min(p.c, 0.1), h: p.h }),
    paperA: mix(theme.bg, '#000000', 0.07),
    paperB: mix(theme.bg, '#ffffff', 0.35),
    line: 'rgba(80, 60, 30, 0.35)',
  }
}

interface Props {
  geo: BookGeometry
  /** 0–1: avance en el libro */
  progress: number
  palette: Palette
  theme: ThemeColors
}

const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/**
 * Lo que rodea a las páginas: la tapa dura y el canto de las hojas a cada lado
 * (al inicio casi todo a la derecha, al final a la izquierda). El canto inferior
 * se adelgaza hacia el lomo, como en un libro abierto de verdad, y se une con el
 * canto lateral en diagonal. Es un SVG estático: no consume nada mientras se lee.
 */
export function OpenBookBase({ geo, progress, palette, theme }: Props) {
  const c = bookColors(palette, theme)
  const tl = Math.max(1, Math.round(geo.stackMax * Math.min(1, Math.max(0, progress))))
  const tr = Math.max(1, geo.stackMax - tl + 1)
  const pad = geo.stackMax + 26
  const W = geo.width + pad * 2
  const H = geo.height + pad * 2
  // coordenadas dentro del SVG: las páginas empiezan en (pad, pad)
  const x0 = pad
  const x1 = pad + geo.width
  const xs = pad + geo.width / 2
  const y0 = pad
  const y1 = pad + geo.height
  const drop = (t: number) => t * 0.55
  const edges = (t: number, outer: number, dir: 1 | -1) => ({
    fore: pts([
      [outer, y0 + 1],
      [outer + dir * t, y0 + 1 + t * 0.3],
      [outer + dir * t, y1 + drop(t)],
      [outer, y1],
    ]),
    bottom: pts([
      [xs, y1],
      [outer, y1],
      [outer + dir * t, y1 + drop(t)],
      [xs, y1 + 1.2],
    ]),
  })
  const sides = [
    { ...edges(tl, x0, -1), shade: 'url(#mitzi-edge-shade-l)' },
    { ...edges(tr, x1, 1), shade: 'url(#mitzi-edge-shade-r)' },
  ]
  const board = {
    x: x0 - tl - 16,
    y: y0 - 11,
    w: geo.width + tl + tr + 32,
    h: geo.height + drop(Math.max(tl, tr)) + 24,
  }
  return (
    <svg
      className="book-base"
      aria-hidden
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ left: geo.left - pad, top: geo.top - pad }}
    >
      <defs>
        <pattern id="mitzi-edge-v" width="3" height="4" patternUnits="userSpaceOnUse">
          <rect width="3" height="4" fill={c.paperB} />
          <rect width="1.2" height="4" fill={c.paperA} />
        </pattern>
        <pattern id="mitzi-edge-h" width="4" height="2" patternUnits="userSpaceOnUse">
          <rect width="4" height="2" fill={c.paperB} />
          <rect width="4" height="0.8" fill={c.paperA} />
        </pattern>
        <linearGradient id="mitzi-edge-shade-l" x1="1" x2="0" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="mitzi-edge-shade-r" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="mitzi-edge-shade-b" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="mitzi-board" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.boardEdge} />
          <stop offset="0.08" stopColor={c.board} />
          <stop offset="1" stopColor={c.board} />
        </linearGradient>
        <filter id="mitzi-book-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x={board.x} y={board.y} width={board.w} height={board.h} rx="9" fill="url(#mitzi-board)" filter="url(#mitzi-book-shadow)" />
      <rect x={board.x + 0.5} y={board.y + 0.5} width={board.w - 1} height={board.h - 1} rx="9" fill="none" stroke="rgba(255,255,255,0.07)" />
      {sides.map((s, i) => (
        <g key={i}>
          <polygon points={s.fore} fill="url(#mitzi-edge-v)" />
          <polygon points={s.fore} fill={s.shade} />
          <polygon points={s.bottom} fill="url(#mitzi-edge-h)" />
          <polygon points={s.bottom} fill="url(#mitzi-edge-shade-b)" />
          <polyline points={s.fore} fill="none" stroke={c.line} strokeWidth="0.6" />
        </g>
      ))}
      {/* el fondo de las páginas: el contenido del libro se dibuja encima */}
      <rect x={x0} y={y0} width={geo.width} height={geo.height} fill={theme.bg} />
    </svg>
  )
}

/**
 * Relieve del centro: las hojas se curvan hacia el lomo. El lado con más hojas
 * queda más alto y proyecta más sombra sobre el otro. En temas oscuros, además,
 * un brillo fino junto al pliegue (una hoja negra no se puede oscurecer más).
 */
export function OpenBookGutter({ geo, progress, dark }: Pick<Props, 'geo' | 'progress'> & { dark: boolean }) {
  const p = Math.min(1, Math.max(0, progress))
  const k = dark ? 1.6 : 1
  const onLeft = (0.14 + 0.16 * (1 - p)) * k // las hojas de la derecha (aún por leer) dan sombra a la izquierda
  const onRight = (0.14 + 0.16 * p) * k
  const half = geo.width / 2
  const w = geo.width
  const shade = (a: number) => `rgba(0,0,0,${Math.min(0.85, a).toFixed(3)})`
  const layers = [
    `linear-gradient(to right, transparent ${half - w * 0.075}px, ${shade(onLeft * 0.35)} ${half - w * 0.02}px, ${shade(onLeft)} ${half}px, ${shade(onRight)} ${half}px, ${shade(onRight * 0.35)} ${half + w * 0.02}px, transparent ${half + w * 0.075}px)`,
    // curvatura suave en los bordes exteriores
    `linear-gradient(to right, ${shade(0.05 * k)}, transparent 3%, transparent 97%, ${shade(0.05 * k)})`,
  ]
  if (dark)
    layers.unshift(
      `linear-gradient(to right, transparent ${half - w * 0.035}px, rgba(255,255,255,0.035) ${half - w * 0.022}px, transparent ${half - w * 0.01}px, transparent ${half + w * 0.01}px, rgba(255,255,255,0.035) ${half + w * 0.022}px, transparent ${half + w * 0.035}px)`,
    )
  return (
    <div
      className="book-gutter"
      data-dark={dark}
      aria-hidden
      style={{ left: geo.left, top: geo.top, width: geo.width, height: geo.height, background: layers.join(', ') }}
    />
  )
}
