import { deriveTheme, type ThemeColors } from '../comfort/contrast'
import { lchToHex, mix, toLch } from '../../lib/color'
import type { Palette } from '../../library/palette'

/**
 * Diseños de la tarjeta para compartir una cita. Cada uno decide solo colores:
 * el dibujo (letra, márgenes, marca de Mitzi) está en card.ts.
 * Para agregar uno nuevo basta con sumar un elemento a DESIGNS.
 */
export interface CardColors {
  /** degradado del fondo, de arriba a abajo */
  bgTop: string
  bgBottom: string
  /** la cita */
  text: string
  /** título, autor y marca */
  muted: string
  /** comillas y la línea que separa la cita del libro */
  accent: string
}

export interface CardDesign {
  id: string
  name: string
  colors(theme: ThemeColors, palette: Palette): CardColors
}

export const DESIGNS: CardDesign[] = [
  {
    id: 'lector',
    name: 'Como lo lees',
    // el mismo fondo y texto del tema con el que estás leyendo
    colors: theme => ({
      bgTop: theme.bg,
      bgBottom: mix(theme.bg, theme.dark ? '#000000' : '#d8cdb8', 0.18),
      text: theme.fg,
      muted: theme.muted,
      accent: theme.link,
    }),
  },
  {
    id: 'portada',
    name: 'Color del libro',
    // oscuro con el tono de la portada, para que el texto claro siempre se lea
    colors: (_theme, palette) => {
      const { c, h } = toLch(palette.primary)
      const top = lchToHex({ l: 0.32, c: Math.min(c, 0.09), h })
      const t = deriveTheme(top)
      return {
        bgTop: top,
        bgBottom: lchToHex({ l: 0.16, c: Math.min(c, 0.06), h }),
        text: t.fg,
        muted: t.muted,
        accent: lchToHex({ l: 0.8, c: Math.min(c, 0.12), h }),
      }
    },
  },
  {
    id: 'papel',
    name: 'Papel',
    colors: () => ({ bgTop: '#f8f1e1', bgBottom: '#ebdfc6', text: '#2f2619', muted: '#7a6a52', accent: '#a0623a' }),
  },
  {
    id: 'noche',
    name: 'Noche',
    colors: (_theme, palette) => ({
      bgTop: '#17151c',
      bgBottom: '#0c0b0f',
      text: '#f1ece4',
      muted: '#9a948c',
      accent: mix(palette.light, '#ffffff', 0.25),
    }),
  },
]

/** Tamaños en píxeles: historia (Instagram, TikTok, WhatsApp) y publicación cuadrada. */
export const FORMATS = {
  historia: { name: 'Historia', width: 1080, height: 1920 },
  cuadrada: { name: 'Cuadrada', width: 1080, height: 1080 },
} as const

export type CardFormat = keyof typeof FORMATS

/** Pie de la tarjeta: así quien la vea sabe de dónde salió. */
export const WATERMARK = 'Leído en Mitzi'
