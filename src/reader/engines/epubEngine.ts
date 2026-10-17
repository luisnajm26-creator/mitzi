import { Overlayer } from 'foliate-js/overlayer.js'
import type { RelocateDetail, TocItem, View, ViewAnnotation } from 'foliate-js/view.js'
import type { AnnotationRecord } from '../../library/db'
import type { ThemeColors } from '../comfort/contrast'
import { epubCss } from '../comfort/epubCss'
import type { ComfortSettings } from '../comfort/settings'
import { GhostPages } from '../pageTurn/epubGhost'
import { createEpubSpeech } from '../tts/epubSpeech'
import type { EngineCallbacks, OpenOptions, PageSide, PointerInfo, ReaderEngine, TocEntry, ViewOptions } from './types'

const idle = () => new Promise<void>(resolve => (window.requestIdleCallback ?? setTimeout)(() => resolve()))

const flattenToc = (items: TocItem[] | null | undefined, depth = 0): TocEntry[] =>
  (items ?? []).flatMap(item => [
    ...(item.href ? [{ label: item.label?.trim() || 'Sin título', target: item.href, depth }] : []),
    ...flattenToc(item.subitems, depth + 1),
  ])

/** Forma de página de un libro impreso típico (ancho / alto). */
const BOOK_PAGE_ASPECT = 0.66

/** EPUB con foliate-js: paginación en columnas, CFI y estilos inyectados. */
export class EpubEngine implements ReaderEngine {
  readonly format = 'epub' as const
  #view: View | null = null
  #callbacks: EngineCallbacks
  #lastCss = ''
  #theme: ThemeColors | null = null
  /** La hoja de papel está activa: los gestos de arrastre son de Mitzi, no de foliate. */
  #flipEnabled = true
  #ghosts = new GhostPages()
  #prewarming = false
  #suppressClickAt = 0
  /** subrayados por CFI */
  #annotations = new Map<string, AnnotationRecord>()
  #annotationTapAt = 0
  #hadSelection = false

  constructor(callbacks: EngineCallbacks) {
    this.#callbacks = callbacks
  }

