# Mitzi

Lector de EPUB y PDF de código abierto (MIT) para Android y PC, con biblioteca 3D estilo selector de videojuegos, libro abierto con relieve y una hoja de papel que gira al pasar página. Un solo código web (React + TypeScript + Vite) empaquetado con **Electron** (Windows) y **Capacitor** (Android).

Se hizo con ayuda de Claude: el autor define la idea, el diseño y las pruebas. Este archivo es el mapa del proyecto para retomarlo en cualquier sesión.

## Reglas del proyecto

- **Responder y comentar en español.** Comentarios del código en español, breves, explicando el porqué.
- **La app va vacía:** nunca subir libros al repo (derechos de autor). `libros-prueba/` está ignorada salvo `LEEME.md`; `npm run demo` genera libros propios de prueba.
- **Sin servicios de Google:** los teléfonos principales (Huawei Pura 70 Ultra, MatePad 11.5) no los tienen. Nada de Firebase, AdMob, Play Services ni plugins que dependan de ellos.
- **Fluidez a 60/120 Hz:** las animaciones dependen del tiempo transcurrido (no de contar cuadros) y en cada cuadro solo cambian `transform`/`opacity`.
- **Repo público** `luisnajm26-creator/mitzi`, autor con correo noreply de GitHub. Commits con la línea `Co-Authored-By` de Claude.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en el navegador (puerto 5173; en `.claude/launch.json` es `mitzi-web`). Lee los libros de `libros-prueba/` con los endpoints `/__mitzi/books` y `/__mitzi/book` de `vite.config.ts` |
| `npm run electron:dev` | Electron con recarga en vivo |
| `npm run build` | `tsc -b` + `vite build` + compila `electron/` |
| `npm run typecheck` | Solo tipos (web y Electron) |
| `npm run electron` | Abre la app de escritorio con lo compilado |
| `npm run android` | Compila web, `cap sync` y `gradlew assembleDebug`; deja `release/Mitzi-<versión>-debug.apk`. Con `-- --install` lo instala por USB; con `-- --release`, el APK firmado para publicar |
| `npm run instalador` | `build` + electron-builder: `release/Mitzi-Setup-<versión>.exe` (NSIS, por usuario) |
| `npm run llave` | Crea la llave de firma del APK en `~/.mitzi` (fuera del repo). La crea el autor, una sola vez, y la respalda |
| `npm run publicar` | Instalador + APK firmado + `SHA256SUMS.txt`; con `-- --subir` crea el Release en GitHub. **Lo ejecuta el autor**, no Claude |
| `npm run demo` | Genera libros de prueba en `libros-prueba/demo` |
| `npx electron scripts/generar-iconos.mjs` | Regenera los íconos PNG desde los SVG |

`postinstall` copia los recursos de pdf.js a `public/pdfjs/` y la letra de títulos a `public/fonts/` (ambas carpetas ignoradas por git).

## Mapa del código

```
src/
  main.tsx            importa primero lib/polyfills (navegadores internos viejos)
  app/                App (arranque y orden de carga), store (vista actual), back.ts (gesto atrás), splash.ts,
                      updates.ts (actualizaciones), author.ts (datos del autor y créditos)
  platform/           Platform: una implementación por plataforma (web, electron, android); index.ts elige
  library/            db.ts (Dexie), scanner.ts (carpetas → libros), metadata.ts (título, portada, serie),
                      formats.ts, palette.ts, series.ts, query.ts (filtros/grupos del explorador), store.ts,
                      stats.ts (minutos y páginas por día)
  shelf/              Shelf (biblioteca), Shelf3D + textures + LightRig + carousel (three.js),
                      Explorer (buscador), AmbientBackground, About, StatsPanel, UpdateToast
  reader/             Reader.tsx (pantalla de lectura, gestos, barras, paneles), SearchPanel, pace.ts
                      (tiempo que falta), lookup.ts (definir/traducir), paperSound.ts
    engines/          ReaderEngine: epubEngine (foliate-js), pdfEngine + pdfjs.ts, plates.ts (láminas),
                      hyphenate.ts (guiones suaves)
    pageTurn/         PageFlip (hoja que gira), geometry (doblez), epubGhost (copias del capítulo)
    layouts/          OpenBook (libro abierto: tapa, cantos, sombra del lomo)
    comfort/          temas, contraste automático, fuentes, ajustes, CSS que se inyecta al EPUB
    annotations/      subrayados, notas y marcadores
    tts/              lectura en voz alta: backends.ts (sistema, Android y servidor de voz local), VoiceServer
  ui/                 Icon, Picker (selector propio, hoja desde abajo en el teléfono)
electron/             main.ts (protocolo mitzi://, ventana, CSP), library.ts (carpetas, fs.watch), updater.ts, preload.cts
scripts/              android.mjs, crear-llave.mjs, publicar.mjs, entorno.mjs (busca Java, SDK, llave y versión)
shared/native-api.ts  tipos del puente Electron
android/app/src/main/java/.../MitziLibraryPlugin.java   carpetas con SAF, escaneo, lectura, 120 Hz
vendor/foliate-js/    submódulo git (motor EPUB). No se modifica: los arreglos van en src/
docs/pruebas/         listas de pruebas que el autor sigue en sus equipos
```

