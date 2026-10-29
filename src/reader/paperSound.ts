/**
 * Sonido de hoja al pasar página: grabaciones reales (public/sounds/, de Kenney, CC0).
 * Se elige una al azar en cada giro, con un tono apenas distinto, para que no suene repetitivo.
 * Se decodifican una sola vez con Web Audio: así suenan al instante, sin el retraso de <audio>.
 */
const FILES = ['hoja-1.ogg', 'hoja-2.ogg', 'hoja-3.ogg']
/** Cuándo debe sonar el golpe de la hoja, contado desde que empieza a girar (segundos). */
const HIT_AT = 0.1
/** Volumen del golpe, igual para todas las grabaciones. */
const LEVEL = 0.4

interface Clip {
  buffer: AudioBuffer
  /** dónde está el golpe dentro de la grabación (segundos) */
  peak: number
  /** qué tan fuerte es el golpe (0–1) */
  level: number
}

let ctx: AudioContext | null = null
let clips: Promise<Clip[]> | null = null
let last = -1

/**
 * Las grabaciones no son parejas: una tiene medio segundo de silencio antes del golpe y
 * suena más fuerte que las otras. Se mide cada una para alinear el golpe con el giro.
 */
function measure(buffer: AudioBuffer): Clip {
  const data = buffer.getChannelData(0)
  let at = 0
  let level = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i])
    if (v > level) {
      level = v
      at = i
    }
  }
  return { buffer, peak: at / buffer.sampleRate, level: level || 1 }
}

function load(context: AudioContext) {
  clips ??= Promise.all(
    FILES.map(async name => {
      const res = await fetch(new URL(`sounds/${name}`, document.baseURI))
      return measure(await context.decodeAudioData(await res.arrayBuffer()))
    }),
  ).catch(() => [])
  return clips
}

/** Carga los sonidos con tiempo (al abrir el lector), para que el primer giro ya suene. */
export function preparePaperSound() {
  try {
    ctx ??= new AudioContext()
    void load(ctx)
  } catch {
    // sin audio disponible
  }
}

export async function playPaperSound() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const startedAt = ctx.currentTime
    const list = await load(ctx)
    if (!list.length) return
    // nunca la misma dos veces seguidas
    let i = Math.floor(Math.random() * list.length)
    if (list.length > 1 && i === last) i = (i + 1) % list.length
    last = i
    const clip = list[i]
    const rate = 0.94 + Math.random() * 0.12
    // el golpe cae a HIT_AT del inicio del giro: se salta el silencio de antes (lo que queda
    // antes del golpe es el roce de la hoja) o se espera un instante si la grabación empieza
    // justo con el golpe
    const peak = clip.peak / rate
    const offset = Math.max(0, peak - HIT_AT) * rate
    const hitIn = peak - offset / rate
    const when = Math.max(ctx.currentTime, startedAt + HIT_AT - hitIn)
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.playbackRate.value = rate
    const gain = ctx.createGain()
    gain.gain.value = Math.min(1.5, LEVEL / clip.level)
    source.connect(gain).connect(ctx.destination)
    source.start(when, offset)
  } catch {
    // sin audio disponible: no pasa nada
  }
}
