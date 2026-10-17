import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import legacyWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

type PdfJs = typeof import('pdfjs-dist')

let loading: Promise<PdfJs> | null = null

/**
 * El pdf.js normal usa funciones de JavaScript muy recientes sin alternativa. Si el
 * navegador interno no las tiene (p. ej. teléfonos Huawei sin Google), se usa su
 * versión compatible, que trae lo que falta.
 */
function supportsModernPdfjs() {
  const g = globalThis as unknown as {
    Map: { prototype: { getOrInsertComputed?: unknown } }
    Math: { sumPrecise?: unknown }
    Promise: { try?: unknown }
    URL: { parse?: unknown }
  }
  return (
    typeof g.Map.prototype.getOrInsertComputed === 'function' &&
    typeof g.Math.sumPrecise === 'function' &&
    typeof g.Promise.try === 'function' &&
    typeof g.URL.parse === 'function'
  )
}

/** Carga pdf.js solo cuando hace falta (no pesa en el arranque). */
export function loadPdfjs() {
  const modern = supportsModernPdfjs()
  loading ??= (modern ? import('pdfjs-dist') : (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>)).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = modern ? workerUrl : legacyWorkerUrl
    return pdfjs
  })
  return loading
}

/** Recursos locales de pdf.js copiados a public/pdfjs (funcionan sin internet). */
export function pdfAssetOptions() {
  const base = new URL('pdfjs/', document.baseURI).href
  return {
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    iccUrl: base + 'iccs/',
  }
}
