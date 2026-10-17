# Mitzi

**Lector de libros EPUB y PDF, gratis y de código abierto, para Android y PC.**

Tu biblioteca se muestra como el selector de un videojuego: el libro elegido gira en el centro bajo un foco de luz, deslizas a los lados para cambiar de libro y el fondo toma los colores de la portada. Al abrirlo, lees con fondos cómodos para la vista (blancos, crema, pasteles y oscuros) y el color del texto se ajusta solo.

> **Mitzi no incluye libros.** Es una app vacía: cada persona agrega sus propios archivos EPUB o PDF y Mitzi los detecta. No distribuimos libros ni contenido con derechos de autor.

## Qué hace hoy

- **Biblioteca que se llena sola**: vigila una carpeta (en PC, `Documentos\Mitzi Libros`) y muestra los libros que agregas o quitas, sin reiniciar. También puedes arrastrar libros a la ventana o elegir otras carpetas.
- **Carrusel 3D**: el libro central gira bajo un haz de luz con polvo flotando; los demás esperan a los lados. Se maneja arrastrando, con la rueda, con las flechas o tocando un libro.
- **Fondo con los colores del libro**: se extrae la paleta de cada portada y el ambiente cambia suavemente al pasar de un libro a otro.
- **Lector de EPUB**: paginado o deslizando, dos páginas en pantallas anchas, índice, barra de avance y retoma donde te quedaste.
- **Lector de PDF**: una o dos páginas, ajuste a la página o al ancho, y los mismos fondos de color.
- **Lectura cómoda**: 17 fondos (claros, 7 pasteles y oscuros) más uno a tu gusto, texto con contraste calculado, 5 tipografías (incluida OpenDyslexic), tamaño, interlineado, márgenes, ancho de línea, brillo, filtro cálido, modo noche automático por horario y ajustes por libro.

## En camino

| Fase | Qué trae |
|---|---|
| 4 | App de Android (probada en Huawei con EMUI, sin servicios de Google) |
| 5 | Libro abierto a pantalla completa con relieve de hojas que cambia con el avance, y animación de pasar página |
| 6 | Subrayados y notas |
| 7 | Lectura en voz alta |
| 8 | Sincronización entre PC y móvil (opcional, con tu propio Supabase gratuito) |
| 9 | Instaladores (.exe y .apk) en cada Release |

## Fluidez y batería

Mitzi está pensada para verse fluida en pantallas de 60, 90, 120 Hz o más sin calentar el dispositivo:

- Todas las animaciones avanzan según el tiempo real, nunca por cuadros, así van igual en cualquier pantalla.
- La biblioteca deja de dibujar cuando no está en pantalla o cuando no la tocas por un rato.
- Mientras lees no hay animaciones continuas: con la página quieta, la app no gasta GPU.
- Si un equipo no alcanza, la biblioteca baja su resolución sola.

## Para desarrolladores

Necesitas [Node.js](https://nodejs.org) 20 o más reciente y Git.

```bash
git clone --recursive https://github.com/luisnajm26-creator/mitzi.git
cd mitzi
npm install
npm run demo          # crea libros de prueba en libros-prueba/demo
npm run electron:dev  # app de PC
```

`npm run dev` abre la app en el navegador (lee los libros de `libros-prueba/`). Si clonaste sin `--recursive`, ejecuta `git submodule update --init`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en el navegador con recarga en vivo |
| `npm run electron:dev` | App de PC (Electron) en modo desarrollo |
| `npm run build` | Compila todo para producción |
| `npm run electron` | Abre la app de PC con la versión compilada |
| `npm run demo` | Genera libros de prueba con texto original |
| `npm run typecheck` | Revisa los tipos de TypeScript |

### Estructura

```
src/
  platform/   lo que cambia entre PC, Android y navegador (carpetas, archivos, pantalla completa)
  library/    base de datos local, detección de libros, portadas y paletas
  shelf/      carrusel 3D (three.js + react-three-fiber)
  reader/     lector: motores EPUB (foliate-js) y PDF (pdf.js), temas y ajustes
electron/     proceso principal de la app de PC
vendor/       foliate-js como submódulo
docs/pruebas/ listas de pruebas manuales por fase
```

Los motores de EPUB y PDF comparten una misma interfaz (`src/reader/engines/types.ts`), así la interfaz, el relieve del libro, las notas y la voz no tienen que distinguir el formato.

¿Quieres ayudar? Lee [CONTRIBUTING.md](CONTRIBUTING.md).

## Créditos

- [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT): motor de EPUB
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0): motor de PDF
- [three.js](https://threejs.org) y [react-three-fiber](https://github.com/pmndrs/react-three-fiber) (MIT): carrusel 3D
- Tipografías Literata, Merriweather, Atkinson Hyperlegible Next, Nunito y OpenDyslexic (SIL Open Font License) vía [Fontsource](https://fontsource.org)

## Licencia

[MIT](LICENSE): puedes usar, copiar, modificar y distribuir Mitzi libremente.

---

### English

Mitzi is a free, open-source EPUB and PDF reader for Android and desktop. Your library is shown like a game-console carousel: the selected book spins under a spotlight and the background takes the colors of its cover. The reader focuses on eye comfort, with pastel and dark themes, auto-contrast text and lots of typography options. **Mitzi ships with no books**: users add their own files. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
