import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { AnnotationRecord } from '../../library/db'
import type { ThemeColors } from '../comfort/contrast'
import type { ComfortSettings } from '../comfort/settings'
import { loadPdfjs, pdfAssetOptions } from './pdfjs'
import type { EngineCallbacks, OpenOptions, PageSide, PointerInfo, ReaderEngine, SpeechSource, TocEntry, ViewOptions } from './types'

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

/**
 * PDF con pdf.js. Dibuja una página (o dos en pantallas anchas, con la portada sola)
 * y solo vuelve a dibujar al cambiar de página o de tamaño: en reposo no gasta nada.
 */
const PDF_MINUTES_PER_PAGE = 1.5

export class PdfEngine implements ReaderEngine {
  readonly format = 'pdf' as const
  #cb: EngineCallbacks
  #doc: PDFDocumentProxy | null = null
  #task: PDFDocumentLoadingTask | null = null
  #stage!: HTMLDivElement
  #sheet!: HTMLDivElement
  #index = 0
  #settings!: ComfortSettings
  #theme!: ThemeColors
  #tasks: RenderTask[] = []
  #token = 0
  #pages = new Map<number, Promise<PDFPageProxy>>()
  #toc: (TocEntry & { page: number })[] = []
  #observer: ResizeObserver | null = null
  #resizeTimer: ReturnType<typeof setTimeout> | undefined
  #swipe: { x: number; y: number; t: number } | null = null
  #swipedAt = 0
  /** El gesto en curso lo tomó Mitzi (arrastrar la hoja). */
  #gestureTaken = false
  #view: ViewOptions = { bookMode: false, pageWidth: 0 }
  #aspect = 0.7
  #pdfjs: Awaited<ReturnType<typeof loadPdfjs>> | null = null
  /** subrayados por página */
  #annotations: AnnotationRecord[] = []
  #hadSelection = false
  #selTimer: ReturnType<typeof setTimeout> | undefined
  #onSelectionChange = () => {
    clearTimeout(this.#selTimer)
    this.#selTimer = setTimeout(() => this.#checkSelection(), 350)
  }

  constructor(callbacks: EngineCallbacks) {
    this.#cb = callbacks
  }

