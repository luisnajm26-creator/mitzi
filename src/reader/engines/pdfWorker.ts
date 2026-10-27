// Worker de pdf.js para navegadores internos viejos (Huawei). El worker corre aparte de
// la página y no recibe los polyfills de main.tsx: sin esto, el pdf.js «legacy» falla
// con «Promise.withResolvers is not a function» y ningún PDF se puede abrir.
// El orden importa: primero lo que falta, después pdf.js.
import '../../lib/polyfills'
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
