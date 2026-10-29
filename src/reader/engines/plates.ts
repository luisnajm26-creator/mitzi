/**
 * Láminas: las páginas del EPUB que son solo una ilustración (a lo sumo con un pie o
 * un crédito corto) se agrandan hasta ocupar todo el espacio, sin deformarse. En el
 * libro abierto, una imagen horizontal se extiende por las dos páginas, cruzando el
 * lomo (como la lámina doble de un libro impreso); una vertical llena su página. En el
 * teléfono, la imagen llena la pantalla.
 *
 * Se hace sobre el capítulo ya cargado: el texto del libro no se toca, y como las
 * copias de la hoja que gira clonan el capítulo, la lámina también se ve al pasar página.
 */

const PLATE = 'mitzi-plate'
const TARGET = 'mitzi-plate-img'
/** lo que envuelve a la imagen (figure, div, section…) */
const WRAP = 'mitzi-plate-wrap'
/** elementos vacíos (separadores, títulos ocultos) que solo ocuparían lugar */
const HIDE = 'mitzi-plate-hide'
/** en una galería, la página que queda libre a la derecha de una lámina doble */
const SPACER = 'mitzi-plate-spacer'
/** Un pie de imagen o un crédito ("Ilustración de…"); más texto ya es una página de lectura. */
const MAX_TEXT = 120
/** Más chica que esto (en píxeles de la imagen) es un adorno, no una ilustración. */
const MIN_SIDE = 300
/** A doble página solo si la imagen queda mucho más grande así: las horizontales y
 * cuadradas; una vertical llena su propia página (no queda partida por el lomo). */
const SPREAD_GAIN = 1.4

type Plate = HTMLImageElement | SVGSVGElement

/**
 * Las ilustraciones de un capítulo que es solo eso: una (con a lo sumo un pie) o una
 * galería (varias seguidas, cada una en su página, como «Ilustraciones» al inicio del libro).
 */
function findPlates(doc: Document): Plate[] {
  const body = doc.body
  if (!body) return []
  const imgs = [...body.querySelectorAll('img')]
  const svgs = [...body.querySelectorAll('svg')].filter(s => s.querySelector('image'))
  const all: Plate[] = [...imgs, ...svgs]
  if (!all.length) return []
  // un pie corto por ilustración, como mucho; más texto ya es una página de lectura
  if ((body.textContent ?? '').replace(/\s+/g, '').length > MAX_TEXT * all.length) return []
  // en orden de aparición (las svg van después de las img en la lista)
  return all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

function naturalSize(el: Plate): { w: number; h: number } | null {
  if (el.tagName.toLowerCase() === 'img') {
    const img = el as HTMLImageElement
    return img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null
  }
  const svg = el as SVGSVGElement
  const box = svg.viewBox?.baseVal
  if (box?.width && box.height) return { w: box.width, h: box.height }
  const image = svg.querySelector('image')
  const w = parseFloat(image?.getAttribute('width') ?? '')
  const h = parseFloat(image?.getAttribute('height') ?? '')
  return w && h ? { w, h } : null
}

const CSS = `
html.${PLATE} body { margin: 0 !important; padding: 0 !important; }
/* lo que envuelve a la imagen no debe empujarla ni recortarla */
.${WRAP} {
  margin: 0 !important; padding: 0 !important; border: 0 !important;
  width: auto !important; max-width: none !important;
  height: auto !important; min-height: 0 !important; max-height: none !important;
  overflow: visible !important; float: none !important; text-indent: 0 !important;
  break-before: auto !important; break-after: auto !important;
  page-break-before: auto !important; page-break-after: auto !important;
}
.${HIDE} { display: none !important; }
.${SPACER} { display: block; break-before: column !important; }
html.${PLATE} body::after { content: none !important; }
.${TARGET} { box-sizing: border-box !important; }
`

/** Pone los estilos que falten o hayan cambiado (sin tocar los demás: así no se repite sin fin). */
function setImportant(el: Element, styles: Record<string, string>) {
  const { style } = el as HTMLElement
  for (const [k, v] of Object.entries(styles))
    if (style.getPropertyValue(k) !== v || style.getPropertyPriority(k) !== 'important') style.setProperty(k, v, 'important')
}

/** Marca lo que envuelve a cada imagen y oculta los elementos vacíos que solo ocupan lugar. */
function prepare(doc: Document, plates: Plate[]) {
  doc.documentElement.classList.add(PLATE)
  for (const el of plates) {
    el.classList.add(TARGET)
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) p.classList.add(WRAP)
  }
  for (const e of doc.body.querySelectorAll('*')) {
    if (plates.some(el => e.contains(el) || el.contains(e))) continue
    if (!(e.textContent ?? '').trim() && !e.querySelector('img, svg, video')) e.classList.add(HIDE)
  }
  const style = doc.createElement('style')
  style.textContent = CSS
  doc.head?.append(style)
}

