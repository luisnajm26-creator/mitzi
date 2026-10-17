import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { deriveTheme, type ThemeColors } from './contrast'
import type { FontId } from './fonts'
import { CUSTOM_THEME_ID, themeById } from './themes'

export interface ComfortSettings {
  themeId: string
  customBg: string
  /** Cambia solo al tema de noche en el horario indicado. */
  autoNight: boolean
  nightThemeId: string
  nightStart: string
  nightEnd: string
  fontId: FontId
  fontSize: number
  lineHeight: number
  /** null = el espaciado que trae el libro */
  paragraphSpacing: number | null
  /** 0–4: margen a los lados del texto */
  margin: number
  /** ancho máximo de cada columna en px */
  maxWidth: number
  justify: boolean
  hyphenate: boolean
  flow: 'paginated' | 'scrolled'
  /** 'auto' = dos páginas cuando la pantalla es ancha */
  spread: 'auto' | 'single'
  pdfFit: 'page' | 'width'
  /** 0.3–1, encima de la pantalla */
  brightness: number
  /** 0–1, filtro cálido (menos luz azul) */
  warmth: number
  animatePages: boolean
  keepAwake: boolean
}

export const DEFAULT_SETTINGS: ComfortSettings = {
  themeId: 'crema',
  customBg: '#e6efe9',
  autoNight: false,
  nightThemeId: 'noche',
  nightStart: '21:00',
  nightEnd: '07:00',
  fontId: 'literata',
  fontSize: 19,
  lineHeight: 1.6,
  paragraphSpacing: null,
  margin: 2,
  maxWidth: 680,
  justify: true,
  hyphenate: true,
  flow: 'paginated',
  spread: 'auto',
  pdfFit: 'page',
  brightness: 1,
  warmth: 0,
  animatePages: true,
  keepAwake: true,
}

interface ReaderSettingsState {
  global: ComfortSettings
  /** Ajustes que solo aplican a un libro (por id). */
  perBook: Record<string, Partial<ComfortSettings>>
  update(patch: Partial<ComfortSettings>, bookId?: string | null): void
  setBookScope(bookId: string, onlyThisBook: boolean): void
}

export const useReaderSettings = create<ReaderSettingsState>()(
  persist(
    (set, get) => ({
      global: DEFAULT_SETTINGS,
      perBook: {},
      update(patch, bookId) {
        const { global, perBook } = get()
        if (bookId && perBook[bookId]) set({ perBook: { ...perBook, [bookId]: { ...perBook[bookId], ...patch } } })
        else set({ global: { ...global, ...patch } })
      },
      setBookScope(bookId, onlyThisBook) {
        const { perBook, global } = get()
        const next = { ...perBook }
        // al activar, el libro parte de los ajustes actuales
        if (onlyThisBook) next[bookId] = { ...global }
        else delete next[bookId]
        set({ perBook: next })
      },
    }),
    {
      name: 'mitzi-lectura',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<ReaderSettingsState> | undefined
        return { ...current, ...p, global: { ...DEFAULT_SETTINGS, ...p?.global } }
      },
    },
  ),
)

type SettingsSnapshot = Pick<ReaderSettingsState, 'global' | 'perBook'>

export function effectiveSettings(s: SettingsSnapshot, bookId?: string | null): ComfortSettings {
  const own = bookId ? s.perBook[bookId] : undefined
  return own ? { ...s.global, ...own } : s.global
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function isNightTime(settings: ComfortSettings, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes()
  const start = minutes(settings.nightStart)
  const end = minutes(settings.nightEnd)
  return start <= end ? t >= start && t < end : t >= start || t < end
}

export function themeBg(id: string, settings: ComfortSettings) {
  if (id === CUSTOM_THEME_ID) return settings.customBg
  return themeById(id)?.bg ?? '#f6efdc'
}

/** Colores que se ven ahora mismo (considera el modo noche automático). */
export function effectiveTheme(s: SettingsSnapshot, bookId?: string | null, now = new Date()): ThemeColors {
  const settings = effectiveSettings(s, bookId)
  const id = settings.autoNight && isNightTime(settings, now) ? settings.nightThemeId : settings.themeId
  return deriveTheme(themeBg(id, settings))
}
