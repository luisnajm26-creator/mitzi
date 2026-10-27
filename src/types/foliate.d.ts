// Tipos mínimos del motor foliate-js (vendor/foliate-js), que está escrito en JS.

declare module 'foliate-js/view.js' {
  export type LanguageMap = string | Record<string, string>
  export type Contributor = string | { name?: LanguageMap } | Array<string | { name?: LanguageMap }>

  export interface TocItem {
    label: string
    href?: string
    subitems?: TocItem[] | null
    id?: number
  }

  export interface FoliateSection {
    id?: string
    size?: number
    linear?: string
    cfi?: string
    createDocument?(): Promise<Document>
    /** ruta de un recurso (imagen, estilo…) relativa a esta sección, dentro del libro */
    resolveHref?(href: string): string
  }

  export interface FoliateBook {
    metadata?: {
      title?: LanguageMap
      author?: Contributor
      language?: string | string[]
      [key: string]: unknown
    }
    sections: FoliateSection[]
    toc?: TocItem[]
    dir?: string
    rendition?: { layout?: string }
    getCover?(): Promise<Blob | null>
    loadBlob?(path: string): Promise<Blob>
    /** a qué sección (índice) lleva un enlace del índice */
    resolveHref?(href: string): { index: number } | null
  }

  export interface RelocateDetail {
    fraction: number
    section?: { current: number; total: number }
    location?: { current: number; next: number; total: number }
    tocItem?: TocItem | null
    pageItem?: TocItem | null
    /** minutos que faltan (sección y libro) a 1600 caracteres por minuto */
    time?: { section: number; total: number }
    cfi: string
    range?: Range
  }

  export interface Paginator extends HTMLElement {
    setStyles(styles: string | [string, string]): void
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    getContents(): { index: number; doc: Document; overlayer?: unknown }[]
    nextSection(): Promise<void>
    scrollToAnchor(anchor: Range | Element | number, select?: boolean): Promise<void>
    readonly page: number
    readonly pages: number
    /** ancho visible del contenedor (px) */
    readonly size: number
    /** desplazamiento actual del contenedor (px) */
    readonly start: number
    /** desplaza el contenido dentro de los límites de la página actual */
    scrollBy(dx: number, dy: number): void
    destroy(): void
  }

  export interface ViewAnnotation {
    value: string
    [key: string]: unknown
  }

  export class View extends HTMLElement {
    /** cómics y libros de páginas fijas: sin columnas ni estilos de texto */
    isFixedLayout: boolean
    addAnnotation(annotation: ViewAnnotation, remove?: boolean): Promise<{ index: number; label: string } | undefined>
    deleteAnnotation(annotation: ViewAnnotation): Promise<unknown>
    getCFI(index: number, range: Range): string
    resolveCFI(cfi: string): { index: number; anchor: (doc: Document) => Range | Element }
    initTTS(granularity?: 'word' | 'sentence', highlight?: (range: Range) => void): Promise<void>
    tts: {
      start(): string | undefined
      next(paused?: boolean): string | undefined
      prev(paused?: boolean): string | undefined
      from(range: Range): string | undefined
      setMark(mark: string): void
    } | null
    book: FoliateBook
    renderer: Paginator
    lastLocation: RelocateDetail | null
    open(book: File | Blob | string | FoliateBook): Promise<void>
    close(): void
    init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    getSectionFractions(): number[]
    deselect(): void
    search(opts: {
      query: string
      matchCase?: boolean
      matchDiacritics?: boolean
      matchWholeWords?: boolean
      draw?: unknown
      drawOptions?: Record<string, unknown>
    }): AsyncGenerator<
      'done' | { progress: number } | { label: string; subitems: { cfi: string; excerpt: { pre: string; match: string; post: string } }[] }
    >
    clearSearch(): void
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}

declare module 'foliate-js/epubcfi.js' {
  /** extremo inicial (o final) de una CFI de rango */
  export function collapse(cfi: string, toEnd?: boolean): string
  export function compare(a: string, b: string): number
}

declare module 'foliate-js/overlayer.js' {
  type DrawFn = (rects: DOMRectList, options?: Record<string, unknown>) => SVGElement
  export class Overlayer {
    static highlight: DrawFn
    static underline: DrawFn
    static outline: DrawFn
  }
}
