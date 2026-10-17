import type { Contributor, LanguageMap } from 'foliate-js/view.js'
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

export const formatOf = (name: string): BookFormat | null =>
  /\.epub$/i.test(name) ? 'epub' : /\.pdf$/i.test(name) ? 'pdf' : null

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
  return format === 'epub' ? extractEpub(file) : extractPdf(file)
}

async function extractEpub(file: File): Promise<ExtractedBook> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const md = book.metadata ?? {}
  const title = formatLanguageMap(md.title).trim() || stripExt(file.name)
  const author = formatContributor(md.author).trim()
  const language = Array.isArray(md.language) ? md.language[0] : md.language
  const bytes = book.sections.reduce((sum, s) => sum + (s.linear !== 'no' ? (s.size ?? 0) : 0), 0)
  const pages = Math.max(8, Math.min(4000, Math.round(bytes / BYTES_PER_PAGE)))
  const coverBlob = await book.getCover?.().catch(() => null)
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

/** Reduce la portada a un tamaño manejable y extrae su paleta. */
async function processCover(blob: Blob) {
  try {
    const img = await loadImage(blob)
    const scale = Math.min(1, COVER_HEIGHT / img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = await canvasToBlob(canvas)
    return {
      blob: out ?? blob,
      aspect: img.naturalWidth / img.naturalHeight,
      palette: paletteFromImage(canvas),
    }
  } catch {
    return null
  }
}

export async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    // el <img> decodificado ya no necesita la URL
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.88))
