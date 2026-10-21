/**
 * Ritmo de lectura personal. foliate estima el tiempo que falta con un ritmo fijo; aquí
 * se compara cuánto avanzas con el tiempo real que pasas leyendo (sin contar pausas)
 * y el estimado se ajusta a tu ritmo. Se recuerda entre libros y sesiones.
 */
const KEY = 'mitzi-ritmo'
/** Más de esto en una misma página es una pausa: no cuenta como lectura. */
const MAX_GAP = 3 * 60_000
/** Minutos reales que se recuerdan: lo más reciente pesa más. */
const WINDOW = 120

interface Pace {
  /** minutos de lectura «estándar» (los de foliate) que avanzaste… */
  std: number
  /** …en estos minutos reales */
  real: number
}

function load(): Pace {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '') as Pace
    if (p.std >= 0 && p.real >= 0) return p
  } catch {
    // primera vez o sin almacenamiento
  }
  return { std: 0, real: 0 }
}

let pace = load()
let last: { total: number; at: number } | null = null

/** Al abrir un libro: el primer cambio de página no cuenta (no se sabe cuánto se leyó antes). */
export function resetPaceSession() {
  last = null
}

/** Cada vez que cambias de página, con los minutos (estándar) que le quedan al libro. */
export function trackPace(minutesLeft: number) {
  const now = Date.now()
  if (last) {
    const read = last.total - minutesLeft
    const spent = now - last.at
    // saltos (índice, barra de avance) o vueltas atrás no son lectura
    if (read > 0 && read < 10 && spent > 0 && spent < MAX_GAP) {
      pace.std += read
      pace.real += spent / 60_000
      if (pace.real > WINDOW) {
        const k = WINDOW / pace.real
        pace = { std: pace.std * k, real: pace.real * k }
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(pace))
      } catch {
        // no es grave
      }
    }
  }
  last = { total: minutesLeft, at: now }
}

/** Cuántos minutos «estándar» lees por minuto real (1 = el ritmo de foliate). */
export function paceFactor() {
  return pace.real >= 3 ? Math.min(4, Math.max(0.3, pace.std / pace.real)) : 1
}

export function formatMinutes(minutes: number) {
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}
