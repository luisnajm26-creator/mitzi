export interface ThemePreset {
  id: string
  name: string
  bg: string
  group: 'claros' | 'pasteles' | 'oscuros'
}

/** Fondos de lectura. El color del texto se calcula solo a partir de cada fondo (ver contrast.ts). */
export const THEMES: ThemePreset[] = [
  { id: 'blanco', name: 'Blanco', bg: '#fbfaf7', group: 'claros' },
  { id: 'crema', name: 'Crema', bg: '#f6efdc', group: 'claros' },
  { id: 'sepia', name: 'Sepia', bg: '#ecdec4', group: 'claros' },
  { id: 'gris-perla', name: 'Perla', bg: '#e9e8e4', group: 'claros' },

  { id: 'menta', name: 'Menta', bg: '#dcefe3', group: 'pasteles' },
  { id: 'salvia', name: 'Salvia', bg: '#dde6d3', group: 'pasteles' },
  { id: 'celeste', name: 'Celeste', bg: '#dbeaf5', group: 'pasteles' },
  { id: 'lavanda', name: 'Lavanda', bg: '#e7e1f4', group: 'pasteles' },
  { id: 'rosa', name: 'Rosa', bg: '#f6e1e7', group: 'pasteles' },
  { id: 'durazno', name: 'Durazno', bg: '#f9e3d2', group: 'pasteles' },
  { id: 'mantequilla', name: 'Mantequilla', bg: '#f6efc9', group: 'pasteles' },

  { id: 'pizarra', name: 'Pizarra', bg: '#3a4049', group: 'oscuros' },
  { id: 'ciruela', name: 'Ciruela', bg: '#2a2433', group: 'oscuros' },
  { id: 'bosque', name: 'Bosque', bg: '#1f2a25', group: 'oscuros' },
  { id: 'oceano', name: 'Océano', bg: '#1b2531', group: 'oscuros' },
  { id: 'noche', name: 'Noche', bg: '#1d1f25', group: 'oscuros' },
  { id: 'oled', name: 'Negro', bg: '#000000', group: 'oscuros' },
]

export const CUSTOM_THEME_ID = 'personalizado'

export const themeById = (id: string) => THEMES.find(t => t.id === id)
