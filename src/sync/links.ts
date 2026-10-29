import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Equipos vinculados. Se vinculan una sola vez con el código de la PC; desde ahí se
 * sincronizan solos, cifrando con la llave de ese vínculo.
 * La PC guarda los equipos que atiende (`guests`); el teléfono o la tablet, su PC (`host`).
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
  /** (solo la PC del teléfono) dónde se la encontró la última vez */
  hosts?: string[]
  port?: number
}

interface LinksState {
  guests: Link[]
  host: Link | null
  saveGuest(link: Link): void
  removeGuest(id: string): void
  setHost(link: Link | null): void
  touch(id: string, patch?: Partial<Link>): void
}

export const useLinks = create<LinksState>()(
  persist(
    (set, get) => ({
      guests: [],
      host: null,
      saveGuest: link => set({ guests: [...get().guests.filter(g => g.id !== link.id), link] }),
      removeGuest: id => set({ guests: get().guests.filter(g => g.id !== id) }),
      setHost: host => set({ host }),
      // marca una sincronización (y guarda dónde está la PC, si cambió de dirección)
      touch(id, patch = {}) {
        const { guests, host } = get()
        const now = { lastSync: Date.now(), ...patch }
        if (host?.id === id) set({ host: { ...host, ...now } })
        else set({ guests: guests.map(g => (g.id === id ? { ...g, ...now } : g)) })
      },
    }),
    { name: 'mitzi-vinculos', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