/** Lo que cuelga directo de <body> y contiene a la imagen: ahí van los saltos de página. */
function topBlock(doc: Document, el: Plate): HTMLElement {
  let p: Element = el
  while (p.parentElement && p.parentElement !== doc.body) p = p.parentElement
  return p as HTMLElement
}

/**
 * Galería: cada ilustración en su página. Las horizontales que caen en una página izquierda
 * se extienden por las dos (la derecha queda libre con un separador); si cayera a la
 * derecha no puede cruzar el lomo hacia afuera, y ocupa solo esa página.
 */
function setupGallery(doc: Document, plates: Plate[]) {
  const win = doc.defaultView
  const html = doc.documentElement
  if (!win) return
  const spacers = new Map<Plate, HTMLElement>()

  const layout = () => {
    const cs = win.getComputedStyle(html)
    const columnWidth = parseFloat(cs.columnWidth)
    const gap = parseFloat(cs.columnGap) || 0
    const height = html.clientHeight
    if (!columnWidth || !height) return
    const sizes = plates.map(naturalSize)
    if (sizes.some(s => !s || Math.min(s.w, s.h) < MIN_SIDE)) return
    if (!html.classList.contains(PLATE)) prepare(doc, plates)
    const width = html.getBoundingClientRect().width
    const columns = Math.max(1, Math.round(width / (columnWidth + gap)))
    const flowing = cs.direction !== 'rtl' && !cs.writingMode.startsWith('vertical')
    const pageH = Math.floor(height) - 2
    const bleed = Math.floor(gap / 4)
    const singleW = columnWidth + 2 * bleed
    const spreadW = 2 * columnWidth + gap + 2 * bleed
    let column = 0
    plates.forEach((el, i) => {
      const size = sizes[i]!
      const one = Math.min(singleW / size.w, pageH / size.h)
      const two = columns >= 2 && flowing && column % 2 === 0 ? Math.min(spreadW / size.w, pageH / size.h) : 0
      const spread = two > one * SPREAD_GAIN
      const box = spread ? spreadW : singleW
      const k = spread ? two : one
      const w = Math.floor(size.w * k)
      const h = Math.floor(size.h * k)
      // cada ilustración empieza en una página nueva
      setImportant(topBlock(doc, el), { 'break-before': i ? 'column' : 'auto' })
      setImportant(el, {
        display: 'block',
        width: `${w}px`,
        height: `${h}px`,
        'max-width': 'none',
        'max-height': 'none',
        'margin-top': `${Math.max(0, Math.floor((pageH - h) / 2))}px`,
        'margin-right': '0px',
        'margin-bottom': '0px',
        'margin-left': `${Math.floor((box - w) / 2) - bleed}px`,
        'object-fit': 'contain',
      })
      // la página de la derecha de una lámina doble queda vacía (la imagen la cubre)
      let spacer = spacers.get(el)
      if (spread && !spacer) {
        spacer = doc.createElement('div')
        spacer.className = SPACER
        topBlock(doc, el).after(spacer)
        spacers.set(el, spacer)
      }
      if (spacer) setImportant(spacer, { display: spread ? 'block' : 'none', height: `${pageH}px` })
      column += spread ? 2 : 1
    })
  }

  const observer = new MutationObserver(layout)
  observer.observe(html, { attributes: true, attributeFilter: ['style'] })
  for (const el of plates) {
    observer.observe(el, { attributes: true, attributeFilter: ['style'] })
    if (el.tagName.toLowerCase() === 'img' && !(el as HTMLImageElement).complete) el.addEventListener('load', layout, { once: true })
  }
  layout()
}

