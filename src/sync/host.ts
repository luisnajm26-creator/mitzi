import { create } from 'zustand'
import { platform } from '../platform'
import { newCode, peek } from './crypto'
import { deviceId, deviceLabel } from './device'
import { useLinks } from './links'
import { answerSync, describeResult, SYNC_PORT } from './session'

/**
 * La PC como centro de la sincronización: mientras haya equipos vinculados, Mitzi los atiende
 * sola (aunque la ventana esté minimizada o en la bandeja). El código para vincular uno nuevo
 * solo vale mientras se muestra, 10 minutos como mucho y hasta 5 intentos equivocados.
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

async function handle(body: string) {
  const { pairing } = useSyncHost.getState()
  const code = pairing && pairing.until > Date.now() ? pairing.code : null
  try {
    const done = await answerSync(body, code)
    if (done.paired) endPairing()
    const text = done.paired ? `${done.label} quedó vinculado. ${describeResult(done.result)}` : `${done.label}: ${describeResult(done.result)}`
    useSyncHost.setState({ last: { ok: true, text, at: Date.now() } })
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

/** Abre el servidor (si no estaba abierto). */
export async function startHost() {
  if (!platform.syncServe) return
  try {
    const { hosts, port } = await platform.syncServe(SYNC_PORT, { id: deviceId(), label: await deviceLabel() }, handle)
    useSyncHost.setState({ listening: true, hosts, port, error: hosts.length ? null : 'Esta PC no está conectada a ninguna red' })
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

/** El código deja de valer; sin equipos vinculados, el servidor se cierra. */
export function endPairing() {
  clearTimeout(pairingTimer)
  useSyncHost.setState({ pairing: null })
  if (!useLinks.getState().guests.length) void stopHost()
}

export function unlinkGuest(id: string) {
  useLinks.getState().removeGuest(id)
  if (!useLinks.getState().guests.length && !useSyncHost.getState().pairing) void stopHost()
}

/** Al abrir la app: si hay equipos vinculados, se queda atenta a ellos. */
export function initHost() {
  if (platform.syncServe && useLinks.getState().guests.length) void startHost()
}