## Cómo funciona por dentro

- **Platform** (`src/platform/types.ts`): `scan()` devuelve `{ files, complete }`; `readBlob(path)` entrega el libro como Blob (en Android el plugin lo copia a la caché y se pide con `fetch(convertFileSrc(...))`). Si una carpeta no se pudo recorrer (`complete: false`), no se da ningún libro por perdido.
- **Escáner** (`library/scanner.ts`): identifica cada libro por SHA-256 (por bloques en Android), con límite de 90 s por libro y un reintento por sesión de los que fallaron. Los fallos quedan en `db.files` con el motivo y se muestran en «N libros no se pudieron leer». Las portadas van aparte en `db.covers`; si el EPUB no declara portada se usa la imagen de su primera página.
- **Base de datos** (`library/db.ts`, Dexie, versión 5: v4 marcadores, v5 `readingDays`): agregar un campo **indexado** o una tabla requiere una versión nueva; un campo opcional sin índice no.
- **Formatos** (`library/formats.ts`): EPUB, MOBI/AZW/AZW3, FB2 y CBZ los abre foliate; PDF, pdf.js. Los de maquetación fija (CBZ, `view.isFixedLayout`) no reciben estilos ni hoja que gira. Al agregar un formato: `formats.ts`, `BOOK_EXT` de `vite.config.ts`, `BOOK_EXTENSIONS` del plugin de Android y los filtros de `AndroidManifest.xml`.
- **Separación silábica** (`engines/hyphenate.ts`): al cargar cada capítulo se insertan guiones suaves (librería `hyphen`), porque Chromium en Windows no trae diccionarios. Se insertan siempre (con la opción apagada, `hyphens: none`) para que los CFI no cambien al activarla. La búsqueda de foliate los ignora; la selección y la voz los quitan.
- **Actualizaciones** (`app/updates.ts`, `electron/updater.ts`, `installUpdate` del plugin): se pregunta a la API de Releases de GitHub una vez al día; se descarga el `.exe` o `.apk`, se compara su SHA-256 con `SHA256SUMS.txt` y se instala. Solo se aceptan URL de `github.com/luisnajm26-creator/mitzi/releases/download/`. En Electron solo funciona en la app instalada.
- **Firma del APK** (`android/app/build.gradle`): la versión sale de `package.json`; si existe `~/.mitzi/keystore.properties`, release **y debug** se firman con esa llave (así las actualizaciones se instalan encima). Cambiar de llave obliga a desinstalar.
- **Estadísticas** (`library/stats.ts`): cada cambio de página suma el tiempo desde el anterior si fue menos de 3 min; foliate avisa dos veces por página, así que solo cuenta páginas con 400 ms o más de diferencia.
- **Voces naturales** (`tts/backends.ts`): en la PC se combinan las voces del sistema con las de un servidor local con la API de OpenAI (`/v1/audio/voices`, `/v1/audio/speech`; ids con prefijo `srv:`). Si el servidor no responde, esa oración se lee con la voz del sistema. En Android no se ofrece: el servidor corre en una PC y Android bloquea las conexiones `http` sin cifrar.
- **Arranque** (`app/App.tsx`, `index.html`, `app/splash.ts`): la pantalla de inicio está en `index.html` para verse al instante; se quita cuando el libro central del carrusel ya está dibujado. Recién entonces se revisan las carpetas y se precarga el lector.
- **Lector EPUB**: foliate pagina cada capítulo como columnas CSS dentro de un iframe. El evento `load` llega antes de maquetar; `plates.ts` reacciona a los cambios de estilo de `<html>` (cuando foliate maqueta) para agrandar las ilustraciones.
- **Hoja que gira** (`pageTurn/PageFlip.ts`): copias exactas de las páginas (iframes «fantasma» que clonan el capítulo) recortadas por la línea del doblez. Cada hoja es caja › recorte › contenido, y en cada cuadro **solo cambian transformaciones** (nada de `clip-path`): así va fluida a 120 Hz en el teléfono. Con una sola página, el reverso es papel liso.
- **Libro abierto** (`layouts/OpenBook.tsx`): el relieve (cantos de hojas) depende del progreso; la sombra del lomo es un degradado que la hoja que cae también copia.
- **Gesto atrás** (`app/back.ts`): cada panel abierto se registra con `useBackHandler`; atrás y Esc cierran primero lo último que se abrió.

