import type { PageSide, ReaderEngine } from '../engines/types'
import { apply, compose, computeFold, IDENTITY, toCssMatrix, toCssPolygon, translate, type Mat, type Poly, type Pt } from './geometry'

export interface FlipContext {
  /** Libro abierto (dos páginas) o una sola página. */
  book: boolean
  /** Rectángulo de las páginas en la ventana. */
  stage: DOMRect
  dark: boolean
}

interface Setup {
  engine: ReaderEngine
  dir: 1 | -1
  /** Una página, hacia atrás: la hoja anterior vuelve desde la izquierda. */
  reverse: boolean
  book: boolean
  dark: boolean
  w: number
  h: number
  corner: Pt
  end: Pt
  toScreen: Mat
  toLocal: Mat
  /** p (hoja que gira) → posición del contenido de su reverso */
  backFromLocal: Mat
  restB: DOMRect
  restC: DOMRect
}

type Mode = 'idle' | 'preparing' | 'auto' | 'drag' | 'settle'

const MIRROR: Mat = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function el(className: string, parent: HTMLElement) {
  const e = document.createElement('div')
  e.className = className
  parent.append(e)
  return e
}

function place(e: HTMLElement, r: DOMRect) {
  Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
}

/**
 * La hoja que gira al pasar página. Se dibuja con copias exactas de las páginas
 * (mismo texto, mismos cortes de línea): la parte plana, la parte doblada con su
 * reverso y las sombras. Por debajo el libro ya cambió de página, así que al
 * terminar no hay ningún salto. Solo cambian recortes y transformaciones: la GPU
 * lo compone sin volver a maquetar el texto, a 60 o 120 Hz.
 */
export class PageFlip {
  readonly slots: HTMLElement[]
  #under: HTMLElement
  #over: HTMLElement
  #A: HTMLElement
  #B: HTMLElement
  #C: HTMLElement
  #cast: HTMLElement
  #castBar: HTMLElement
  #shade: HTMLElement
  #shadeBar: HTMLElement

  #mode: Mode = 'idle'
  #setup: Setup | null = null
  #t: Pt = { x: 0, y: 0 }
  #v: Pt = { x: 0, y: 0 }
  #target: Pt = { x: 0, y: 0 }
  #grab: Pt = { x: 0, y: 0 }
  #auto = { start: 0, duration: 600, from: 0, to: 1 }
  #complete = true
  #raf = 0
  #last = 0
  #samples: { x: number; t: number }[] = []
  #pendingRelease = false
  #resolve: (() => void) | null = null
  #queue: Promise<void> = Promise.resolve()
  onFinish: (() => void) | null = null

  constructor(under: HTMLElement, over: HTMLElement) {
    this.#under = under
    this.#over = over
    under.replaceChildren()
    over.replaceChildren()
    this.#A = el('flip-slot', under)
    this.#B = el('flip-slot', under)
    this.#cast = el('flip-shadow', under)
    this.#castBar = el('flip-bar', this.#cast)
    this.#C = el('flip-slot', over)
    this.#shade = el('flip-shadow', over)
    this.#shadeBar = el('flip-bar', this.#shade)
    this.slots = [this.#A, this.#B, this.#C]
    this.#hide()
  }

  get busy() {
    return this.#mode !== 'idle'
  }

  /** Pasa de página con la hoja que se dobla y cae del otro lado. */
  turn(engine: ReaderEngine, dir: 1 | -1, ctx: FlipContext): Promise<void> {
    if (this.#mode === 'auto' || this.#mode === 'settle') this.#jumpToEnd()
    this.#queue = this.#queue.then(async () => {
      const ready = await this.#prepare(engine, dir, ctx, null)
      if (ready !== true) return
      const s = this.#setup!
      this.#complete = true
      // en desarrollo se puede ralentizar para revisarla: window.__mitziFlipSlow = 10
      const slow = import.meta.env.DEV ? Number((window as { __mitziFlipSlow?: number }).__mitziFlipSlow ?? 1) : 1
      this.#auto = { start: performance.now(), duration: (ctx.book ? 720 : 560) * slow, from: s.reverse ? 1 : 0, to: s.reverse ? 0 : 1 }
      await this.#run('auto')
    }).catch(e => console.warn('No se pudo animar la página', e))
    return this.#queue
  }

