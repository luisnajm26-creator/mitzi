import type { PageSide, ReaderEngine } from '../engines/types'
import { apply, compose, computeFold, IDENTITY, toCssMatrix, translate, type Mat, type Pt } from './geometry'

export interface FlipContext {
  /** Libro abierto (dos páginas) o una sola página. */
  book: boolean
  /** Rectángulo de las páginas en la ventana. */
  stage: DOMRect
  dark: boolean
  /** Sombra del lomo del libro abierto: la hoja la toma al caer sobre la otra página. */
  gutter?: HTMLElement | null
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
  /** lado del recorte (un cuadrado que siempre cubre la página) */
  cut: number
  /** largo de las sombras a lo largo del doblez (cubre cualquier corte de la página) */
  diag: number
}

type Mode = 'idle' | 'preparing' | 'auto' | 'drag' | 'settle'

const MIRROR: Mat = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const linear = (m: Mat): Mat => ({ ...m, e: 0, f: 0 })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

function el(className: string, parent: HTMLElement) {
  const e = document.createElement('div')
  e.className = className
  parent.append(e)
  return e
}

function setRect(e: HTMLElement, r: DOMRect) {
  Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
}

/**
 * Una hoja: su caja (la página; en el reverso, reflejada sobre el doblez) › el recorte
 * por la línea del doblez › el contenido, devuelto a su lugar. El motor pinta en
 * `content`. En cada cuadro solo cambian transformaciones, que la GPU compone sin
 * repintar nada: así el giro va igual de fluido a 60 o a 120 Hz, también en el teléfono.
 */
interface Sheet {
  box: HTMLElement
  clip: HTMLElement
  content: HTMLElement
}

function sheet(parent: HTMLElement): Sheet {
  const box = el('flip-slot', parent)
  const clip = el('flip-clip', box)
  const content = el('flip-content', clip)
  return { box, clip, content }
}

function place(sh: Sheet, r: DOMRect) {
  setRect(sh.box, r)
  Object.assign(sh.content.style, { width: `${r.width}px`, height: `${r.height}px` })
  // el recorte es un cuadrado que cubre la página entera aunque gire alrededor de cualquier
  // punto de ella; sin tamaño, la copia quieta (la que no gira) quedaba invisible
  const cut = `${cutSize(r.width, r.height)}px`
  Object.assign(sh.clip.style, { width: cut, height: cut })
}

const cutSize = (w: number, h: number) => 3 * Math.hypot(w, h)

/** Inversa de una rotación con traslación. */
const invertRigid = (m: Mat): Mat => ({ a: m.a, b: m.c, c: m.b, d: m.d, e: -(m.a * m.e + m.b * m.f), f: -(m.c * m.e + m.d * m.f) })

/**
 * Recorta por un semiplano solo con transformaciones: `clip` es un cuadrado de lado
 * `size` con un borde sobre la línea que pasa por `m` (normal `u`, hacia lo que se
 * conserva) y `content` se contrarrota para quedar quieto. Devuelve a qué altura del
 * recorte queda `center` proyectado sobre la línea (para alinear las sombras).
 */
function cutAlong(clip: HTMLElement, content: HTMLElement | null, m: Pt, u: Pt, size: number, center: Pt) {
  const v = { x: -u.y, y: u.x }
  const W: Mat = { a: u.x, b: u.y, c: v.x, d: v.y, e: m.x - (size / 2) * v.x, f: m.y - (size / 2) * v.y }
  clip.style.transform = toCssMatrix(W)
  if (content) content.style.transform = toCssMatrix(invertRigid(W))
  return dot({ x: center.x - m.x, y: center.y - m.y }, v) + size / 2
}

/** Sin recorte: el cuadrado del recorte cubre toda la página. */
function uncut(sh: Sheet) {
  sh.clip.style.transform = 'none'
  sh.content.style.transform = 'none'
}

