import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { platform } from '../../platform'

export interface SpeechVoice {
  id: string
  name: string
  lang: string
}

export interface SpeakOptions {
  voice?: string | null
  lang?: string
  rate: number
}

/** Voz del sistema: Web Speech en PC/navegador, motor de Android en el teléfono. */
export interface SpeechBackend {
  voices(): Promise<SpeechVoice[]>
  /** Se resuelve cuando termina de leer (o cuando se detiene). */
  speak(text: string, options: SpeakOptions): Promise<void>
  stop(): void
}

class WebSpeech implements SpeechBackend {
  async #all() {
    const synth = window.speechSynthesis
    let list = synth.getVoices()
    if (list.length) return list
    // las voces se cargan solas un momento después de abrir la app
    await new Promise<void>(resolve => {
      const done = () => resolve()
      synth.addEventListener('voiceschanged', done, { once: true })
      setTimeout(done, 1500)
    })
    list = synth.getVoices()
    return list
  }

  async voices() {
    return (await this.#all()).map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
  }

  async speak(text: string, { voice, lang, rate }: SpeakOptions) {
    const all = await this.#all()
    const chosen = all.find(v => v.voiceURI === voice) ?? pickVoice(all, lang, v => v.lang)
    return new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = rate
      if (chosen) u.voice = chosen
      u.lang = chosen?.lang ?? lang ?? 'es'
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    })
  }

  stop() {
    window.speechSynthesis.cancel()
  }
}

class AndroidSpeech implements SpeechBackend {
  #cache: SpeechVoice[] | null = null

  async voices() {
    if (!this.#cache) {
      const { voices } = await TextToSpeech.getSupportedVoices()
      // el plugin elige la voz por su posición en la lista
      this.#cache = voices.map((v, i) => ({ id: String(i), name: v.name, lang: v.lang }))
    }
    return this.#cache
  }

  async speak(text: string, { voice, lang, rate }: SpeakOptions) {
    const all = await this.voices().catch(() => [])
    const chosen = all.find(v => v.id === voice) ?? pickVoice(all, lang, v => v.lang)
    try {
      await TextToSpeech.speak({ text, lang: chosen?.lang ?? lang ?? 'es-ES', rate, voice: chosen ? Number(chosen.id) : undefined })
    } catch {
      // detenido a mitad de una oración
    }
  }

  stop() {
    TextToSpeech.stop().catch(() => {})
  }
}

/** Primera voz del idioma del libro (es-MX, es-ES…), o la primera disponible. */
function pickVoice<T>(all: T[], lang: string | undefined, langOf: (v: T) => string) {
  const base = (lang ?? 'es').toLowerCase().split('-')[0]
  return all.find(v => langOf(v).toLowerCase().startsWith(base)) ?? all[0]
}

export function createSpeechBackend(): SpeechBackend | null {
  if (platform.kind === 'android') return new AndroidSpeech()
  if ('speechSynthesis' in window) return new WebSpeech()
  return null
}
