import { db, type ReadingDay } from './db'

/**
 * Estadísticas de lectura: minutos reales leyendo (sin pausas largas) y páginas por día.
 * Se acumulan en memoria y se guardan cada tanto (y al cerrar el libro).
 */
const MAX_GAP = 3 * 60_000

let pending: { minutes: number; pages: number; books: Set<string> } | null = null
let last: { bookId: string; at: number } | null = null
let flushTimer: ReturnType<typeof setTimeout> | undefined

/** Fecha local como 2026-10-21 (el día cambia a medianoche donde estés). */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Al abrir un libro: el primer cambio de página no cuenta tiempo. */
export function startReadingSession(bookId: string) {
  last = { bookId, at: Date.now() }
}

/** Cada cambio de página: suma el tiempo desde el anterior (si no fue una pausa larga). */
export function notePageTurn(bookId: string) {
  const now = Date.now()
  const spent = last && last.bookId === bookId ? now - last.at : 0
  last = { bookId, at: now }
  if (spent <= 0 || spent > MAX_GAP) return
  pending ??= { minutes: 0, pages: 0, books: new Set() }
  pending.minutes += spent / 60_000
  // foliate avisa dos veces por cada cambio de página, casi juntas: cuenta una sola
  if (spent >= 400) pending.pages += 1
  pending.books.add(bookId)
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flushStats, 20_000)
}

export async function flushStats() {
  clearTimeout(flushTimer)
  if (!pending) return
  const add = pending
  pending = null
  const day = dayKey()
  await db.transaction('rw', db.readingDays, async () => {
    const row: ReadingDay = (await db.readingDays.get(day)) ?? { day, minutes: 0, pages: 0, books: [] }
    row.minutes += add.minutes
    row.pages += add.pages
    row.books = [...new Set([...row.books, ...add.books])]
    await db.readingDays.put(row)
  })
}

/** Minutos de hoy contando lo que todavía no se guardó (para la meta diaria). */
export async function todayMinutes() {
  const row = await db.readingDays.get(dayKey())
  return (row?.minutes ?? 0) + (pending?.minutes ?? 0)
}

/** Días seguidos leyendo (al menos un minuto), contando desde hoy o desde ayer. */
export function streak(days: Map<string, ReadingDay>) {
  const d = new Date()
  if ((days.get(dayKey(d))?.minutes ?? 0) < 1) d.setDate(d.getDate() - 1)
  let count = 0
  while ((days.get(dayKey(d))?.minutes ?? 0) >= 1) {
    count++
    d.setDate(d.getDate() - 1)
  }
  return count
}
