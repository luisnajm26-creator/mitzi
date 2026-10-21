import type { ThemeColors } from './contrast'
import { fontFaceCss, fontStack } from './fonts'
import type { ComfortSettings } from './settings'

const TEXT_ELEMENTS = 'p, div, span, li, dd, dt, blockquote, h1, h2, h3, h4, h5, h6, td, th, caption, figcaption, em, i, strong, b, small, sup, sub, cite, q, section, article, aside, header, footer, label, ruby, rt'

/** CSS que se inyecta dentro del EPUB para aplicar tema y tipografía. */
export function epubCss(s: ComfortSettings, t: ThemeColors) {
  const family = fontStack(s.fontId)
  // Mitzi inserta guiones suaves siempre (ver engines/hyphenate.ts): «none» los ignora
  const hyphens = s.hyphenate ? 'auto' : 'none'
  return `
${fontFaceCss(s.fontId)}
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: ${t.dark ? 'dark' : 'light'};
  background: ${t.bg} !important;
  color: ${t.fg} !important;
  font-size: ${s.fontSize}px !important;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
}
body {
  background: transparent !important;
  color: ${t.fg} !important;
  font-size: 1rem !important;
  ${family ? `font-family: ${family} !important;` : ''}
}
body :where(${TEXT_ELEMENTS}) {
  color: inherit !important;
  background-color: transparent !important;
  ${family ? 'font-family: inherit !important;' : ''}
}
p, li, blockquote, dd {
  line-height: ${s.lineHeight} !important;
  text-align: ${s.justify ? 'justify' : 'start'};
  -webkit-hyphens: ${hyphens};
  hyphens: ${hyphens};
  -webkit-hyphenate-limit-before: 3;
  -webkit-hyphenate-limit-after: 2;
  -webkit-hyphenate-limit-lines: 2;
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}
${s.paragraphSpacing !== null ? `p { margin-top: 0 !important; margin-bottom: ${s.paragraphSpacing}em !important; }` : ''}
[align="left"] { text-align: left; }
[align="right"] { text-align: right; }
[align="center"] { text-align: center; }
[align="justify"] { text-align: justify; }
a:link, a:visited { color: ${t.link} !important; }
::selection { background: ${t.selection}; }
::highlight(mitzi-tts) { background-color: ${t.highlights.azul}; }
pre { white-space: pre-wrap !important; }
${s.chapterOrnament ? `html.mitzi-chapter body::after {
  content: '';
  display: block;
  width: 4.2em;
  height: 0.8em;
  margin: 2.4em auto 0.6em;
  background-color: ${t.muted};
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 12'%3E%3Cpath d='M0 6Q12 0 26 6Q12 12 0 6ZM38 6Q52 0 64 6Q52 12 38 6ZM32 2l4 4-4 4-4-4Z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 12'%3E%3Cpath d='M0 6Q12 0 26 6Q12 12 0 6ZM38 6Q52 0 64 6Q52 12 38 6ZM32 2l4 4-4 4-4-4Z'/%3E%3C/svg%3E") center / contain no-repeat;
  opacity: 0.7;
}` : ''}
hr { border-color: ${t.border} !important; }
${t.dark ? 'img, svg, image, video { filter: brightness(0.86) contrast(1.04); }' : ''}
aside[epub|type~="endnote"],
aside[epub|type~="footnote"],
aside[epub|type~="note"],
aside[epub|type~="rearnote"] { display: none; }
`
}
