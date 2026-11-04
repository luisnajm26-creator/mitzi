# Pruebas: Mitzi en Ubuntu

El paquete de prueba se descarga de GitHub: **Actions › Linux** › la ejecución más reciente › **Artifacts › mitzi-ubuntu** (necesitas tu sesión de GitHub). Es un `.zip` con `Mitzi-x.y.z.deb` adentro.

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Descomprime el `.zip` y abre `Mitzi-x.y.z.deb` con doble clic (o en la terminal: `sudo apt install ./Mitzi-x.y.z.deb`) | Se instala con tu contraseña; Mitzi aparece en el menú de aplicaciones con su ícono |
| 2 | Abre Mitzi desde el menú | Abre la biblioteca 3D; en el dock se ve el ícono de Mitzi (no un engrane genérico) |
| 3 | Configuración › Carpetas: agrega la carpeta donde tienes tus libros | Aparecen los libros con portada. La carpeta propia de Mitzi es `~/Documentos/Mitzi Libros` |
| 4 | Arrastra un EPUB desde Archivos a la ventana | Se copia a `Mitzi Libros` y aparece en la biblioteca |
| 5 | Abre un EPUB y un PDF, pasa varias páginas | La hoja gira fluida y el relieve del libro cambia |
| 6 | Pantalla completa (botón del lector) | Ocupa toda la pantalla y vuelve al salir |
| 7 | Lectura en voz alta | Hay al menos una voz del sistema (en Ubuntu suenan robóticas; las naturales necesitan el servidor de voz local) |
| 8 | Comparte una cita › Guardar y › Copiar; pega en otra app | Se guarda el PNG en `~/Imágenes` y se pega la imagen |
| 9 | Configuración › Sincronizar: vincula la laptop con el teléfono (QR o código) | Se vinculan; al avanzar en uno, el otro se pone al día |
| 10 | Activa «Mantener en la bandeja» y cierra la ventana | El ícono de Mitzi queda arriba a la derecha; su menú › Abrir Mitzi la regresa |
| 11 | Abre Mitzi otra vez desde el menú mientras ya está abierta | No se abre otra copia: se muestra la que ya estaba |
| 12 | Desinstala (`sudo apt remove mitzi`) y vuelve a instalar | Tus libros, notas y avances siguen ahí (viven en `~/.config/Mitzi`) |
| 13 | Cuando se publique la siguiente versión: Configuración › Actualizaciones › Buscar | Ofrece la nueva, pide tu contraseña en la ventana del sistema, se instala y Mitzi se vuelve a abrir |
