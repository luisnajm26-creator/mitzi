import { create } from 'zustand'
import { platform } from '../platform'
import { newCode, peek } from './crypto'
import { deviceId, deviceLabel } from './device'
import { useLinks } from './links'
import { answerSync, describeResult, SYNC_PORT } from './session'
import { setStatus } from './auto'

/**
 * Atender a los equipos vinculados: mientras haya alguno, Mitzi espera que le hablen (la PC
 * aunque esté minimizada o en la bandeja; Android mientras Mitzi esté abierta, o en segundo
 * plano si se eligió). El código para vincular uno nuevo solo vale mientras se muestra, 10
 * minutos como mucho y hasta 5 intentos equivocados.
 */
const PAIRING_MS = 10 * 60_000
const MAX_FAILURES = 5

interface HostState {
  listening: boolean
  hosts: string[]
  port: number
  /** código para vincular un equipo, mientras se muestra */
  pairing: { code: string; until: number } | null
  /** lo último que pasó, para mostrarlo */
  last: { ok: boolean; text: string; at: number } | null
  error: string | null
}

export const useSyncHost = create<HostState>(() => ({ listening: false, hosts: [], port: SYNC_PORT, pairing: null, last: null, error: null }))

let failures = 0
let pairingTimer: ReturnType<typeof setTimeout> | undefined

async function handle(body: string, remote?: string) {
  const { pairing } = useSyncHost.getState()
  const code = pairing && pairing.until > Date.now() ? pairing.code : null
  try {
    const done = await answerSync(body, code, remote)
    if (done.paired) endPairing()
    const text = done.paired ? `${done.label} quedó vinculado. ${describeResult(done.result)}` : `${done.label}: ${describeResult(done.result)}`
    useSyncHost.setState({ last: { ok: true, text, at: Date.now() } })
    // el otro equipo acaba de hablar: si antes no se lo encontraba, ya no es cierto
    if (done.peerId) setStatus(done.peerId, { ok: true, text: describeResult(done.result), at: Date.now() })
    return done.reply
  } catch (e) {
    // un código equivocado mientras se vincula: a los 5 intentos el código deja de valer
    if (code && peek(body).v === 1) {
      useSyncHost.setState({ last: { ok: false, text: 'Alguien intentó vincularse con un código equivocado.', at: Date.now() } })
      if (++failures >= MAX_FAILURES) endPairing()
    }
    throw e
  }
}

/** Empieza a atender (si no estaba atendiendo ya). */
export async function startHost() {
  if (!platform.syncServe) return
  try {
    const { hosts, port } = await platform.syncServe(SYNC_PORT, { id: deviceId(), label: await deviceLabel() }, handle)
    useSyncHost.setState({ listening: true, hosts, port, error: hosts.length ? null : 'Este equipo no está conectado a ninguna red' })
  } catch (e) {
    useSyncHost.setState({ listening: false, error: e instanceof Error ? e.message : String(e) })
  }
}

export async function stopHost() {
  await platform.syncStop?.()
  useSyncHost.setState({ listening: false })
}

/** Muestra un código nuevo para vincular un equipo. */
export async function beginPairing() {
  failures = 0
  clearTimeout(pairingTimer)
  const until = Date.now() + PAIRING_MS
  useSyncHost.setState({ pairing: { code: newCode(), until }, last: null })
  pairingTimer = setTimeout(endPairing, PAIRING_MS)
  await startHost()
}

/** El código deja de valer; sin equipos vinculados, se deja de atender. */
export function endPairing() {
  clearTimeout(pairingTimer)
  useSyncHost.setState({ pairing: null })
  if (!useLinks.getState().peers.length) void stopHost()
}

export function unlinkPeer(id: string) {
  useLinks.getState().removePeer(id)
  if (!useLinks.getState().peers.length && !useSyncHost.getState().pairing) void stopHost()
}

/** Al abrir la app (o al vincular uno nuevo): si hay equipos vinculados, se queda atenta a ellos. */
export function initHost() {
  if (platform.syncServe && useLinks.getState().peers.length) void startHost()
}