## Trampas conocidas

- **Navegador interno viejo en los Huawei.** No tienen Chrome actualizado: falló `Object.groupBy` (foliate) y ningún EPUB abría. Antes de usar una API de JavaScript reciente, revisar su versión de Chrome y agregar polyfill en `src/lib/polyfills.ts`. pdf.js usa su versión `legacy` cuando faltan APIs (`engines/pdfjs.ts`). En CSS también: las fichas del explorador se desarmaron allí (proporción con `aspect-ratio` dentro de un `<button>` flex) y se arreglaron con el truco clásico del relleno porcentual; para medidas críticas, preferir técnicas antiguas. Para simularlo en el navegador: borrar la API (`delete Object.groupBy`) y probar.
- **foliate vuelve a limitar las imágenes** al ancho de una página cada vez que maqueta: hay que reaplicar los tamaños (ver `plates.ts`, que compara antes de escribir para no entrar en un ciclo).
- **Recortes de la hoja:** cada `.flip-clip` necesita tamaño (lo pone `place()`); sin él la copia quieta desaparece y se ve la página nueva antes de tiempo.
- **Verificar el giro de página** congelándolo: `window.__mitziFlipFreeze = 0.5` (y `__mitziFlipSlow = 10` para verlo lento). Probar hacia adelante y hacia atrás, en libro abierto y en una página (tamaño teléfono), y **leer el texto de cada página** en la captura, no solo que «se vea bien».
- **Frecuencia de pantalla:** pedir 120 Hz al tocar (no al empezar la animación) y mantenerla unos segundos; cambiar de 60 a 120 Hz a mitad del giro lo traba.
- **Vite a veces sirve un módulo viejo** tras muchos cambios: reiniciar el servidor de desarrollo.
- **Gestos dentro del iframe del EPUB:** `epubEngine` frena los toques con `stopImmediatePropagation` para que foliate no pase página por su cuenta. Un gesto nuevo (como pellizcar) debe registrar sus oyentes **antes** de ese bloqueo o nunca recibe los eventos.
- **Panel del navegador oculto:** si la vista previa no está a la vista, `requestAnimationFrame` no corre y el giro de página se queda a medias. No es un error de la app; mostrar el panel antes de probar animaciones.
- **CSP de Electron** (`electron/main.ts`): toda dirección nueva a la que la app haga `fetch` (GitHub, servidor de voz…) debe agregarse a `connect-src`.

## Entorno de esta PC (Windows 11)

- Java: Microsoft OpenJDK 21 en `C:\Program Files\Microsoft\jdk-21*`. Android SDK en `%LOCALAPPDATA%\Android\Sdk` (sin Android Studio). `scripts/android.mjs` los encuentra solo.
- PowerShell 5.1: no hay `&&`; usar `.\gradlew.bat` (no busca en la carpeta actual). Las rutas muy largas fallan: poner scripts auxiliares en `%TEMP%`.
- En Bash, los heredocs con comillas invertidas o apóstrofos a veces fallan, y las barras invertidas pueden quedar a la mitad (rompe expresiones regulares y `\n` en Java o TS): para código con `\`, usar las herramientas de edición de archivos o un script de Python.

## Forma de trabajar

1. El autor prueba en sus equipos (PC, Pura 70 Ultra, MatePad) y reporta con capturas.
2. Antes de entregar: probar en la vista previa del navegador (también a tamaño teléfono), `npm run build`, abrir Electron unos segundos y `npm run android`.
3. Dejar una lista de pruebas en `docs/pruebas/` (número, qué hacer, qué debe pasar).
4. Commit en español y push a `main`.
5. El autor está aprendiendo: las partes sencillas las escribe con guía; en las difíciles, explicar qué se hizo y por qué.
