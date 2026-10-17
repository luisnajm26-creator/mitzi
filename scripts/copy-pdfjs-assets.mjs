// Copia los recursos de pdf.js (mapas de caracteres, fuentes estándar y wasm)
// a public/pdfjs para que funcionen sin internet en PC y Android, y la letra de los
// títulos a public/fonts para que la pantalla de inicio la tenga desde el primer instante.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', 'pdfjs-dist')
const dest = path.join(root, 'public', 'pdfjs')

const literata = path.join(root, 'node_modules', '@fontsource-variable', 'literata', 'files', 'literata-latin-wght-normal.woff2')
if (fs.existsSync(literata)) {
  fs.mkdirSync(path.join(root, 'public', 'fonts'), { recursive: true })
  fs.copyFileSync(literata, path.join(root, 'public', 'fonts', 'literata-latin.woff2'))
}

if (!fs.existsSync(src)) process.exit(0)
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const from = path.join(src, dir)
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, dir), { recursive: true })
}
