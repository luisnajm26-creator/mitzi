# Pruebas: lo nuevo de la fase de ideas

Todo lo que se agregó mientras descansabas: pantalla «Acerca de», actualizaciones desde la app, más formatos, tiempo que falta, marcadores, búsqueda, definir y traducir, separación silábica en la PC, detalles de papel, gestos, estadísticas y voces naturales.

Al reportar algo, anota: **número de prueba, dispositivo, qué hiciste, qué esperabas, qué pasó** y, si puedes, una captura.

> **Antes de empezar en Android:** desinstala el Mitzi viejo **solo si** ya creaste tu llave con `npm run llave` (el APK nuevo va firmado con ella y Android no deja instalarlo encima de uno firmado con otra llave). Se pierde el avance guardado en el teléfono; pasa una sola vez. Si todavía no creas la llave, instálalo encima como siempre.

## Acerca de y actualizaciones

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | En la biblioteca, toca el botón **ⓘ** de arriba a la derecha | Se abre «Acerca de Mitzi» con el ícono, la versión 0.1.0, tu nombre y tu tarjeta de contacto |
| 2 | Toca **¿Tienes un proyecto? Hablemos** | Abre tu perfil de GitHub (cuando pongas tu correo en `src/app/author.ts`, abrirá un correo nuevo) |
| 3 | Lee el texto sobre cómo se hizo Mitzi | Dice que se hizo con ayuda de Claude y qué parte es tuya; corrígelo a tu gusto en `About.tsx` |
| 4 | Abre **Créditos y licencias** | Aparecen foliate-js, pdf.js, three.js, hyphen y las tipografías con su licencia |
| 5 | Toca **Buscar actualizaciones** (PC instalada con el instalador, o Android) | Como todavía no hay versiones publicadas: «Tienes la última versión.» |
| 6 | En la PC, ejecuta `npm run instalador` e instala `release/Mitzi-Setup-0.1.0.exe` | El instalador deja elegir la carpeta, se instala en tu usuario (sin pedir administrador), crea el acceso directo y Mitzi abre con tus libros |

## Formatos

| # | Haz esto | Debe pasar |
|---|---|---|
| 7 | Pon en tu carpeta un libro **MOBI o AZW3** (Kindle, sin DRM) | Aparece con su portada y se lee como un EPUB: temas, letra y hoja que gira |
| 8 | Pon un libro **FB2** | Igual que el anterior |
| 9 | Pon un cómic **CBZ** | Aparece con la primera página de portada; se ve a página completa, sin temas de texto ni hoja que gira |
| 10 | En el explorador, abre el filtro de formato | Solo aparecen los formatos que tienes en tu biblioteca |
| 11 | En Android, toca un MOBI o CBZ desde el gestor de archivos | Mitzi aparece en «Abrir con» y lo abre |

## Mientras lees

| # | Haz esto | Debe pasar |
|---|---|---|
| 12 | Lee unas páginas y mira la barra de abajo | Dice cuánto falta del capítulo y del libro (p. ej. «10 min de capítulo · 3 h 34 min del libro»); tras leer un rato se ajusta a tu ritmo |
| 13 | Toca el **marcador** de arriba | Se rellena; en **Marcadores, subrayados y notas** aparece la página con su comienzo |
| 14 | Vete a otra parte, abre el panel y toca el marcador | Vuelves a esa página. Tocar de nuevo el marcador arriba lo quita |
| 15 | Toca la **lupa** (o Ctrl+F en la PC) y busca una palabra con o sin tilde | Lista de resultados con el texto alrededor; al tocar uno, salta y la palabra queda resaltada |
| 16 | Selecciona una palabra y toca **Definir** | Android: te ofrece tus apps de diccionario. PC: abre la RAE con esa palabra |
| 17 | Selecciona una frase y toca **Traducir** | Android: tus apps de traducción. PC: DeepL con la frase |
| 18 | En la PC, activa **Aa › Separar palabras con guiones** con texto justificado | Las palabras largas se parten con guion al final de la línea y ya no quedan huecos grandes entre palabras |
| 19 | Busca una palabra que quedó partida con guion | La búsqueda la encuentra igual |

## Papel, sonido y gestos

| # | Haz esto | Debe pasar |
|---|---|---|
| 20 | Mira la página de cerca con **Textura de papel** activada | Un grano muy suave, como papel; al desactivarla, la página queda lisa |
| 21 | Llega al final de un capítulo | Debajo del último párrafo aparece un pequeño adorno |
| 22 | Mira las barras de arriba y abajo con distintos libros | Toman un tinte suave del color de la portada |
| 23 | Activa **Sonido de papel** y pasa páginas | Un roce suave y corto en cada giro, no molesto |
| 24 | En Android, con **Vibración al pasar página** activada | Un toque muy leve al terminar el giro |
| 25 | Pellizca la página con dos dedos (abre o cierra) | Aparece una burbuja con el tamaño de letra; al soltar, el texto toma ese tamaño |
| 26 | Desliza hacia arriba o abajo pegado al **borde izquierdo** | Aparece la burbuja de brillo y la página se aclara u oscurece |
| 27 | Pasa páginas rápido después de los gestos | El giro sigue fluido a 120 Hz; los gestos no se disparan al pasar página normal |

## Tu lectura

| # | Haz esto | Debe pasar |
|---|---|---|
| 28 | Lee unos minutos, vuelve a la biblioteca y toca el botón de **gráfica** de arriba | «Tu lectura» muestra los minutos de hoy, la racha, las barras de la semana y los totales |
| 29 | Elige una **Meta diaria** (p. ej. 10 min) y vuelve a leer | Al cumplirla aparece en el lector «¡Cumpliste tu meta de hoy!», una sola vez al día |
| 30 | Deja el libro abierto sin tocar más de 3 minutos | Ese tiempo no cuenta como lectura |

## Voces naturales (solo PC)

Necesitas un servidor de voz abierto en tu PC. El más sencillo es [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) (gratis, tiene voces en español como `ef_dora` y `em_alex`); se abre con Docker:

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

| # | Haz esto | Debe pasar |
|---|---|---|
| 31 | Con el servidor abierto, en el lector ve a **Aa › Voces naturales** y toca **Probar conexión** | «Conectado: N voces» |
| 32 | Toca **Leer en voz alta** y elige una voz «· natural» | Lee con esa voz, resalta cada oración y pasa de página sola |
| 33 | Cierra el servidor a mitad de la lectura | Sigue leyendo con la voz del sistema, sin saltarse oraciones |
| 34 | Pausa mientras lee con la voz natural | Se calla al momento y al reanudar repite la oración |

> Con una voz natural puede haber una pausa corta entre oraciones mientras el servidor genera el audio (más larga sin tarjeta gráfica).
