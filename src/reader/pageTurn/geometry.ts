/**
 * Geometría del doblez de una hoja (como en un libro de papel).
 *
 * Todo se calcula en un marco "local" donde la hoja que gira está a la derecha del
 * lomo: el lomo es x = 0 y la hoja ocupa [0, W] × [0, H]. La esquina que se toma
 * (C0) se lleva hasta el punto T; la hoja se dobla por la mediatriz entre C0 y T,
 * que es lo que hace un papel: la parte doblada es el reflejo de la original.
 */

export interface Pt {
  x: number
  y: number
}

export type Poly = Pt[]

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const len = (a: Pt) => Math.hypot(a.x, a.y)

/** Matriz afín 2D: x' = a·x + c·y + e, y' = b·x + d·y + f (como CSS matrix()). */
export interface Mat {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** m1 ∘ m2: primero m2, luego m1. */
export function compose(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

export const apply = (m: Mat, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

export const translate = (x: number, y: number): Mat => ({ ...IDENTITY, e: x, f: y })

/** Recorta un polígono por un semiplano (Sutherland–Hodgman con un solo borde). */
function clipHalfPlane(poly: Poly, side: (p: Pt) => number): Poly {
  const out: Poly = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push(add(a, mul(sub(b, a), t)))
    }
  }
  return out
}

export interface Fold {
  /** No hay doblez (la esquina está en su lugar). */
  flat: boolean
  /** Parte de la hoja que sigue plana (del lado del lomo). */
  flatPart: Poly
  /** Parte de la hoja que se levantó (del lado de la esquina), en su posición original. */
  foldedPart: Poly
  /** La parte levantada ya doblada: el reflejo de foldedPart. */
  flap: Poly
  /** Reflejo por la línea del doblez. */
  reflect: Mat
  /** Un punto de la línea del doblez y la normal que apunta hacia la esquina. */
  mid: Pt
  normal: Pt
  /** 0 al empezar, 1 con la hoja ya del otro lado. */
  progress: number
}

/**
 * La esquina no puede alejarse del lomo más de lo que mide el papel:
 * así la hoja nunca se estira ni se despega del libro.
 */
export function constrain(t: Pt, corner: Pt, w: number, h: number): Pt {
  const near: Pt = { x: 0, y: corner.y } // punto del lomo a la altura de la esquina
  const far: Pt = { x: 0, y: h - corner.y }
  let p = t
  const dNear = len(sub(p, near))
  if (dNear > w) p = add(near, mul(sub(p, near), w / dNear))
  const diag = Math.hypot(w, h)
  const dFar = len(sub(p, far))
  if (dFar > diag) p = add(far, mul(sub(p, far), diag / dFar))
  return p
}

export function computeFold(corner: Pt, target: Pt, w: number, h: number): Fold {
  const page: Poly = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const t = constrain(target, corner, w, h)
  const n = sub(corner, t)
  const dist = len(n)
  const progress = Math.min(1, Math.max(0, (corner.x - t.x) / (2 * w)))
  if (dist < 0.5) {
    return { flat: true, flatPart: page, foldedPart: [], flap: [], reflect: IDENTITY, mid: corner, normal: { x: 1, y: 0 }, progress: 0 }
  }
  const u = mul(n, 1 / dist)
  const mid = mul(add(corner, t), 0.5)
  const side = (p: Pt) => dot(sub(p, mid), u)
  const foldedPart = clipHalfPlane(page, side)
  const flatPart = clipHalfPlane(page, p => -side(p))
  // reflejo: p' = p − 2((p − mid)·u)u
  const k = 2 * dot(mid, u)
  const reflect: Mat = {
    a: 1 - 2 * u.x * u.x,
    b: -2 * u.x * u.y,
    c: -2 * u.x * u.y,
    d: 1 - 2 * u.y * u.y,
    e: k * u.x,
    f: k * u.y,
  }
  return { flat: false, flatPart, foldedPart, flap: foldedPart.map(p => apply(reflect, p)), reflect, mid, normal: u, progress }
}

export const toCssMatrix = (m: Mat) => `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`

export const toCssPolygon = (poly: Poly) =>
  poly.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${poly.map(p => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(', ')})`
