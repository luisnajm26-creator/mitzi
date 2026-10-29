import { create } from 'zustand'
import { platform } from '../platform'
import { useLinks } from './links'
import { describeResult, isRejected, SYNC_PORT, syncLinked, type SyncOutcome } from './session'

/**
 * Sincronización automática del teléfono o la tablet con su PC vinculada: al abrir Mitzi, al
 * volver a ella y al cerrar un libro. Si la PC no responde en la dirección de siempre, se la
 * busca en la red. Si está apagada no pasa nada: se intenta la próxima vez.
 */
type Reason = 'inicio' | 'volver' | 'libro' | 'manual'

/** Al volver a la app no se pregunta más de una vez cada tanto (el teléfono se prende y apaga mucho). */
const MIN_GAP_MS = 20_000

interface ClientState {
  busy: boolean
  /** lo último que pasó, para mostrarlo en Configuración */
  last: { ok: boolean; text: string; at: number } | null
  /** aviso breve en la biblioteca cuando llegó algo nuevo */
  notice: string | null
}

export const useSyncClient = create<ClientState>(() => ({ busy: false, last: null, notice: null }))

let lastTry = 0

const changed = (o: SyncOutcome) => {
  const r = o.result
  return r.progress + r.annotations + r.bookmarks + r.collections + r.days > 0
}

export async function syncNow(reason: Reason): Promise<SyncOutcome | null> {
  const host = useLinks.getState().host
  if (!host || !platform.syncRequest || useSyncClient.getState().busy) return null
  if ((reason === 'inicio' || reason === 'volver') && Date.now() - lastTry < MIN_GAP_MS) return null
  lastTry = Date.now()
  useSyncClient.setState({ busy: true })
  try {
    let outcome: SyncOutcome
    try {
      outcome = await syncLinked(host.hosts ?? [], host.port ?? SYNC_PORT)
    } catch (e) {
      if (isRejected(e)) throw e
      // la PC pudo cambiar de dirección (el módem reparte otra): se pregunta en la red
      const peers = ((await platform.syncDiscover?.()) ?? []).filter(p => p.id === host.id)
      if (!peers.length) throw e
      outcome = await syncLinked(
        peers.map(p => p.host),
        peers[0].port,
      )
    }
    const text = `Sincronizado con ${outcome.label}. ${describeResult(outcome.result)}`
    useSyncClient.setState({
      last: { ok: true, text, at: Date.now() },
      notice: reason !== 'manual' && changed(outcome) ? `Llegó lo último de ${outcome.label}` : null,
    })
    return outcome
  } catch (e) {
    const text = isRejected(e)
      ? `${host.label} ya no reconoce este equipo: vuelve a vincularlo.`
      : `No se encontró a ${host.label} en la red. ¿Está encendida con Mitzi abierta y en el mismo Wi-Fi?`
    useSyncClient.setState({ last: { ok: false, text, at: Date.now() } })
    if (reason === 'manual') throw new Error(text)
    return null
  } finally {
    useSyncClient.setState({ busy: false })
  }
}

/** Sin esperar ni mostrar errores: para los momentos automáticos. */
export function autoSync(reason: Exclude<Reason, 'manual'>) {
  void syncNow(reason)
}
