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
| `npm run android` | Compila web, `cap sync` y `gradlew assembleDebug`; deja `release/Mitzi-<versión>-prueba.apk`, que se instala como otra app («Mitzi Prueba», id `….mitzi.prueba`) junto a la oficial. Con `-- --install` lo instala por USB; con `-- --release`, el APK firmado para publicar |
| `npm run instalador` | `build` + electron-builder: `release/Mitzi-Setup-<versión>.exe` (NSIS, por usuario) |
| `npm run llave` | Crea la llave de firma del APK en `~/.mitzi` (fuera del repo). La crea el autor, una sola vez, y la respalda |
| `npm run publicar` | Instalador + APK firmado + `SHA256SUMS.txt`; con `-- --subir` crea el Release en GitHub. Las novedades van en `docs/versiones/x.y.z.md`. **Solo cuando el autor lo pide** (es público) |
| `npm run demo` | Genera libros de prueba en `libros-prueba/demo` |
| `npx electron scripts/generar-iconos.mjs` | Regenera los íconos PNG desde los SVG |
| `npx electron scripts/capturas.mjs` | Capturas del README con los libros de `npm run demo` (con `npm run dev` abierto; `SOLO=pc` o `SOLO=telefono`). Se eligen a mano y se pasan a WebP en `docs/capturas/` |
| `npx electron scripts/gif-hoja.mjs` | `docs/capturas/hoja.gif`: el libro abierto y la hoja que gira, grabados de la app (con `npm run dev` abierto) |

`postinstall` copia los recursos de pdf.js a `public/pdfjs/` y la letra de títulos a `public/fonts/` (ambas carpetas ignoradas por git).

## Mapa del código

```
src/
  main.tsx            importa primero lib/polyfills (navegadores internos viejos)
  app/                App (arranque y orden de carga), store (vista actual), back.ts (gesto atrás y Esc), splash.ts,
                      updates.ts (actualizaciones), author.ts (datos del autor y créditos), settings.ts (ajustes de la app)
  platform/           Platform: una implementación por plataforma (web, electron, android); index.ts elige
  library/            db.ts (Dexie), scanner.ts (carpetas → libros), metadata.ts (título, portada, serie),
                      formats.ts, palette.ts, series.ts, query.ts (filtros/grupos del explorador), store.ts,
                      collections.ts, stats.ts (minutos por día y dispositivo), statsSummary.ts (cálculos de Tu lectura)
  shelf/              Shelf (biblioteca), Shelf3D + textures + LightRig + carousel (three.js),
                      Explorer (buscador), AmbientBackground, Settings (Configuración y sus secciones: Folders,
                      Collections, SyncPanel, About), StatsPanel, UpdateToast
  sync/               sincronizar por Wi-Fi: snapshot.ts (qué se manda y cómo se une), crypto.ts, session.ts, device.ts
  reader/             Reader.tsx (pantalla de lectura, gestos, barras, paneles), SearchPanel, pace.ts
                      (tiempo que falta), lookup.ts (definir/traducir), paperSound.ts (hojas grabadas de public/sounds, CC0)
    engines/          ReaderEngine: epubEngine (foliate-js), pdfEngine + pdfjs.ts, plates.ts (láminas),
                      hyphenate.ts (guiones suaves)
    pageTurn/         PageFlip (hoja que gira), geometry (doblez), epubGhost (copias del capítulo)
    layouts/          OpenBook (libro abierto: tapa, cantos, sombra del lomo)
    comfort/          temas, contraste automático, fuentes, ajustes, CSS que se inyecta al EPUB
    annotations/      subrayados, notas y marcadores
    share/            tarjetas para compartir: designs.ts (colores y formatos), card.ts (cita y piezas comunes: fondo,
                      marca, letra), statsCard.ts (Mi semana / Mi mes), ShareShell (vista previa y botones), ShareSheet
    tts/              lectura en voz alta: backends.ts (sistema, Android y servidor de voz local), VoiceServer
  ui/                 Icon, Picker (selector propio, hoja desde abajo en el teléfono), controls (interruptores,
                      deslizadores; los usan el panel Aa y Configuración con los colores --r-*)
electron/             main.ts (protocolo mitzi://, ventana, CSP), library.ts (carpetas, fs.watch), updater.ts,
                      sync.ts (servidor de la sincronización), preload.cts
scripts/              android.mjs, crear-llave.mjs, publicar.mjs, entorno.mjs (busca Java, SDK, llave y versión)
shared/native-api.ts  tipos del puente Electron
android/app/src/main/java/.../MitziLibraryPlugin.java   carpetas con SAF, escaneo, lectura, 120 Hz
vendor/foliate-js/    submódulo git (motor EPUB). No se modifica: los arreglos van en src/
docs/pruebas/         listas de pruebas que el autor sigue en sus equipos
```

