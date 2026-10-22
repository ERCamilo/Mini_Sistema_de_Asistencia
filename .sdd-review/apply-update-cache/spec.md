# Actualizar ahora renueva la aplicación

- Guardar los datos locales antes de iniciar la instalación. Si falla o se
  cancela el diálogo mientras guarda, no renovar el caché ni recargar.
- Separar guardado, instalación y recarga para mostrar el progreso y distinguir
  un error de almacenamiento de uno de descarga.
- Actualizar/activar el worker y pedirle una renovación confirmada de su caché
  de aplicación, incluso cuando ya esté activo y no haya cambiado su archivo.
- Descargar primero todos los recursos precacheados con una URL única y caché
  HTTP renovado; si falla una descarga, conservar el caché anterior. Tras guardar
  los recursos nuevos, quitar las entradas antiguas del mismo caché.
- No borrar IndexedDB, localStorage, vínculos ni cachés de tutoriales u otros
  usos. El worker confirma por MessageChannel cuándo se puede recargar.
- Pruebas: orden guardar/renovar/recargar, cancelación y errores; recursos viejos
  en el worker ya activo; conservación de empleados/asistencia y cachés ajenos;
  recarga offline después de actualizar; build y novedades coherentes.
