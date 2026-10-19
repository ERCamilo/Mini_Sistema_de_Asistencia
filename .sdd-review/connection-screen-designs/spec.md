# Pantallas de Conexiones según referencias visuales

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M5 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M5
API de descripción de página/feedback e iconos locales de presentación. El montaje real en el shell requiere el menú y cableado de M7/M8. Los módulos permanecen dormidos: no se registran scripts ni se modifica el precache o `index.html`. Se conserva la implementación del candidato integrado, sin cambiar reglas de datos ni permisos.

La evidencia actual comprende build y 8 tests puros (tracker/monitor, títulos, feedback e iconos mediante fixture). No prueba el montaje real de presentación, notificaciones visibles en la app, navegador, Google ni backend. Esa integración queda para M8 y las pruebas posteriores. La descripción restante es el diseño/candidato integrado de referencia, no activación certificada de este slice. Sin push, merge, PR ni despliegue autorizado.

Referencias: Vinculación entre SA y Mini; Compartir y actualizar personal; Enviar y revisar asistencia: Mini y SA; Detalles, cuenta y desvinculación (4 octubre 2026).

Aplicar las tarjetas de método, contexto de obra/grupo, selección de personal con búsqueda y conteo, confirmación de vínculo con capacidades reales, vista previa de asistencia, detalle de vínculo, cuenta y confirmación de desvinculación. Un único shell y acción primaria por pantalla; cuenta compacta en tareas y vista de cuenta dedicada. Conservar DOM/IDs/handlers existentes, decisiones explícitas, permisos por dispositivo, scopes, colas y sesiones. No introducir salarios, credenciales, acceso automático ni estados ficticios. No prometer conexión directa sin internet. Usar desvincular, no papelera.

La vista previa de envío deriva del payload real del grupo/fecha obteniendo roster autorizado; no encola ni envía. El envío confirma datos vigentes de nuevo. Búsqueda no desmarca filas ocultas. Los detalles conservan identidad por scope/ID después de refrescar y las acciones se resuelven de nuevo. Cuenta usa datos reales de sesión, nunca nombres de ejemplo. Los pasos nativos de revisión mantienen sus decisiones y protecciones; se adapta presentación sin reimplementar reglas de conciliación.

Validación: pruebas de DOM antes de cambios, resumen puro de asistencia, browser con SA+Minis, scope exacto, búsqueda/selección, detalles/cuenta, cancelar/salir, revisión humana, ambos temas/móvil. Versiones de prueba autorizadas únicamente, sin main/commit/push.

Implementado en el candidato integrado de referencia, no activado por M5: elección por tarjetas/radios, invitación en paso dedicado con código original, confirmación con capacidades, búsqueda y contador que incluyen filas ocultas, resumen real de asistencia, detalle por identidad de vínculo/dispositivo, cuenta con sesión real y salida/desvinculación nativas. Los revisores de personal y conciliación de SA conservan su presentación nativa y sus reglas; el QR de internet del boceto no se añade en esta entrega (QR directo existente se conserva). Las pantallas de acciones no muestran controles redundantes de cuenta. Al volver desde cuenta/detalle/envío no se vuelve a descargar innecesariamente el personal.

Aceptación browser prevista para la integración: SA y 3 Minis, selección filtrada, cuenta y scope exactos, resumen sin encolar, revisión y aplicación humanas, cambios de acceso, nombre, sesiones/recarga y salida sin borrar historial. El escenario UI ampliado usa ipLimit 1000 en su fixture para la ráfaga automatizada; no cambia los límites del servicio real, cubiertos por las pruebas de gateway.

2026-10-05 correction: exact uploaded B actions-first reference. Compact header account; SA two action tiles and compact native device rows; Mini today before roster notices and compact work rows. Native actions remain in detail screens. Counts/status use real sources, never fixture values or authorization-as-online.
