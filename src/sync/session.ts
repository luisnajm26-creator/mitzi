import { platform } from '../platform'
import { refreshLibrary } from '../library/store'
import { agreeKey, cleanCode, newExchange, open, peek, seal } from './crypto'
import { deviceId, deviceLabel } from './device'
import { useLinks, type Link } from './links'
import { mergeSnapshot, takeSnapshot, type MergeResult, type Snapshot } from './snapshot'

/**
 * Sincronizar por Wi-Fi, sin cuentas ni internet. La primera vez dos equipos se vinculan con el
 * código que muestra uno de ellos; después se sincronizan solos, cifrando con la llave del
 * vínculo. Cada vez uno manda sus datos, el otro los une con los suyos y responde con todo junto,
 * que el primero también une: los dos quedan iguales.
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
  /** su id (si es un equipo vinculado) */
  peerId?: string
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

/**
 * Lo que viaja: los datos y, al vincular, quién es cada uno y la parte pública de su llave de un
 * solo uso (`pub`), con la que los dos calculan la llave del vínculo sin mandarla.
 */
interface SyncRequest {
  snapshot: Snapshot
  link?: { id: string; label: string; pub?: string }
}

interface SyncResponse {
  snapshot: Snapshot
  link?: { id: string; label: string; pub: string }
}

/** Después de unir: la biblioteca se actualiza y el lector se entera (por si su libro avanzó en otro lado). */
async function afterMerge(result: MergeResult) {
  await refreshLibrary()
  window.dispatchEvent(new CustomEvent('mitzi:sincronizado', { detail: result }))
}

/** El código no coincide o la PC ya no tiene este vínculo. */
export const isRejected = (e: unknown) => e instanceof Error && /coincide/.test(e.message)

/**
 * Del lado que escanea: se vincula con el otro equipo usando su código (una sola vez) y de paso
 * se sincroniza. El otro responde con la llave del vínculo, que se usa desde entonces.
 */
export async function pairWith(target: SyncTarget): Promise<SyncOutcome> {
  if (!platform.syncRequest) throw new Error('Este dispositivo no puede sincronizar')
  const secret = { code: target.code }
  const exchange = await newExchange()
  const request: SyncRequest = { snapshot: await takeSnapshot(), link: { id: deviceId(), label: await deviceLabel(), pub: exchange.pub } }
  const reply = await platform.syncRequest(target.hosts, target.port, await seal(secret, 'pedido', request))
  let response: SyncResponse
  try {
    response = await open<SyncResponse>(secret, 'respuesta', reply)
  } catch {
    throw new Error('La respuesta no se pudo leer. Revisa el código.')
  }
  if (response.link) {
    const now = Date.now()
    const key = await agreeKey(exchange.pair, response.link.pub, target.code)
    const { id, label } = response.link
    useLinks.getState().savePeer({ id, label, key, linkedAt: now, lastSync: now, hosts: target.hosts, port: target.port })
  }
  const result = await mergeSnapshot(response.snapshot)
  await afterMerge(result)
  return { name: response.snapshot.name, label: response.link?.label ?? response.snapshot.name, peerId: response.link?.id, result }
}

/** Con un equipo ya vinculado: sin código, con la llave del vínculo. */
export async function syncPeer(peer: Link, hosts: string[], port: number): Promise<SyncOutcome> {
  if (!platform.syncRequest) throw new Error('Este dispositivo no puede sincronizar')
  const secret = { key: peer.key, from: deviceId() }
  const request: SyncRequest = { snapshot: await takeSnapshot(), link: { id: deviceId(), label: await deviceLabel() } }
  const reply = await platform.syncRequest(hosts, port, await seal(secret, 'pedido', request))
  const response = await open<SyncResponse>(secret, 'respuesta', reply)
  const result = await mergeSnapshot(response.snapshot)
  useLinks.getState().touch(peer.id, { hosts, port })
  await afterMerge(result)
  return { name: response.snapshot.name, label: peer.label, peerId: peer.id, result }
}

/**
 * Del lado que atiende: abre lo que llegó y lo une con lo de aquí. Con el código (`pairingCode`,
 * solo mientras se muestra) vincula al equipo; si viene con la llave de un vínculo, lo reconoce.
 * Si no es ninguno de los dos, lanza un error y no se toca nada. `remote` es la dirección desde
 * la que habló el otro: se guarda para buscarlo después.
 */
export async function answerSync(body: string, pairingCode: string | null, remote?: string): Promise<{ reply: string; paired: boolean } & SyncOutcome> {
  const envelope = peek(body)
  const links = useLinks.getState()
  const seen = remote ? { hosts: [remote], port: SYNC_PORT } : {}
  if (envelope.v === 1) {
    if (!pairingCode) throw new Error('No se está vinculando ningún equipo')
    const secret = { code: pairingCode }
    const request = await open<SyncRequest>(secret, 'pedido', body)
    const now = Date.now()
    const exchange = await newExchange()
    // sin la parte pública del otro no se vincula (versiones de prueba anteriores)
    const linking = request.link?.pub ? request.link : null
    if (linking) {
      const key = await agreeKey(exchange.pair, linking.pub!, pairingCode)
      links.savePeer({ id: linking.id, label: linking.label, key, linkedAt: now, lastSync: now, ...seen })
    }
    const result = await mergeSnapshot(request.snapshot)
    const response: SyncResponse = {
      snapshot: await takeSnapshot(),
      link: linking ? { id: deviceId(), label: await deviceLabel(), pub: exchange.pub } : undefined,
    }
    const reply = await seal(secret, 'respuesta', response)
    await afterMerge(result)
    return { reply, paired: !!linking, name: request.snapshot.name, label: request.link?.label ?? request.snapshot.name, peerId: linking?.id, result }
  }
  const peer = links.peers.find(p => p.id === envelope.from)
  if (!peer) throw new Error('Equipo no vinculado')
  const request = await open<SyncRequest>({ key: peer.key, from: peer.id }, 'pedido', body)
  const result = await mergeSnapshot(request.snapshot)
  const response: SyncResponse = { snapshot: await takeSnapshot() }
  const reply = await seal({ key: peer.key, from: deviceId() }, 'respuesta', response)
  links.touch(peer.id, { ...(request.link ? { label: request.link.label } : {}), ...seen })
  await afterMerge(result)
  return { reply, paired: false, name: request.snapshot.name, label: request.link?.label ?? peer.label, peerId: peer.id, result }
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
