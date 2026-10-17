import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfJs = typeof import('pdfjs-dist')

let loading: Promise<PdfJs> | null = null

/** Carga pdf.js solo cuando hace falta (no pesa en el arranque). */
export function loadPdfjs() {
  loading ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
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
