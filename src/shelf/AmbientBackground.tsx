import type { CSSProperties } from 'react'
import { ambientColors, type Palette } from '../library/palette'

const FALLBACK = {
  glow: '#3b2f5c',
  top: '#16121f',
  bottom: '#0b0910',
  floor: '#2a2140',
}

/** Fondo de la biblioteca con los colores del libro central; cambia con una transición suave. */
export function AmbientBackground({ palette }: { palette: Palette | null }) {
  const c = palette ? ambientColors(palette) : FALLBACK
  const style = {
    '--amb-glow': c.glow,
    '--amb-top': c.top,
    '--amb-bottom': c.bottom,
    '--amb-floor': c.floor,
  } as CSSProperties
  return (
    <div className="ambient" style={style} aria-hidden>
      <div className="ambient-vignette" />
    </div>
  )
}
