import { db, type AnnotationRecord, type BookmarkRecord, type CollectionRecord, type DayPart, type ProgressRecord, type ReadingDay } from '../library/db'
import { devicesOf, flushStats, totalsOf } from '../library/stats'
import { deviceId, deviceName } from './device'

/**
 * Lo que se sincroniza: todo lo que haces con tus libros, pero no los libros. Cada libro se
 * reconoce por la huella de su archivo (SHA-256), así que el mismo EPUB en el teléfono y en la
 * PC es el mismo libro aunque esté en carpetas distintas.
 */
export interface Snapshot {
  v: 1
  device: string
  name: string
  progress: ProgressRecord[]
  annotations: AnnotationRecord[]
  bookmarks: BookmarkRecord[]
  collections: CollectionRecord[]
  /** cada día con la parte de cada dispositivo */
  days: (Omit<ReadingDay, 'devices'> & { devices: Record<string, DayPart> })[]
  /** cuándo se abrió cada libro por última vez (el orden del carrusel) */
  opened: Record<string, number>
}

/** Cuántas cosas cambiaron en este dispositivo al sincronizar. */
export interface MergeResult {
  progress: number
  /** libros cuyo avance cambió (el lector lo usa para ofrecer ir a la página nueva) */
  progressIds: string[]
  annotations: number
  bookmarks: number
  collections: number
  days: number
}

export async function takeSnapshot(): Promise<Snapshot> {
  await flushStats()
  const me = deviceId()
  const [progress, annotations, bookmarks, collections, days, books] = await Promise.all([
    db.progress.toArray(),
    db.annotations.toArray(),
    db.bookmarks.toArray(),
    db.collections.toArray(),
    db.readingDays.toArray(),
    db.books.toArray(),
  ])
  return {
    v: 1,
    device: me,
    name: deviceName(),
    progress,
    annotations,
    bookmarks,
    collections,
    days: days.map(d => ({ ...d, devices: devicesOf(d, me) })),
    opened: Object.fromEntries(books.filter(b => b.lastOpenedAt).map(b => [b.id, b.lastOpenedAt!])),
  }
}

const bookmarkTime = (b: BookmarkRecord) => b.updatedAt ?? b.createdAt

/** Une dos versiones de una colección: el nombre del cambio más nuevo y, libro por libro, lo último que se hizo. */
function mergeCollection(mine: CollectionRecord, theirs: CollectionRecord): CollectionRecord {
  const newer = theirs.updatedAt > mine.updatedAt ? theirs : mine
  const items = { ...mine.items }
  for (const [id, item] of Object.entries(theirs.items)) if (!items[id] || item.at > items[id].at) items[id] = item
  return { ...newer, items, createdAt: Math.min(mine.createdAt, theirs.createdAt) }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Mete en este dispositivo lo que trae el otro. Unir es simétrico: después de que cada uno une lo
 * del otro, los dos quedan iguales. Ante dos versiones de lo mismo gana la que se cambió al último.
 */
export async function mergeSnapshot(remote: Snapshot): Promise<MergeResult> {
  const result: MergeResult = { progress: 0, progressIds: [], annotations: 0, bookmarks: 0, collections: 0, days: 0 }
  const me = deviceId()
  await flushStats()
  await db.transaction('rw', [db.progress, db.annotations, db.bookmarks, db.collections, db.readingDays, db.books], async () => {
    const progress = new Map((await db.progress.toArray()).map(p => [p.bookId, p]))
    const changedProgress = remote.progress.filter(p => p.updatedAt > (progress.get(p.bookId)?.updatedAt ?? -1))
    await db.progress.bulkPut(changedProgress)
    result.progress = changedProgress.length
    result.progressIds = changedProgress.map(p => p.bookId)

    const annotations = new Map((await db.annotations.toArray()).map(a => [a.id, a]))
    const changedNotes = remote.annotations.filter(a => a.updatedAt > (annotations.get(a.id)?.updatedAt ?? -1))
    await db.annotations.bulkPut(changedNotes)
    result.annotations = changedNotes.length

    const bookmarks = new Map((await db.bookmarks.toArray()).map(b => [b.id, b]))
    const changedMarks = remote.bookmarks.filter(b => {
      const local = bookmarks.get(b.id)
      return !local || bookmarkTime(b) > bookmarkTime(local)
    })
    await db.bookmarks.bulkPut(changedMarks)
    result.bookmarks = changedMarks.length

    const collections = new Map((await db.collections.toArray()).map(c => [c.id, c]))
    for (const theirs of remote.collections) {
      const mine = collections.get(theirs.id)
      const merged = mine ? mergeCollection(mine, theirs) : theirs
      if (mine && sameJson(merged, mine)) continue
      await db.collections.put(merged)
      result.collections++
    }

    // estadísticas: de cada dispositivo se queda la parte más completa (solo crece con el día)
    const days = new Map((await db.readingDays.toArray()).map(d => [d.day, d]))
    for (const theirs of remote.days) {
      const local = days.get(theirs.day)
      const devices = { ...(local ? devicesOf(local, me) : {}) }
      let changed = false
      for (const [id, part] of Object.entries(theirs.devices)) {
        if (part.minutes > (devices[id]?.minutes ?? -1)) {
          devices[id] = part
          changed = true
        }
      }
      if (!changed) continue
      await db.readingDays.put({ day: theirs.day, ...totalsOf(devices), devices })
      result.days++
    }

    // el libro que se leyó al último en cualquiera de los dos queda primero en el carrusel
    for (const [id, at] of Object.entries(remote.opened)) {
      const book = await db.books.get(id)
      if (book && at > (book.lastOpenedAt ?? 0)) await db.books.update(id, { lastOpenedAt: at })
    }
  })
  return result
}
