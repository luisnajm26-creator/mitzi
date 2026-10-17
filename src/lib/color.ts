// Utilidades de color: sRGB, OKLab/OKLCH (percepción uniforme) y contraste WCAG.

export type RGB = [number, number, number] // 0..1
export type Lab = [number, number, number]
export interface LCH {
  l: number
  c: number
  h: number
}

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x))

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const rgbToHex = (rgb: RGB) =>
  '#' + rgb.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055

export function rgbToOklab([r, g, b]: RGB): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

export const labToLch = ([l, a, b]: Lab): LCH => ({
  l,
  c: Math.hypot(a, b),
  h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
})

const lchToLab = ({ l, c, h }: LCH): Lab => {
  const r = (h * Math.PI) / 180
  return [l, c * Math.cos(r), c * Math.sin(r)]
}

export const toLch = (hex: string) => labToLch(rgbToOklab(hexToRgb(hex)))

const inGamut = (rgb: RGB) => rgb.every(v => v >= -0.0005 && v <= 1.0005)

/** OKLCH → hex, bajando el croma si el color no cabe en sRGB. */
export function lchToHex(lch: LCH): string {
  const l = clamp(lch.l)
  let rgb = oklabToRgb(lchToLab({ ...lch, l }))
  if (inGamut(rgb)) return rgbToHex(rgb)
  let lo = 0, hi = lch.c
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklabToRgb(lchToLab({ l, c: mid, h: lch.h })))) lo = mid
    else hi = mid
  }
  rgb = oklabToRgb(lchToLab({ l, c: lo, h: lch.h }))
  return rgbToHex(rgb)
}

/** Luminancia relativa WCAG. */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const isDark = (hex: string) => luminance(hex) < 0.2

/** Mezcla en OKLab (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number) {
  const la = rgbToOklab(hexToRgb(a)), lb = rgbToOklab(hexToRgb(b))
  return rgbToHex(oklabToRgb([0, 1, 2].map(i => la[i] + (lb[i] - la[i]) * t) as Lab))
}

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * 255))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Hash de texto → número estable (para colores de portadas generadas). */
export function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
