import type { RelocateDetail, TocItem, View } from 'foliate-js/view.js'
import type { ThemeColors } from '../comfort/contrast'
import { epubCss } from '../comfort/epubCss'
import type { ComfortSettings } from '../comfort/settings'
import type { EngineCallbacks, OpenOptions, ReaderEngine, TocEntry } from './types'

const flattenToc = (items: TocItem[] | null | undefined, depth = 0): TocEntry[] =>
  (items ?? []).flatMap(item => [
    ...(item.href ? [{ label: item.label?.trim() || 'Sin título', target: item.href, depth }] : []),
    ...flattenToc(item.subitems, depth + 1),
  ])

/** EPUB con foliate-js: paginación en columnas, CFI y estilos inyectados. */
export class EpubEngine implements ReaderEngine {
  readonly format = 'epub' as const
  #view: View | null = null
  #callbacks: EngineCallbacks
  #lastCss = ''

  constructor(callbacks: EngineCallbacks) {
    this.#callbacks = callbacks
  }

  async open(container: HTMLElement, file: File, { location, settings, theme }: OpenOptions) {
    await import('foliate-js/view.js')
    const view = document.createElement('foliate-view') as View
    view.className = 'epub-view'
    container.append(view)
    this.#view = view

    await view.open(file)
    view.addEventListener('relocate', e => this.#onRelocate((e as CustomEvent<RelocateDetail>).detail))
    view.addEventListener('load', e => this.#attach((e as CustomEvent<{ doc: Document }>).detail.doc))
    this.apply(settings, theme)
    await view.init({ lastLocation: location ?? null })
  }

  apply(s: ComfortSettings, t: ThemeColors) {
    const r = this.#view?.renderer
    if (!r) return
    const attrs: Record<string, string> = {
      flow: s.flow,
      gap: `${4 + s.margin * 2}%`,
      margin: '36px',
      'max-inline-size': `${s.maxWidth}px`,
      'max-column-count': s.spread === 'single' ? '1' : '2',
    }
    for (const [name, value] of Object.entries(attrs)) if (r.getAttribute(name) !== value) r.setAttribute(name, value)
    r.toggleAttribute('animated', s.animatePages)
    const css = epubCss(s, t)
    if (css !== this.#lastCss) {
      this.#lastCss = css
      r.setStyles(css)
    }
  }

  next() {
    return this.#view?.next() ?? Promise.resolve()
  }

  prev() {
    return this.#view?.prev() ?? Promise.resolve()
  }

  async goTo(target: string) {
    await this.#view?.goTo(target)
  }

  async goToFraction(fraction: number) {
    await this.#view?.goToFraction(fraction)
  }

  toc() {
    return flattenToc(this.#view?.book.toc)
  }

  destroy() {
    this.#view?.close()
    this.#view?.remove()
    this.#view = null
  }

  #onRelocate(d: RelocateDetail) {
    this.#callbacks.onRelocate({
      fraction: d.fraction ?? 0,
      location: d.cfi,
      chapter: d.tocItem?.label?.trim(),
      pageLabel: d.pageItem?.label,
    })
  }

  /** Los toques y teclas ocurren dentro del iframe del libro; se pasan a la interfaz. */
  #attach(doc: Document) {
    doc.addEventListener('keydown', e => this.#callbacks.onKey(e))
    doc.addEventListener('wheel', e => this.#callbacks.onWheel(e), { passive: true })
    doc.addEventListener('click', e => {
      if (e.defaultPrevented) return // enlaces: los maneja foliate
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) return
      const frame = doc.defaultView?.frameElement
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      this.#callbacks.onTap(rect.left + e.clientX, rect.top + e.clientY)
    })
  }
}
