# Logo de Mitzi: lo que necesita el artista

**Mitzi** es un lector de libros electrónicos y cómics, gratis y de código abierto, para Android y Windows. Su biblioteca se ve como el selector de un videojuego: el libro elegido gira bajo un foco de luz sobre fondo oscuro. Al leer hay temas suaves (crema, pasteles) y una hoja de papel que gira al pasar página.

**Colores actuales** (se pueden cambiar si el artista propone otros):
- fondo de la app: `#0d0b12` (casi negro, un poco morado)
- acento: `#c9b6ff` (lavanda)
- texto claro: `#f3eff8`

## Archivos que hacen falta

| Archivo | Para qué | Detalles |
|---|---|---|
| **Ícono completo** (SVG) | Ícono de Windows, de la ventana y de «Acerca de» | Cuadrado, con su fondo. Se ve a 16 px en la barra de tareas: que se reconozca chico |
| **Primer plano para Android** (SVG) | Ícono adaptable de Android | Cuadrado de 108 × 108, **fondo transparente**, el dibujo dentro del círculo central de 66 × 66 (Android recorta el resto en círculo, gota o cuadrado según el teléfono) |
| **Color de fondo** para Android | Va detrás del primer plano | Un solo color (o un fondo sencillo) |
| **Versión de un color** (SVG, opcional) | Íconos temáticos de Android 13+ | Solo la silueta, en negro sobre transparente |
| **Logotipo con el nombre** (SVG, opcional) | README, pantalla de inicio, redes | «Mitzi» con el símbolo; versión clara y oscura |

Mejor en **SVG** (vectorial). Si solo puede entregar PNG: 1024 × 1024 sin compresión.

## Cómo se cambia en el proyecto

El ícono actual (libro con audífonos sobre la cama, de noche) está hecho en dos capas:

1. Fondo → `resources/icon-background.svg` (108 × 108, ocupa todo)
2. Dibujo → `resources/icon-foreground.svg` (108 × 108, transparente, dentro del círculo central de 66)
3. `npx electron scripts/generar-iconos.mjs` arma con las dos el ícono completo (`public/icon.svg`) y genera los PNG de Android y Windows
4. `npm run android` y `npm run instalador` para verlo en el teléfono y en la PC

**Licencia:** el código de Mitzi es MIT. Acordar con el artista que el logo se pueda usar en el proyecto (y en sus copias) dándole crédito; el crédito va en `src/app/author.ts` (lista `CREDITS`) y en el README.
