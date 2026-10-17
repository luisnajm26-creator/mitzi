# Pruebas: segunda ronda de mejoras

Lectura de la carpeta en Android, destellos al pasar página y al tocar el centro, y bordes del libro 3D.

Al reportar algo, anota: **número de prueba, dispositivo, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura o video corto.

APK nuevo: `release/Mitzi-0.1.0-debug.apk`. Instálalo encima del anterior (no hace falta desinstalar; se conservan tus carpetas y tu progreso).

## Android: leer la carpeta (Pura 70 Ultra y MatePad)

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Abre Mitzi con el APK nuevo | Arriba aparece «Leyendo libros… N / M» y el contador llega hasta el final sin quedarse trabado. Los libros grandes (20 MB o más) pueden tardar unos segundos cada uno |
| 2 | Mira el carrusel mientras lee | Los libros van apareciendo poco a poco |
| 3 | Si un libro no se puede leer | Mitzi lo deja después de 1,5 minutos como mucho y sigue con el siguiente. Al terminar aparece arriba «N libros no se pudieron leer» |
| 4 | Toca ese aviso | Se ve la lista con el nombre de cada archivo y el motivo. **Mándame una captura de esta lista** |
| 5 | En esa lista, toca **Reintentar** | Vuelve a intentar solo esos libros |
| 6 | Cierra Mitzi por completo (desde recientes) y ábrela otra vez | Los libros siguen ahí y no vuelve a leerlos todos (solo los nuevos o los que cambiaron) |
| 7 | Botón de carpeta → **Agregar carpeta** → elige una subcarpeta con 2 libros | Los 2 libros están en el carrusel y no se pierde ningún otro. Nunca vuelve a «Tu biblioteca está vacía» |
| 8 | Copia un EPUB nuevo a la carpeta con el gestor de archivos y vuelve a Mitzi | Lee solo ese libro y aparece |
| 9 | Borra un libro de la carpeta y vuelve a Mitzi | Desaparece del carrusel |
| 10 | Desliza por el carrusel con más de 30 libros | Fluido; el teléfono no se calienta tras unos minutos |
| 11 | Abre un libro grande (20 MB o más) | Se abre en pocos segundos |

Si algo de esto falla, dime también en qué número se quedó el contador y si la app se cerró sola.

## Destellos al leer (PC y MatePad en horizontal)

| # | Haz esto | Debe pasar |
|---|---|---|
| 12 | Con fondo **Blanco** o **Crema**, pasa varias páginas con → | Sin destello blanco al empezar ni al terminar el giro; la sombra de la hoja aparece y se va suave |
| 13 | Lo mismo con fondo **Negro** o **Noche** | Sin destello blanco ni franjas claras |
| 14 | Arrastra la hoja despacio con el ratón y suéltala | Sin destello al tomarla ni al soltarla |
| 15 | Haz clic (o toca) en el centro del libro varias veces | Las barras de arriba y abajo aparecen y se van con un fundido suave; sin destello negro |

## Bordes del libro 3D

| # | Haz esto | Debe pasar |
|---|---|---|
| 16 | En la biblioteca, mira el libro del centro dar una vuelta completa | El lomo y las esquinas se ven limpios: sin franja con ruido ni parpadeo donde el lomo se une con las tapas |
| 17 | Mira los libros de los lados al cambiar de libro | Igual de limpios |
