/**
 * ¿La dirección es un archivo de una versión publicada de este repositorio? Antes se comparaba
 * el texto con `startsWith`, y una dirección con `..` (o `%2e%2e`) empezaba bien pero, al
 * resolverse, podía salir del repositorio. Ahora se analiza con `new URL` y la ruta tiene que
 * ser exactamente `/luisnajm26-creator/mitzi/releases/download/v1.2.3/<archivo>`.
 */
const RELEASE_PATH = /^\/luisnajm26-creator\/mitzi\/releases\/download\/v\d+\.\d+\.\d+\/([A-Za-z0-9._-]+)$/

export function isReleaseFile(text: string, fileName: string) {
  // nada de segmentos «..» ni barras o puntos escondidos, ni siquiera codificados
  if (/(^|[/\\])\.\.([/\\]|$)|%2e|%2f|%5c/i.test(text)) return false
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return false
  if (url.search || url.hash) return false
  return RELEASE_PATH.exec(url.pathname)?.[1] === fileName
}
