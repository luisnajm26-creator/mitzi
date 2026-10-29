/**
 * Política de seguridad del contenido (CSP): de dónde puede venir lo que carga la app.
 * La usan la PC (como encabezado, en electron/main.ts) y la página compilada (como <meta>, en
 * vite.config.ts), así que llega también a Android.
 *
 * Lo más importante es `script-src`: solo el código de Mitzi. Los capítulos de un EPUB se abren
 * en iframes que heredan esta política, así que si un libro trae JavaScript (en <script>, en un
 * .js aparte o en atributos como onerror) no corre: un libro malicioso no puede leer tus notas
 * ni mandar nada a ningún lado.
 */
export const CSP = [
  "default-src 'self'",
  // wasm: lo usa pdf.js para algunas imágenes de los PDF
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  // GitHub: buscar actualizaciones; localhost: el servidor de voz en la misma PC
  "connect-src 'self' blob: data: https://api.github.com http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  // nada de <object>/<embed> ni de cambiar la base de las direcciones desde un libro
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')
