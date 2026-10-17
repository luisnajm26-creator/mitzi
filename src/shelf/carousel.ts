/**
 * Estado del carrusel fuera de React (se actualiza en cada frame sin re-renderizar).
 * `offset` es la posición continua: 2.0 = el libro 2 está al centro.
 * Todo el movimiento usa el tiempo real transcurrido, así se ve igual a 60, 90 o 120 Hz.
 */
export class CarouselController {
  offset = 0
  target = 0
  velocity = 0
  count = 0
  dragging = false
  lastInput = performance.now()

  #dragStartX = 0
  #dragStartOffset = 0
  #pxPerBook = 300
  #samples: { x: number; t: number }[] = []

  setCount(count: number) {
    this.count = count
    const max = Math.max(0, count - 1)
    this.target = Math.min(Math.max(0, Math.round(this.target)), max)
    this.offset = Math.min(this.offset, max)
  }

  get center() {
    return Math.min(Math.max(0, Math.round(this.offset)), Math.max(0, this.count - 1))
  }

  get settled() {
    return !this.dragging && Math.abs(this.offset - this.target) < 0.0005 && Math.abs(this.velocity) < 0.001
  }

  touch() {
    this.lastInput = performance.now()
  }

  goTo(index: number) {
    this.target = Math.min(Math.max(0, index), Math.max(0, this.count - 1))
    this.touch()
  }

  step(dir: number) {
    this.goTo(Math.round(this.target) + dir)
  }

  jumpTo(index: number) {
    this.goTo(index)
    this.offset = this.target
    this.velocity = 0
  }

  beginDrag(x: number, pxPerBook: number) {
    this.dragging = true
    this.#dragStartX = x
    this.#dragStartOffset = this.offset
    this.#pxPerBook = pxPerBook
    this.#samples = [{ x, t: performance.now() }]
    this.velocity = 0
    this.touch()
  }

  moveDrag(x: number) {
    if (!this.dragging) return
    const max = Math.max(0, this.count - 1)
    let next = this.#dragStartOffset - (x - this.#dragStartX) / this.#pxPerBook
    // resistencia elástica al pasar los extremos
    if (next < 0) next = -rubber(-next)
    else if (next > max) next = max + rubber(next - max)
    this.offset = next
    const t = performance.now()
    this.#samples.push({ x, t })
    while (this.#samples.length > 2 && t - this.#samples[0].t > 100) this.#samples.shift()
    this.touch()
  }

  endDrag() {
    if (!this.dragging) return
    this.dragging = false
    const first = this.#samples[0]
    const last = this.#samples[this.#samples.length - 1]
    const dt = Math.max(1, last.t - first.t) / 1000
    // libros por segundo (positivo = hacia libros siguientes)
    const speed = -(last.x - first.x) / this.#pxPerBook / dt
    this.velocity = speed
    const projected = this.offset + speed * 0.22
    this.target = Math.min(Math.max(0, Math.round(projected)), Math.max(0, this.count - 1))
    this.touch()
  }

  /** Resorte críticamente amortiguado: llega suave y sin rebotes, independiente de los FPS. */
  update(dt: number) {
    if (this.dragging) return
    const omega = 10
    const x = this.offset - this.target
    const temp = (this.velocity + omega * x) * dt
    const decay = Math.exp(-omega * dt)
    this.velocity = (this.velocity - omega * temp) * decay
    this.offset = this.target + (x + temp) * decay
    if (Math.abs(this.offset - this.target) < 0.0005 && Math.abs(this.velocity) < 0.001) {
      this.offset = this.target
      this.velocity = 0
    }
  }
}

const rubber = (x: number) => 0.35 * (1 - 1 / (x * 0.9 + 1))
