import { platform } from '../platform'
import { refreshLibrary } from '../library/store'
import { cleanCode, open, seal } from './crypto'
import { mergeSnapshot, takeSnapshot, type MergeResult, type Snapshot } from './snapshot'

/**
 * Sincronizar por Wi-Fi, sin cuentas ni internet: la PC espera con un código en pantalla y el
 * otro dispositivo (que lo escanea o lo escribe) le manda sus datos cifrados. La PC une lo que
 * llegó con lo suyo y responde con el resultado, que el otro también une: los dos quedan iguales.
 */
export const SYNC_PORT = 47123

export interface SyncTarget {
  /** direcciones de la PC en la red (puede tener varias: Wi-Fi, cable, máquinas virtuales) */
  hosts: string[]
  port: number
  code: string
}

export interface SyncOutcome {
  /** con quién se sincronizó («PC», «Android») */
  name: string
  result: MergeResult
}

/** Lo que dice el código QR: MITZI1:192.168.1.20,10.0.0.4:47123:K7QM3XPA */
export const qrText = (t: SyncTarget) => `MITZI1:${t.hosts.join(',')}:${t.port}:${t.code}`

export function parseQr(text: string): SyncTarget | null {
  const m = text.trim().match(/^MITZI1:([\d.,]+):(\d+):([0-9A-Z]+)$/)
  if (!m) return null
  return { hosts: m[1].split(',').filter(Boolean), port: Number(m[2]), code: m[3] }
}

/** Lo que se escribe a mano: «192.168.1.20» (o con :puerto) y el código. */
export function parseManual(address: string, code: string): SyncTarget | null {
  const m = address.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/)
  const clean = cleanCode(code)
  if (!m || clean.length < 6) return null
  return { hosts: [m[1]], port: m[2] ? Number(m[2]) : SYNC_PORT, code: clean }
}

const LAST = 'mitzi-sync-ultima'

export function lastSync(): { at: number; name: string } | null {
  try {
    return JSON.parse(localStorage.getItem(LAST) ?? 'null')
  } catch {
    return null
  }
}

function saveLast(name: string) {
  try {
    localStorage.setItem(LAST, JSON.stringify({ at: Date.now(), name }))
  } catch {
    // no es grave
  }
}

/** Del lado que escanea: manda lo suyo y une lo que responde la PC. */
export async function syncWith(target: SyncTarget): Promise<SyncOutcome> {
  if (!platform.syncRequest) throw new Error('Este dispositivo no puede sincronizar')
  const body = await seal(target.code, 'pedido', await takeSnapshot())
  const reply = await platform.syncRequest(target.hosts, target.port, body)
  let remote: Snapshot
  try {
    remote = await open<Snapshot>(target.code, 'respuesta', reply)
  } catch {
    throw new Error('La respuesta no se pudo leer. Revisa el código.')
  }
  const result = await mergeSnapshot(remote)
  await refreshLibrary()
  saveLast(remote.name)
  return { name: remote.name, result }
}

/**
 * Del lado de la PC: abre lo que llegó (si el código no coincide, lanza un error y no se toca
 * nada), lo une con lo de aquí y responde con todo junto.
 */
export async function answerSync(code: string, body: string): Promise<{ reply: string } & SyncOutcome> {
  const remote = await open<Snapshot>(code, 'pedido', body)
  const result = await mergeSnapshot(remote)
  const reply = await seal(code, 'respuesta', await takeSnapshot())
  await refreshLibrary()
  saveLast(remote.name)
  return { reply, name: remote.name, result }
}

/** «3 avances, 5 notas y 2 días de lectura» */
export function describeResult(r: MergeResult) {
  const parts: string[] = []
  const add = (n: number, one: string, many: string) => n && parts.push(`${n} ${n === 1 ? one : many}`)
  add(r.progress, 'avance', 'avances')
  add(r.annotations, 'subrayado o nota', 'subrayados y notas')
  add(r.bookmarks, 'marcador', 'marcadores')
  add(r.collections, 'colección', 'colecciones')
  add(r.days, 'día de lectura', 'días de lectura')
  if (!parts.length) return 'Ya estaban iguales.'
  const last = parts.pop()!
  return `Llegaron ${parts.length ? `${parts.join(', ')} y ${last}` : last}.`
}
