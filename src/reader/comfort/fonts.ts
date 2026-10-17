import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import merriweather from '@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url'
import merriweatherItalic from '@fontsource-variable/merriweather/files/merriweather-latin-wght-italic.woff2?url'
import atkinson from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url'
import atkinsonItalic from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2?url'
import nunito from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url'
import nunitoItalic from '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2?url'
import dyslexic from '@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url'
import dyslexicBold from '@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url'
import dyslexicItalic from '@fontsource/opendyslexic/files/opendyslexic-latin-400-italic.woff2?url'

export type FontId = 'publisher' | 'literata' | 'merriweather' | 'atkinson' | 'nunito' | 'opendyslexic'

interface Face {
  url: string
  style: 'normal' | 'italic'
  weight: string
}

interface FontDef {
  label: string
  family: string
  fallback: string
  faces: Face[]
}

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

const variable = (normal: string, italic: string): Face[] => [
  { url: normal, style: 'normal', weight: '200 900' },
  { url: italic, style: 'italic', weight: '200 900' },
]

export const FONTS: Record<FontId, FontDef> = {
  publisher: { label: 'Original', family: '', fallback: '', faces: [] },
  literata: { label: 'Literata', family: 'Mitzi Literata', fallback: 'Georgia, serif', faces: variable(literata, literataItalic) },
  merriweather: { label: 'Merriweather', family: 'Mitzi Merriweather', fallback: 'Georgia, serif', faces: variable(merriweather, merriweatherItalic) },
  atkinson: { label: 'Atkinson', family: 'Mitzi Atkinson', fallback: 'system-ui, sans-serif', faces: variable(atkinson, atkinsonItalic) },
  nunito: { label: 'Nunito', family: 'Mitzi Nunito', fallback: 'system-ui, sans-serif', faces: variable(nunito, nunitoItalic) },
  opendyslexic: {
    label: 'OpenDyslexic',
    family: 'Mitzi OpenDyslexic',
    fallback: 'sans-serif',
    faces: [
      { url: dyslexic, style: 'normal', weight: '400' },
      { url: dyslexicBold, style: 'normal', weight: '700' },
      { url: dyslexicItalic, style: 'italic', weight: '400' },
    ],
  },
}

export const FONT_IDS = Object.keys(FONTS) as FontId[]

/**
 * @font-face para inyectar dentro del libro. Las URLs van absolutas porque el
 * contenido del EPUB vive en iframes con URL blob:, donde las rutas relativas no sirven.
 */
export function fontFaceCss(id: FontId) {
  const font = FONTS[id]
  return font.faces
    .map(
      f => `@font-face {
  font-family: '${font.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: block;
  src: url("${new URL(f.url, document.baseURI).href}") format('woff2');
  unicode-range: ${LATIN};
}`,
    )
    .join('\n')
}

export function fontStack(id: FontId) {
  const font = FONTS[id]
  return font.family ? `'${font.family}', ${font.fallback}` : null
}
