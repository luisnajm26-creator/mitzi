# Pruebas: refuerzo de seguridad (0.3.1)

Nada debería cambiar al usarla: estas pruebas confirman que todo sigue igual después de los cambios de seguridad.

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | Instala la 0.3.1 en la PC (o deja que se actualice sola desde la 0.3.0) | Abre normal: biblioteca, libros EPUB y PDF, hoja que gira |
| 2 | Configuración › Actualizaciones › Buscar actualizaciones | Dice que tienes la última versión (ya no rechaza la dirección de GitHub) |
| 3 | En Android, actualiza a la 0.3.1 desde el aviso de la app | Se descarga, comprueba la huella e instala encima |
| 4 | Sincroniza la PC con el teléfono y la tablet (ya vinculados) | Igual que antes; si alguno tenía la 0.3.0, también funciona |
| 5 | En Android: Configuración › Sincronizar › Mostrar mi código, y vincula otro equipo | Se vinculan normal (la validación nueva del servidor de Android se probó solo compilando) |
| 6 | Opcional: repite el escaneo de ZAP (pasos en el resumen de la sesión) | En `mitzi://` ya no hay rutas fuera de la app; el servidor de sincronización responde 404/400/415 y, tras 10 rechazos, 429 |
