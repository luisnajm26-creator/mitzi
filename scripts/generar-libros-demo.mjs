// Genera libros de prueba (EPUB y PDF) en libros-prueba/ con texto original,
// para probar Mitzi sin necesitar libros propios. Uso: npm run demo
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'libros-prueba', 'demo')
fs.mkdirSync(outDir, { recursive: true })

// ---------- texto ----------
const SENTENCES = [
  'La lámpara del estudio seguía encendida cuando el viento empezó a golpear las ventanas.',
  'Nadie en el pueblo recordaba quién había plantado el primer árbol junto al río.',
  'Abrió el cuaderno en la última página escrita y leyó despacio, como si fuera la primera vez.',
  'El tren nocturno cruzaba los campos dormidos dejando un rastro de luces amarillas.',
  'Había aprendido que las mejores conversaciones empiezan con una pregunta pequeña.',
  'En la plaza, los niños perseguían a las palomas mientras los mayores discutían del clima.',
  'El olor a pan recién hecho subía por la escalera y llegaba hasta el último piso.',
  'Guardó la carta en el bolsillo del abrigo sin atreverse todavía a abrirla.',
  'Las montañas, cubiertas de niebla, parecían dibujadas con un lápiz muy suave.',
  'Cada mañana anotaba tres cosas que quería recordar antes de que terminara el día.',
  'El viejo reloj de la estación marcaba siempre cinco minutos de más, y a nadie le importaba.',
  'Entre las páginas del libro encontró una flor seca y una fecha escrita a mano.',
  'La biblioteca cerraba tarde, y en invierno era el lugar más cálido de toda la ciudad.',
  'Caminaron sin prisa por la orilla, contando las barcas que regresaban al puerto.',
  'Pensó que algunas historias solo se entienden cuando se leen en voz alta.',
  'El gato se acomodó sobre la pila de periódicos como si fuera un trono.',
  'Afuera llovía con esa calma que invita a quedarse en casa y no hacer nada.',
  '—¿Sabes qué es lo más difícil de un viaje? —preguntó—. Decidir cuándo termina.',
  'Las luces del faro giraban sobre el agua, lentas, pacientes, puntuales.',
  'Al final del pasillo había una puerta azul que nadie se animaba a abrir.',
]

let seed = 1
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const paragraph = () => Array.from({ length: 3 + Math.floor(rand() * 4) }, () => SENTENCES[Math.floor(rand() * SENTENCES.length)]).join(' ')
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---------- zip (sin compresión, suficiente para EPUB) ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// ---------- EPUB ----------
function coverSvg(title, author, [c1, c2, ink]) {
  const words = title.split(' ')
  const lines = []
  for (const w of words) {
    if (lines.length && (lines[lines.length - 1] + ' ' + w).length < 14) lines[lines.length - 1] += ' ' + w
    else lines.push(w)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <circle cx="460" cy="190" r="120" fill="${ink}" opacity=".12"/>
  <circle cx="120" cy="720" r="200" fill="${ink}" opacity=".08"/>
  <rect x="34" y="34" width="532" height="832" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="3"/>
  ${lines.map((l, i) => `<text x="300" y="${330 + i * 76}" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="700" fill="${ink}">${esc(l)}</text>`).join('\n  ')}
  <text x="300" y="790" text-anchor="middle" font-family="Verdana, sans-serif" font-size="26" fill="${ink}" opacity=".85">${esc(author)}</text>
</svg>`
}

function makeEpub({ file, title, author, colors, chapters }) {
  const id = `urn:uuid:mitzi-demo-${file}`
  const chapterFiles = Array.from({ length: chapters }, (_, i) => {
    const name = `cap${i + 1}.xhtml`
    const body = Array.from({ length: 14 }, paragraph).map(p => `<p>${esc(p)}</p>`).join('\n')
    const html = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es">
<head><title>Capítulo ${i + 1}</title><link rel="stylesheet" href="estilo.css"/></head>
<body><section epub:type="chapter"><h2>Capítulo ${i + 1}</h2>
${body}
</section></body></html>`
    return { name, title: `Capítulo ${i + 1}`, html }
  })
  const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="es"><head><title>Portada</title>
