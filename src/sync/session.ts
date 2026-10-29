import { platform } from '../platform'
import { refreshLibrary } from '../library/store'
import { cleanCode, newKey, open, peek, seal } from './crypto'
import { deviceId, deviceLabel } from './device'
import { useLinks } from './links'
import { mergeSnapshot, takeSnapshot, type MergeResult, type Snapshot } from './snapshot'

/**
 * Sincronizar por Wi-Fi, sin cuentas ni internet. La primera vez el teléfono se vincula con el
 * código que muestra la PC; después se sincroniza solo, cifrando con la llave del vínculo.
 * Cada vez manda sus datos, la PC los une con los suyos y responde con todo junto, que el
 * teléfono también une: los dos quedan iguales.
 */
export const SYNC_PORT = 47123

export interface SyncTarget {
  /** direcciones de la PC en la red (puede tener varias: Wi-Fi, cable, máquinas virtuales) */
  hosts: string[]
  port: number
  code: string
}

export interface SyncOutcome {
  /** qué es el otro equipo («PC», «Android») */
  name: string
  /** cómo se llama («Pura 70 Ultra», «DESKTOP-LUIS») */
  label: string
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

/** Lo que viaja: los datos y, al vincular, quién es cada uno (y la llave nueva, de vuelta). */
interface SyncRequest {
  snapshot: Snapshot
  link?: { id: string; label: string }
}

interface SyncResponse {
  snapshot: Snapshot
  link?: { id: string; label: string; key: string }
}

/** Después de unir: la biblioteca se actualiza y el lector se entera (por si su libro avanzó en otro lado). */
async function afterMerge(result: MergeResult) {
  await refreshLibrary()
  window.dispatchEvent(new CustomEvent('mitzi:sincronizado', { detail: result }))
}

/** El código no coincide o la PC ya no tiene este vínculo. */
export const isRejected = (e: unknown) => e instanceof Error && /coincide/.test(e.message)

/**
 * Del lado del teléfono: se vincula con la PC usando su código (una sola vez) y de paso se
 * sincroniza. La PC responde con la llave del vínculo, que se usa desde entonces.
 */
export async function pairWith(target: SyncTarget): Promise<SyncOutcome> {
  if (!platform.syncRequest) throw new Error('Este dispositivo no puede sincronizar')
  const secret = { code: target.code }
  const request: SyncRequest = { snapshot: await takeSnapshot(), link: { id: deviceId(), label: await deviceLabel() } }
  const reply = await platform.syncRequest(target.hosts, target.port, await seal(secret, 'pedido', request))
  let response: SyncResponse
  try {
    response = await open<SyncResponse>(secret, 'respuesta', reply)
  } catch {
    throw new Error('La respuesta no se pudo leer. Revisa el código.')
  }
  if (response.link) {
    const now = Date.now()
    useLinks.getState().setHost({ ...response.link, linkedAt: now, lastSync: now, hosts: target.hosts, port: target.port })
  }
  const result = await mergeSnapshot(response.snapshot)
  await afterMerge(result)
  return { name: response.snapshot.name, label: response.link?.label ?? response.snapshot.name, result }
}

/** Del lado del teléfono, ya vinculado: sin código, con la llave del vínculo. */
export async function syncLinked(hosts: string[], port: number): Promise<SyncOutcome> {
  const host = useLinks.getState().host
  if (!host || !platform.syncRequest) throw new Error('No hay una PC vinculada')
  const secret = { key: host.key, from: deviceId() }
  const request: SyncRequest = { snapshot: await takeSnapshot(), link: { id: deviceId(), label: await deviceLabel() } }
  const reply = await platform.syncRequest(hosts, port, await seal(secret, 'pedido', request))
  const response = await open<SyncResponse>(secret, 'respuesta', reply)
  const result = await mergeSnapshot(response.snapshot)
  useLinks.getState().touch(host.id, { hosts, port })
  await afterMerge(result)
  return { name: response.snapshot.name, label: host.label, result }
}

/**
 * Del lado de la PC: abre lo que llegó y lo une con lo de aquí. Con el código (`pairingCode`,
 * solo mientras se muestra) vincula al equipo; si viene con la llave de un vínculo, lo reconoce.
 * Si no es ninguno de los dos, lanza un error y no se toca nada.
 */
export async function answerSync(body: string, pairingCode: string | null): Promise<{ reply: string; paired: boolean } & SyncOutcome> {
  const envelope = peek(body)
  const links = useLinks.getState()
  if (envelope.v === 1) {
    if (!pairingCode) throw new Error('No se está vinculando ningún equipo')
    const secret = { code: pairingCode }
    const request = await open<SyncRequest>(secret, 'pedido', body)
    const now = Date.now()
    const key = newKey()
    if (request.link) links.saveGuest({ id: request.link.id, label: request.link.label, key, linkedAt: now, lastSync: now })
    const result = await mergeSnapshot(request.snapshot)
    const response: SyncResponse = {
      snapshot: await takeSnapshot(),
      link: request.link && { id: deviceId(), label: await deviceLabel(), key },
    }
    const reply = await seal(secret, 'respuesta', response)
    await afterMerge(result)
    return { reply, paired: !!request.link, name: request.snapshot.name, label: request.link?.label ?? request.snapshot.name, result }
  }
  const guest = links.guests.find(g => g.id === envelope.from)
  if (!guest) throw new Error('Equipo no vinculado')
  const request = await open<SyncRequest>({ key: guest.key, from: guest.id }, 'pedido', body)
  const result = await mergeSnapshot(request.snapshot)
  const response: SyncResponse = { snapshot: await takeSnapshot() }
  const reply = await seal({ key: guest.key, from: deviceId() }, 'respuesta', response)
  links.touch(guest.id, request.link ? { label: request.link.label } : {})
  await afterMerge(result)
  return { reply, paired: false, name: request.snapshot.name, label: request.link?.label ?? guest.label, result }
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
  // «Llegó 1 avance», «Llegaron 2 avances», «Llegaron 1 avance y 3 notas»
  const verb = !parts.length && last.startsWith('1 ') ? 'Llegó' : 'Llegaron'
  return `${verb} ${parts.length ? `${parts.join(', ')} y ${last}` : last}.`
}
