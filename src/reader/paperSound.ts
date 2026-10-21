/**
 * Roce de papel al pasar página, sintetizado con Web Audio (ruido filtrado que sube de
 * tono y se apaga): no hace falta ningún archivo de audio ni su licencia.
 */
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function noiseBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.5)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  // ruido «marrón» (más grave que el blanco) con un poco de blanco: suena a hoja, no a radio
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5 + white * 0.15
  }
  return buffer
}

export function playPaperSound() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    noise ??= noiseBuffer(ctx)
    const t = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.8
    band.frequency.setValueAtTime(1100, t)
    band.frequency.exponentialRampToValueAtTime(3600, t + 0.3)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    source.connect(band).connect(gain).connect(ctx.destination)
    source.start(t)
    source.stop(t + 0.45)
  } catch {
    // sin audio disponible: no pasa nada
  }
}
