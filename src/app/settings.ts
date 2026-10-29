import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Ajustes de la app (no de la lectura): cómo se ve la biblioteca y cómo se comporta Mitzi.
 * Los de lectura viven en reader/comfort/settings.ts porque pueden ser distintos por libro.
 */
export interface AppSettings {
  /** el libro del centro gira solo */
  shelfSpin: boolean
  /** partículas de polvo dentro del haz de luz */
  shelfDust: boolean
  /** menos resolución en la biblioteca 3D y sin efectos: gasta menos batería */
  batterySaver: boolean
  /** buscar una versión nueva una vez al día */
  autoUpdates: boolean
  /** (PC) al cerrar la ventana, Mitzi queda en la bandeja y sigue atendiendo a los equipos vinculados */
  keepInTray: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shelfSpin: true,
  shelfDust: true,
  batterySaver: false,
  autoUpdates: true,
  keepInTray: false,
}

interface AppSettingsState extends AppSettings {
  set(patch: Partial<AppSettings>): void
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    set => ({
      ...DEFAULT_APP_SETTINGS,
      set: patch => set(patch),
    }),
    { name: 'mitzi-app', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
