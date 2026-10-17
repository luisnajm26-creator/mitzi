/**
 * Pantalla de inicio (está en index.html para verse desde el primer instante, antes de
 * que cargue la app). Se va cuando la biblioteca está lista para mostrarse: con el libro
 * central ya dibujado, o enseguida si la biblioteca está vacía. Así no se ve nada a
 * medio cargar, y el nombre alcanza a animarse completo.
 */

/** Lo que tarda la animación de las letras (desde que se abre la app). */
const MIN_MS = 1500
/** Por si algo tarda de más: la app nunca se queda tapada. */
const MAX_MS = 6000

let gone = false
let resolveGone: () => void
/** Se cumple cuando la pantalla de inicio ya se fue: recién ahí empieza el trabajo pesado. */
export const splashGone = new Promise<void>(r => (resolveGone = r))

export function hideSplash() {
  if (gone) return
  gone = true
  const el = document.getElementById('splash')
  if (!el) return resolveGone()
  const wait = Math.max(0, MIN_MS - performance.now())
  setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => {
      el.remove()
      resolveGone()
    }, 700)
  }, wait)
}

/** Espera a que el cuadro ya esté pintado (dos cuadros) antes de destapar. */
export function hideSplashAfterPaint() {
  requestAnimationFrame(() => requestAnimationFrame(hideSplash))
}

setTimeout(hideSplash, MAX_MS)
