# Actualizaciones con progreso visible

Versión 2.17.12.

La descarga prepara una copia verificada antes de ofrecer la instalación. El usuario confirma, se comprueba el guardado y se activa antes de recargar. Las fases muestran animaciones SVG y progreso por archivos cuando existe un total válido; no se inventa un porcentaje de bytes. Movimiento reducido desactiva las animaciones. El arranque de una versión nueva confirmada muestra una sola vez el check de éxito.

La reparación conserva IndexedDB, almacenamiento local, fotos, comprobantes y tutoriales. Descargas bloqueadas, guardado fallido y errores de activación permiten recuperar el control.

## Evidencia

1,212 pruebas unitarias aprobadas; un TODO preexistente sobre fragmentación de mensajes de asistencia de 3.6 MB. Ocho recorridos Chromium de actualización y 80 recorridos adicionales aprobados. Compilación y catálogo aprobados.

Las comprobaciones incluyen funcionamiento offline, fallo de descarga, espera bloqueada, reintento, conservación de datos y accesibilidad. No certifican dispositivos físicos ni autenticación real de servicios externos.

Implementación nueva en TypeScript; los módulos JS generados se incluyen en el commit.
