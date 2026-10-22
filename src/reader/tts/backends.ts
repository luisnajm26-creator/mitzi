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

// ---------- voces naturales desde un servidor de voz en la PC ----------

/**
 * Servidor de voz local con la API de OpenAI (POST /v1/audio/speech), por ejemplo
 * Kokoro-FastAPI, o VoiceStudio si ofrece esa API. Mitzi no lo incluye: si lo tienes
 * abierto en tu PC, sus voces aparecen junto a las del sistema.
 */
export interface VoiceServerConfig {
  /** p. ej. http://localhost:8880/v1 */
  url: string
  model: string
}

const SERVER_KEY = 'mitzi-servidor-voz'

export function loadVoiceServer(): VoiceServerConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(SERVER_KEY) ?? 'null') as VoiceServerConfig | null
    return c?.url ? c : null
  } catch {
    return null
  }
}

export function saveVoiceServer(config: VoiceServerConfig | null) {
  try {
    if (config) localStorage.setItem(SERVER_KEY, JSON.stringify(config))
    else localStorage.removeItem(SERVER_KEY)
  } catch {
    // no es grave
  }
}

/** Kokoro nombra sus voces con el idioma delante: ef_dora = español, af_bella = inglés (EE. UU.)… */
const KOKORO_LANG: Record<string, string> = { a: 'en-US', b: 'en-GB', e: 'es', f: 'fr', h: 'hi', i: 'it', j: 'ja', p: 'pt-BR', z: 'zh' }

const SERVER_PREFIX = 'srv:'

/** Pide la lista de voces al servidor (también sirve para «Probar conexión»). */
export async function serverVoices(config: VoiceServerConfig): Promise<SpeechVoice[]> {
  const res = await fetch(`${config.url.replace(/\/$/, '')}/audio/voices`)
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`)
  const body = (await res.json()) as { voices?: (string | { id?: string; name?: string })[]; data?: { id?: string; name?: string }[] }
  const list = body.voices ?? body.data ?? []
  return list
    .map(v => (typeof v === 'string' ? v : (v.id ?? v.name ?? '')))
    .filter(Boolean)
    .map(name => ({ id: SERVER_PREFIX + name, name: `${name} · natural`, lang: KOKORO_LANG[name[0]] ?? '' }))
}

class ServerSpeech {
  #audio: HTMLAudioElement | null = null
  #finish: (() => void) | null = null
  #request: AbortController | null = null

  async voices() {
    const config = loadVoiceServer()
    return config ? serverVoices(config) : []
  }

  /** Devuelve false si el servidor no contestó (para leer esa oración con la voz del sistema). */
  async speak(text: string, { voice, rate }: SpeakOptions): Promise<boolean> {
    const config = loadVoiceServer()
    if (!config || !voice) return false
    const request = new AbortController()
    this.#request = request
    try {
      const res = await fetch(`${config.url.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, input: text, voice: voice.slice(SERVER_PREFIX.length), speed: rate, response_format: 'mp3' }),
        signal: request.signal,
      })
      if (!res.ok) return false
      const url = URL.createObjectURL(await res.blob())
      // si se pausó mientras el servidor generaba el audio, no se reproduce
      if (request.signal.aborted) return true
      await new Promise<void>(resolve => {
        const audio = new Audio(url)
        this.#audio = audio
        this.#finish = resolve
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      })
      URL.revokeObjectURL(url)
      return true
    } catch {
      // pausado a mitad de la petición: no hay que leerla con otra voz
      return request.signal.aborted
    } finally {
      this.#audio = null
      this.#finish = null
    }
  }

  stop() {
    this.#request?.abort()
    this.#audio?.pause()
    this.#finish?.()
  }
}

/** Las voces del sistema más las naturales del servidor (si hay uno configurado). */
class MixedSpeech implements SpeechBackend {
  #system: SpeechBackend | null
  #server = new ServerSpeech()

  constructor(system: SpeechBackend | null) {
    this.#system = system
  }

  async voices() {
    const [natural, system] = await Promise.all([this.#server.voices().catch(() => []), this.#system?.voices() ?? Promise.resolve([])])
    return [...natural, ...system]
  }

  async speak(text: string, options: SpeakOptions) {
    // si el servidor se cerró, sigue la voz del sistema (si no, se saltaría oraciones sin leerlas)
    if (options.voice?.startsWith(SERVER_PREFIX) && (await this.#server.speak(text, options))) return
    await this.#system?.speak(text, { ...options, voice: options.voice?.startsWith(SERVER_PREFIX) ? null : options.voice })
  }

  stop() {
    this.#system?.stop()
    this.#server.stop()
  }
}

export function createSpeechBackend(): SpeechBackend | null {
  if (platform.kind === 'android') return new AndroidSpeech()
  // en la PC: voces del sistema y, si hay un servidor de voz configurado, las naturales
  return new MixedSpeech('speechSynthesis' in window ? new WebSpeech() : null)
}
