import { clamp, hashString, labToLch, lchToHex, rgbToOklab, toLch, type Lab } from '../lib/color'

/** Colores de una portada, usados para el fondo, el foco y el lomo del libro. */
export interface Palette {
  /** El color más vivo y representativo. */
  primary: string
  /** Un segundo color distinto del primero. */
  secondary: string
  dark: string
  light: string
}

interface Cluster {
  lab: Lab
  count: number
}

const SAMPLE = 48

/** Extrae la paleta de una imagen con k-means en OKLab sobre una versión reducida. */
export function paletteFromImage(image: CanvasImageSource): Palette | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE)
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)

  const points: Lab[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    points.push(rgbToOklab([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]))
  }
  if (points.length < 16) return null

  const clusters = kmeans(points, 6)
  const total = points.length
  const scored = clusters
    .filter(c => c.count > 0)
    .map(c => ({ ...c, lch: labToLch(c.lab), share: c.count / total }))

  // el primario: con color y con presencia, sin ser casi blanco o casi negro
  const vividness = (x: (typeof scored)[number]) =>
    (x.lch.c + 0.015) * Math.sqrt(x.share) * (x.lch.l > 0.22 && x.lch.l < 0.92 ? 1 : 0.35)
  const byVivid = [...scored].sort((a, b) => vividness(b) - vividness(a))
  const primary = byVivid[0]

  const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  const secondary =
    byVivid.find(x => x !== primary && x.share > 0.04 && (hueDistance(x.lch.h, primary.lch.h) > 35 || Math.abs(x.lch.l - primary.lch.l) > 0.25)) ??
    byVivid[1] ??
    primary

  const significant = scored.filter(x => x.share > 0.05)
  const darkest = [...significant].sort((a, b) => a.lch.l - b.lch.l)[0] ?? primary
  const lightest = [...significant].sort((a, b) => b.lch.l - a.lch.l)[0] ?? primary

  return {
    primary: lchToHex(primary.lch),
    secondary: lchToHex(secondary.lch),
    dark: lchToHex({ ...darkest.lch, l: Math.min(darkest.lch.l, 0.3) }),
    light: lchToHex({ ...lightest.lch, l: Math.max(lightest.lch.l, 0.85) }),
  }
}

/** Paleta estable a partir de un texto (para libros sin portada). */
export function paletteFromSeed(seed: string): Palette {
  const h = hashString(seed) % 360
  return {
    primary: lchToHex({ l: 0.62, c: 0.13, h }),
    secondary: lchToHex({ l: 0.72, c: 0.1, h: (h + 50) % 360 }),
    dark: lchToHex({ l: 0.24, c: 0.06, h }),
    light: lchToHex({ l: 0.93, c: 0.03, h }),
  }
}

function kmeans(points: Lab[], k: number): Cluster[] {
  // inicio determinista: el punto medio y luego los más lejanos (k-means++ sin azar)
  const centers: Lab[] = [points[Math.floor(points.length / 2)]]
  const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  while (centers.length < k) {
    let best = points[0], bestD = -1
    for (const p of points) {
      const d = Math.min(...centers.map(c => dist2(p, c)))
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    centers.push(best)
  }

  const assign = new Array<number>(points.length).fill(0)
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < points.length; i++) {
      let bi = 0, bd = Infinity
      for (let j = 0; j < centers.length; j++) {
        const d = dist2(points[i], centers[j])
        if (d < bd) {
          bd = d
          bi = j
        }
      }
      assign[i] = bi
    }
    const sums = centers.map(() => [0, 0, 0, 0])
    points.forEach((p, i) => {
      const s = sums[assign[i]]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    })
    sums.forEach((s, j) => {
      if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    })
  }
  const counts = centers.map(() => 0)
  assign.forEach(a => counts[a]++)
  return centers.map((lab, j) => ({ lab, count: counts[j] }))
}

/** Colores del fondo ambiental de la biblioteca: siempre oscuros y saturados para que luzca el foco. */
export function ambientColors(p: Palette) {
  const a = toLch(p.primary)
  const b = toLch(p.secondary)
  const chroma = (c: number, max: number) => clamp(c * 0.9, 0.02, max)
  return {
    glow: lchToHex({ l: 0.42, c: chroma(a.c, 0.14), h: a.h }),
    top: lchToHex({ l: 0.17, c: chroma(b.c, 0.06), h: b.h }),
    bottom: lchToHex({ l: 0.09, c: chroma(a.c, 0.04), h: a.h }),
    floor: lchToHex({ l: 0.3, c: chroma(b.c, 0.1), h: b.h }),
    beam: lchToHex({ l: 0.97, c: Math.min(a.c * 0.25, 0.04), h: a.h }),
    rim: lchToHex({ l: 0.7, c: chroma(a.c, 0.16), h: a.h }),
  }
}