  get #count() {
    return this.#doc?.numPages ?? 0
  }

  async open(container: HTMLElement, file: File, { location, settings, theme, view }: OpenOptions) {
    this.#stage = document.createElement('div')
    this.#stage.className = 'pdf-stage'
    this.#sheet = document.createElement('div')
    this.#sheet.className = 'pdf-sheet'
    this.#stage.append(this.#sheet)
    container.append(this.#stage)
    this.#bindInput()

    const pdfjs = await loadPdfjs()
    this.#pdfjs = pdfjs
    this.#task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...pdfAssetOptions() })
    this.#doc = await this.#task.promise
    const page = location ? parseInt(location, 10) : 1
    this.#index = Math.min(Math.max(0, (Number.isFinite(page) ? page : 1) - 1), this.#count - 1)
    this.#settings = settings
    this.#theme = theme
    this.#view = view
    const first = (await this.#page(1)).getViewport({ scale: 1 })
    this.#aspect = first.width / first.height
    this.#applyTheme()
    this.#toc = await this.#buildToc().catch(() => [])

    this.#observer = new ResizeObserver(() => {
      clearTimeout(this.#resizeTimer)
      this.#resizeTimer = setTimeout(() => this.#render(), 120)
    })
    this.#observer.observe(this.#stage)
    await this.#render()
  }

  apply(settings: ComfortSettings, theme: ThemeColors, view: ViewOptions) {
    const prev = this.#settings
    const prevBook = this.#view.bookMode
    this.#settings = settings
    this.#theme = theme
    this.#view = view
    if (!this.#stage) return
    this.#applyTheme()
    if (prev && (prev.spread !== settings.spread || prev.pdfFit !== settings.pdfFit || prevBook !== view.bookMode)) this.#render()
  }

  async next() {
    const visible = this.#visible()
    const last = visible[visible.length - 1]
    if (last >= this.#count - 1) return
    this.#index = last + 1
    await this.#render()
  }

  async prev() {
    const start = this.#start(this.#index)
    if (start <= 0) return
    this.#index = this.#spread ? this.#start(start - 1) : start - 1
    await this.#render()
  }

  async goTo(target: string) {
    const page = parseInt(target.replace(/^page:/, ''), 10)
    if (!Number.isFinite(page)) return
    this.#index = Math.min(Math.max(0, page - 1), this.#count - 1)
    await this.#render()
  }

  async goToFraction(fraction: number) {
    this.#index = Math.round(fraction * (this.#count - 1))
    await this.#render()
  }

  toc(): TocEntry[] {
    return this.#toc
  }

  position() {
    return this.#doc ? String(this.#start(this.#index)) : null
  }

  pageAspect() {
    return this.#aspect
  }

  canFlip() {
    if (!this.#doc || this.#settings.pdfFit === 'width') return false
    // dos páginas fuera del modo libro (ventana horizontal pequeña): sin hoja
    return this.#view.bookMode || this.#visible().length === 1
  }

  /** Copia exacta (el mismo lienzo ya dibujado) de una página visible. */
  async paintPage(slot: HTMLElement, side: PageSide, pageRect: DOMRect) {
    slot.style.background = this.#theme.bg
    const wraps = [...this.#sheet.querySelectorAll<HTMLElement>('.pdf-page')]
    const wrap = side === 'single' ? wraps[0] : wraps.find(w => w.dataset.side === side)
    const canvas = wrap?.querySelector('canvas')
    if (!wrap || !canvas) {
      slot.replaceChildren()
      return false
    }
    const r = canvas.getBoundingClientRect()
    const holder = document.createElement('div')
    holder.className = 'pdf-snap-holder'
    holder.dataset.dark = String(this.#theme.dark)
    Object.assign(holder.style, { left: `${r.left - pageRect.left}px`, top: `${r.top - pageRect.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    copy.getContext('2d')?.drawImage(canvas, 0, 0)
    holder.append(copy)
    const marks = wrap.querySelector('.pdf-marks')
    if (marks) holder.append(marks.cloneNode(true))
    slot.replaceChildren(holder)
    return true
  }

  prewarm() {
    // los lienzos ya están dibujados: no hay nada que preparar
  }


  /** Lee las páginas visibles oración por oración y pasa de página al terminar. */
  async speech(lang?: string): Promise<SpeechSource | null> {
    if (!this.#doc) return null
    let segmenter: Intl.Segmenter
    try {
      segmenter = new Intl.Segmenter(lang || undefined, { granularity: 'sentence' })
    } catch {
      // idioma con un código raro en los metadatos del PDF
      segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    }
    let queue: string[] = []
    const load = async () => {
      const texts = await Promise.all(
        this.#visible().map(async i => {
          const content = await (await this.#page(i + 1)).getTextContent()
          return content.items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join('')
        }),
      )
      // une palabras cortadas con guion al final de línea
      const full = texts.join('\n').replace(/-\n(\p{L})/gu, '$1').replace(/\s*\n\s*/g, ' ')
      queue = [...segmenter.segment(full)].map(s => s.segment.trim()).filter(Boolean)
    }
    await load()
    const next = async () => {
      while (!queue.length) {
        const before = this.position()
        await this.next()
        if (this.position() === before) return null
        await load()
      }
      return { text: queue.shift()!, lang }
    }
    return { next, prev: next, stop() {} }
  }

  setAnnotations(list: AnnotationRecord[], theme: ThemeColors) {
    this.#theme = theme
    this.#annotations = list.filter(a => !a.deleted && a.rects?.length)
    for (const wrap of this.#sheet?.querySelectorAll<HTMLElement>('.pdf-page') ?? []) this.#drawMarks(wrap)
  }

  clearSelection() {
    this.#hadSelection = false
    const sel = window.getSelection()
    if (sel && this.#stage.contains(sel.anchorNode)) sel.removeAllRanges()
  }

  destroy() {
    document.removeEventListener('selectionchange', this.#onSelectionChange)
    this.#token++
    for (const t of this.#tasks) t.cancel()
    this.#observer?.disconnect()
    clearTimeout(this.#resizeTimer)
    this.#task?.destroy()
    this.#task = null
    this.#doc = null
    this.#stage?.remove()
  }

  // ---------- interno ----------

  get #spread() {
    const s = this.#settings
    if (this.#view.bookMode) return this.#count > 1
    return (
      s.spread !== 'single' &&
      s.pdfFit === 'page' &&
      this.#count > 1 &&
      this.#stage.clientWidth / Math.max(1, this.#stage.clientHeight) > 1.15
    )
  }

  /** Primera página del par visible: la portada va sola, luego 2-3, 4-5… */
  #start(i: number) {
    if (!this.#spread || i === 0) return i
    return i % 2 === 1 ? i : i - 1
  }

  #visible() {
    const s = this.#start(this.#index)
    if (!this.#spread || s === 0 || s + 1 >= this.#count) return [s]
    return [s, s + 1]
  }

  #page(n: number) {
    let p = this.#pages.get(n)
    if (!p) {
      p = this.#doc!.getPage(n)
      this.#pages.set(n, p)
    }
    return p
  }

  #applyTheme() {
    this.#stage.style.background = this.#theme.bg
    this.#stage.dataset.dark = String(this.#theme.dark)
    this.#stage.dataset.fit = this.#settings.pdfFit
    this.#stage.dataset.book = String(this.#view.bookMode)
  }

  async #render() {
    if (!this.#doc) return
    const token = ++this.#token
    for (const t of this.#tasks) t.cancel()
    this.#tasks = []

    const visible = this.#visible()
    const pages = await Promise.all(visible.map(i => this.#page(i + 1)))
    if (token !== this.#token) return

    const book = this.#view.bookMode
    const fitWidth = this.#settings.pdfFit === 'width' && !book
    const narrow = this.#stage.clientWidth < 600
    // en modo libro las páginas llenan su mitad del libro abierto
    const padX = fitWidth || book ? 0 : narrow ? 6 : 28
    const padY = fitWidth || book ? 0 : narrow ? 10 : 24
    const availW = Math.max(100, this.#stage.clientWidth - padX * 2)
    const availH = Math.max(100, this.#stage.clientHeight - padY * 2)
    const base = pages.map(p => p.getViewport({ scale: 1 }))
    const totalW = book ? base[0].width * 2 : base.reduce((sum, v) => sum + v.width, 0)
    const maxH = Math.max(...base.map(v => v.height))
    const scale = fitWidth ? availW / base[0].width : Math.min(availW / totalW, availH / maxH)
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)

    const canvases = base.map(v => {
      const canvas = document.createElement('canvas')
      canvas.style.width = `${Math.floor(v.width * scale)}px`
      canvas.style.height = `${Math.floor(v.height * scale)}px`
      canvas.width = Math.floor(v.width * scale * dpr)
      canvas.height = Math.floor(v.height * scale * dpr)
      return canvas
    })

    try {
      // se dibuja fuera de pantalla y luego se cambia de golpe: sin parpadeo
      await Promise.all(
        pages.map((page, k) => {
          const task = page.render({ canvas: canvases[k], viewport: page.getViewport({ scale: scale * dpr }) })
          this.#tasks.push(task)
          return task.promise
        }),
      )
    } catch (e) {
      if ((e as Error)?.name === 'RenderingCancelledException') return
      throw e
    }
    if (token !== this.#token) return

    const wraps = canvases.map((canvas, k) => {
      const wrap = document.createElement('div')
      wrap.className = 'pdf-page'
      wrap.dataset.page = String(visible[k] + 1)
      // como en un libro impreso: la portada (página 1) a la derecha, las pares a la izquierda
      if (book) wrap.dataset.side = visible[k] % 2 === 1 ? 'left' : 'right'
      else if (visible.length === 2) wrap.dataset.side = k === 0 ? 'left' : 'right'
      wrap.append(canvas)
      return wrap
    })
    this.#sheet.dataset.book = String(book)
    this.#sheet.replaceChildren(...wraps)
    for (const wrap of wraps) this.#drawMarks(wrap)
    // capa de texto invisible encima del dibujo: permite seleccionar y subrayar
    pages.forEach((page, k) => this.#addTextLayer(page, wraps[k], scale, token))
    if (fitWidth) this.#stage.scrollTop = 0
    this.#emit(visible)
  }

  #emit(visible: number[]) {
    const n = this.#count
    const first = visible[0] + 1
    const last = visible[visible.length - 1] + 1
    const chapter = [...this.#toc].reverse().find(t => t.page <= first)?.label
    const nextChapter = this.#toc.find(t => t.page > last)?.page
    this.#cb.onRelocate({
      fraction: n <= 1 ? 1 : (last - 1) / (n - 1),
      location: String(first),
      chapter,
      // ritmo estándar de PDF: un minuto y medio por página
      minutesLeft: {
        total: (n - last) * PDF_MINUTES_PER_PAGE,
        section: nextChapter ? (nextChapter - 1 - last) * PDF_MINUTES_PER_PAGE : undefined,
      },
      pageLabel: visible.length > 1 ? `Páginas ${first}–${last} de ${n}` : `Página ${first} de ${n}`,
    })
  }

  async #buildToc() {
    const doc = this.#doc!
    const outline = (await doc.getOutline()) ?? []
    const out: (TocEntry & { page: number })[] = []
    const walk = async (items: OutlineItem[], depth: number) => {
      for (const item of items) {
        try {
          const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
          const ref = Array.isArray(dest) ? dest[0] : null
          const index = typeof ref === 'number' ? ref : ref ? await doc.getPageIndex(ref) : null
          if (index !== null) out.push({ label: item.title.trim() || 'Sin título', target: `page:${index + 1}`, depth, page: index + 1 })
        } catch {
          // destino roto: se omite
        }
        if (item.items?.length) await walk(item.items, depth + 1)
      }
    }
    await walk(outline, 0)
    return out
  }

  async #addTextLayer(page: PDFPageProxy, wrap: HTMLElement, scale: number, token: number) {
    if (!this.#pdfjs) return
    const layer = document.createElement('div')
    layer.className = 'textLayer'
    for (const v of ['--scale-factor', '--total-scale-factor']) layer.style.setProperty(v, String(scale))
    layer.style.setProperty('--user-unit', '1')
    const textLayer = new this.#pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container: layer,
      viewport: page.getViewport({ scale }),
    })
    try {
      await textLayer.render()
    } catch {
      return
    }
    if (token === this.#token) wrap.append(layer)
  }

  /** Subrayados de una página, en proporción a su tamaño (sirven a cualquier zoom). */
  #drawMarks(wrap: HTMLElement) {
    wrap.querySelector('.pdf-marks')?.remove()
    const anchor = `page:${wrap.dataset.page}`
    const list = this.#annotations.filter(a => a.anchor === anchor)
    if (!list.length || !this.#theme) return
    const marks = document.createElement('div')
    marks.className = 'pdf-marks'
    for (const a of list)
      for (const [x, y, w, h] of a.rects ?? []) {
        const m = document.createElement('div')
        Object.assign(m.style, {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${w * 100}%`,
          height: `${h * 100}%`,
          background: this.#theme.highlights[a.color],
        })
        marks.append(m)
      }
    wrap.append(marks)
  }

  #checkSelection() {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null
    const node = range?.startContainer
    const wrap = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.pdf-page')
    if (!sel || sel.isCollapsed || !text || !range || !wrap || !this.#stage.contains(wrap)) {
      if (this.#hadSelection) {
        this.#hadSelection = false
        this.#cb.onSelect(null)
      }
      return
    }
    const box = wrap.getBoundingClientRect()
    const rects = [...range.getClientRects()]
      .filter(r => r.width > 1 && r.height > 1 && r.top < box.bottom && r.bottom > box.top)
      .map(r => [(r.left - box.left) / box.width, (r.top - box.top) / box.height, r.width / box.width, r.height / box.height] as [number, number, number, number])
    if (!rects.length) return
    this.#hadSelection = true
    this.#cb.onSelect({ text, rect: range.getBoundingClientRect(), anchor: `page:${wrap.dataset.page}`, rects })
  }

  /** ¿El punto (en la ventana) cae sobre un subrayado? */
  #hitAnnotation(x: number, y: number, target: EventTarget | null) {
    const wrap = (target as Element | null)?.closest?.<HTMLElement>('.pdf-page')
    if (!wrap) return null
    const box = wrap.getBoundingClientRect()
    const px = (x - box.left) / box.width
    const py = (y - box.top) / box.height
    const anchor = `page:${wrap.dataset.page}`
    for (const a of this.#annotations) {
      if (a.anchor !== anchor) continue
      const hit = a.rects?.find(([rx, ry, rw, rh]) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh)
      if (hit) return { id: a.id, rect: new DOMRect(box.left + hit[0] * box.width, box.top + hit[1] * box.height, hit[2] * box.width, hit[3] * box.height) }
    }
    return null
  }

  #bindInput() {
    document.addEventListener('selectionchange', this.#onSelectionChange)
    this.#stage.addEventListener('pointerup', () => setTimeout(() => this.#checkSelection(), 10))
    // arrastrar la hoja: los gestos se pasan a Mitzi
    const forward = (type: PointerInfo['type'], e: PointerEvent) =>
      this.#cb.onPointer({ type, x: e.clientX, y: e.clientY, pointerType: e.pointerType })
    this.#stage.addEventListener('pointerdown', e => {
      this.#gestureTaken = false
      if (forward('down', e)) e.preventDefault()
    })
    this.#stage.addEventListener('pointermove', e => {
      if (forward('move', e)) {
        this.#gestureTaken = true
        e.preventDefault()
      }
    })
    this.#stage.addEventListener('pointerup', e => {
      if (forward('up', e)) this.#swipedAt = performance.now()
    })
    this.#stage.addEventListener('pointercancel', e => forward('cancel', e))
    this.#stage.addEventListener('click', e => {
      // un deslizamiento o arrastre también dispara "click"; ese no cuenta como toque
      if (performance.now() - this.#swipedAt < 400) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return
      const hit = this.#hitAnnotation(e.clientX, e.clientY, e.target)
      if (hit) this.#cb.onAnnotationTap(hit.id, hit.rect)
      else this.#cb.onTap(e.clientX, e.clientY)
    })
    this.#stage.addEventListener('keydown', e => this.#cb.onKey(e))
    this.#stage.addEventListener(
      'wheel',
      e => {
        if (this.#settings?.pdfFit !== 'width') this.#cb.onWheel(e)
      },
      { passive: true },
    )
    // deslizar a los lados en pantallas táctiles
    this.#stage.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') this.#swipe = { x: e.clientX, y: e.clientY, t: performance.now() }
    })
    this.#stage.addEventListener('pointerup', e => {
      const s = this.#swipe
      this.#swipe = null
      if (!s || this.#gestureTaken) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - s.t < 600) {
        this.#swipedAt = performance.now()
        this.#cb.onSwipe(dx < 0 ? 1 : -1)
      }
    })
  }
}
