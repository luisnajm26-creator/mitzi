/**
 * Separación silábica propia. En Windows, Chromium (y por eso Electron) no trae los
 * diccionarios de guiones: `hyphens: auto` no hacía nada y el texto justificado dejaba
 * huecos enormes entre palabras. Aquí se insertan guiones suaves (U+00AD, invisibles) en
 * las palabras largas de cada capítulo; el navegador solo los usa cuando tiene que partir
 * una palabra al final de una línea.
 *
 * Se insertan SIEMPRE, también con la opción apagada (entonces el CSS `hyphens: none` los
 * ignora): así el texto del capítulo es el mismo en cualquier caso y en cualquier
 * dispositivo, y las posiciones guardadas (progreso, subrayados) no se mueven.
 * Se hace al cargar cada capítulo, antes de que foliate lo maquete: nada se reacomoda.
 */

type Hyphenator = (text: string) => string
type HyphenModule = { hyphenateSync(text: string, options?: { minWordLength?: number }): string }

/** Idiomas con patrones (librería `hyphen`, patrones de hyph-utf8). */
const LOADERS: Record<string, () => Promise<HyphenModule>> = {
  es: () => import('hyphen/es') as Promise<HyphenModule>,
  en: () => import('hyphen/en-us') as Promise<HyphenModule>,
  pt: () => import('hyphen/pt') as Promise<HyphenModule>,
  fr: () => import('hyphen/fr') as Promise<HyphenModule>,
  it: () => import('hyphen/it') as Promise<HyphenModule>,
  de: () => import('hyphen/de') as Promise<HyphenModule>,
  ca: () => import('hyphen/ca') as Promise<HyphenModule>,
}

const loaded = new Map<string, Hyphenator | null>()

const baseLang = (lang: string | undefined) => (lang ?? '').toLowerCase().split(/[-_]/)[0]

/** Carga los patrones del idioma del libro (antes de abrirlo, para poder usarlos al instante). */
export async function prepareHyphenation(lang: string | undefined) {
  const key = baseLang(lang)
  if (loaded.has(key)) return
  const load = LOADERS[key]
  if (!load) return void loaded.set(key, null)
  try {
    const imported = (await load()) as HyphenModule & { default?: HyphenModule }
    // son módulos CommonJS: según cómo se empaqueten, la función queda en `default`
    const mod = typeof imported.hyphenateSync === 'function' ? imported : imported.default
    if (!mod) return void loaded.set(key, null)
    // palabras de 7 letras o más: las cortas casi nunca necesitan partirse
    loaded.set(key, text => mod.hyphenateSync(text, { minWordLength: 7 }))
  } catch {
    loaded.set(key, null)
  }
}

/** Lo que no es texto de lectura (código, estilos) no se toca. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE', 'KBD', 'SAMP', 'TEXTAREA', 'TITLE'])
const LONG_WORD = /\p{L}{7,}/u

/** Inserta guiones suaves en el capítulo (síncrono: se llama al cargarlo, antes de maquetar). */
export function hyphenateDocument(doc: Document, bookLang: string | undefined) {
  const lang = doc.documentElement.lang || doc.documentElement.getAttribute('xml:lang') || doc.body?.lang || bookLang
  const hyphenate = loaded.get(baseLang(lang)) ?? loaded.get(baseLang(bookLang))
  if (!hyphenate || !doc.body) return
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement && !SKIP.has(n.parentElement.tagName.toUpperCase()) && LONG_WORD.test(n.nodeValue ?? '')) nodes.push(n as Text)
  }
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    // ya tiene guiones suaves (el libro los trae): se respeta
    if (text.includes('­')) continue
    const out = hyphenate(text)
    if (out !== text) node.nodeValue = out
  }
}

/** Para copiar, subrayar o leer en voz alta: sin los guiones invisibles. */
export const withoutSoftHyphens = (text: string) => text.replace(/­/g, '')