<style>body{margin:0;text-align:center}img{max-width:100%;max-height:100%}</style></head>
<body><img src="portada.svg" alt="Portada"/></body></html>`
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es"><head><title>Índice</title></head>
<body><nav epub:type="toc"><h1>Índice</h1><ol>
${chapterFiles.map(c => `<li><a href="${c.name}">${c.title}</a></li>`).join('\n')}
</ol></nav></body></html>`
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="es">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="bookid">${id}</dc:identifier>
  <dc:title>${esc(title)}</dc:title>
  <dc:creator>${esc(author)}</dc:creator>
  <dc:language>es</dc:language>
  <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  <meta name="cover" content="portada"/>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="portada" href="portada.svg" media-type="image/svg+xml" properties="cover-image"/>
  <item id="portada-xhtml" href="portada.xhtml" media-type="application/xhtml+xml"/>
  <item id="css" href="estilo.css" media-type="text/css"/>
  ${chapterFiles.map((c, i) => `<item id="c${i + 1}" href="${c.name}" media-type="application/xhtml+xml"/>`).join('\n  ')}
</manifest>
<spine>
  <itemref idref="portada-xhtml"/>
  ${chapterFiles.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n  ')}
</spine>
</package>`
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  const css = 'h2{text-align:center;margin:2em 0 1.2em}p{text-indent:1.5em;margin:0}'
  const entries = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', data: Buffer.from(container) },
    { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
    { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) },
    { name: 'OEBPS/portada.svg', data: Buffer.from(coverSvg(title, author, colors)) },
    { name: 'OEBPS/portada.xhtml', data: Buffer.from(coverXhtml) },
    { name: 'OEBPS/estilo.css', data: Buffer.from(css) },
    ...chapterFiles.map(c => ({ name: `OEBPS/${c.name}`, data: Buffer.from(c.html) })),
  ]
  fs.writeFileSync(path.join(outDir, file), zip(entries))
}

// ---------- PDF ----------
function pdfString(s) {
  // la raya (—) en WinAnsiEncoding es el byte 0x97
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/—/g, '\x97') + ')'
}

function wrap(text, max) {
  const lines = []
  let line = ''
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim())
      line = w
    } else line += ' ' + w
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

function makePdf({ file, title, author, pages }) {
  const W = 420, H = 595
  const contents = []
  // portada
  contents.push(
    [
      '0.93 0.62 0.68 rg 0 0 420 595 re f',
      '0.98 0.86 0.80 rg 0 0 420 200 re f',
      'BT /F2 30 Tf 0.18 0.1 0.15 rg 40 380 Td',
      ...wrap(title, 20).flatMap((l, i) => (i ? ['0 -38 Td'] : []).concat(`${pdfString(l)} Tj`)),
      'ET',
      `BT /F1 14 Tf 0.25 0.15 0.2 rg 40 120 Td ${pdfString(author)} Tj ET`,
    ].join('\n'),
  )
  for (let p = 1; p < pages; p++) {
    const lines = []
    while (lines.length < 34) lines.push(...wrap(paragraph(), 62), '')
    contents.push(
      [
        `BT /F2 15 Tf 0.1 0.1 0.1 rg 40 548 Td ${pdfString(`Parte ${p}`)} Tj ET`,
        'BT /F1 10.5 Tf 0.12 0.12 0.12 rg 14.5 TL 40 520 Td',
        ...lines.slice(0, 33).map(l => `${pdfString(l)} '`),
        'ET',
        `BT /F1 9 Tf 0.4 0.4 0.4 rg 200 28 Td ${pdfString(String(p + 1))} Tj ET`,
      ].join('\n'),
    )
  }

  const objects = []
  const add = body => objects.push(body) // número = índice + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('PAGES')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  add(`<< /Title ${pdfString(title)} /Author ${pdfString(author)} /Producer (Mitzi demo) >>`)
  const pageIds = []
  for (const content of contents) {
    const stream = Buffer.from(content, 'latin1')
    add(`<< /Length ${stream.length} >>\nstream\n${content}\nendstream`)
    const contentId = objects.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  fs.writeFileSync(path.join(outDir, file), Buffer.from(out, 'latin1'))
}

makeEpub({ file: 'el-faro-de-las-palabras.epub', title: 'El faro de las palabras', author: 'Libro de prueba de Mitzi', colors: ['#1f6f78', '#f3b562', '#fff8ec'], chapters: 10 })
makeEpub({ file: 'jardin-de-lavanda.epub', title: 'Jardín de lavanda', author: 'Libro de prueba de Mitzi', colors: ['#6b4fa0', '#e6b8e8', '#fdf7ff'], chapters: 6 })
makeEpub({ file: 'cartas-al-mar.epub', title: 'Cartas al mar', author: 'Libro de prueba de Mitzi', colors: ['#14385c', '#ff7f6e', '#fff4ee'], chapters: 16 })
makePdf({ file: 'manual-de-lectura-comoda.pdf', title: 'Manual de lectura cómoda', author: 'Libro de prueba de Mitzi', pages: 24 })

console.log(`Libros de prueba creados en ${path.relative(root, outDir)}`)
