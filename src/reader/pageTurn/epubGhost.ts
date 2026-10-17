import type { View } from 'foliate-js/view.js'
import type { AnnotationRecord } from '../../library/db'
import type { ThemeColors } from '../comfort/contrast'

export interface Ghost {
  /** Ventana que recorta una página. */
  win: HTMLDivElement
  /** Copia completa del capítulo, maquetada igual que el original. */
  frame: HTMLIFrameElement
  key: string
}

const HIGHLIGHT = 'mitzi-hl-'
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Copias "fantasma" del capítulo que se está leyendo, una por cada hoja de la
 * animación. Son el mismo documento con los mismos estilos y el mismo tamaño, así
 * que muestran cada página idéntica al original (sin reacomodar el texto).
 * Se rehacen solo cuando cambia el capítulo, el tamaño, el estilo o los subrayados.
 */
export class GhostPages {
  #ghosts = new WeakMap<HTMLElement, Ghost>()
  #version = 0

  /** Algo cambió en el estilo o los subrayados: las copias se rehacen al usarlas. */
  invalidate() {
    this.#version++
  }

  async ensure(
    slot: HTMLElement,
    view: View,
    doc: Document,
    index: number,
    annotations: AnnotationRecord[],
    theme: ThemeColors | null,
  ): Promise<Ghost> {
    const source = doc.defaultView?.frameElement as HTMLIFrameElement | null
    if (!source) throw new Error('Capítulo sin iframe')
    const fr = source.getBoundingClientRect()
    const key = `${index}|${Math.round(fr.width)}|${Math.round(fr.height)}|${this.#version}`
    let g = this.#ghosts.get(slot)
    if (!g) {
      const win = document.createElement('div')
      win.className = 'ghost-win'
      const frame = document.createElement('iframe')
      frame.className = 'ghost-frame'
      frame.setAttribute('sandbox', 'allow-same-origin')
      frame.setAttribute('aria-hidden', 'true')
      frame.tabIndex = -1
      win.append(frame)
      slot.replaceChildren(win)
      const loaded = new Promise(r => frame.addEventListener('load', r, { once: true }))
      frame.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>'
      await loaded
      g = { win, frame, key: '' }
      this.#ghosts.set(slot, g)
    } else if (g.win.parentElement !== slot) slot.replaceChildren(g.win)

    if (g.key !== key) {
      g.key = key
      g.frame.style.width = `${fr.width}px`
      g.frame.style.height = `${fr.height}px`
      const gdoc = g.frame.contentDocument
      if (gdoc) {
        const html = gdoc.importNode(doc.documentElement, true)
        html.querySelectorAll('script').forEach(s => s.remove())
        const waits = [...html.querySelectorAll('link')].map(
          link => new Promise(resolve => {
            link.addEventListener('load', resolve, { once: true })
            link.addEventListener('error', resolve, { once: true })
          }),
        )
        gdoc.replaceChild(html, gdoc.documentElement)
        await Promise.race([Promise.all(waits), wait(500)])
        await gdoc.fonts?.ready
        paintHighlights(gdoc, view, index, annotations, theme)
      }
    }
    return g
  }
}

/** Los subrayados (que foliate dibuja en otra capa) se marcan también en la copia. */
function paintHighlights(gdoc: Document, view: View, index: number, annotations: AnnotationRecord[], theme: ThemeColors | null) {
  const win = gdoc.defaultView as (Window & typeof globalThis) | null
  if (!win?.CSS?.highlights || !win.Highlight || !theme) return
  win.CSS.highlights.clear()
  const groups = new Map<string, Range[]>()
  for (const a of annotations) {
    try {
      const resolved = view.resolveCFI(a.anchor)
      if (resolved.index !== index) continue
      const range = resolved.anchor(gdoc)
      if (range instanceof win.Range) groups.set(a.color, [...(groups.get(a.color) ?? []), range])
    } catch {
      // un CFI que ya no existe en el capítulo
    }
  }
  let css = ''
  for (const [color, ranges] of groups) {
    win.CSS.highlights.set(HIGHLIGHT + color, new win.Highlight(...ranges))
    css += `::highlight(${HIGHLIGHT}${color}) { background-color: ${theme.highlights[color as keyof ThemeColors['highlights']]}; }\n`
  }
  let style = gdoc.getElementById('mitzi-ghost-hl')
  if (!style) {
    style = gdoc.createElement('style')
    style.id = 'mitzi-ghost-hl'
    gdoc.head?.append(style)
  }
  style.textContent = css
}