## Cómo funciona por dentro

- **Platform** (`src/platform/types.ts`): `scan()` devuelve `{ files, complete }`; `readBlob(path)` entrega el libro como Blob (en Android el plugin lo copia a la caché y se pide con `fetch(convertFileSrc(...))`). Si una carpeta no se pudo recorrer (`complete: false`), no se da ningún libro por perdido.
- **Escáner** (`library/scanner.ts`): identifica cada libro por SHA-256 (por bloques en Android), con límite de 90 s por libro y un reintento por sesión de los que fallaron. Los fallos quedan en `db.files` con el motivo y se muestran en «N libros no se pudieron leer». Las portadas van aparte en `db.covers`; si el EPUB no declara portada se usa la imagen de su primera página.
- **Base de datos** (`library/db.ts`, Dexie, versión 6: v4 marcadores, v5 `readingDays`, v6 `collections`): agregar un campo **indexado** o una tabla requiere una versión nueva; un campo opcional sin índice no. Lo que se sincroniza nunca se borra de verdad: se marca `deleted` con `updatedAt` (notas, marcadores, colecciones), si no el borrado no llega al otro equipo y el registro reaparece.
- **Formatos** (`library/formats.ts`): EPUB, MOBI/AZW/AZW3, FB2 y CBZ los abre foliate; PDF, pdf.js. Los de maquetación fija (CBZ, `view.isFixedLayout`) no reciben estilos ni hoja que gira. Al agregar un formato: `formats.ts`, `BOOK_EXT` de `vite.config.ts`, `BOOK_EXTENSIONS` del plugin de Android y los filtros de `AndroidManifest.xml`.
- **Separación silábica** (`engines/hyphenate.ts`): al cargar cada capítulo se insertan guiones suaves (librería `hyphen`), porque Chromium en Windows no trae diccionarios. Se insertan siempre (con la opción apagada, `hyphens: none`) para que los CFI no cambien al activarla. La búsqueda de foliate los ignora; la selección y la voz los quitan.
- **Actualizaciones** (`app/updates.ts`, `electron/updater.ts`, `installUpdate` del plugin): se pregunta a la API de Releases de GitHub una vez al día; se descarga el `.exe` o `.apk`, se compara su SHA-256 con `SHA256SUMS.txt` y se instala. Solo se aceptan URL de `github.com/luisnajm26-creator/mitzi/releases/download/`. En Electron solo funciona en la app instalada.
- **Firma del APK** (`android/app/build.gradle`): la versión sale de `package.json`; si existe `~/.mitzi/keystore.properties`, release **y debug** se firman con esa llave (así las actualizaciones se instalan encima). Cambiar de llave obliga a desinstalar.
- **Estadísticas** (`library/stats.ts`): cada cambio de página suma el tiempo desde el anterior si fue menos de 3 min; foliate avisa dos veces por página, así que solo cuenta páginas con 400 ms o más de diferencia. Cada día guarda la parte de cada dispositivo (`devices`, por `deviceId()`) además del total: al sincronizar se queda la parte más grande de cada uno y se vuelve a sumar, así nada se cuenta doble. Los días de antes de la 0.3 no tienen `devices` (`devicesOf` los atribuye a este equipo).
- **Sincronizar** (`sync/`, `electron/sync.ts`, `syncServe`/`syncRequest`/`syncDiscover` del plugin): todos los equipos son iguales (`links.ts`: `peers`). **Vincular** (una vez por par): uno muestra un código (`host.ts`, 10 min, 5 intentos) y el QR `MITZI1:ips:puerto:código`; el otro manda su `Snapshot` cifrado con AES-GCM (llave por PBKDF2 del código, sobre `v:1`) y recibe una llave nueva de 32 bytes. Desde ahí todo va con esa llave (sobre `v:2` con `from`: el id del equipo, para elegir su llave). Cada equipo **atiende** (puerto 47123, y responde por UDP a `MITZI?` para que lo encuentren si cambia de dirección) mientras tenga vínculos: la PC con Electron, Android con un servidor mínimo en el plugin que le pasa cada pedido a la página (`syncIncoming`/`syncReply`), porque los datos viven en su IndexedDB. Y cada uno **busca** a todos (`auto.ts`) al abrir, al volver (no más de una vez cada 20 s) y al cerrar un libro; lo que llega de uno se pasa al siguiente en cadena. Tras unir se dispara `mitzi:sincronizado` y el lector ofrece ir a la página si su libro avanzó en otro equipo. Unir es simétrico (gana el `updatedAt` más nuevo; colecciones libro por libro). Android manda por un socket propio porque bloquea el `http` sin cifrar; la cámara lee el QR con jsQR. Opcionales: «Mantener en la bandeja» en la PC (`setTray` en `electron/main.ts`) y «Seguir atenta en segundo plano» en Android (`SyncKeepAlive.java`: servicio con aviso fijo y Wi-Fi despierto; Capacitor deja correr la página en segundo plano porque `KeepRunning` vale true).
- **Voces naturales** (`tts/backends.ts`): en la PC se combinan las voces del sistema con las de un servidor local con la API de OpenAI (`/v1/audio/voices`, `/v1/audio/speech`; ids con prefijo `srv:`). Si el servidor no responde, esa oración se lee con la voz del sistema. En Android no se ofrece: el servidor corre en una PC y Android bloquea las conexiones `http` sin cifrar.
- **Compartir citas** (`reader/share/`): la tarjeta se dibuja en un canvas con la letra del lector, que antes se registra con `FontFace` en la página (las del libro viven en el iframe y el canvas no las ve). Android la manda al menú de compartir (`shareImage` del plugin, por FileProvider); en la PC se guarda o copia por IPC (`image:save`, `image:copy`; Electron 44 usa `clipboard.write` con `ClipboardItem`).
- **Licencias** (`vite.config.ts`, plugin `mitzi-licencias`): al compilar escribe `dist/licencias.txt` con la licencia de cada paquete que entró al bundle, más `docs/licencias-extra.txt` (sonidos, patrones de guiones, librerías dentro de foliate, Android). Todo recurso ajeno que no venga de npm se anota ahí. Se lee en «Acerca de» › Créditos y licencias.
- **Arranque** (`app/App.tsx`, `index.html`, `app/splash.ts`): la pantalla de inicio está en `index.html` para verse al instante; se quita cuando el libro central del carrusel ya está dibujado. Recién entonces se revisan las carpetas y se precarga el lector.
- **Lector EPUB**: foliate pagina cada capítulo como columnas CSS dentro de un iframe. El evento `load` llega antes de maquetar; `plates.ts` reacciona a los cambios de estilo de `<html>` (cuando foliate maqueta) para agrandar las ilustraciones.
- **Hoja que gira** (`pageTurn/PageFlip.ts`): copias exactas de las páginas (iframes «fantasma» que clonan el capítulo) recortadas por la línea del doblez. Cada hoja es caja › recorte › contenido, y en cada cuadro **solo cambian transformaciones** (nada de `clip-path`): así va fluida a 120 Hz en el teléfono. Con una sola página, el reverso es papel liso.
- **Libro abierto** (`layouts/OpenBook.tsx`): el relieve (cantos de hojas) depende del progreso; la sombra del lomo es un degradado que la hoja que cae también copia.
- **Gesto atrás** (`app/back.ts`): cada panel abierto se registra con `useBackHandler`; atrás y Esc cierran primero lo último que se abrió.

