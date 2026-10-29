# Seguridad

## Reportar un problema

Si encuentras una falla de seguridad en Mitzi, por favor **no abras un issue público**: escribe a luisnajm26@gmail.com con los pasos para reproducirla. Responderé lo antes posible y, una vez corregida, se publicará una versión nueva con el crédito para quien la reportó (si así lo quiere).

## Cómo se protege Mitzi

**Los libros no ejecutan código.** Un EPUB puede traer JavaScript; Mitzi no lo deja correr. La app tiene una política de seguridad de contenido (`shared/csp.ts`) que solo permite el código de la propia app, y los capítulos la heredan. Así, un libro bajado de cualquier lado no puede leer tus notas ni mandar datos a ningún sitio.

**La sincronización entre tus equipos va cifrada.**
- Todo lo que viaja por tu Wi-Fi va cifrado con AES-256-GCM: quien lo capture no puede leerlo ni modificarlo sin que se note.
- Para vincular dos equipos se muestra un código de 8 letras que vale 10 minutos y 5 intentos. La llave del vínculo no viaja: los dos equipos la calculan con un intercambio Diffie-Hellman (curva P-256) en el que también entra el código. Aunque alguien grabara la vinculación y algún día adivinara el código, no podría obtener la llave.
- Cada vínculo tiene su propia llave de 256 bits. Un equipo no vinculado recibe un «no» y no se toca nada; volver a mandar un pedido grabado no cambia nada, porque los datos viejos nunca pisan a los nuevos.
- El servidor que atiende a los otros equipos acepta pedidos de hasta 16 MB y pocas conexiones a la vez, para que nadie en la red pueda trabar la app.
- No hay cuentas ni servidores: los datos van directo de un equipo a otro y nunca pasan por internet.

**Las actualizaciones se comprueban.** Solo se descargan de las versiones publicadas en este repositorio, por HTTPS; la app compara la huella SHA-256 del archivo con `SHA256SUMS.txt`, y Android además exige que el APK esté firmado con la misma llave que la app instalada.

**En la PC**, la página de la app está aislada de Windows (Electron con `contextIsolation` y `sandbox`): solo puede leer libros dentro de tus carpetas de libros y abre los enlaces únicamente en el navegador.

## Lo que depende de ti

- Descarga Mitzi solo desde las [Releases](https://github.com/luisnajm26-creator/mitzi/releases) de este repositorio.
- En la PC, si Windows pregunta por el firewall, permite a Mitzi solo en **redes privadas**: así, en el Wi-Fi de un café, nadie puede hablarle.
- Vincula solo tus propios equipos, y desvincula los que ya no uses (Configuración › Sincronizar).
