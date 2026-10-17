import { contrast, isDark, lchToHex, mix, toLch, withAlpha } from '../../lib/color'

export type HighlightColor = 'amarillo' | 'verde' | 'azul' | 'rosa' | 'lila'

export interface ThemeColors {
  bg: string
  /** texto principal: mismo tono que el fondo, contraste ≥ 8:1 */
  fg: string
  /** texto secundario (capítulo, porcentaje): contraste ≥ 4.6:1 */
  muted: string
  link: string
  selection: string
  /** fondo de paneles y barras */
  surface: string
  border: string
  dark: boolean
  highlights: Record<HighlightColor, string>
}

const HIGHLIGHT_HUES: Record<HighlightColor, number> = {
  amarillo: 95,
  verde: 150,
  azul: 240,
  rosa: 0,
  lila: 300,
}

/**
 * Busca la luminosidad del texto (en OKLCH, con un toque del tono del fondo)
 * más suave que todavía alcanza el contraste pedido. Así el texto no es negro
 * o blanco puro, que cansan más la vista.
 */
function textFor(bg: string, target: number, dark: boolean) {
  const { h, c } = toLch(bg)
  const chroma = Math.min(0.035, c * 0.6 + 0.008)
  if (dark) {
    for (let l = 0.6; l <= 0.99; l += 0.01) {
      const hex = lchToHex({ l, c: chroma, h })
      if (contrast(hex, bg) >= target) return hex
    }
    return '#f2f2f2'
  }
  for (let l = 0.5; l >= 0.1; l -= 0.01) {
    const hex = lchToHex({ l, c: chroma, h })
    if (contrast(hex, bg) >= target) return hex
  }
  return '#151515'
}

function accentFor(bg: string, hue: number, target: number, dark: boolean) {
  for (let i = 0; i <= 60; i++) {
    const l = dark ? 0.62 + i * 0.006 : 0.55 - i * 0.006
    const hex = lchToHex({ l, c: 0.12, h: hue })
    if (contrast(hex, bg) >= target) return hex
  }
  return dark ? '#9cc4ff' : '#1f4f99'
}

const cache = new Map<string, ThemeColors>()

export function deriveTheme(bg: string): ThemeColors {
  const cached = cache.get(bg)
  if (cached) return cached
  const dark = isDark(bg)
  const fg = textFor(bg, 8, dark)
  const muted = textFor(bg, 4.6, dark)
  const link = accentFor(bg, 255, 4.8, dark)
  const { l } = toLch(bg)
  const surface = lchToHex({ ...toLch(bg), l: dark ? Math.min(1, l + 0.06) : Math.max(0, l - 0.035) })
  const highlights = Object.fromEntries(
    Object.entries(HIGHLIGHT_HUES).map(([name, h]) => [
      name,
      withAlpha(lchToHex({ l: dark ? 0.62 : 0.86, c: dark ? 0.12 : 0.13, h }), dark ? 0.38 : 0.55),
    ]),
  ) as Record<HighlightColor, string>
  const colors: ThemeColors = {
    bg,
    fg,
    muted,
    link,
    selection: withAlpha(link, dark ? 0.35 : 0.25),
    surface,
    border: mix(bg, fg, 0.14),
    dark,
    highlights,
  }
  cache.set(bg, colors)
  return colors
}
