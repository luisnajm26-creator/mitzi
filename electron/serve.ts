import path from 'node:path'

/**
 * El archivo de `dist` que pide una dirección `mitzi://app/…`, o null si se sale de `dist`.
 * Se decodifica la ruta antes de comprobarla: `..%2Fdist-electron/…` trae un `../` escondido, y
 * comparar con `startsWith(distDir)` dejaba pasar carpetas hermanas como `dist-electron`.
 */
export function appFile(distDir: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null // un «%» mal formado
  }
  if (decoded.includes('\0')) return null
  const file = path.join(distDir, decoded)
  const rel = path.relative(distDir, file)
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null
  return file
}
