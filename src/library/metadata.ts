import type { Contributor, FoliateBook, LanguageMap } from 'foliate-js/view.js'
import { loadPdfjs, pdfAssetOptions } from '../reader/engines/pdfjs'
import type { BookFormat } from './db'
import { paletteFromImage, paletteFromSeed, type Palette } from './palette'
import { guessSeries } from './series'

export interface ExtractedBook {
  title: string
  author: string
  language?: string
  pages: number
  cover?: Blob
  coverAspect: number
  palette: Palette
  series?: string
  seriesIndex?: number
}

/** Serie del EPUB (EPUB 3 o calibre) si la trae; si no, se deduce del título. */
function seriesOf(title: string, belongsTo: unknown) {
  const raw = (belongsTo as { series?: unknown } | undefined)?.series
  const one = (Array.isArray(raw) ? raw[0] : raw) as { name?: LanguageMap; position?: number } | null | undefined
  const name = formatLanguageMap(one?.name).trim()
  if (name) return { series: name, seriesIndex: Number.isFinite(one?.position) ? one!.position : guessSeries(title)?.index }
  const guess = guessSeries(title)
  return guess ? { series: guess.series, seriesIndex: guess.index } : {}
}

const COVER_HEIGHT = 1024
/** Bytes de XHTML que suelen equivaler a una página impresa. */
const BYTES_PER_PAGE = 2300

export { formatOf } from './formats'

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()

export const formatLanguageMap = (x: LanguageMap | undefined): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  return Object.values(x)[0] ?? ''
}

export const formatContributor = (c: Contributor | undefined): string => {
  if (!c) return ''
  const one = (x: string | { name?: LanguageMap }) => (typeof x === 'string' ? x : formatLanguageMap(x?.name))
  const list = Array.isArray(c) ? c.map(one) : [one(c)]
  return new Intl.ListFormat('es', { style: 'short', type: 'conjunction' }).format(list.filter(Boolean))
}

export async function extractBook(file: File, format: BookFormat): Promise<ExtractedBook> {
  return format === 'pdf' ? extractPdf(file) : extractEpub(file)
}

async function extractEpub(file: File): Promise<ExtractedBook> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const md = book.metadata ?? {}
  const named = formatLanguageMap(md.title).trim()
  // los cómics no traen título: se usa el nombre del archivo, sin la extensión
  const title = named && named !== file.name ? named : stripExt(file.name)
  const author = formatContributor(md.author).trim()
  const language = Array.isArray(md.language) ? md.language[0] : md.language
  const bytes = book.sections.reduce((sum, s) => sum + (s.linear !== 'no' ? (s.size ?? 0) : 0), 0)
  // libros de páginas fijas (cómics): una página por sección; los demás, por cantidad de texto
  const pages = book.rendition?.layout === 'pre-paginated' ? book.sections.length : Math.max(8, Math.min(4000, Math.round(bytes / BYTES_PER_PAGE)))
  const coverBlob = (await declaredCover(book)) ?? (await firstPageImage(book).catch(() => null))
  const cover = coverBlob ? await processCover(coverBlob) : null
  return {
    title,
    author,
    language,
    pages,
    cover: cover?.blob,
    coverAspect: cover?.aspect ?? 0.68,
    palette: cover?.palette ?? paletteFromSeed(title + author),
    ...seriesOf(title, md.belongsTo),
  }
}

/** La portada que el libro declara (algunos formatos devuelven null en vez de una promesa). */
async function declaredCover(book: FoliateBook): Promise<Blob | null> {
  try {
    return (await book.getCover?.()) ?? null
  } catch {
    return null
  }
}

/**
 * Muchos EPUB no declaran su portada, pero la ponen como imagen en la primera página
 * (cover.xhtml, Portada.xhtml…). Se usa esa imagen si la página casi no tiene texto.
 */
export async function firstPageImage(book: FoliateBook): Promise<Blob | null> {
  for (const section of book.sections.slice(0, 2)) {
    const doc = await section.createDocument?.()
    if (!doc || !section.resolveHref || !book.loadBlob) continue
    if ((doc.body?.textContent?.trim().length ?? 0) > 200) continue
    const img = doc.querySelector('img[src], image')
    const src = img?.getAttribute('src') ?? img?.getAttribute('href') ?? img?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (src) return book.loadBlob(section.resolveHref(src))
  }
  return null
}

async function extractPdf(file: File): Promise<ExtractedBook> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...pdfAssetOptions() })
  const doc = await task.promise
  try {
    const meta = await doc.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string; Language?: string }
    const title = info.Title?.trim() || stripExt(file.name)
    const author = info.Author?.trim() ?? ''

    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_HEIGHT / base.height })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    const blob = await canvasToBlob(canvas)
    const palette = paletteFromImage(canvas) ?? paletteFromSeed(title + author)
    page.cleanup()
    return {
      title,
      author,
      language: info.Language,
      pages: doc.numPages,
      cover: blob ?? undefined,
      coverAspect: base.width / base.height,
      palette,
      ...seriesOf(title, null),
    }
  } finally {
    await task.destroy()
  }
}

/** Vuelve a buscar la portada de un EPUB ya importado (con la búsqueda en la primera página). */
export async function findEpubCover(file: File) {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const blob = (await declaredCover(book)) ?? (await firstPageImage(book).catch(() => null))
  return blob ? processCover(blob) : null
}

/** Reduce la portada a un tamaño manejable y extrae su paleta. */
async function processCover(blob: Blob) {
  try {
    const img = await decodeImage(blob)
    const scale = Math.min(1, COVER_HEIGHT / img.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    canvas.getContext('2d')!.drawImage(img.source, 0, 0, canvas.width, canvas.height)
    img.close()
    const out = await canvasToBlob(canvas)
    return {
      blob: out ?? blob,
      aspect: img.width / img.height,
      palette: paletteFromImage(canvas),
    }
  } catch {
    return null
  }
}

/** Una imagen ya decodificada, lista para dibujar en un lienzo. */
export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close(): void
}

const IMAGE_TIMEOUT = 15_000
const limit = <T,>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('La imagen tardó demasiado')), IMAGE_TIMEOUT))])

/**
 * Decodifica una imagen sin colgarse: primero con createImageBitmap (fuera del hilo
 * principal); si ese formato no se puede así (p. ej. SVG), con <img>. Nunca espera más
 * de 15 s: con algunas imágenes `img.decode()` no terminaba y trababa la importación.
 */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await limit(createImageBitmap(blob))
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = url
      await limit(img.decode())
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close() {} }
    } finally {
      // el <img> decodificado ya no necesita la URL
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.88))