## Trampas conocidas

- **Navegador interno viejo en los Huawei.** No tienen Chrome actualizado: falló `Object.groupBy` (foliate) y ningún EPUB abría. Antes de usar una API de JavaScript reciente, revisar su versión de Chrome y agregar polyfill en `src/lib/polyfills.ts`. pdf.js usa su versión `legacy` cuando faltan APIs (`engines/pdfjs.ts`). En CSS también: las fichas del explorador se desarmaron allí (proporción con `aspect-ratio` dentro de un `<button>` flex) y se arreglaron con el truco clásico del relleno porcentual; para medidas críticas, preferir técnicas antiguas. Para simularlo en el navegador: borrar la API (`delete Object.groupBy`) y probar.
- **El worker de pdf.js no recibe los polyfills** de la página: el «legacy» de pdf.js 6 usa `Promise.withResolvers` (Chrome 119) y en los Huawei (WebView 114) ningún PDF abría. Por eso arranca desde `engines/pdfWorker.ts`, que carga primero `lib/polyfills`. Todo polyfill nuevo que pdf.js necesite va ahí también.
- **Probar en el teléfono por USB:** `adb` está en `%LOCALAPPDATA%\Android\Sdk\platform-tools`. En Git Bash usar `MSYS_NO_PATHCONV=1` (si no, `/data/local/tmp` se vuelve una ruta de Windows). La consola de la WebView no siempre sale en `logcat` en los Huawei: capturas con `adb exec-out screencap -p`. Probar en «Mitzi Prueba», nunca en la Mitzi oficial del autor.
- **Selección en EPUB paginado:** foliate pasa de página solo si la selección llega al borde, y el navegador corre el contenedor al arrastrar manijas: las dos cosas pasan por fuera de Mitzi. `epubEngine` corta la selección en la página visible (`#keepSelectionInPage`) y regresa el desplazamiento mientras hay selección; toda navegación propia debe ir por `#navigate()` para que esa protección no la frene.
- **Pantalla completa en Android** (`MainActivity`): barra de notificaciones oculta siempre, contenido bajo la cámara (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`) y márgenes seguros que da el plugin (`safeArea`) como `--mitzi-sa-*`; el `insetsHandling` de Capacitor está apagado porque falla en la WebView vieja. El lector solo oculta la barra de navegación. El menú de selección del sistema se vacía en `onActionModeStarted`.
- **Texto seleccionado en PDF:** los `<br>` de pdf.js están ocultos (Chrome pintaba su selección como franja junto al lomo); el texto se arma con `textOf()` en `pdfEngine.ts`, también al copiar.
- **Láminas** (`plates.ts`): un capítulo con una sola imagen (y poco texto) se agranda; si tiene varias seguidas (galería) cada una va en su página con `break-before: column`, y tras una lámina doble se agrega un separador que ocupa la página derecha.
- **foliate vuelve a limitar las imágenes** al ancho de una página cada vez que maqueta: hay que reaplicar los tamaños (ver `plates.ts`, que compara antes de escribir para no entrar en un ciclo).
- **Recortes de la hoja:** cada `.flip-clip` necesita tamaño (lo pone `place()`); sin él la copia quieta desaparece y se ve la página nueva antes de tiempo.
- **Verificar el giro de página** congelándolo: `window.__mitziFlipFreeze = 0.5` (y `__mitziFlipSlow = 10` para verlo lento). Probar hacia adelante y hacia atrás, en libro abierto y en una página (tamaño teléfono), y **leer el texto de cada página** en la captura, no solo que «se vea bien».
- **Frecuencia de pantalla:** pedir 120 Hz al tocar (no al empezar la animación) y mantenerla unos segundos; cambiar de 60 a 120 Hz a mitad del giro lo traba.
- **Vite a veces sirve un módulo viejo** tras muchos cambios: reiniciar el servidor de desarrollo.
- **Gestos dentro del iframe del EPUB:** `epubEngine` frena los toques con `stopImmediatePropagation` para que foliate no pase página por su cuenta. Un gesto nuevo (como pellizcar) debe registrar sus oyentes **antes** de ese bloqueo o nunca recibe los eventos.
- **Panel del navegador oculto:** si la vista previa no está a la vista, `requestAnimationFrame` no corre y el giro de página se queda a medias. No es un error de la app; mostrar el panel antes de probar animaciones.
- **CSP de Electron** (`electron/main.ts`): toda dirección nueva a la que la app haga `fetch` (GitHub, servidor de voz…) debe agregarse a `connect-src`. La sincronización no pasa por la CSP: va por IPC al proceso principal.
- **Ventanas `offscreen` de Electron** (sin GPU) dibujan mal la hoja que gira: salen textos encimados que en la app no existen. Para grabar el giro, una ventana real fuera de la pantalla (ver `scripts/gif-hoja.mjs`). Ojo al revisar el giro: en la parte doblada el texto queda cortado justo en el pliegue y pegado al de la página de abajo; así debe verse.
- **Probar la sincronización sin teléfono:** abrir Electron con `--user-data-dir` aparte (no toca los datos del autor) y `--remote-debugging-port`, mostrar el código y mandarle un `Snapshot` cifrado desde un script de Node con el mismo cifrado. Ojo: `fetch` entiende cualquier respuesta, el lector mínimo de Android no tanto: la respuesta va con `Content-Length` (sin él, Node la manda «por partes» y el teléfono no podía leerla; ahora también sabe unir las partes). Para probar como el teléfono, un socket crudo.
- **Manejar Mitzi Prueba desde la PC:** su WebView se puede depurar por USB. `adb shell pidof io.github.luisnajm26creator.mitzi.prueba`, luego `adb forward tcp:9240 localabstract:webview_devtools_remote_<pid>` y se le habla por el protocolo de depuración de Chrome (`http://127.0.0.1:9240/json`): leer IndexedDB, tocar botones y ver errores. Las capturas, con `adb exec-out screencap -p`.

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
