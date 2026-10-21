import type { View } from 'foliate-js/view.js'
import { withoutSoftHyphens } from '../engines/hyphenate'
import type { SpeechSource } from '../engines/types'

interface Segment {
  mark: string | null
  text: string
}

/** El TTS de foliate da SSML con <mark/> antes de cada oración; aquí se separa en oraciones. */
function parseSsml(ssml: string | undefined): Segment[] {
  if (!ssml) return []
  const doc = new DOMParser().parseFromString(ssml, 'application/xml')
  const out: Segment[] = []
  let current: Segment = { mark: null, text: '' }
  const flush = () => {
    // sin los guiones suaves de la separación silábica
    const text = withoutSoftHyphens(current.text).replace(/\s+/g, ' ').trim()
    if (text) out.push({ mark: current.mark, text })
  }
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) current.text += child.nodeValue ?? ''
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (el.localName === 'mark') {
          flush()
          current = { mark: el.getAttribute('name'), text: '' }
        } else if (el.localName === 'break') current.text += ' '
        else walk(el)
      }
    }
  }
  walk(doc.documentElement)
  flush()
  return out
}

const HIGHLIGHT = 'mitzi-tts'

/** Lee el EPUB oración por oración desde lo que se ve, resaltando cada una y pasando de página sola. */
export async function createEpubSpeech(view: View, lang?: string): Promise<SpeechSource | null> {
  let segments: Segment[] = []
  let i = 0
  let doc: Document | null = null

  const highlight = (range: Range) => {
    const win = range.startContainer.ownerDocument?.defaultView as (Window & typeof globalThis) | null
    if (win?.CSS?.highlights && win.Highlight) win.CSS.highlights.set(HIGHLIGHT, new win.Highlight(range))
    // si la oración está en la página siguiente, se pasa de página
    view.renderer.scrollToAnchor(range)
  }
  const init = async () => {
    await view.initTTS('sentence', highlight)
    doc = view.renderer.getContents()[0]?.doc ?? null
  }
  const load = (ssml: string | undefined) => {
    segments = parseSsml(ssml)
    i = 0
  }

  await init()
  if (!view.tts) return null
  const visible = view.lastLocation?.range
  load(visible ? view.tts.from(visible) : view.tts.start())

  const next = async () => {
    for (let guard = 0; guard < 1000; guard++) {
      if (i < segments.length) {
        const s = segments[i++]
        if (s.mark) view.tts?.setMark(s.mark)
        return { text: s.text, lang }
      }
      const ssml = view.tts?.next()
      if (ssml) {
        load(ssml)
        continue
      }
      // fin del capítulo: sigue con el próximo
      const before = view.renderer.getContents()[0]?.index
      await view.renderer.nextSection()
      if (view.renderer.getContents()[0]?.index === before) return null
      await init()
      load(view.tts?.start())
    }
    return null
  }

  return {
    next,
    async prev() {
      // vuelve a la oración anterior (dentro del capítulo)
      if (i >= 2) i -= 2
      else {
        const ssml = view.tts?.prev()
        if (ssml) {
          load(ssml)
          i = Math.max(0, segments.length - 1)
        } else i = 0
      }
      return next()
    },
    stop() {
      const win = doc?.defaultView as (Window & typeof globalThis) | null
      win?.CSS?.highlights?.delete(HIGHLIGHT)
    },
  }
}