/** Si el capítulo es una lámina (o una galería), la ajusta ahora y cada vez que cambie el tamaño de las páginas. */
export function setupPlate(doc: Document) {
  const plates = findPlates(doc)
  if (plates.length > 1) return setupGallery(doc, plates)
  const el = plates[0]
  const win = doc.defaultView
  if (!el || !win) return
  const html = doc.documentElement
  /** alto del pie o crédito, medido después de acomodar la imagen */
  let caption = 0

  const layout = () => {
    const size = naturalSize(el)
    if (!size || Math.min(size.w, size.h) < MIN_SIDE) return
    const cs = win.getComputedStyle(html)
    const columnWidth = parseFloat(cs.columnWidth)
    const gap = parseFloat(cs.columnGap) || 0
    const height = html.clientHeight
    // en modo desplazamiento no hay páginas: la imagen queda como la pone el libro
    if (!columnWidth || !height) return
    if (!html.classList.contains(PLATE)) prepare(doc, [el])
    const width = html.getBoundingClientRect().width
    const columns = Math.max(1, Math.round(width / (columnWidth + gap)))
    const flowing = cs.direction !== 'rtl' && !cs.writingMode.startsWith('vertical')
    const pageH = Math.floor(height) - 2
    // la lámina toma también parte de los márgenes de los lados: queda más grande
    // sin pegarse al borde del papel (arriba y abajo respeta los del texto)
    const bleed = Math.floor(gap / 4)
    const singleW = columnWidth + 2 * bleed
    const spreadW = 2 * columnWidth + gap + 2 * bleed

    // con pie de imagen: primero se acomoda, se mide cuánto ocupa el texto y se ajusta
    for (let pass = 0; pass < 3; pass++) {
      const room = pageH - caption
      const one = Math.min(singleW / size.w, room / size.h)
      const two = columns >= 2 && flowing ? Math.min(spreadW / size.w, room / size.h) : 0
      const spread = two > one * SPREAD_GAIN
      const box = spread ? spreadW : singleW
      const k = spread ? two : one
      const w = Math.floor(size.w * k)
      const h = Math.floor(size.h * k)
      const top = Math.max(0, Math.floor((room - h) / 2))
      html.dataset.mitziSpread = String(spread)
      setImportant(el, {
        display: 'block',
        width: `${w}px`,
        height: `${h}px`,
        'max-width': 'none',
        'max-height': 'none',
        'margin-top': `${top}px`,
        'margin-right': '0px',
        'margin-bottom': '0px',
        'margin-left': `${Math.floor((box - w) / 2) - bleed}px`,
        'object-fit': 'contain',
      })
      // dónde termina todo lo de la página: lo que pasa de la imagen es el pie (arriba o abajo)
      const range = doc.createRange()
      range.selectNodeContents(doc.body)
      const bottom = range.getBoundingClientRect().bottom - doc.body.getBoundingClientRect().top
      const measured = Math.min(pageH * 0.4, Math.max(0, Math.ceil(bottom - top - h)))
      if (Math.abs(measured - caption) <= 1) break
      caption = measured
    }
  }

  // foliate maqueta las páginas cambiando el estilo de <html> y vuelve a limitar las
  // imágenes al ancho de una página: en ambos casos se vuelve a ajustar
  const observer = new MutationObserver(layout)
  observer.observe(html, { attributes: true, attributeFilter: ['style'] })
  observer.observe(el, { attributes: true, attributeFilter: ['style'] })
  if (el.tagName.toLowerCase() === 'img' && !(el as HTMLImageElement).complete) el.addEventListener('load', layout, { once: true })
  layout()
}
