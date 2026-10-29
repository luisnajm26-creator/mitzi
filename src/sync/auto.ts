import { create } from 'zustand'
import { platform } from '../platform'
import { useLinks, type Link } from './links'
import { describeResult, isRejected, SYNC_PORT, syncPeer, type SyncOutcome } from './session'

/**
 * Sincronización automática con los equipos vinculados: al abrir Mitzi, al volver a ella y al
 * cerrar un libro, se busca a cada uno. Si no responde en la dirección de siempre, se lo busca
 * en la red. Si está apagado (o con Mitzi cerrada) no pasa nada: se intenta la próxima vez.
 * Los cambios viajan en cadena: lo que llegó de uno se pasa al siguiente.
 */
type Reason = 'inicio' | 'volver' | 'libro' | 'manual'

/** Al volver a la app no se pregunta más de una vez cada tanto (el teléfono se prende y apaga mucho). */
const MIN_GAP_MS = 20_000

export interface PeerStatus {
  ok: boolean
  text: string
  at: number
}

interface ClientState {
  busy: boolean
  /** lo último que pasó con cada equipo, para mostrarlo en Configuración */
  status: Record<string, PeerStatus>
  /** aviso breve en la biblioteca cuando llegó algo nuevo */
  notice: string | null
}

export const useSyncClient = create<ClientState>(() => ({ busy: false, status: {}, notice: null }))

let lastTry = 0

const changed = (o: SyncOutcome) => {
  const r = o.result
  return r.progress + r.annotations + r.bookmarks + r.collections + r.days > 0
}

/** Un equipo: en su dirección de siempre y, si no responde, buscándolo en la red. */
async function reach(peer: Link) {
  try {
    return await syncPeer(peer, peer.hosts ?? [], peer.port ?? SYNC_PORT)
  } catch (e) {
    if (isRejected(e)) throw e
    // pudo cambiar de dirección (el módem reparte otra): se pregunta en la red
    const found = ((await platform.syncDiscover?.()) ?? []).filter(p => p.id === peer.id)
    if (!found.length) throw e
    return await syncPeer(
      peer,
      found.map(p => p.host),
      found[0].port,
    )
  }
}

export function setStatus(id: string, status: PeerStatus) {
  useSyncClient.setState(s => ({ status: { ...s.status, [id]: status } }))
}

/** Se sincroniza con todos los equipos vinculados, uno por uno. Devuelve cuántos respondieron. */
export async function syncNow(reason: Reason): Promise<number> {
  const peers = useLinks.getState().peers
  if (!peers.length || !platform.syncRequest || useSyncClient.getState().busy) return 0
  if ((reason === 'inicio' || reason === 'volver') && Date.now() - lastTry < MIN_GAP_MS) return 0
  lastTry = Date.now()
  useSyncClient.setState({ busy: true })
  let reached = 0
  const arrived: string[] = []
  try {
    for (const peer of peers) {
      try {
        const outcome = await reach(peer)
        reached++
        if (changed(outcome)) arrived.push(outcome.label)
        setStatus(peer.id, { ok: true, text: `Sincronizado. ${describeResult(outcome.result)}`, at: Date.now() })
      } catch (e) {
        setStatus(peer.id, {
          ok: false,
          text: isRejected(e) ? 'Ya no reconoce este equipo: vuelve a vincularlo.' : 'No se encontró en la red (¿apagado o con Mitzi cerrada?).',
          at: Date.now(),
        })
      }
    }
    if (reason !== 'manual' && arrived.length) useSyncClient.setState({ notice: `Llegó lo último de ${arrived.join(' y ')}` })
    return reached
  } finally {
    useSyncClient.setState({ busy: false })
  }
}

/** Sin esperar ni mostrar errores: para los momentos automáticos. */
export function autoSync(reason: Exclude<Reason, 'manual'>) {
  void syncNow(reason)
}
