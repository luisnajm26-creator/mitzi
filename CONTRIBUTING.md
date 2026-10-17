# Cómo contribuir a Mitzi

¡Gracias por querer ayudar! Mitzi es un proyecto abierto y cualquier aporte suma: código, pruebas en tu dispositivo, ideas o reportes de errores.

## Reglas básicas

- **Nunca subas libros** (EPUB, PDF, etc.) al repositorio, ni siquiera para pruebas. Usa `npm run demo`, que genera libros con texto original, o tus propios archivos en `libros-prueba/` (esa carpeta está ignorada por git).
- **La fluidez es una prioridad.** Las animaciones deben depender del tiempo transcurrido, no del número de cuadros, para verse igual a 60 o 120 Hz. Anima solo `transform` y `opacity`, y no dejes nada dibujándose cuando la pantalla está quieta.
- **Sin servicios de Google obligatorios.** Mitzi debe funcionar en teléfonos sin Google Play Services (por ejemplo, Huawei).
- Escribe la interfaz y los comentarios en español; los nombres en el código pueden ir en inglés.

## Preparar el entorno

```bash
git clone --recursive https://github.com/luisnajm26-creator/mitzi.git
cd mitzi
npm install
npm run demo
npm run dev
```

Antes de abrir un pull request, ejecuta `npm run typecheck` y `npm run build`.

## Reportar un error

Abre un *issue* con:

1. Dispositivo y sistema (por ejemplo, "PC con Windows 11" o "Huawei MatePad 11.5, EMUI").
2. Qué hiciste, qué esperabas y qué pasó.
3. Una captura de pantalla, si se puede.
4. Si el problema es con un libro concreto, describe el archivo (formato, tamaño, editorial), pero **no lo adjuntes**.

## Pull requests

- Un cambio por pull request, con una descripción corta de qué cambia y por qué.
- Si cambias algo visible, agrega una captura.
- Si tu cambio afecta una fase, actualiza su lista en `docs/pruebas/`.
