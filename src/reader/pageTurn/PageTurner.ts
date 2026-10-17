import type { ReaderEngine, SnapColumn, Snapshot } from '../engines/types'

export interface TurnContext {
  /** Libro abierto (dos páginas que giran sobre el lomo) o una sola página. */
  book: boolean
  /** Rectángulo de las páginas en la ventana. */
  pages: DOMRect
  bg: string
  dark: boolean
}

const EASING = 'cubic-bezier(0.42, 0.04, 0.26, 1)'

/**
 * Animación de pasar página: una hoja gira sobre el lomo mostrando por delante la
 * página que se va y por detrás la que llega. Se usan capturas de las páginas, se
 * cambia de página por debajo y la hoja cubre el cambio. Solo se animan `transform`
 * y `opacity` con Web Animations: corre en la GPU, igual de fluida a 60 o 120 Hz.
 */
export class PageTurner {
  #layer: HTMLElement
  #running: Animation[] = []
  #queue: Promise<void> = Promise.resolve()

  constructor(layer: HTMLElement) {
    this.#layer = layer
  }

  /** Pasa de página con animación; si se pide otra antes de terminar, la anterior se completa al instante. */
  turn(engine: ReaderEngine, dir: 1 | -1, ctx: TurnContext): Promise<void> {
    for (const a of this.#running) a.finish()
    this.#queue = this.#queue.then(() => this.#turn(engine, dir, ctx)).catch(e => console.warn('No se pudo animar la página', e))
    return this.#queue
  }

  cancel() {
    for (const a of this.#running) a.finish()
    this.#layer.replaceChildren()
  }

  async #turn(engine: ReaderEngine, dir: 1 | -1, ctx: TurnContext) {
    const move = () => (dir > 0 ? engine.next() : engine.prev())
    const before = await engine.snapshot().catch(() => null)
    if (!before) return move()

    const { pages } = ctx
    const layer = this.#layer
    layer.dataset.dark = String(ctx.dark)
    const spine = pages.left + pages.width / 2
    const half = ctx.book ? pages.width / 2 : pages.width
    const leftRect = new DOMRect(pages.left, pages.top, half, pages.height)
    const rightRect = ctx.book ? new DOMRect(spine, pages.top, half, pages.height) : leftRect
    const side = (c: SnapColumn) => (ctx.book && c.rect.left + c.rect.width / 2 < spine ? 'left' : 'right')
    const pick = (s: Snapshot | null, which: 'left' | 'right') => s?.columns.find(c => side(c) === which) ?? null

    const scene = el('div', 'turn-scene')
    // la hoja gira sobre el lomo (o sobre el borde izquierdo con una sola página)
    const leaf = el('div', 'turn-leaf')
    place(leaf, rightRect)
    leaf.style.transformOrigin = 'left center'
    const front = makeFace(rightRect, ctx.bg)
    const back = makeFace(rightRect, ctx.bg)
    back.el.classList.add('back')
    leaf.append(front.el, back.el)

    // lo que se ve antes de cambiar de página, para tapar el cambio por debajo
    const oldLeft = pick(before, 'left')
    const oldRight = pick(before, 'right')
    const mounts: Promise<void>[] = []
    let still: Face | null = null
    if (dir > 0) {
      // siguiente: la hoja derecha se levanta; la izquierda vieja queda quieta hasta que la cubra
      if (oldRight) mounts.push(front.fill(oldRight, rightRect))
      if (ctx.book && oldLeft) {
        still = makeFace(leftRect, ctx.bg)
        mounts.push(still.fill(oldLeft, leftRect))
      }
    } else {
      // anterior: la hoja viene desde la izquierda; la derecha vieja queda quieta
      if (ctx.book && oldLeft) mounts.push(back.fill(oldLeft, leftRect))
      const keep = ctx.book ? oldRight : (oldRight ?? oldLeft)
      if (keep) {
        still = makeFace(rightRect, ctx.bg)
        mounts.push(still.fill(keep, rightRect))
      }
    }
    if (still) {
      place(still.el, dir > 0 && ctx.book ? leftRect : rightRect)
      scene.append(still.el)
    }
    scene.append(leaf)
    // sombra que la hoja proyecta sobre la página de abajo, más oscura cerca del lomo
    const shadeUnder = el('div', 'turn-cast')
    place(shadeUnder, dir > 0 || !ctx.book ? rightRect : leftRect)
    shadeUnder.style.background = `linear-gradient(to ${dir > 0 || !ctx.book ? 'right' : 'left'}, rgba(0, 0, 0, 0.32), transparent 60%)`
    scene.prepend(shadeUnder)
    scene.style.visibility = 'hidden'
    scene.style.perspectiveOrigin = `${spine}px ${pages.top + pages.height / 2}px`
    layer.append(scene)
    await Promise.all(mounts)
    leaf.style.transform = `rotateY(${dir > 0 ? 0 : -180}deg)`
    scene.style.visibility = 'visible'

    const from = engine.position()
    await move()
    if (engine.position() === from) {
      scene.remove()
      return
    }

    // lo que llega: por detrás de la hoja (siguiente) o por delante (anterior)
    const after = await engine.snapshot().catch(() => null)
    if (dir > 0) {
      const newLeft = ctx.book ? pick(after, 'left') : null
      if (newLeft) await back.fill(newLeft, leftRect)
    } else {
      const newRight = pick(after, 'right') ?? (ctx.book ? null : pick(after, 'left'))
      if (newRight) await front.fill(newRight, rightRect)
    }

    const duration = ctx.book ? 620 : 480
    const opts: KeyframeAnimationOptions = { duration, easing: EASING, fill: 'forwards' }
    const turnDeg = dir > 0 ? [0, -180] : [-180, 0]
    const anims = [
      leaf.animate(
        [
          { transform: `rotateY(${turnDeg[0]}deg)` },
          { transform: `rotateY(${(turnDeg[0] + turnDeg[1]) / 2}deg) translateZ(${ctx.book ? 18 : 10}px)` },
          { transform: `rotateY(${turnDeg[1]}deg)` },
        ],
        opts,
      ),
      // la cara que mira a la luz se oscurece al levantarse
      front.shade.animate({ opacity: dir > 0 ? [0, 0.55, 0.55] : [0.55, 0.55, 0] }, opts),
      back.shade.animate({ opacity: dir > 0 ? [0.55, 0.55, 0] : [0, 0.55, 0.55] }, opts),
      shadeUnder.animate({ opacity: [0, 0.75, 0] }, opts),
    ]
    if (still) {
      // la página que queda quieta se oculta justo cuando la hoja la tapa
      anims.push(still.el.animate({ opacity: [1, 1, 0], offset: [0, 0.98, 1] }, opts))
    }
    this.#running = anims
    await Promise.all(anims.map(a => a.finished.catch(() => {})))
    this.#running = []
    scene.remove()
  }
}

function makeFace(rect: DOMRect, bg: string) {
  const face = el('div', 'turn-face')
  face.style.width = `${rect.width}px`
  face.style.height = `${rect.height}px`
  face.style.background = bg
  const content = el('div', 'turn-content')
  const shade = el('div', 'turn-shade')
  face.append(content, shade)
  return {
    el: face,
    shade,
    /** Monta la captura de una columna en su posición dentro de esta cara. */
    async fill(col: SnapColumn, page: DOMRect) {
      const slot = el('div', 'turn-slot')
      place(slot, new DOMRect(col.rect.left - page.left, col.rect.top - page.top, col.rect.width, col.rect.height))
      content.replaceChildren(slot)
      await col.mount(slot)
    },
  }
}

type Face = ReturnType<typeof makeFace>

function el(tag: string, className: string) {
  const e = document.createElement(tag)
  e.className = className
  return e
}

function place(e: HTMLElement, r: DOMRect) {
  Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
}
