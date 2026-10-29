/**
 * Sonido de hoja al pasar página: grabaciones reales (public/sounds/, de Kenney, CC0).
 * Se elige una al azar en cada giro, con un tono apenas distinto, para que no suene repetitivo.
 * Se decodifican una sola vez con Web Audio: así suenan al instante, sin el retraso de <audio>.
 */
const FILES = ['hoja-1.ogg', 'hoja-2.ogg', 'hoja-3.ogg']

let ctx: AudioContext | null = null
let buffers: Promise<AudioBuffer[]> | null = null
let last = -1

function load(context: AudioContext) {
  buffers ??= Promise.all(
    FILES.map(async name => {
      const res = await fetch(new URL(`sounds/${name}`, document.baseURI))
      return context.decodeAudioData(await res.arrayBuffer())
    }),
  ).catch(() => [])
  return buffers
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
    const list = await load(ctx)
    if (!list.length) return
    // nunca la misma dos veces seguidas
    let i = Math.floor(Math.random() * list.length)
    if (list.length > 1 && i === last) i = (i + 1) % list.length
    last = i
    const source = ctx.createBufferSource()
    source.buffer = list[i]
    source.playbackRate.value = 0.94 + Math.random() * 0.12
    const gain = ctx.createGain()
    gain.gain.value = 0.55
    source.connect(gain).connect(ctx.destination)
    source.start()
  } catch {
    // sin audio disponible: no pasa nada
  }
}
