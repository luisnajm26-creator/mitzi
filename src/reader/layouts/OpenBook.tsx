import type { CSSProperties } from 'react'
import { mix } from '../../lib/color'
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

/** Capas de hojas apiladas en el borde de una página: cada sombra es una hoja de 1 px. */
function stack(n: number, dir: 1 | -1, a: string, b: string) {
  if (n <= 0) return 'none'
  const layers = Array.from({ length: n }, (_, i) => `${dir * (i + 1)}px ${((i + 1) * 0.55).toFixed(2)}px 0 ${i % 3 === 2 ? b : a}`)
  layers.push(`${dir * (n + 1)}px ${((n + 1) * 0.55 + 0.6).toFixed(2)}px 2px rgba(0, 0, 0, 0.28)`)
  return layers.join(', ')
}

interface Props {
  geo: BookGeometry
  /** 0–1: avance en el libro */
  progress: number
  palette: Palette
  theme: ThemeColors
}

/**
 * Lo que rodea a las páginas: la tapa dura, el grosor de las hojas a cada lado
 * (al inicio casi todo a la derecha, al final a la izquierda) y la mesa.
 * Todo es CSS estático: no consume nada mientras no se pasa de página.
 */
export function OpenBookBase({ geo, progress, palette, theme }: Props) {
  const left = Math.round(geo.stackMax * Math.min(1, Math.max(0, progress)))
  const right = geo.stackMax - left
  const half = geo.width / 2
  const edge = theme.dark ? '#ffffff' : '#000000'
  const paperA = mix(theme.bg, edge, 0.07)
  const paperB = mix(theme.bg, edge, 0.15)
  const board = mix(palette.primary, palette.dark, 0.55)
  const drop = Math.max(left, right) * 0.55
  const style = (x: number, extra: CSSProperties = {}): CSSProperties => ({
    left: x,
    top: geo.top,
    width: half,
    height: geo.height,
    background: theme.bg,
    ...extra,
  })
  return (
    <div className="book-base" aria-hidden>
      <div
        className="book-board"
        style={{
          left: geo.left - left - 18,
          top: geo.top - 12,
          width: geo.width + left + right + 36,
          height: geo.height + drop + 26,
          background: board,
        }}
      />
      <div className="book-stack" style={style(geo.left, { boxShadow: stack(left, -1, paperA, paperB) })} />
      <div className="book-stack" style={style(geo.left + half, { boxShadow: stack(right, 1, paperA, paperB) })} />
    </div>
  )
}

/**
 * Relieve del centro: las hojas se curvan hacia el lomo. El lado con más hojas
 * queda más alto y proyecta más sombra sobre el otro.
 */
export function OpenBookGutter({ geo, progress }: Pick<Props, 'geo' | 'progress'>) {
  const p = Math.min(1, Math.max(0, progress))
  const onLeft = 0.14 + 0.16 * (1 - p) // las hojas de la derecha (aún por leer) dan sombra a la izquierda
  const onRight = 0.14 + 0.16 * p
  const half = geo.width / 2
  return (
    <div
      className="book-gutter"
      aria-hidden
      style={{
        left: geo.left,
        top: geo.top,
        width: geo.width,
        height: geo.height,
        background: [
          `linear-gradient(to right, transparent ${half - geo.width * 0.075}px, rgba(0,0,0,${(onLeft * 0.35).toFixed(3)}) ${half - geo.width * 0.02}px, rgba(0,0,0,${onLeft.toFixed(3)}) ${half}px, rgba(0,0,0,${onRight.toFixed(3)}) ${half}px, rgba(0,0,0,${(onRight * 0.35).toFixed(3)}) ${half + geo.width * 0.02}px, transparent ${half + geo.width * 0.075}px)`,
          // curvatura suave en los bordes exteriores
          'linear-gradient(to right, rgba(0,0,0,0.05), transparent 3%, transparent 97%, rgba(0,0,0,0.05))',
        ].join(', '),
      }}
    />
  )
}
