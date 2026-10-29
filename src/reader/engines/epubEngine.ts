import { collapse, compare } from 'foliate-js/epubcfi.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import type { RelocateDetail, TocItem, View, ViewAnnotation } from 'foliate-js/view.js'
import type { AnnotationRecord } from '../../library/db'
import type { ThemeColors } from '../comfort/contrast'
import { epubCss } from '../comfort/epubCss'
import type { ComfortSettings } from '../comfort/settings'
import { GhostPages } from '../pageTurn/epubGhost'
import { createEpubSpeech } from '../tts/epubSpeech'
import { hyphenateDocument, prepareHyphenation, withoutSoftHyphens } from './hyphenate'
import { setupPlate } from './plates'
import type { EngineCallbacks, OpenOptions, PageSide, PointerInfo, ReaderEngine, SearchResult, TocEntry, ViewOptions } from './types'

const idle = () => new Promise<void>(resolve => (window.requestIdleCallback ?? setTimeout)(() => resolve()))

const flattenToc = (items: TocItem[] | null | undefined, depth = 0): TocEntry[] =>
  (items ?? []).flatMap(item => [
    ...(item.href ? [{ label: item.label?.trim() || 'Sin título', target: item.href, depth }] : []),
    ...flattenToc(item.subitems, depth + 1),
  ])

/** Forma de página de un libro impreso típico (ancho / alto). */
const BOOK_PAGE_ASPECT = 0.66

