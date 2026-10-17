# Pruebas: fases 4 a 7

Animación de abrir libros, libro abierto con relieve, pasar página, app de Android, subrayados con notas y lectura en voz alta.

Al reportar algo, anota: **número de prueba, dispositivo, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura o video corto.

## Instalar Mitzi en el Huawei (Pura 70 Ultra / MatePad 11.5)

1. En la PC, dentro de `Documents\Mitzi`, ejecuta `npm run android`. Al terminar queda el archivo `release\Mitzi-0.1.0-debug.apk` (ya hay uno listo).
2. Pásalo al teléfono (cable USB, Huawei Share o la nube).
3. En el teléfono, ábrelo desde **Archivos**. Si aparece un aviso:
   - Permite **Instalar aplicaciones desconocidas** para la app Archivos.
   - Si tienes el **Modo puro** activado (Ajustes → Sistema y actualizaciones → Modo puro), desactívalo un momento para instalar.
4. Abre Mitzi → **Elegir carpeta** → elige la carpeta donde tienes tus EPUB o PDF.
5. Para 120 Hz: Ajustes → Pantalla y brillo → Frecuencia de actualización → **Dinámica** o **Alta**.

Con depuración USB activada y el teléfono conectado, `npm run android -- --install` lo instala directo.

## Abrir un libro (PC y Android)

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Toca el libro del centro (o **Leer**) | El libro se pone de frente, la tapa gira sobre el lomo, se ve la guarda de color y la portadilla con el título, y la cámara entra a la página |
| 2 | Toca un libro de un lado | Solo pasa al centro, no se abre |
| 3 | Abre varios libros seguidos | La animación es fluida cada vez, sin tirones |

## Libro abierto y pasar página (PC y MatePad en horizontal)

| # | Haz esto | Debe pasar |
|---|---|---|
| 4 | Abre un EPUB en una ventana horizontal | Se ve un libro abierto sobre una mesa oscura: tapa dura del color de la portada, dos páginas y sombra en el lomo |
| 5 | Mira los bordes de las hojas al inicio del libro | Casi todo el grosor de hojas está a la derecha |
| 6 | Salta al 50 % con la barra de avance | Los dos bloques de hojas se ven parecidos |
| 7 | Salta al final | Casi todo el grosor queda a la izquierda |
| 8 | Pasa página con →, rueda, clic en el borde derecho | La hoja derecha gira sobre el lomo mostrando por detrás la página nueva |
| 9 | Retrocede con ← | La hoja vuelve desde la izquierda |
| 10 | Presiona → muchas veces rápido | No se traba: cada vuelta termina y empieza la siguiente |
| 11 | Pasa de un capítulo al siguiente | La hoja gira igual (puede tardar un poco más) |
| 12 | Ajustes **Aa** → desactiva **Animación al pasar página** | Las páginas cambian al instante |
| 13 | Ajustes → Pantallas anchas: **Una página** | Se quita el libro abierto y se lee a una columna |
| 14 | Abre un PDF en horizontal | Portada sola a la derecha; luego dos páginas por vista, con el mismo giro de hoja |

## Android (Pura 70 Ultra en vertical, MatePad)

| # | Haz esto | Debe pasar |
|---|---|---|
| 15 | Primera vez: **Elegir carpeta** | Se abre el selector de Android; al elegir, los libros aparecen en el carrusel |
| 16 | Copia un libro nuevo a esa carpeta y vuelve a Mitzi | Aparece al volver a la app |
| 17 | Desde el gestor de archivos, toca un EPUB → **Abrir con Mitzi** | El libro se agrega a la biblioteca |
| 18 | Desliza el carrusel con el dedo | Sigue al dedo, con inercia, fluido a 120 Hz |
| 19 | Abre un libro | Pantalla completa sin barras del sistema; al volver a la biblioteca regresan |
| 20 | Toca los bordes / desliza para pasar página | En vertical la hoja gira sobre el borde izquierdo; deslizar mueve la página con el dedo |
| 21 | Botón o gesto **atrás** | En el lector vuelve a la biblioteca; en la biblioteca sale de la app |
| 22 | MatePad en horizontal | Se ve el libro abierto de dos páginas |
| 23 | Deja la biblioteca quieta 1 minuto | El libro deja de girar y el teléfono no se calienta |
| 24 | Lee 10 minutos | El teléfono no se calienta y la batería baja como con cualquier lector |

## Subrayados y notas

| # | Haz esto | Debe pasar |
|---|---|---|
| 25 | Selecciona texto (arrastrando en PC, mantener presionado en Android) | Aparece un menú con 5 colores, nota y copiar |
| 26 | Elige un color | El texto queda subrayado con ese color |
| 27 | Toca el subrayado | Menú para cambiar color, escribir nota o borrar |
| 28 | Agrega una nota y guárdala | La nota aparece al tocar el subrayado |
| 29 | Botón de marcador (arriba) | Panel con todos los subrayados ordenados, con capítulo y nota |
| 30 | Toca un subrayado en el panel | Salta a esa parte del libro |
| 31 | **Copiar como Markdown** y pégalo en un bloc de notas | Título, capítulos, citas y notas bien ordenados |
| 32 | Cambia el fondo a oscuro | Los subrayados se siguen viendo bien |
| 33 | En un PDF, selecciona texto y subráyalo | Funciona igual (si el PDF es una imagen escaneada no tiene texto para seleccionar) |
| 34 | Cierra y vuelve a abrir el libro | Los subrayados siguen ahí |

## Lectura en voz alta

| # | Haz esto | Debe pasar |
|---|---|---|
| 35 | Botón de bocina (arriba) | Empieza a leer desde la página que ves; la oración actual se resalta en azul |
| 36 | Deja que siga | Pasa de página y de capítulo sola |
| 37 | Pausa y reanuda | Retoma desde la oración en curso |
| 38 | Botones ‹ › de la barra | Oración anterior / siguiente |
| 39 | Cambia la velocidad (1.0×, 1.2×…) | Se aplica desde la siguiente oración |
| 40 | Elige otra voz | Lee con esa voz |
| 41 | **Temporizador** → 15 min | Deja de leer solo a los 15 minutos |
| 42 | En el Huawei | Si no lee nada, el teléfono no tiene un motor de voz en español: instala uno (AppGallery) y avísame qué pasó |