/**
 * La hoja que gira al pasar página. Se dibuja con copias exactas de las páginas
 * (mismo texto, mismos cortes de línea): la parte plana, la parte doblada con su
 * reverso y las sombras. Por debajo el libro ya cambió de página, así que al
 * terminar no hay ningún salto.
 */
export class PageFlip {
  readonly slots: HTMLElement[]
  #under: HTMLElement
  #over: HTMLElement
  #A: Sheet
  #B: Sheet
  #C: Sheet
  #crease: HTMLElement
  /** reverso liso de la hoja cuando se lee de a una página */
  #paper: HTMLElement
  #castBox: HTMLElement
  #castClip: HTMLElement
  #castBar: HTMLElement
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
  /** la hoja empieza a moverse (para el sonido de papel) */
  onStart: (() => void) | null = null
  /** terminó el giro; `turned` es false si la hoja volvió a su lugar */
  onFinish: ((turned: boolean) => void) | null = null

  constructor(under: HTMLElement, over: HTMLElement) {
    this.#under = under
    this.#over = over
    under.replaceChildren()
    over.replaceChildren()
    this.#A = sheet(under)
    this.#B = sheet(under)
    this.#castBox = el('flip-slot', under)
    this.#castClip = el('flip-clip', this.#castBox)
    this.#castBar = el('flip-bar cast', this.#castClip)
    this.#C = sheet(over)
    this.#shadeBar = el('flip-bar shade', this.#C.clip)
    this.#crease = document.createElement('div')
    this.#crease.className = 'flip-crease'
    this.#paper = document.createElement('div')
    this.#paper.className = 'flip-paper'
    this.slots = [this.#A.content, this.#B.content, this.#C.content]
    this.#hide()
  }

  get busy() {
    return this.#mode !== 'idle'
  }

  /** Las copias que conviene tener listas: con una sola página el reverso es papel liso. */
  slotsFor(book: boolean) {
    return book ? [this.#B.content, this.#A.content, this.#C.content] : [this.#B.content, this.#A.content]
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
      this.onStart?.()
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
    this.onStart?.()
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
    this.#crease.remove() // se vuelve a poner con la página que llega (solo en el libro abierto)
    try {
      // lo que se ve ahora, copiado antes de cambiar de página
      if (!reverse) {
        place(B, turningRect)
        await engine.paintPage(B.content, turningSide, turningRect)
        if (book) {
          place(A, otherRect)
          A.box.hidden = !(await engine.paintPage(A.content, otherSide, otherRect))
        } else {
          A.box.hidden = true
          // una sola página: el reverso es papel (sin otra copia del capítulo que maquetar)
          place(C, turningRect)
          C.content.replaceChildren(this.#paper)
        }
      } else {
        place(A, stage)
        A.box.hidden = !(await engine.paintPage(A.content, 'single', stage))
      }
      uncut(B)
      C.box.style.transform = ''
      B.box.hidden = reverse
      C.box.style.visibility = 'hidden'
      this.#castBox.style.visibility = 'hidden'
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
        const ok = await engine.paintPage(C.content, otherSide, otherRect)
        if (ok) this.#attachCrease(ctx.gutter, ctx.dark, otherRect)
        else C.content.replaceChildren()
      } else if (reverse) {
        place(B, stage)
        B.box.hidden = false
        await engine.paintPage(B.content, 'single', stage)
        place(C, stage)
        C.content.replaceChildren(this.#paper)
      }
    } catch (e) {
      this.#hide()
      throw e
    }

    const restB = reverse ? stage : turningRect
    const diag = Math.hypot(w, h)
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
      restB,
      restC: book ? otherRect : turningRect,
      cut: cutSize(w, h),
      diag: diag + 4,
    }
    // tamaños fijos durante el giro: luego solo cambian transformaciones y opacidades
    Object.assign(this.#castClip.style, { width: `${cutSize(w, h)}px`, height: `${cutSize(w, h)}px` })
    setRect(this.#castBox, restB)
    Object.assign(this.#castBar.style, { width: `${16 + w * 0.4}px`, height: `${diag + 4}px` })
    Object.assign(this.#shadeBar.style, { width: `${w}px`, height: `${diag + 4}px` })
    this.#shadeBar.dataset.dark = String(ctx.dark)

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
    this.onFinish?.(this.#complete)
  }

  #hide() {
    this.#mode = 'idle'
    this.#under.style.visibility = 'hidden'
    this.#over.style.visibility = 'hidden'
    // los hijos heredan la visibilidad de su capa: así nada queda dibujado en reposo
    for (const e of [this.#A.box, this.#B.box, this.#C.box, this.#castBox]) Object.assign(e.style, { transform: '', visibility: '' })
  }

  /**
   * La sombra del lomo va pegada al reverso de la hoja, en el lugar donde la hoja va a
   * caer: viaja con ella (no se ve a través) y, cuando termina de asentarse, coincide
   * con la sombra del libro, así que nada cambia de golpe.
   */
  #attachCrease(gutter: HTMLElement | null | undefined, dark: boolean, rest: DOMRect) {
    if (!gutter) {
      this.#crease.remove()
      return
    }
    const r = gutter.getBoundingClientRect()
    Object.assign(this.#crease.style, {
      left: `${r.left - rest.left}px`,
      top: `${r.top - rest.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      background: gutter.style.background,
    })
    this.#crease.dataset.dark = String(dark)
    this.#C.content.append(this.#crease)
  }

  // ---------- dibujo de cada cuadro ----------

  #render() {
    const s = this.#setup!
    const fold = computeFold(s.corner, this.#t, s.w, s.h)
    const B = this.#B, C = this.#C
    if (fold.flat) {
      uncut(B)
      C.box.style.visibility = 'hidden'
      this.#castBox.style.visibility = 'hidden'
      return
    }

    // la línea del doblez en la pantalla, con su normal hacia la esquina que se levanta
    const mid = apply(s.toScreen, fold.mid)
    const n = apply(linear(s.toScreen), fold.normal)
    const rB = s.restB
    const mB = { x: mid.x - rB.left, y: mid.y - rB.top }
    const centerB = { x: rB.width / 2, y: rB.height / 2 }
    // la parte plana es lo que queda del lado del lomo
    cutAlong(B.clip, B.content, mB, { x: -n.x, y: -n.y }, s.cut, centerB)

    // reverso: el contenido en su lugar de reposo, reflejado sobre la línea del doblez
    const S = compose(s.toScreen, compose(fold.reflect, compose(s.backFromLocal, s.toLocal)))
    const origin = { x: s.restC.left, y: s.restC.top }
    const moved = apply(S, origin)
    C.box.style.transform = toCssMatrix({ ...S, e: moved.x - origin.x, f: moved.y - origin.y })
    const toC = compose(s.toScreen, s.backFromLocal)
    const mC = apply(toC, fold.mid)
    const shadeY = cutAlong(
      C.clip,
      C.content,
      { x: mC.x - origin.x, y: mC.y - origin.y },
      apply(linear(toC), fold.normal),
      s.cut,
      { x: s.restC.width / 2, y: s.restC.height / 2 },
    )
    const lift = Math.sin(Math.PI * fold.progress)
    // sobre la hoja doblada: sombra en el pliegue y brillo de la curvatura del papel
    this.#shadeBar.style.transform = `translate(0, ${shadeY - s.diag / 2}px)`
    // las sombras y el brillo entran y salen suaves: nada se enciende o apaga de golpe
    this.#shadeBar.style.opacity = String(Math.min(1, lift * 1.8))
    C.box.style.visibility = ''

    // sobre la página que se descubre: la sombra que proyecta la hoja levantada
    const castY = cutAlong(this.#castClip, null, mB, n, s.cut, centerB)
    const depth = 16 + s.w * 0.4 * lift
    this.#castBar.style.transform = `translate(0, ${castY - s.diag / 2}px) scaleX(${depth / (16 + s.w * 0.4)})`
    this.#castBar.style.opacity = String(lift)
    this.#castBox.style.visibility = ''
  }
}
