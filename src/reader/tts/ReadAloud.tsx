import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../ui/Icon'
import type { ReaderEngine, SpeechSegment, SpeechSource } from '../engines/types'
import { createSpeechBackend, type SpeechVoice } from './backends'

export type ReadAloudState = 'idle' | 'playing' | 'paused'

interface Options {
  engine: () => ReaderEngine | null
  lang?: string
  rate: number
  voice: string | null
}

/** Controla la lectura en voz alta: un bucle que pide una oración, la lee y sigue. */
export function useReadAloud({ engine, lang, rate, voice }: Options) {
  const backend = useMemo(createSpeechBackend, [])
  const [state, setState] = useState<ReadAloudState>('idle')
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const run = useRef<{ token: number; source: SpeechSource | null; current: SpeechSegment | null }>({ token: 0, source: null, current: null })
  const opts = useRef({ rate, voice, lang })
  opts.current = { rate, voice, lang }

  const loop = useCallback(
    async (token: number) => {
      const r = run.current
      while (r.token === token && r.source) {
        const seg = r.current ?? (await r.source.next())
        if (r.token !== token) return
        if (!seg) {
          // terminó el libro
          r.token++
          r.source?.stop()
          r.source = null
          setState('idle')
          return
        }
        r.current = seg
        await backend?.speak(seg.text, { voice: opts.current.voice, lang: seg.lang ?? opts.current.lang, rate: opts.current.rate })
        if (r.token !== token) return
        r.current = null
      }
    },
    [backend],
  )

  const play = useCallback(async () => {
    const r = run.current
    if (!backend) return
    if (!r.source) {
      const source = await engine()?.speech(opts.current.lang)
      if (!source) return
      r.source = source
      r.current = null
    }
    const token = ++r.token
    setState('playing')
    loop(token)
  }, [backend, engine, loop])

  /** Pausa a mitad de la oración; al reanudar se repite esa oración. */
  const pause = useCallback(() => {
    run.current.token++
    backend?.stop()
    setState(s => (s === 'playing' ? 'paused' : s))
  }, [backend])

  const stop = useCallback(() => {
    const r = run.current
    r.token++
    backend?.stop()
    r.source?.stop()
    r.source = null
    r.current = null
    setState('idle')
    setSleepAt(null)
  }, [backend])

  const skip = useCallback(
    async (dir: 1 | -1) => {
      const r = run.current
      if (!r.source) return
      r.token++
      backend?.stop()
      r.current = dir < 0 ? await r.source.prev() : null
      const token = ++r.token
      setState('playing')
      loop(token)
    },
    [backend, loop],
  )

  // temporizador para dormir: pausa sola al cumplirse
  useEffect(() => {
    if (!sleepAt) return
    const id = setTimeout(() => {
      pause()
      setSleepAt(null)
    }, Math.max(0, sleepAt - Date.now()))
    return () => clearTimeout(id)
  }, [sleepAt, pause])

  useEffect(() => stop, [stop])

  return { available: !!backend, backend, state, play, pause, stop, skip, sleepAt, setSleepAt }
}

const RATES = [0.8, 1, 1.2, 1.5, 1.8, 2.2]
const SLEEP = [0, 15, 30, 60]

interface BarProps {
  state: ReadAloudState
  rate: number
  voice: string | null
  lang?: string
  sleepAt: number | null
  voices: () => Promise<SpeechVoice[]>
  onPlay(): void
  onPause(): void
  onStop(): void
  onSkip(dir: 1 | -1): void
  onRate(rate: number): void
  onVoice(voice: string | null): void
  onSleep(minutes: number): void
}

/** Barra flotante con los controles de la voz. */
export function ReadAloudBar(p: BarProps) {
  const [voices, setVoices] = useState<SpeechVoice[]>([])
  const [sleepIdx, setSleepIdx] = useState(0)
  const { voices: loadVoices, lang } = p
  useEffect(() => {
    loadVoices().then(list => {
      // primero las del idioma del libro
      const base = (lang ?? 'es').toLowerCase().split('-')[0]
      const own = (v: SpeechVoice) => Number(v.lang.toLowerCase().startsWith(base))
      setVoices([...list].sort((a, b) => own(b) - own(a)))
    })
  }, [loadVoices, lang])
  const minutesLeft = p.sleepAt ? Math.max(1, Math.round((p.sleepAt - Date.now()) / 60_000)) : 0
  const nextRate = RATES[(RATES.indexOf(p.rate) + 1) % RATES.length] ?? 1
  const cycleSleep = () => {
    const i = (sleepIdx + 1) % SLEEP.length
    setSleepIdx(i)
    p.onSleep(SLEEP[i])
  }

  return (
    <div className="tts-bar" role="toolbar" aria-label="Lectura en voz alta">
      <button className="tts-btn" onClick={() => p.onSkip(-1)} aria-label="Oración anterior" title="Oración anterior">
        <Icon name="chevron-left" size={20} />
      </button>
      <button className="tts-btn main" onClick={p.state === 'playing' ? p.onPause : p.onPlay} aria-label={p.state === 'playing' ? 'Pausa' : 'Leer'}>
        <Icon name={p.state === 'playing' ? 'pause' : 'play'} size={20} />
      </button>
      <button className="tts-btn" onClick={() => p.onSkip(1)} aria-label="Oración siguiente" title="Oración siguiente">
        <Icon name="chevron-right" size={20} />
      </button>
      <span className="tts-sep" />
      <button className="tts-chip" onClick={() => p.onRate(nextRate)} title="Velocidad">
        {p.rate.toFixed(1)}×
      </button>
      <button className="tts-chip" onClick={cycleSleep} title="Dejar de leer después de…">
        {minutesLeft ? `Apagar en ${minutesLeft} min` : 'Temporizador'}
      </button>
      {voices.length > 1 && (
        <select className="tts-voice" value={p.voice ?? ''} onChange={e => p.onVoice(e.target.value || null)} aria-label="Voz">
          <option value="">Voz automática</option>
          {voices.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      )}
      <button className="tts-btn" onClick={p.onStop} aria-label="Cerrar lectura en voz alta" title="Detener">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
