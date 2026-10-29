import { create } from 'zustand'
import { db, type CollectionRecord } from './db'

/**
 * Colecciones propias: listas que haces tú («Favoritos», «Por leer»…), además de las series
 * que Mitzi arma sola. Se guardan en la base de datos y se sincronizan con el otro dispositivo.
 */
interface CollectionsState {
  /** las que no están borradas, por nombre */
  list: CollectionRecord[]
}

export const useCollections = create<CollectionsState>(() => ({ list: [] }))

export const SUGGESTED = ['Favoritos', 'Por leer', 'Releer', 'Prestados']

export async function refreshCollections() {
  const all = await db.collections.toArray()
  const list = all.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
  useCollections.setState({ list })
}

/** Ids de los libros que están en la colección. */
export const booksIn = (c: CollectionRecord) => Object.keys(c.items).filter(id => !c.items[id].removed)

export const hasBook = (c: CollectionRecord, bookId: string) => !!c.items[bookId] && !c.items[bookId].removed

export async function createCollection(name: string, bookIds: string[] = []) {
  const now = Date.now()
  const record: CollectionRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    items: Object.fromEntries(bookIds.map(id => [id, { at: now }])),
    createdAt: now,
    updatedAt: now,
  }
  await db.collections.put(record)
  await refreshCollections()
  return record
}

export async function renameCollection(id: string, name: string) {
  await db.collections.update(id, { name: name.trim(), updatedAt: Date.now() })
  await refreshCollections()
}

/** Se marca como borrada (no se elimina) para que el borrado llegue al otro dispositivo. */
export async function deleteCollection(id: string) {
  await db.collections.update(id, { deleted: true, updatedAt: Date.now() })
  await refreshCollections()
}

export async function setInCollection(id: string, bookId: string, inside: boolean) {
  await db.transaction('rw', db.collections, async () => {
    const c = await db.collections.get(id)
    if (!c) return
    c.items = { ...c.items, [bookId]: inside ? { at: Date.now() } : { at: Date.now(), removed: true } }
    await db.collections.put(c)
  })
  await refreshCollections()
}
