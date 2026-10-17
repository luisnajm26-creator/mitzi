# Pruebas: tercera ronda de mejoras

Fluidez al pasar página en Android, portadas y diseño del explorador, gesto atrás y pantalla de inicio.

Al reportar algo, anota: **número de prueba, dispositivo, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura o video corto.

APK nuevo: `release/Mitzi-0.1.0-debug.apk`. Instálalo encima del anterior.

## Pasar página fluido (Pura 70 Ultra a 120 Hz y MatePad)

Qué cambió: la hoja ya no se vuelve a pintar en cada cuadro; solo se mueven capas ya pintadas, que la GPU compone. En el teléfono el reverso de la hoja es papel liso (antes era una tercera copia del capítulo). Los 120 Hz se piden al tocar la pantalla, antes de que empiece el giro, y se mantienen unos segundos entre página y página.

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | En el teléfono, desliza el dedo despacio para pasar página | La hoja sigue al dedo sin tirones, pegada al dedo |
| 2 | Pasa varias páginas seguidas, rápido | Cada giro es fluido; no se traba al empezar |
| 3 | Toca el borde derecho para pasar página | El giro arranca enseguida, sin pausa |
| 4 | Pasa al siguiente capítulo | El primer giro del capítulo puede tardar un poco más; los siguientes, fluidos |
| 5 | Pasa una página hacia atrás | La hoja vuelve desde la izquierda, igual de fluida |
| 6 | Pasa páginas hacia adelante y hacia atrás, en la PC y en el teléfono | La página que se queda quieta no cambia hasta que la hoja termina de taparla: el texto nuevo nunca aparece antes de tiempo |
| 7 | MatePad en horizontal (libro abierto) | El giro de la hoja, fluido; la sombra del lomo igual que en la PC |
| 8 | Deja el libro quieto un rato y vuelve a pasar página | Igual de fluido (la pantalla vuelve a 120 Hz al tocarla) |

## Explorador

| # | Haz esto | Debe pasar |
|---|---|---|
| 9 | Abre la lupa y busca los libros que antes salían sin portada (Re:Zero-01 a 05, LN Vol 12 a 15) | Ahora tienen su portada. Al abrir la app, Mitzi las busca en la primera página del libro (puede tardar unos segundos la primera vez) |
| 10 | Si algún libro sigue sin portada | Se ve una portada dibujada con sus colores, título y autor; nada se encima ni se desborda |
| 11 | Mira los nombres de autor largos | Se cortan con «…» dentro de su ficha |
| 12 | Toca **Agrupar**, **Ordenar** o **Formato** | Sube una hoja desde abajo con opciones grandes y una ✓ en la elegida (ya no el menú gris de Android) |
| 13 | Desliza la fila de filtros a los lados | Se desplaza si no cabe en la pantalla |

## Gesto atrás

| # | Haz esto | Debe pasar |
|---|---|---|
| 14 | Abre el explorador y haz el gesto atrás | Se cierra el explorador; sigues en la biblioteca |
| 15 | Abre un menú de **Ordenar** y haz el gesto atrás | Se cierra solo el menú |
| 16 | Abre el panel de carpetas y haz el gesto atrás | Se cierra el panel |
| 17 | En la biblioteca, sin nada abierto, haz el gesto atrás | Sale de la app (como antes) |

## Pantalla de inicio

| # | Haz esto | Debe pasar |
|---|---|---|
| 18 | Cierra Mitzi por completo y ábrela | Ya no aparece el logo viejo: fondo oscuro, luego «Mitzi» aparece letra por letra con un brillo y una línea de carga |
| 19 | Espera | La pantalla se desvanece cuando el libro del centro ya está dibujado; no se ve nada a medio cargar |
| 20 | Mira la biblioteca justo después | Fluida desde el inicio; la revisión de carpetas empieza después de la pantalla de inicio |
| 21 | Abre un libro unos segundos después de iniciar | Se abre rápido (el lector ya quedó cargado en segundo plano) |
| 22 | Abre Mitzi en la PC | La misma pantalla de inicio |
