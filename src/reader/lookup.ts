import { platform } from '../platform'

export type LookupMode = 'define' | 'translate'

/** En la web: el diccionario de la RAE para definir; DeepL para traducir al español. */
export function lookupUrl(text: string, mode: LookupMode) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (mode === 'define') return `https://dle.rae.es/${encodeURIComponent(clean.split(' ')[0].toLowerCase())}`
  return `https://www.deepl.com/translator#auto/es/${encodeURIComponent(clean.slice(0, 1500))}`
}

/**
 * Definir o traducir lo seleccionado. En Android se ofrece primero a las apps del
 * teléfono que saben hacerlo (diccionarios, traductores); si no hay, se abre la web.
 */
export function lookup(text: string, mode: LookupMode) {
  if (platform.lookupText) platform.lookupText(text).then(handled => handled || platform.openExternal(lookupUrl(text, mode)))
  else platform.openExternal(lookupUrl(text, mode))
}