  /** Empieza a arrastrar la hoja con el dedo o el ratón desde (x, y). */
  async beginDrag(engine: ReaderEngine, dir: 1 | -1, ctx: FlipContext, x: number, y: number): Promise<boolean> {
    if (this.#mode !== 'idle') return false
    this.#pendingRelease = false
    this.#samples = [{ x, t: performance.now() }]
    const ready = await this.#prepare(engine, dir, ctx, { x, y })
    if (ready !== true) return false
    const s = this.#setup!
    const p = apply(s.toLocal, { x, y })
    // la esquina se mueve con el dedo, manteniendo la distancia del primer toque
    const from = s.reverse ? s.end : s.corner
    this.#grab = { x: from.x - p.x, y: from.y - p.y }
    this.#target = { ...from }
    const run = this.#run('drag')
    if (this.#pendingRelease) this.endDrag()
    await run
    return true
  }

  dragTo(x: number, y: number) {
    this.#samples.push({ x, t: performance.now() })
    while (this.#samples.length > 2 && performance.now() - this.#samples[0].t > 120) this.#samples.shift()
    const s = this.#setup
    if (!s || this.#mode !== 'drag') return
    const p = apply(s.toLocal, { x, y })
    this.#target = { x: p.x + this.#grab.x, y: p.y + this.#grab.y }
  }

  /** Al soltar: si la hoja pasó la mitad (o se lanzó con fuerza) termina de girar; si no, vuelve. */
  endDrag() {
    if (this.#mode === 'preparing') {
      this.#pendingRelease = true
      return
    }
    const s = this.#setup
    if (!s || this.#mode !== 'drag') return
    const a = this.#samples[0]
    const b = this.#samples[this.#samples.length - 1]
    const vScreen = (b.x - a.x) / Math.max(1, b.t - a.t) // px/ms
    const v = s.toScreen.a < 0 ? -vScreen : vScreen // velocidad en el marco local
    const progress = (s.corner.x - this.#t.x) / (2 * s.w)
    this.#complete = s.reverse ? progress < 0.5 || v > 0.35 : progress > 0.35 || v < -0.35
    const forward = s.reverse ? !this.#complete : this.#complete
    this.#target = forward ? { ...s.end } : { ...s.corner }
    this.#mode = 'settle'
  }

  /** Termina al instante lo que esté en curso (al pedir otra página muy rápido). */
  #jumpToEnd() {
    const s = this.#setup
    if (!s) return
    if (this.#mode === 'auto') this.#auto.start = -Infinity
    else if (this.#mode === 'settle') this.#t = { ...this.#target }
  }

  // ---------- preparación ----------

  async #prepare(engine: ReaderEngine, dir: 1 | -1, ctx: FlipContext, grabAt: Pt | null): Promise<boolean | 'nomove'> {
    const move = () => (dir > 0 ? engine.next() : engine.prev())
    if (!engine.canFlip()) {
      await move()
      return 'nomove'
    }
    this.#mode = 'preparing'
    const { book, stage } = ctx
    const reverse = !book && dir < 0
    const mirrored = book && dir < 0
    const w = book ? stage.width / 2 : stage.width
    const h = stage.height
    const spineX = book ? stage.left + w : stage.left
    const toScreen: Mat = mirrored ? { ...MIRROR, e: spineX, f: stage.top } : translate(spineX, stage.top)
    const toLocal: Mat = mirrored ? { ...MIRROR, e: spineX, f: -stage.top } : translate(-spineX, -stage.top)
    const leftRect = new DOMRect(stage.left, stage.top, w, h)
    const rightRect = book ? new DOMRect(spineX, stage.top, w, h) : leftRect
    const turningRect = book && dir < 0 ? leftRect : rightRect
    const otherRect = book && dir < 0 ? rightRect : leftRect
    const turningSide: PageSide = !book ? 'single' : dir > 0 ? 'right' : 'left'
    const otherSide: PageSide = dir > 0 ? 'left' : 'right'

    // esquina que se toma: la de abajo, o la de arriba si el dedo empezó arriba
    let cornerY = h
    if (grabAt) cornerY = apply(toLocal, grabAt).y < h / 2 ? 0 : h
    const corner = { x: w, y: cornerY }
    const end = { x: -w, y: cornerY }

    const A = this.#A, B = this.#B, C = this.#C
    for (const s of this.slots) s.removeAttribute('data-faint')
    try {
      // lo que se ve ahora, copiado antes de cambiar de página
      if (!reverse) {
        place(B, turningRect)
        await engine.paintPage(B, turningSide, turningRect)
        if (book) {
          place(A, otherRect)
          A.hidden = !(await engine.paintPage(A, otherSide, otherRect))
        } else {
          A.hidden = true
          // una sola página: el reverso deja ver el texto al trasluz
          place(C, turningRect)
          await engine.paintPage(C, 'single', turningRect)
          C.dataset.faint = 'true'
        }
      } else {
        place(A, stage)
        A.hidden = !(await engine.paintPage(A, 'single', stage))
      }
      for (const s of [B, C]) Object.assign(s.style, { clipPath: '', transform: '' })
      B.hidden = reverse
      C.style.visibility = 'hidden'
      this.#under.style.visibility = 'visible'

      const from = engine.position()
      await move()
      if (engine.position() === from) {
        this.#hide()
        return 'nomove'
      }

      // lo que llega
      if (book) {
        place(C, otherRect)
        const ok = await engine.paintPage(C, otherSide, otherRect)
        if (!ok) C.replaceChildren()
      } else if (reverse) {
        place(B, stage)
        B.hidden = false
        await engine.paintPage(B, 'single', stage)
        place(C, stage)
        await engine.paintPage(C, 'single', stage)
        C.dataset.faint = 'true'
      }
    } catch (e) {
      this.#hide()
      throw e
    }

    this.#setup = {
      engine,
      dir,
      reverse,
      book,
      dark: ctx.dark,
      w,
      h,
      corner,
      end,
      toScreen,
      toLocal,
      backFromLocal: book ? MIRROR : IDENTITY,
      restB: reverse ? stage : turningRect,
      restC: book ? otherRect : turningRect,
    }
    this.#t = reverse ? { ...end } : { ...corner }
    this.#v = { x: 0, y: 0 }
    this.#render()
    this.#over.style.visibility = 'visible'
    return true
  }

  // ---------- animación ----------

  #run(mode: Mode) {
    this.#mode = mode
    this.#last = performance.now()
    return new Promise<void>(resolve => {
      this.#resolve = resolve
      cancelAnimationFrame(this.#raf)
      this.#raf = requestAnimationFrame(this.#frame)
    })
  }

  /** Punto de la esquina en un giro automático: avanza y se levanta un poco a mitad de camino. */
  #pathPoint(s: number): Pt {
    const { w, h, corner } = this.#setup!
    const lift = h * 0.06 * Math.sin(Math.PI * s)
    return { x: w - 2 * w * s, y: corner.y === 0 ? lift : h - lift }
  }

  #frame = (now: number) => {
    const s = this.#setup
    if (!s) return
    const dt = Math.min(0.05, (now - this.#last) / 1000)
    this.#last = now
    let finished = false
    if (this.#mode === 'auto') {
      let k = clamp01((now - this.#auto.start) / this.#auto.duration)
      // en desarrollo se puede congelar la hoja en un punto: window.__mitziFlipFreeze = 0.4
      const freeze = import.meta.env.DEV ? (window as { __mitziFlipFreeze?: number }).__mitziFlipFreeze : undefined
      if (typeof freeze === 'number') {
        k = freeze
        this.#auto.start = now - k * this.#auto.duration
      }
      this.#t = this.#pathPoint(this.#auto.from + (this.#auto.to - this.#auto.from) * easeInOut(k))
      finished = k >= 1
    } else {
      // resorte críticamente amortiguado: la hoja sigue al dedo con la suavidad del papel
      const omega = this.#mode === 'drag' ? 24 : 11
      for (const axis of ['x', 'y'] as const) {
        const x = this.#t[axis] - this.#target[axis]
        const temp = (this.#v[axis] + omega * x) * dt
        const decay = Math.exp(-omega * dt)
        this.#v[axis] = (this.#v[axis] - omega * temp) * decay
        this.#t[axis] = this.#target[axis] + (x + temp) * decay
      }
      if (this.#mode === 'settle') {
        const d = Math.hypot(this.#t.x - this.#target.x, this.#t.y - this.#target.y)
        if (d < 0.6 && Math.hypot(this.#v.x, this.#v.y) < 5) {
          this.#t = { ...this.#target }
          finished = true
        }
      }
    }
    this.#render()
    if (finished) this.#finish()
    else this.#raf = requestAnimationFrame(this.#frame)
  }

  async #finish() {
    const s = this.#setup!
    if (!this.#complete) {
      // se soltó antes de tiempo: el libro vuelve a la página de antes, tapado por las copias
      await (s.dir > 0 ? s.engine.prev() : s.engine.next())
    }
    this.#hide()
    this.#setup = null
    this.#resolve?.()
    this.#resolve = null
    this.onFinish?.()
  }

  #hide() {
    this.#mode = 'idle'
    this.#under.style.visibility = 'hidden'
    this.#over.style.visibility = 'hidden'
    // los hijos heredan la visibilidad de su capa: así nada queda dibujado en reposo
    for (const e of [...this.slots, this.#cast, this.#shade]) Object.assign(e.style, { clipPath: '', transform: '', visibility: '' })
  }

  // ---------- dibujo de cada cuadro ----------

  #render() {
    const s = this.#setup!
    const fold = computeFold(s.corner, this.#t, s.w, s.h)
    const toScr = (p: Pt) => apply(s.toScreen, p)
    const rel = (poly: Poly, r: DOMRect) => toCssPolygon(poly.map(p => ({ x: p.x - r.left, y: p.y - r.top })))

    this.#B.style.clipPath = rel(fold.flatPart.map(toScr), s.restB)
    if (fold.flat) {
      this.#C.style.visibility = 'hidden'
      this.#cast.style.visibility = 'hidden'
      this.#shade.style.visibility = 'hidden'
      return
    }

    // reverso: contenido en su lugar de reposo → reflejado sobre la línea del doblez
    const S = compose(s.toScreen, compose(fold.reflect, compose(s.backFromLocal, s.toLocal)))
    const origin = { x: s.restC.left, y: s.restC.top }
    const moved = apply(S, origin)
    this.#C.style.transform = toCssMatrix({ ...S, e: moved.x - origin.x, f: moved.y - origin.y })
    this.#C.style.clipPath = rel(fold.foldedPart.map(p => toScr(apply(s.backFromLocal, p))), s.restC)
    this.#C.style.visibility = ''

    // sombras alineadas con el doblez
    const lift = Math.sin(Math.PI * fold.progress)
    const mid = toScr(fold.mid)
    const lin = { ...s.toScreen, e: 0, f: 0 }
    const n = apply(lin, fold.normal)
    const span = 3 * Math.max(s.w, s.h)
    const bar = (e: HTMLElement, vx: number, vy: number, depth: number) => {
      const angle = Math.atan2(-vx, vy)
      e.style.width = `${span}px`
      e.style.height = `${depth}px`
      e.style.transform = `translate(${mid.x}px, ${mid.y}px) rotate(${angle}rad) translate(${-span / 2}px, 0)`
    }
    // sobre la página que se descubre: sombra que proyecta la hoja levantada
    this.#cast.style.clipPath = toCssPolygon(fold.foldedPart.map(toScr))
    this.#cast.style.visibility = ''
    bar(this.#castBar, n.x, n.y, 16 + s.w * 0.4 * lift)
    this.#castBar.style.opacity = String(0.25 + 0.75 * lift)
    // sobre la hoja doblada: brillo y sombra de la curvatura del papel
    this.#shade.style.clipPath = toCssPolygon(fold.flap.map(toScr))
    this.#shade.style.visibility = ''
    bar(this.#shadeBar, -n.x, -n.y, s.w)
    this.#shade.dataset.dark = String(s.dark)
  }
}
