import { create } from 'zustand'
import { platform } from '../platform'
import type { UpdateInfo } from '../platform/types'

/**
 * Actualizaciones desde las versiones publicadas en GitHub (las que arma `npm run publicar`).
 * Mitzi pregunta una vez al día; si hay una versión nueva avisa, y al aceptar la app
 * descarga el instalador (PC) o el APK (Android), comprueba su huella SHA-256 contra
 * SHA256SUMS.txt y lo instala. Solo se aceptan archivos de este repositorio.
 */
const LATEST = 'https://api.github.com/repos/luisnajm26-creator/mitzi/releases/latest'
const LAST_CHECK = 'mitzi-update-check'
const DAY = 24 * 60 * 60 * 1000

interface UpdateState {
  info: UpdateInfo | null
  /** 0–1 mientras se descarga */
  progress: number | null
  error: string | null
  dismissed: boolean
}

export const useUpdates = create<UpdateState>(() => ({ info: null, progress: null, error: null, dismissed: false }))

/** ¿La versión `a` es más nueva que `b`? (1.10.0 > 1.9.3) */
export function isNewer(a: string, b: string) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

export const updatesSupported = () => !!platform.installUpdate

/**
 * Pregunta a GitHub si hay una versión nueva. Sin `force`, a lo sumo una vez al día.
 * Devuelve la versión nueva, o null si ya tienes la última.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!platform.installUpdate) return null
  if (!force) {
    try {
      if (Date.now() - Number(localStorage.getItem(LAST_CHECK) || 0) < DAY) return null
    } catch {
      // sin almacenamiento: se pregunta igual
    }
  }
  const res = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' } })
  try {
    localStorage.setItem(LAST_CHECK, String(Date.now()))
  } catch {
    // no es grave
  }
  if (res.status === 404) return null // todavía no hay versiones publicadas
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`)
  const release = (await res.json()) as {
    tag_name?: string
    body?: string
    html_url?: string
    assets?: { name: string; browser_download_url: string }[]
  }
  const version = String(release.tag_name ?? '').replace(/^v/, '')
  if (!isNewer(version, __MITZI_VERSION__)) {
    useUpdates.setState({ info: null })
    return null
  }
  const pattern = platform.kind === 'android' ? /^Mitzi-\d+\.\d+\.\d+\.apk$/ : /^Mitzi-Setup-\d+\.\d+\.\d+\.exe$/
  const asset = release.assets?.find(a => pattern.test(a.name))
  const sums = release.assets?.find(a => a.name === 'SHA256SUMS.txt')
  if (!asset || !sums) return null
  const info: UpdateInfo = {
    version,
    name: asset.name,
    url: asset.browser_download_url,
    sumsUrl: sums.browser_download_url,
    notes: release.body ?? '',
    pageUrl: release.html_url ?? '',
  }
  useUpdates.setState({ info, dismissed: false, error: null })
  return info
}

/** Descarga, comprueba e instala la versión encontrada. */
export async function installUpdate() {
  const { info } = useUpdates.getState()
  if (!info || !platform.installUpdate) return
  useUpdates.setState({ progress: 0, error: null })
  try {
    const result = await platform.installUpdate(info, fraction => useUpdates.setState({ progress: fraction }))
    if (result === 'needs-permission')
      useUpdates.setState({ progress: null, error: 'Permite que Mitzi instale apps (se abrió el ajuste) y vuelve a tocar «Actualizar».' })
  } catch (e) {
    useUpdates.setState({ progress: null, error: e instanceof Error ? e.message : String(e) })
  }
}
