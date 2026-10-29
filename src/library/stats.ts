import { db, type DayPart, type ReadingDay } from './db'
import { deviceId } from '../sync/device'

/**
 * Estadísticas de lectura: minutos reales leyendo (sin pausas largas) y páginas por día.
 * Se acumulan en memoria y se guardan cada tanto (y al cerrar el libro).
 */
const MAX_GAP = 3 * 60_000

interface Pending {
  minutes: number
  pages: number
  byBook: Record<string, number>
  hours: number[]
}

let pending: Pending | null = null
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
  pending ??= { minutes: 0, pages: 0, byBook: {}, hours: new Array(24).fill(0) }
  const minutes = spent / 60_000
  pending.minutes += minutes
  pending.byBook[bookId] = (pending.byBook[bookId] ?? 0) + minutes
  pending.hours[new Date(now).getHours()] += minutes
  // foliate avisa dos veces por cada cambio de página, casi juntas: cuenta una sola
  if (spent >= 400) pending.pages += 1
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flushStats, 20_000)
}

const emptyPart = (): DayPart => ({ minutes: 0, pages: 0, books: [] })

/** Suma las partes de todos los dispositivos (lo que se muestra en las estadísticas). */
export function totalsOf(devices: Record<string, DayPart>): DayPart {
  const total: DayPart = { minutes: 0, pages: 0, books: [], byBook: {}, hours: new Array(24).fill(0) }
  const books = new Set<string>()
  for (const part of Object.values(devices)) {
    total.minutes += part.minutes
    total.pages += part.pages
    for (const id of part.books) books.add(id)
    for (const [id, m] of Object.entries(part.byBook ?? {})) total.byBook![id] = (total.byBook![id] ?? 0) + m
    part.hours?.forEach((m, h) => (total.hours![h] += m))
  }
  total.books = [...books]
  return total
}

/**
 * Las partes de cada dispositivo de un día. Los días de antes de la 0.3 no las tienen:
 * todo lo de ese día se leyó en `owner` (este dispositivo, o el que mandó el día al sincronizar).
 */
export function devicesOf(row: ReadingDay, owner: string): Record<string, DayPart> {
  if (row.devices) return row.devices
  const { day: _day, devices: _devices, ...part } = row
  return part.minutes > 0 || part.pages > 0 ? { [owner]: part } : {}
}

export async function flushStats() {
  clearTimeout(flushTimer)
  if (!pending) return
  const add = pending
  pending = null
  const day = dayKey()
  const me = deviceId()
  await db.transaction('rw', db.readingDays, async () => {
    const row: ReadingDay = (await db.readingDays.get(day)) ?? { day, ...emptyPart() }
    const devices = { ...devicesOf(row, me) }
    const mine = { ...emptyPart(), ...devices[me] }
    mine.minutes += add.minutes
    mine.pages += add.pages
    mine.books = [...new Set([...mine.books, ...Object.keys(add.byBook)])]
    mine.byBook = { ...mine.byBook }
    for (const [id, m] of Object.entries(add.byBook)) mine.byBook[id] = (mine.byBook[id] ?? 0) + m
    const hours = mine.hours ? [...mine.hours] : new Array(24).fill(0)
    add.hours.forEach((m, h) => (hours[h] += m))
    mine.hours = hours
    devices[me] = mine
    await db.readingDays.put({ day, ...totalsOf(devices), devices })
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

/** La racha más larga de la historia. */
export function bestStreak(days: Map<string, ReadingDay>) {
  const keys = [...days.values()].filter(r => r.minutes >= 1).map(r => r.day).sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    // días seguidos: la diferencia redondeada evita líos con el cambio de horario
    run = prev && Math.round((date.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = date
  }
  return best
}
