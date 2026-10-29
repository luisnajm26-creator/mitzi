import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Equipos vinculados. Cualquier par de equipos se vincula una sola vez con el código que muestra
 * uno de ellos; desde ahí se sincronizan solos, cifrando con la llave de ese vínculo. Todos son
 * iguales: la PC, el teléfono y la tablet atienden a los demás y también los buscan.
 */
export interface Link {
  /** id del otro equipo (su `deviceId()`) */
  id: string
  /** su nombre, para mostrarlo («Pura 70 Ultra», «DESKTOP-LUIS») */
  label: string
  /** llave del vínculo (base64) */
  key: string
  linkedAt: number
  lastSync?: number
  /** dónde se lo encontró la última vez */
  hosts?: string[]
  port?: number
}

interface LinksState {
  peers: Link[]
  savePeer(link: Link): void
  removePeer(id: string): void
  /** marca una sincronización (y guarda dónde está el otro, si cambió de dirección) */
  touch(id: string, patch?: Partial<Link>): void
}

export const useLinks = create<LinksState>()(
  persist(
    (set, get) => ({
      peers: [],
      savePeer: link => set({ peers: [...get().peers.filter(p => p.id !== link.id), link] }),
      removePeer: id => set({ peers: get().peers.filter(p => p.id !== id) }),
      touch(id, patch = {}) {
        set({ peers: get().peers.map(p => (p.id === id ? { ...p, lastSync: Date.now(), ...patch } : p)) })
      },
    }),
    {
      name: 'mitzi-vinculos',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // la primera versión separaba «la PC del teléfono» (host) de «los equipos de la PC» (guests)
      migrate: (old, version) => {
        if (version >= 2) return old as LinksState
        const o = (old ?? {}) as { guests?: Link[]; host?: Link | null }
        return { peers: [...(o.guests ?? []), ...(o.host ? [o.host] : [])] } as LinksState
      },
    },
  ),
)
