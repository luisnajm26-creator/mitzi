import type { SnapColumn } from '../engines/types'

const MEDIA = new Set(['img', 'svg', 'image', 'video'])

/**
 * Busca dónde empieza la columna derecha dentro del rango visible: el primer
 * carácter (o imagen) cuya posición x ya pasó la mitad. Las columnas siguen el
 * orden de lectura, así que se puede buscar de forma binaria dentro de cada texto.
 */
function findSplit(doc: Document, range: Range, splitX: number): { node: Node; offset: number } | null {
  const root = range.commonAncestorContainer
  const walker = doc.createTreeWalker(root.nodeType === 1 ? root : root.parentNode!, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n =>
      n.nodeType === 3 || MEDIA.has((n as Element).localName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  })
  const probe = doc.createRange()
  const charLeft = (text: Text, i: number) => {
    probe.setStart(text, i)
    probe.setEnd(text, i + 1)
    const r = probe.getClientRects()[0]
    return r && r.width + r.height > 0 ? r.left : null
  }
  let started = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) {
      if (started) break
      continue
    }
    started = true
    if (n.nodeType === 1) {
      const rect = (n as Element).getBoundingClientRect()
      if (rect.width > 0 && rect.left >= splitX - 1) return { node: n.parentNode!, offset: [...n.parentNode!.childNodes].indexOf(n as ChildNode) }
      continue
    }
    const text = n as Text
    const len = text.length
    if (!len) continue
    const last = charLeft(text, len - 1)
    if (last === null || last < splitX) continue
    let lo = 0
    let hi = len - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const left = charLeft(text, mid)
      if (left !== null && left >= splitX) hi = mid
      else lo = mid + 1
    }
    return { node: text, offset: lo }
  }
  return null
}

/** Divide el rango visible del libro abierto en las dos páginas. */
export function splitColumns(doc: Document, visible: Range, splitX: number): Range[] {
  const split = findSplit(doc, visible, splitX)
  if (!split) return [visible.cloneRange(), doc.createRange()]
  const left = visible.cloneRange()
  left.setEnd(split.node, split.offset)
  const right = visible.cloneRange()
  right.setStart(split.node, split.offset)
  return [left, right]
}

interface SnapOptions {
  rect: DOMRect
  /** margen interno a cada lado del texto (la mitad del espacio entre columnas) */
  padX: number
}

/**
 * Copia una página del EPUB (sus estilos y el trozo de texto visible) para dibujarla
 * aparte en la hoja que gira. La copia se hace ya; montarla puede ser después.
 */
export function snapshotColumn(doc: Document, range: Range, { rect, padX }: SnapOptions): SnapColumn {
  const content = range.collapsed ? doc.createDocumentFragment() : range.cloneContents()
  // si la página empieza a mitad de párrafo, su primera línea no lleva sangría
  const midParagraph = range.startContainer.nodeType === 3 && range.startOffset > 0
  const head = doc.head?.cloneNode(true) as HTMLElement | undefined
  head?.querySelectorAll('script').forEach(s => s.remove())
  const htmlAttrs = [...doc.documentElement.attributes].filter(a => a.name !== 'style')
  const bodyAttrs = [...doc.body.attributes].filter(a => a.name !== 'style')

  return {
    rect,
    async mount(container) {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-same-origin')
      frame.setAttribute('aria-hidden', 'true')
      frame.tabIndex = -1
      frame.className = 'page-snap'
      Object.assign(frame.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: '0',
        pointerEvents: 'none',
        background: 'transparent',
      })
      const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
      frame.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>'
      container.append(frame)
      await loaded
      const sdoc = frame.contentDocument
      if (!sdoc) return
      for (const a of htmlAttrs) sdoc.documentElement.setAttribute(a.name, a.value)
      for (const a of bodyAttrs) sdoc.body.setAttribute(a.name, a.value)
      const waits: Promise<unknown>[] = []
      for (const node of [...(head?.childNodes ?? [])]) {
        const imported = sdoc.importNode(node, true)
        if (imported instanceof sdoc.defaultView!.HTMLLinkElement)
          waits.push(new Promise(resolve => imported.addEventListener('load', resolve, { once: true })).catch(() => {}))
        sdoc.head.append(imported)
      }
      Object.assign(sdoc.documentElement.style, {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        padding: `0 ${padX}px`,
        margin: '0',
        boxSizing: 'border-box',
        overflow: 'hidden',
      })
      sdoc.body.style.margin = '0'
      sdoc.body.append(sdoc.importNode(content, true))
      if (midParagraph) {
        const first = sdoc.body.querySelector('p, li, blockquote, dd, div')
        if (first instanceof sdoc.defaultView!.HTMLElement) first.style.setProperty('text-indent', '0', 'important')
      }
      await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 250))])
      await sdoc.fonts?.ready
    },
  }
}
