import { platform } from '../platform'

const KEY = 'mitzi-dispositivo'
let cached: string | null = null

/** Id al azar de este dispositivo: separa lo que se leyó en cada uno al sincronizar. */
export function deviceId() {
  if (cached) return cached
  try {
    cached = localStorage.getItem(KEY)
    if (!cached) {
      cached = crypto.randomUUID()
      localStorage.setItem(KEY, cached)
    }
  } catch {
    cached ??= crypto.randomUUID()
  }
  return cached
}

/** Cómo se llama este dispositivo en los avisos («Sincronizado con tu PC»). */
export const deviceName = () => (platform.kind === 'android' ? 'Android' : 'PC')

let label: Promise<string> | null = null

/** El nombre del equipo que se ve en el otro: el del sistema, o «Android» / «PC». */
export function deviceLabel() {
  label ??= (platform.deviceLabel?.() ?? Promise.resolve(''))
    .catch(() => '')
    .then(l => l.trim() || deviceName())
  return label
}
