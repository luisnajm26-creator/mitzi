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
  }

  export interface RelocateDetail {
    fraction: number
    section?: { current: number; total: number }
    location?: { current: number; next: number; total: number }
    tocItem?: TocItem | null
    pageItem?: TocItem | null
    cfi: string
    range?: Range
  }

  export interface Paginator extends HTMLElement {
    setStyles(styles: string | [string, string]): void
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    getContents(): { index: number; doc: Document; overlayer?: unknown }[]
    readonly page: number
    readonly pages: number
    destroy(): void
  }

  export class View extends HTMLElement {
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
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}