  async open(container: HTMLElement, file: File, { location, settings, theme, view: viewOptions }: OpenOptions) {
    await import('foliate-js/view.js')
    const view = document.createElement('foliate-view') as View
    view.className = 'epub-view'
    container.append(view)
    this.#view = view

    await view.open(file)
    view.addEventListener('relocate', e => this.#onRelocate((e as CustomEvent<RelocateDetail>).detail))
    view.addEventListener('load', e => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail
      this.#attach(doc, index)
    })
    // subrayados: foliate pide dibujarlos al cargar cada capítulo
    view.addEventListener('draw-annotation', e => {
      const { draw, annotation } = (e as CustomEvent<{ draw: (fn: unknown, opts: unknown) => void; annotation: ViewAnnotation }>).detail
      const record = this.#annotations.get(annotation.value)
      if (record && this.#theme) draw(Overlayer.highlight, { color: this.#theme.highlights[record.color] })
    })
    view.addEventListener('create-overlay', () => this.#drawAll())
    view.addEventListener('show-annotation', e => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail
      const record = this.#annotations.get(value)
      if (!record) return
      this.#annotationTapAt = performance.now()
      this.#callbacks.onAnnotationTap(record.id, this.#toViewport(range))
    })
    this.apply(settings, theme, viewOptions)
    await view.init({ lastLocation: location ?? null })
  }

  apply(s: ComfortSettings, t: ThemeColors, v: ViewOptions) {
    const r = this.#view?.renderer
    if (!r) return
    this.#theme = t
    // los colores de subrayado ya traen su transparencia
    this.#view!.style.setProperty('--overlayer-highlight-opacity', '1')
    this.#view!.style.setProperty('--overlayer-highlight-blend-mode', t.dark ? 'normal' : 'multiply')
    // en modo libro cada columna es una página del libro abierto
    const attrs: Record<string, string> = v.bookMode
      ? {
          flow: 'paginated',
          gap: `${5 + s.margin * 1.5}%`,
          margin: '44px',
          'max-inline-size': `${Math.floor(v.pageWidth)}px`,
          'max-column-count': '2',
        }
      : {
          flow: s.flow,
          gap: `${4 + s.margin * 2}%`,
          margin: '36px',
          'max-inline-size': `${s.maxWidth}px`,
          'max-column-count': s.spread === 'single' ? '1' : '2',
        }
    for (const [name, value] of Object.entries(attrs)) if (r.getAttribute(name) !== value) r.setAttribute(name, value)
    this.#flipEnabled = s.animatePages && (v.bookMode || s.flow === 'paginated')
    const css = epubCss(s, t)
    if (css !== this.#lastCss) {
      this.#lastCss = css
      r.setStyles(css)
      this.#ghosts.invalidate()
    }
  }

  // el giro lo anima Mitzi (la hoja de papel): foliate cambia de página al instante
  next() {
    this.#view?.renderer.toggleAttribute('animated', !this.#flipEnabled)
    return this.#view?.next() ?? Promise.resolve()
  }

  prev() {
    this.#view?.renderer.toggleAttribute('animated', !this.#flipEnabled)
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

  position() {
    return this.#view?.lastLocation?.cfi ?? null
  }

  pageAspect() {
    return BOOK_PAGE_ASPECT
  }

  canFlip() {
    const r = this.#view?.renderer
    const doc = r?.getContents()[0]?.doc
    if (!r || !doc || !this.#flipEnabled || r.getAttribute('flow') === 'scrolled') return false
    // textos verticales o de derecha a izquierda: sin hoja por ahora
    const body = doc.defaultView?.getComputedStyle(doc.body)
    return !!body && body.direction !== 'rtl' && !body.writingMode.startsWith('vertical')
  }

  async paintPage(slot: HTMLElement, side: PageSide, pageRect: DOMRect) {
    const view = this.#view
    const r = view?.renderer
    const content = r?.getContents()[0]
    const frame = content?.doc.defaultView?.frameElement
    if (!view || !r || !content || !frame) return false
    const doc = content.doc
    const fr = frame.getBoundingClientRect()
    const size = r.size
    const x0 = r.start - size // ventana visible, en coordenadas del iframe
    const html = doc.defaultView!.getComputedStyle(doc.documentElement)
    const colWidth = parseFloat(html.columnWidth) || size
    const gap = parseFloat(html.columnGap) || 0
    const count = Math.max(1, Math.min(2, Math.round(size / (colWidth + gap))))
    const width = size / count
    const k = side === 'right' && count === 2 ? 1 : 0
    const g = await this.#ghosts.ensure(slot, view, doc, content.index, [...this.#annotations.values()], this.#theme)
    Object.assign(g.win.style, {
      left: `${fr.left + x0 + k * width - pageRect.left}px`,
      top: `${fr.top - pageRect.top}px`,
      width: `${width}px`,
      height: `${fr.height}px`,
    })
    g.frame.style.left = `${-(x0 + k * width)}px`
    slot.style.background = this.#theme?.bg ?? ''
    return true
  }

  prewarm(slots: HTMLElement[]) {
    if (this.#prewarming || !this.#flipEnabled) return
    this.#prewarming = true
    ;(async () => {
      for (const slot of slots) {
        await idle()
        const view = this.#view
        const content = view?.renderer.getContents()[0]
        if (!view || !content?.doc) break
        await this.#ghosts.ensure(slot, view, content.doc, content.index, [...this.#annotations.values()], this.#theme)
      }
    })()
      .catch(() => {})
      .finally(() => (this.#prewarming = false))
  }

  speech(lang?: string) {
    return this.#view ? createEpubSpeech(this.#view, lang) : Promise.resolve(null)
  }

  setAnnotations(list: AnnotationRecord[], theme: ThemeColors) {
    this.#theme = theme
    const next = new Map(list.filter(a => !a.deleted).map(a => [a.anchor, a]))
    for (const cfi of this.#annotations.keys()) if (!next.has(cfi)) this.#view?.deleteAnnotation({ value: cfi }).catch(() => {})
    this.#annotations = next
    this.#ghosts.invalidate()
    this.#drawAll()
  }

  clearSelection() {
    this.#hadSelection = false
    for (const { doc } of this.#view?.renderer.getContents() ?? []) doc.getSelection()?.removeAllRanges()
  }

  #drawAll() {
    // foliate ignora los que no son del capítulo cargado
    for (const cfi of this.#annotations.keys()) this.#view?.addAnnotation({ value: cfi }).catch(() => {})
  }

  #toViewport(range: Range) {
    const r = range.getBoundingClientRect()
    const frame = range.startContainer.ownerDocument?.defaultView?.frameElement
    const f = frame?.getBoundingClientRect()
    return new DOMRect(r.left + (f?.left ?? 0), r.top + (f?.top ?? 0), r.width, r.height)
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
  #attach(doc: Document, index: number) {
    doc.addEventListener('keydown', e => this.#callbacks.onKey(e))
    // selección de texto para subrayar (con ratón, teclado o las manijas de Android)
    const checkSelection = () => {
      const sel = doc.getSelection()
      const text = sel?.toString().trim()
      if (!sel || sel.isCollapsed || !sel.rangeCount || !text) {
        if (this.#hadSelection) {
          this.#hadSelection = false
          this.#callbacks.onSelect(null)
        }
        return
      }
      const range = sel.getRangeAt(0)
      this.#hadSelection = true
      this.#callbacks.onSelect({ text, rect: this.#toViewport(range), anchor: this.#view!.getCFI(index, range) })
    }
    let selTimer: ReturnType<typeof setTimeout> | undefined
    doc.addEventListener('selectionchange', () => {
      clearTimeout(selTimer)
      selTimer = setTimeout(checkSelection, 350)
    })
    doc.addEventListener('pointerup', () => setTimeout(checkSelection, 10))
    doc.addEventListener('wheel', e => this.#callbacks.onWheel(e), { passive: true })

    // arrastrar la hoja: los gestos se pasan a Mitzi en coordenadas de la ventana
    const forward = (type: PointerInfo['type'], e: PointerEvent) => {
      const rect = doc.defaultView?.frameElement?.getBoundingClientRect()
      if (!rect) return false
      return this.#callbacks.onPointer({ type, x: rect.left + e.clientX, y: rect.top + e.clientY, pointerType: e.pointerType })
    }
    doc.addEventListener('pointerdown', e => forward('down', e) && e.preventDefault(), true)
    doc.addEventListener('pointermove', e => forward('move', e) && e.preventDefault(), true)
    doc.addEventListener('pointerup', e => {
      if (forward('up', e)) this.#suppressClickAt = performance.now()
    }, true)
    doc.addEventListener('pointercancel', e => forward('cancel', e), true)
    // con la hoja activa, foliate no debe deslizar la página por su cuenta
    const blockTouch = (e: TouchEvent) => {
      if (this.#flipEnabled) e.stopImmediatePropagation()
    }
    doc.addEventListener('touchstart', blockTouch, { capture: true, passive: true })
    doc.addEventListener('touchmove', blockTouch, { capture: true, passive: true })
    doc.addEventListener('touchend', blockTouch, { capture: true, passive: true })
    // lo horizontal es para pasar página; lo vertical y el zoom quedan para el sistema
    doc.documentElement.style.touchAction = 'pan-y pinch-zoom'

    doc.addEventListener('click', e => {
      if (e.defaultPrevented) return // enlaces: los maneja foliate
      if (performance.now() - this.#suppressClickAt < 400) return // fue un arrastre
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) return
      const frame = doc.defaultView?.frameElement
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const x = rect.left + e.clientX
      const y = rect.top + e.clientY
      // si el toque fue sobre un subrayado, foliate lo avisa justo después: ese no pasa página
      setTimeout(() => {
        if (performance.now() - this.#annotationTapAt > 80) this.#callbacks.onTap(x, y)
      })
    })
  }
}
