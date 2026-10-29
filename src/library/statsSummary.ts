import type { BookRecord, ProgressRecord, ReadingDay } from './db'
import { bestStreak, dayKey, streak } from './stats'

/** Todo lo que muestra «Tu lectura», calculado de una vez a partir de los días guardados. */
export interface StatsSummary {
  days: Map<string, ReadingDay>
  today: number
  streak: number
  bestStreak: number
  totalMinutes: number
  totalPages: number
  /** días con al menos un minuto */
  daysRead: number
  /** páginas por hora (de los días que tienen páginas y minutos) */
  pagesPerHour: number
  /** minutos por cada hora del día (0–23), de todo el historial */
  hours: number[]
  /** libros con más tiempo de lectura */
  topBooks: { book: BookRecord; minutes: number; fraction: number }[]
  /** libros terminados, el más reciente primero */
  finished: { book: BookRecord; at: number }[]
  started: number
  /** todos los libros, por id */
  books: Map<string, BookRecord>
}

export type Period = 'semana' | 'mes' | 'año'

export interface Bar {
  label: string
  /** lo que dice el detalle al tocar la barra */
  detail: string
  minutes: number
  current: boolean
}

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const WEEKDAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function summarize(rows: ReadingDay[], progress: ProgressRecord[], books: BookRecord[], extraToday = 0): StatsSummary {
  const days = new Map(rows.map(r => [r.day, r]))
  const byId = new Map(books.map(b => [b.id, b]))
  const hours = new Array(24).fill(0)
  const perBook = new Map<string, number>()
  let pages = 0
  let pagedMinutes = 0
  for (const r of rows) {
    r.hours?.forEach((m, h) => (hours[h] += m))
    for (const [id, m] of Object.entries(r.byBook ?? {})) perBook.set(id, (perBook.get(id) ?? 0) + m)
    if (r.pages > 0 && r.minutes > 0) {
      pages += r.pages
      pagedMinutes += r.minutes
    }
  }
  const fractions = new Map(progress.map(p => [p.bookId, p]))
  const topBooks = [...perBook]
    .filter(([id, m]) => byId.has(id) && m >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, minutes]) => ({ book: byId.get(id)!, minutes, fraction: fractions.get(id)?.fraction ?? 0 }))
  const finished = progress
    .filter(p => p.fraction >= 0.98 && byId.has(p.bookId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(p => ({ book: byId.get(p.bookId)!, at: p.updatedAt }))
  return {
    days,
    today: (days.get(dayKey())?.minutes ?? 0) + extraToday,
    streak: streak(days),
    bestStreak: bestStreak(days),
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    totalPages: rows.reduce((s, r) => s + r.pages, 0),
    daysRead: rows.filter(r => r.minutes >= 1).length,
    pagesPerHour: pagedMinutes >= 10 ? (pages / pagedMinutes) * 60 : 0,
    hours,
    topBooks,
    finished,
    started: progress.filter(p => p.fraction > 0.005 && byId.has(p.bookId)).length,
    books: byId,
  }
}

const minutesOn = (days: Map<string, ReadingDay>, d: Date) => days.get(dayKey(d))?.minutes ?? 0

/**
 * Las barras de un periodo: la semana (7 días), el mes (30 días) o el año (12 meses), y lo mismo
 * del periodo anterior para comparar.
 */
export function periodBars(days: Map<string, ReadingDay>, period: Period): { bars: Bar[]; total: number; previous: number } {
  const now = new Date()
  if (period === 'año') {
    const bars: Bar[] = []
    let previous = 0
    for (let i = 11; i >= 0; i--) {
      const y = now.getFullYear()
      const m = now.getMonth() - i
      const first = new Date(y, m, 1)
      const prefix = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
      const lastYear = `${first.getFullYear() - 1}-${String(first.getMonth() + 1).padStart(2, '0')}`
      let minutes = 0
      for (const [key, r] of days) {
        if (key.startsWith(prefix)) minutes += r.minutes
        else if (key.startsWith(lastYear)) previous += r.minutes
      }
      bars.push({ label: MONTHS[first.getMonth()][0].toUpperCase(), detail: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`, minutes, current: i === 0 })
    }
    return { bars, total: bars.reduce((s, b) => s + b.minutes, 0), previous }
  }
  const count = period === 'semana' ? 7 : 30
  const bars: Bar[] = []
  let previous = 0
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const before = new Date(d)
    before.setDate(before.getDate() - count)
    previous += minutesOn(days, before)
    const label = period === 'semana' ? WEEKDAY[d.getDay()] : i % 5 === 0 ? String(d.getDate()) : ''
    bars.push({
      label,
      detail: `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`,
      minutes: minutesOn(days, d),
      current: i === 0,
    })
  }
  return { bars, total: bars.reduce((s, b) => s + b.minutes, 0), previous }
}

/** El calendario de las últimas semanas: columnas de lunes a domingo. */
export function calendar(days: Map<string, ReadingDay>, weeks: number) {
  const today = new Date()
  // la última columna es la semana actual; empieza en lunes
  const start = new Date(today)
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7)
  const cells: { key: string; minutes: number; future: boolean; detail: string; month: number; day: number }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      key: dayKey(d),
      minutes: minutesOn(days, d),
      future: d > today,
      detail: `${d.getDate()} de ${MONTHS[d.getMonth()]}`,
      month: d.getMonth(),
      day: d.getDate(),
    })
  }
  return cells
}

/** «por la noche»: el momento del día en que más lees. */
export function favoriteTime(hours: number[]) {
  const parts = [
    { label: 'de madrugada', from: 0, to: 6 },
    { label: 'por la mañana', from: 6, to: 12 },
    { label: 'por la tarde', from: 12, to: 19 },
    { label: 'por la noche', from: 19, to: 24 },
  ]
  const sums = parts.map(p => hours.slice(p.from, p.to).reduce((s, m) => s + m, 0))
  const best = sums.indexOf(Math.max(...sums))
  return sums[best] >= 5 ? parts[best].label : null
}

export const monthName = (m: number) => MONTHS[m]

/** Lo que va en la tarjeta para compartir: solo los números que lucen (sin racha de 1 día, sin «0 terminados»). */
export interface ShareStats {
  kind: 'semana' | 'mes'
  /** «Mi semana en Mitzi» */
  heading: string
  /** «23 – 29 de octubre» u «octubre de 2026» */
  range: string
  totalMinutes: number
  /** promedio por día en el periodo */
  perDay: number
  goal: number
  /** semana: una barra por día */
  bars: Bar[]
  /** mes: un cuadro por día, empezando en lunes (null = hueco antes del día 1) */
  calendar: ({ day: number; minutes: number; future: boolean } | null)[]
  facts: { value: string; label: string }[]
  topBook: { book: BookRecord; minutes: number } | null
}

export function shareStats(data: StatsSummary, kind: 'semana' | 'mes', goal: number): ShareStats {
  const today = new Date()
  let keys: string[] = []
  let range = ''
  let bars: Bar[] = []
  const calendar: ShareStats['calendar'] = []
  if (kind === 'semana') {
    bars = periodBars(data.days, 'semana').bars
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
    for (let i = 0; i < 7; i++) {
      const d = new Date(from)
      d.setDate(from.getDate() + i)
      keys.push(dayKey(d))
    }
    range =
      from.getMonth() === today.getMonth()
        ? `${from.getDate()} – ${today.getDate()} de ${MONTHS_LONG[today.getMonth()]}`
        : `${from.getDate()} de ${MONTHS_LONG[from.getMonth()]} – ${today.getDate()} de ${MONTHS_LONG[today.getMonth()]}`
  } else {
    // en los primeros días del mes todavía no hay mucho que mostrar: va el mes anterior
    const month = today.getDate() <= 3 ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1)
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    for (let i = 0; i < (month.getDay() + 6) % 7; i++) calendar.push(null)
    for (let n = 1; n <= days; n++) {
      const d = new Date(month.getFullYear(), month.getMonth(), n)
      keys.push(dayKey(d))
      calendar.push({ day: n, minutes: minutesOn(data.days, d), future: d > today })
    }
    keys = keys.filter((_, i) => !calendar.filter(Boolean)[i]!.future)
    range = `${MONTHS_LONG[month.getMonth()]} de ${month.getFullYear()}`
  }
  const rows = keys.map(k => data.days.get(k)).filter((r): r is ReadingDay => !!r)
  const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0)
  const pages = rows.reduce((s, r) => s + r.pages, 0)
  const daysRead = rows.filter(r => r.minutes >= 1).length
  const perBook = new Map<string, number>()
  for (const r of rows) for (const [id, m] of Object.entries(r.byBook ?? {})) perBook.set(id, (perBook.get(id) ?? 0) + m)
  const top = [...perBook].sort((a, b) => b[1] - a[1])[0]
  const first = new Date(keys[0] + 'T00:00')
  const finished = data.finished.filter(f => f.at >= first.getTime()).length

  const facts: ShareStats['facts'] = []
  facts.push({ value: `${daysRead} de ${keys.length}`, label: daysRead === 1 ? 'día leyendo' : 'días leyendo' })
  if (data.streak >= 2) facts.push({ value: `${data.streak}`, label: 'días seguidos' })
  if (pages >= 10) facts.push({ value: `${pages}`, label: 'páginas' })
  if (finished > 0) facts.push({ value: `${finished}`, label: finished === 1 ? 'libro terminado' : 'libros terminados' })
  const when = favoriteTime(sumHours(rows))
  if (facts.length < 4 && when) facts.push({ value: when[0].toUpperCase() + when.slice(1), label: 'es cuando más leo' })

  return {
    kind,
    heading: kind === 'semana' ? 'Mi semana en Mitzi' : 'Mi mes en Mitzi',
    range,
    totalMinutes,
    perDay: keys.length ? totalMinutes / keys.length : 0,
    goal,
    bars,
    calendar,
    facts: facts.slice(0, 4),
    topBook: top && top[1] >= 5 && data.books.get(top[0]) ? { book: data.books.get(top[0])!, minutes: top[1] } : null,
  }
}

const sumHours = (rows: ReadingDay[]) => {
  const hours = new Array(24).fill(0)
  for (const r of rows) r.hours?.forEach((m, h) => (hours[h] += m))
  return hours
}
