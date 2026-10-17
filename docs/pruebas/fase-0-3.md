# Pruebas: fases 0 a 3 (PC)

Biblioteca, carrusel 3D y lector con ajustes de comodidad. Todo se prueba en la PC; Android llega en la fase 4.

## Preparar

En una terminal, dentro de `Documents\Mitzi`:

```bash
npm install
npm run demo
npm run electron:dev
```

Se abre la ventana de Mitzi con 4 libros de prueba (3 EPUB y 1 PDF). Copia también algunos de tus libros a `Documents\Mitzi\libros-prueba\`.

Al reportar algo, anota: **número de prueba, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura.

## Biblioteca

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Copia un EPUB a `libros-prueba\` con Mitzi abierto | Aparece en el carrusel en menos de 3 s, con su portada, sin reiniciar |
| 2 | Borra ese archivo | Desaparece del carrusel |
| 3 | Vuelve a copiarlo | Reaparece con el mismo avance de lectura que tenía |
| 4 | Arrastra un EPUB desde el Explorador a la ventana | Se copia a `Documentos\Mitzi Libros` y aparece |
| 5 | Botón de carpeta (arriba a la derecha) → **Agregar carpeta** | Los libros de esa carpeta y sus subcarpetas aparecen |
| 6 | En ese mismo panel, **Quitar** la carpeta agregada | Sus libros desaparecen |
| 7 | Copia un libro con portada muy colorida | El lomo y el fondo toman sus colores |
| 8 | Copia un archivo dañado o renombrado (por ejemplo, un .txt cambiado a .epub) | Mitzi no se cae; ese archivo simplemente no aparece |

## Carrusel 3D

| # | Haz esto | Debe pasar |
|---|---|---|
| 9 | Observa el libro central | Gira despacio bajo un foco de luz, con polvo flotando y sombra en el piso |
| 10 | Arrastra con el ratón a los lados, suelta con fuerza | Cambia de libro con inercia y se acomoda solo en uno |
| 11 | Usa flechas ← →, la rueda del ratón y los botones laterales | Cambia de libro uno por uno |
| 12 | Haz clic en un libro de un lado | Ese libro pasa al centro |
| 13 | Cambia de libro varias veces | El fondo cambia de color con una transición suave, sin saltos |
| 14 | No toques nada durante 30 s | El libro deja de girar y queda de frente. Al mover el ratón vuelve a girar |
| 15 | Con el libro quieto (prueba 14), abre el Administrador de tareas → Rendimiento → GPU | El uso de GPU de Mitzi baja casi a 0 |
| 16 | Si tu monitor es de 120 Hz o más: mueve el carrusel | Se ve igual de fluido o más que a 60 Hz, sin tirones |
| 17 | Haz la ventana muy angosta y luego muy baja | El libro siempre cabe entre la barra de arriba y el título |
| 18 | F11 | Pantalla completa; F11 otra vez la quita |

## Lector

| # | Haz esto | Debe pasar |
|---|---|---|
| 19 | Clic en **Leer** (o Enter) | El libro se acerca, la pantalla se funde y abre el lector |
| 20 | Pasa páginas con → ←, espacio, rueda y clic en los bordes | Avanza y retrocede; clic en el centro muestra u oculta las barras |
| 21 | Ventana ancha / ventana angosta | Dos páginas / una página |
| 22 | Botón de índice | Lista de capítulos; al tocar uno, salta ahí |
| 23 | Arrastra la barra de avance de abajo | Salta a esa parte del libro |
| 24 | Cierra el libro (Esc o flecha ←) y vuelve a abrirlo | Retoma en la misma página; en el carrusel se ve el porcentaje |
| 25 | Abre un libro tuyo con ilustraciones (por ejemplo, una novela ligera) | Las imágenes se ven completas, sin cortarse |
| 26 | Abre el PDF de prueba | Se ve la portada sola y luego dos páginas por pantalla |

## Lectura cómoda (botón **Aa**)

| # | Haz esto | Debe pasar |
|---|---|---|
| 27 | Prueba cada fondo pastel | El texto siempre se lee cómodo, nunca muy claro ni muy oscuro |
| 28 | Prueba los fondos oscuros, incluido **Negro** | Texto claro suave (no blanco puro); las imágenes no se ven invertidas |
| 29 | **Tu color**: elige un color cualquiera, claro u oscuro | El texto se ajusta solo para leerse bien |
| 30 | Cambia tipografía, tamaño (A− / A+), interlineado, márgenes y ancho de línea | Cada cambio se ve al instante y la página no salta a otro capítulo |
| 31 | Espacio entre párrafos: Original / Poco / Medio / Mucho | Cambia la separación |
| 32 | Lectura: **Deslizando** | El libro se lee como una página larga con scroll |
| 33 | Brillo al 40 % y filtro cálido al 60 % | La pantalla se oscurece y se vuelve más cálida |
| 34 | Modo noche automático con "Desde" un minuto antes de la hora actual | Cambia al fondo de noche (puede tardar hasta 1 minuto) |
| 35 | Activa **Solo a este libro**, cambia el fondo y abre otro libro | El otro libro conserva el fondo general |
| 36 | En el PDF: Ajuste **Al ancho** | La página ocupa todo el ancho y se recorre con scroll |
| 37 | En el PDF con fondo pastel y con fondo oscuro | La hoja toma el color del fondo; en oscuro el texto se ve claro |
| 38 | Cierra Mitzi y vuelve a abrirlo | Todos los ajustes se conservan |
