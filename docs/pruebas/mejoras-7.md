# Pruebas: PDF en Android, selección en PDF y versión de prueba

**Lo que se arregló**
- **Ningún PDF se podía leer en los Huawei** (por eso los de Telegram «se quedaban cargando y al final nada»): el motor de PDF corre una parte aparte (un *worker*) que no recibía los arreglos para el navegador interno viejo. Ahora sí.
- **Al seleccionar texto en un PDF** se pintaba una franja junto al lomo, como si la selección se saliera al medio del libro.
- **El botón de compartir se salía del menú** de selección: ahora el menú toma el ancho de sus botones.

**Versión de prueba:** `release/Mitzi-<versión>-prueba.apk` se instala como otra app, **«Mitzi Prueba»**, junto a tu Mitzi de siempre, sin tocarla. Tiene sus propias carpetas, avance y ajustes, así que puedes probar sin miedo a desacomodar nada. Para instalarla por cable: `npm run android -- --install`; o pasa el APK al teléfono y ábrelo.

Al reportar algo, anota: **número de prueba, dispositivo, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura.

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Instala `Mitzi-0.1.0-prueba.apk` en el teléfono | Aparece un ícono nuevo «Mitzi Prueba»; tu Mitzi de siempre sigue igual, con tus libros y tu avance |
| 2 | En Mitzi Prueba, agrega la carpeta `Download/Telegram` | Los PDF aparecen con su portada en unos segundos cada uno (el aviso «Leyendo libros… N / M» avanza) |
| 3 | Abre uno de esos PDF y pasa varias páginas | Se ve nítido y pasa de página sin trabarse |
| 4 | Abre un PDF grande (más de 100 MB, si tienes) | Tarda más la primera vez, pero aparece; si no, debe salir en «N libros no se pudieron leer» con el motivo, nunca quedarse cargando sin fin |
| 5 | En la PC, selecciona varias líneas de un PDF con el ratón | El resaltado cubre solo el texto; ya no hay una franja punteada junto al lomo |
| 6 | Copia ese texto (Ctrl+C) y pégalo en el Bloc de notas | Las palabras de distintos renglones quedan separadas por un espacio o salto, no pegadas |
| 7 | Selecciona una sola palabra (aparece **Definir**) y luego una frase larga | En los dos casos todos los botones caben dentro del menú, incluido **Compartir** |
| 8 | Abre el panel de **Carpetas** | Dice que muestra EPUB, PDF, MOBI, AZW3, FB2 y CBZ |

## Selección de texto en el teléfono

**Lo que se arregló:** al arrastrar una manija contra el borde de la página, el navegador corría el libro por su cuenta y foliate pasaba de página sin avisar a Mitzi: se seleccionaba texto de otras páginas y el libro quedaba desacomodado. Ahora la selección se queda en la página que ves. Además, el menú de colores ya no tapa las manijas ni se sale de la pantalla.

| # | Haz esto | Debe pasar |
|---|---|---|
| 9 | En el teléfono, mantén presionada una palabra de un EPUB | El menú sale debajo, con los colores arriba y los botones abajo, sin tapar las manijas |
| 10 | Arrastra la manija final hasta el último renglón de la página | La selección llega hasta ahí; el menú se mueve arriba del texto |
| 11 | Sigue empujando la manija contra el borde derecho o de abajo | La selección se queda en el final de la página: no toma texto de la siguiente y el libro no se mueve |
| 12 | Achica la selección arrastrando la manija hacia atrás | Se achica sin saltos |
| 13 | Toca fuera para quitar la selección y pasa de página | Pasa normal y la página queda alineada |
| 14 | En la PC, selecciona un texto con el ratón y pulsa la flecha derecha | Pasa de página normalmente |
