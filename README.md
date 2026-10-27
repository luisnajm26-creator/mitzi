# Mitzi

**Lector de libros EPUB y PDF, gratis y de código abierto, para Android y PC.**

Tu biblioteca se muestra como el selector de un videojuego: el libro elegido gira en el centro bajo un foco de luz, deslizas a los lados para cambiar de libro y el fondo toma los colores de la portada. Al abrirlo, lees con fondos cómodos para la vista (blancos, crema, pasteles y oscuros) y el color del texto se ajusta solo.

> **Mitzi no incluye libros.** Es una app vacía: cada persona agrega sus propios archivos EPUB o PDF y Mitzi los detecta. No distribuimos libros ni contenido con derechos de autor.

## Descargar

En [Releases](https://github.com/luisnajm26-creator/mitzi/releases) están el instalador de Windows (`Mitzi-Setup-x.y.z.exe`) y el APK de Android (`Mitzi-x.y.z.apk`), junto con `SHA256SUMS.txt` para comprobar que los archivos no fueron alterados. Mitzi se actualiza sola desde ahí: avisa cuando hay una versión nueva, la descarga, comprueba su huella y la instala. Descárgala solo de este repositorio.

## Qué hace hoy

- **Biblioteca que se llena sola**: en PC vigila `Documentos\Mitzi Libros` y otras carpetas que elijas; en Android usas el selector de carpetas del sistema o "Abrir con Mitzi". Los libros aparecen y desaparecen sin reiniciar.
- **Formatos**: EPUB, PDF, Kindle (MOBI, AZW, AZW3, sin DRM), FB2 y cómics CBZ.
- **Carrusel 3D**: el libro central gira bajo un haz de luz con polvo flotando; el fondo toma los colores de la portada. Se maneja arrastrando, con la rueda, con las flechas o tocando un libro.
- **Abrir y cerrar un libro**: el libro se pone de frente, la tapa gira sobre el lomo y la cámara entra a la primera página; al salir, se cierra y vuelve al estante.
- **Explorar la biblioteca**: búsqueda por título, autor o serie (sin importar tildes), filtros por estado y formato, libros agrupados por serie (con número de tomo) o por autor, y opción de ver solo una serie en el carrusel. Pensado para bibliotecas de miles de libros.
- **Libro abierto** (PC y tablet en horizontal): tapa dura, dos páginas, sombra en el lomo y un bloque de hojas a cada lado que cambia con tu avance, como un libro de papel. Las ilustraciones ocupan la página entera o se extienden por las dos.
- **Pasar página como papel**: la hoja se dobla desde la esquina y se puede arrastrar con el dedo o el ratón; si la sueltas antes de la mitad, vuelve. Usa copias exactas de las páginas, así el texto nunca salta. Con sonido de papel y vibración leve opcionales.
- **Lectura cómoda**: 17 fondos (claros, 7 pasteles y oscuros) más uno a tu gusto, texto con contraste calculado, 5 tipografías (incluida OpenDyslexic), tamaño, interlineado, márgenes, separación silábica en 7 idiomas, textura de papel, brillo, filtro cálido, modo noche automático y ajustes por libro.
- **Gestos**: pellizcar para cambiar el tamaño de letra y deslizar por el borde izquierdo para el brillo.
- **Tiempo que falta** del capítulo y del libro, ajustado a tu ritmo de lectura.
- **Marcadores, subrayados y notas** en 5 colores, con panel de notas y exportación a Markdown.
- **Compartir citas como imagen**: seleccionas un fragmento y Mitzi arma una tarjeta para historias o publicaciones, con 4 diseños y la letra con la que lees.
- **Buscar dentro del libro**, y **definir o traducir** lo que seleccionas (en Android, con tus apps de diccionario y traducción).
- **Tu lectura**: minutos por día, racha, la última semana, totales y una meta diaria. Todo queda en tu dispositivo.
- **Lectura en voz alta** con las voces del sistema: resalta la oración que lee, pasa de página sola y tiene temporizador para dormir. En la PC también puede usar **voces naturales** de un servidor de voz local, como [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).
- **Android** (probado con Huawei EMUI, sin servicios de Google): pantalla completa, gesto atrás y 120 Hz mientras hay animación.

## En camino

| Fase | Qué trae |
|---|---|
| 8 | Sincronización entre PC y móvil (opcional, con tu propio Supabase gratuito) |

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
| `npm run android` | Compila el APK de Android en `release/` (necesita Java 21 y el Android SDK) |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run instalador` | Crea el instalador de Windows en `release/` |
| `npm run llave` | Crea la llave para firmar el APK (una sola vez; se guarda en `~/.mitzi`, fuera del repositorio) |
| `npm run publicar` | Arma una versión (instalador, APK firmado y `SHA256SUMS.txt`); con `-- --subir` la publica en GitHub |

### Estructura

```
src/
  app/        arranque, pantalla de inicio, gesto atrás, actualizaciones y datos del autor
  platform/   lo que cambia entre PC, Android y navegador (carpetas, archivos, pantalla completa)
  library/    base de datos local, detección de libros, portadas, paletas y estadísticas
  shelf/      carrusel 3D (three.js + react-three-fiber), explorador, «Acerca de» y «Tu lectura»
  reader/     lector: motores EPUB (foliate-js) y PDF (pdf.js), hoja que gira, temas, notas y voz
electron/     proceso principal de la app de PC
vendor/       foliate-js como submódulo
docs/pruebas/ listas de pruebas manuales por fase
```

Los motores de EPUB y PDF comparten una misma interfaz (`src/reader/engines/types.ts`), así la interfaz, el relieve del libro, las notas y la voz no tienen que distinguir el formato.

¿Quieres ayudar? Lee [CONTRIBUTING.md](CONTRIBUTING.md). [CLAUDE.md](CLAUDE.md) es el mapa del proyecto: cómo funciona por dentro y las trampas conocidas.

## Cómo se hizo

Mitzi se hizo con ayuda de Claude, una IA de Anthropic. La idea, el diseño, las decisiones y las pruebas en dispositivos reales (PC con Windows, Huawei Pura 70 Ultra y MatePad 11.5) son mías; la IA escribió gran parte del código. Lo digo abiertamente porque así se programa hoy, y porque este proyecto también es mi forma de aprender: poco a poco voy escribiendo yo las partes nuevas, con su guía.

## Autor

Hola, soy **Luis A.** Hice Mitzi por puro gusto personal, a raíz de mi afición reciente por la lectura. Si te interesa hacer un proyecto juntos, me encantará que me contactes: [GitHub](https://github.com/luisnajm26-creator) · luisnajm26@gmail.com

> *The Universe is, and we are.*

## Créditos

- [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT): motor de EPUB
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0): motor de PDF
- [three.js](https://threejs.org) y [react-three-fiber](https://github.com/pmndrs/react-three-fiber) (MIT): carrusel 3D
- [hyphen](https://github.com/ytiurin/hyphen) (ISC): separación silábica
- Tipografías Literata, Merriweather, Atkinson Hyperlegible Next, Nunito y OpenDyslexic (SIL Open Font License) vía [Fontsource](https://fontsource.org)

## Licencia

[MIT](LICENSE): puedes usar, copiar, modificar y distribuir Mitzi libremente.

---

### English

Mitzi is a free, open-source EPUB and PDF reader for Android and desktop. Your library is shown like a game-console carousel: the selected book spins under a spotlight and the background takes the colors of its cover. The reader focuses on eye comfort, with pastel and dark themes, auto-contrast text and lots of typography options. It reads EPUB, PDF, MOBI/AZW3, FB2 and CBZ, and updates itself from this repository's Releases. Built with the help of Claude (AI): the idea, design and device testing are the author's. **Mitzi ships with no books**: users add their own files. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