/** EPUB con foliate-js: paginación en columnas, CFI y estilos inyectados. */
/** Secciones con las que termina cada capítulo: las anteriores a donde empieza uno del índice. */
function chapterEnds(view: View) {
  const book = view.book
  const starts = new Set<number>()
  const walk = (items: TocItem[] | null | undefined) => {
    for (const item of items ?? []) {
      const index = item.href ? book.resolveHref?.(item.href)?.index : undefined
      if (index !== undefined && index > 0) starts.add(index)
      walk(item.subitems)
    }
  }
  walk(book.toc)
  const ends = new Set([...starts].map(i => i - 1))
  // y la última sección con texto del libro
  ends.add(book.sections.length - 1)
  return ends
}

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
  /** el texto de la página que se ve (para que la selección no se pase a otra) */
  #visibleRange: Range | null = null
  /** dónde empieza la página que se ve (desplazamiento del contenido de foliate) */
  #pageStart = 0
  /** pasando de página o saltando: ese desplazamiento sí es a propósito */
  #navigating = 0
  /** idioma del libro (para la separación silábica) */
  #lang: string | undefined
  /** secciones con las que termina un capítulo del índice */
  #chapterEnds = new Set<number>()
  /** pellizco en curso (distancia inicial entre los dedos) */
  #pinch: { start: number; scale: number } | null = null

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
    // patrones de separación silábica del idioma del libro, listos antes del primer capítulo
    const md = view.book.metadata
    this.#lang = Array.isArray(md?.language) ? md.language[0] : md?.language
    if (!view.isFixedLayout) await prepareHyphenation(this.#lang)
    this.#chapterEnds = chapterEnds(view)
    view.addEventListener('relocate', e => this.#onRelocate((e as CustomEvent<RelocateDetail>).detail))
    // al arrastrar una manija de selección contra el borde, el navegador corre el contenido
    // por su cuenta y la página queda a medias: mientras haya selección, se regresa a su lugar
    view.renderer.addEventListener('scroll', () => {
      const r = view.renderer
      if (this.#navigating || r.getAttribute('flow') === 'scrolled' || !this.#selecting()) return
      const off = this.#pageStart - r.start
      if (Math.abs(off) > 1) r.scrollBy(off, 0)
    })
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
    // los cómics y libros de páginas fijas no tienen texto que reacomodar
    if (css !== this.#lastCss && !this.#view?.isFixedLayout) {
      this.#lastCss = css
      r.setStyles(css)
      this.#ghosts.invalidate()
    }
  }

  // el giro lo anima Mitzi (la hoja de papel): foliate cambia de página al instante
  /** Marca la navegación para que la protección de la selección no la frene (ver el oyente de 'scroll'). */
  async #navigate(go: () => Promise<unknown> | undefined) {
    this.#navigating++
    try {
      await go()
    } finally {
      this.#navigating--
    }
  }

  next() {
    this.#view?.renderer.toggleAttribute('animated', !this.#flipEnabled)
    return this.#navigate(() => this.#view?.next())
  }

  prev() {
    this.#view?.renderer.toggleAttribute('animated', !this.#flipEnabled)
    return this.#navigate(() => this.#view?.prev())
  }

  goTo(target: string) {
    return this.#navigate(() => this.#view?.goTo(target))
  }

  goToFraction(fraction: number) {
    return this.#navigate(() => this.#view?.goToFraction(fraction))
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
    if (!r || !doc || !this.#flipEnabled || this.#view?.isFixedLayout || r.getAttribute('flow') === 'scrolled') return false
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

  bookmarkHere() {
    const loc = this.#view?.lastLocation
    if (!loc?.cfi) return null
    const excerpt = loc.range?.toString().replace(/\s+/g, ' ').trim().slice(0, 160) ?? ''
    return { location: collapse(loc.cfi), excerpt }
  }

  showing(location: string) {
    const cfi = this.#view?.lastLocation?.cfi
    if (!cfi || !location.startsWith('epubcfi(')) return false
    try {
      return compare(location, collapse(cfi)) >= 0 && compare(location, collapse(cfi, true)) <= 0
    } catch {
      return false
    }
  }

  async search(query: string, onResults: (r: SearchResult[]) => void, onProgress: (f: number) => void, signal: AbortSignal) {
    const view = this.#view
    if (!view) return
    // sin distinguir mayúsculas ni tildes; lo encontrado se resalta en el libro
    const iter = view.search({
      query,
      draw: Overlayer.highlight,
      drawOptions: { color: this.#theme?.highlights.amarillo ?? 'rgba(255, 220, 90, 0.5)' },
    })
    for await (const r of iter) {
      if (signal.aborted || r === 'done') break
      if ('progress' in r) onProgress(r.progress)
      else onResults(r.subitems.map(s => ({ location: s.cfi, excerpt: s.excerpt, chapter: r.label || undefined })))
    }
  }

  clearSearch() {
    this.#view?.clearSearch()
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

  #cursorHidden = false

  setCursorHidden(hidden: boolean) {
    this.#cursorHidden = hidden
    for (const { doc } of this.#view?.renderer.getContents() ?? []) doc.documentElement.style.cursor = hidden ? 'none' : ''
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
    this.#visibleRange = d.range ?? null
    this.#pageStart = this.#view?.renderer.start ?? 0
    this.#callbacks.onRelocate({
      fraction: d.fraction ?? 0,
      location: d.cfi,
      chapter: d.tocItem?.label?.trim(),
      pageLabel: d.pageItem?.label,
      // en los cómics el «tiempo» de foliate saldría del peso de las imágenes: no sirve
      minutesLeft: d.time && !this.#view?.isFixedLayout ? { section: d.time.section, total: d.time.total } : undefined,
    })
  }

  /** ¿Hay texto seleccionado en el capítulo que se ve? */
  #selecting() {
    return (this.#view?.renderer.getContents() ?? []).some(({ doc }) => {
      const sel = doc.getSelection()
      return !!sel && sel.rangeCount > 0 && !sel.isCollapsed
    })
  }

  /**
   * La selección no puede pasar de la página que se ve. Si una manija llega al borde,
   * foliate pasa de página por su cuenta para seguir seleccionando: esa vuelta no pasa
   * por Mitzi (ni la hoja que gira ni el avance) y el libro quedaba desacomodado, con
   * texto de otra página seleccionado. Aquí la selección se corta en el borde.
   */
  #keepSelectionInPage(doc: Document) {
    const page = this.#visibleRange
    const sel = doc.getSelection()
    if (!page || page.startContainer.ownerDocument !== doc || !sel || !sel.rangeCount || sel.isCollapsed) return
    if (this.#view?.renderer.getAttribute('flow') === 'scrolled') return
    const range = sel.getRangeAt(0)
    const pastEnd = range.compareBoundaryPoints(Range.END_TO_END, page) > 0
    const beforeStart = range.compareBoundaryPoints(Range.START_TO_START, page) < 0
    if (!pastEnd && !beforeStart) return
    const start = beforeStart ? page : range
    const end = pastEnd ? page : range
    // se conserva qué extremo es el que se arrastra
    const anchorFirst = sel.anchorNode === range.startContainer && sel.anchorOffset === range.startOffset
    if (anchorFirst) sel.setBaseAndExtent(start.startContainer, start.startOffset, end.endContainer, end.endOffset)
    else sel.setBaseAndExtent(end.endContainer, end.endOffset, start.startContainer, start.startOffset)
  }

  /** Los toques y teclas ocurren dentro del iframe del libro; se pasan a la interfaz. */
  #attach(doc: Document, index: number) {
    // páginas que son solo una ilustración: a página completa (o doble, si es horizontal)
    if (!this.#view?.isFixedLayout) hyphenateDocument(doc, this.#lang)
    // adorno al final de cada capítulo: la sección justo antes de donde empieza el siguiente
    // del índice (los libros suelen partir un capítulo en varios archivos)
    doc.documentElement.classList.toggle('mitzi-chapter', this.#chapterEnds.has(index) && (doc.body?.textContent?.trim().length ?? 0) > 200)
    setupPlate(doc)
    if (this.#cursorHidden) doc.documentElement.style.cursor = 'none'
    doc.addEventListener('keydown', e => this.#callbacks.onKey(e))
    // selección de texto para subrayar (con ratón, teclado o las manijas de Android)
    const checkSelection = () => {
      const sel = doc.getSelection()
      const text = withoutSoftHyphens(sel?.toString() ?? '').trim()
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
      this.#keepSelectionInPage(doc)
      clearTimeout(selTimer)
      selTimer = setTimeout(checkSelection, 350)
    })
    doc.addEventListener('pointerup', () => setTimeout(checkSelection, 10))
    doc.addEventListener('wheel', e => this.#callbacks.onWheel(e), { passive: true })

    // arrastrar la hoja: los gestos se pasan a Mitzi en coordenadas de la ventana
    const forward = (type: PointerInfo['type'], e: PointerEvent) => {
      const rect = doc.defaultView?.frameElement?.getBoundingClientRect()
      // con dos dedos es un pellizco (tamaño de letra), no pasar página
      if (!rect || this.#pinch) return false
      return this.#callbacks.onPointer({ type, x: rect.left + e.clientX, y: rect.top + e.clientY, pointerType: e.pointerType })
    }
    doc.addEventListener('pointerdown', e => forward('down', e) && e.preventDefault(), true)
    doc.addEventListener('pointermove', e => forward('move', e) && e.preventDefault(), true)
    doc.addEventListener('pointerup', e => {
      if (forward('up', e)) this.#suppressClickAt = performance.now()
    }, true)
    doc.addEventListener('pointercancel', e => forward('cancel', e), true)
    // pellizcar con dos dedos cambia el tamaño de la letra (se aplica al soltar)
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    doc.addEventListener(
      'touchstart',
      e => {
        if (e.touches.length !== 2 || this.#view?.isFixedLayout) return
        this.#pinch = { start: spread(e.touches), scale: 1 }
        // si el primer dedo ya había empezado a llevar la hoja, se suelta
        this.#callbacks.onPointer({ type: 'cancel', x: 0, y: 0, pointerType: 'touch' })
      },
      { capture: true, passive: true },
    )
    doc.addEventListener(
      'touchmove',
      e => {
        if (!this.#pinch || e.touches.length !== 2) return
        this.#pinch.scale = spread(e.touches) / this.#pinch.start
        this.#callbacks.onPinch?.(this.#pinch.scale, false)
      },
      { capture: true, passive: true },
    )
    const endPinch = (e: TouchEvent) => {
      if (!this.#pinch || e.touches.length >= 2) return
      this.#callbacks.onPinch?.(this.#pinch.scale, true)
      this.#pinch = null
    }
    doc.addEventListener('touchend', endPinch, { capture: true, passive: true })
    doc.addEventListener('touchcancel', endPinch, { capture: true, passive: true })
    // con la hoja activa, foliate no debe deslizar la página por su cuenta (va después del
    // pellizco: stopImmediatePropagation cortaría las escuchas que se registren detrás)
    const blockTouch = (e: TouchEvent) => {
      if (this.#flipEnabled) e.stopImmediatePropagation()
    }
    doc.addEventListener('touchstart', blockTouch, { capture: true, passive: true })
    doc.addEventListener('touchmove', blockTouch, { capture: true, passive: true })
    doc.addEventListener('touchend', blockTouch, { capture: true, passive: true })
    // lo horizontal es para pasar página, lo vertical para el sistema; el pellizco es de Mitzi
    doc.documentElement.style.touchAction = 'pan-y'

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
