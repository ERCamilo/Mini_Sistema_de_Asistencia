# Mini — conexiones simples y accesibles

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M7 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M7
Controlador compartido TS/JS y CSS de pantallas, con los cuatro tests puros de selección de transporte y guards. El código conserva la agrupación de cuenta/dispositivos SA ya implementada; este slice no escribe en SA ni repite esa implementación. El JS canónico de Mini se copiará como espejo a SA en S7. No se registra el script/CSS ni se modifica `index.html` o precache funcional: la activación Mini queda para M8 y la integración SA para S7.

La evidencia actual verifica estados direct/internet, disponibilidad, bloqueo por operación activa y rechazo de valores desconocidos; no certifica montaje/restauración DOM, QR/cámara, contraste renderizado, agrupación SA real, navegador, Google ni backend. La descripción y resultados siguientes pertenecen al diseño/candidato integrado anterior; no se reproducen ni se presentan como validación de este slice. Sin push, merge, PR ni despliegue autorizado.

## Referencia del candidato integrado

Capturas del usuario: inicio vacío con acciones diminutas, QR separado del formulario, invitación que queda visible después de conectar, contraste incorrecto en temas blancos.

Solo Mini en preview; SA y backend sin cambios. Mantener IDs, autenticación, invitaciones, scopes, revisión humana, almacenamiento y colas. No aplicar personal/asistencia automáticamente.

Inicio vacío: icono de obra, explicación corta y Vincular prominente. Con vínculos: Enviar asistencia y Actualizar personal visibles antes de administración. Alias y respaldos en Mi cuenta; evitar duplicar acciones técnicas.
Invitación: Escanear QR de SA dentro del formulario, pegar código como alternativa, login clásico si hace falta. Cámara denegada o no soportada: Volver y Pegar código de invitación, sin mezclar código+clave de conexión directa. Lectura de QR abre revisión, no canjea automáticamente.
Confirmación y resultado: título según fase real, cuenta y scope reales. Tras canje exitoso pantalla Mini vinculado con Actualizar personal y Volver a conexiones. Acciones protegidas por scope exacto, no seleccionar otra obra silenciosamente.
Contraste: medir texto sobre fondo renderizado en los cinco temas, estados seleccionados, primarios, errores y badges. Mínimo 4.5:1 para texto normal; 3:1 para texto grande, foco/controles visibles y targets44.
Playwright: recorrer vacío/ruta/código/QR/fallback/confirmación/resultado/roster/envío/detalle/cuenta/miembros/alias/desvincular, 360/390 y escritorio. Usar cámara sintética para el circuito y registrar que no es prueba física. Contraste medido, capturas y recorridos de no duplicación/reload/retry antes de publicar.


## Implementado en el candidato integrado anterior (no activado por M7)
- [x] Inicio vacío visual y Vincular con icono y tamaño principal; alias y respaldo en cuenta.
- [x] Enviar asistencia y Actualizar personal al inicio; scope exacto en cada acción.
- [x] QR en formulario de invitación; alternativa de código; fallback de cámara específico para invitaciones.
- [x] Fases ready/preview/linked visibles; resultado con personal y vuelta a conexiones.
- [x] Estado técnico plegado por defecto; resultado/error localizado, incluso al repetir la misma operación.
- [x] Navegación refleja busy, progreso visible y cámara detenida al terminar/volver.
- [x] Foreground semántico en errores/desvincular, warning, selección y autorización; bordes y placeholder de claro/Sol reforzados.
- [x] 641 unit tests; circuito completo y compartir con SA + 3 Minis; contraste medido de texto en 5 temas, 360/390 y escritorio768, objetivos44 y foco de teclado; cámara sintética/denegada/no soportada.
- [x] WebRTC y 4 pruebas de temas; preview Mini publicado y verificado con hashes exactos, Google, QR y 5 temas.

WebRTC: respaldo pasó; primer intento SA+3 Minis recibió 2/3 por un fallo de transporte, repetición sin cambios pasó completa. No se modificó transporte. Smoke público inicial esperó QR sin encontrarlo; repetición sin cambios pasó y verificó los 75 assets exactos y SW. No afirmar estabilidad física de cámara ni ausencia de fallos intermitentes de transporte.

La prueba de cámara usa el dispositivo sintético de Chromium y un detector controlado en la frontera de lectura; valida el flujo de UI, parser, scope, no canje automático y cierre de tracks. No demuestra la lectura física de un QR en un teléfono. Los scripts mini-design originales delegan en la aceptación actual ampliada, para no mantener recorridos obsoletos.
