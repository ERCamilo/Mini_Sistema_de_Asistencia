# Avisos y acciones primero

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M5 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M5
APIs puras de tracker/monitor y presentación; dedupe, aplazamiento, descarte por cuenta/generación, disponibilidad y backoff mediante dependencias inyectadas. Los módulos permanecen dormidos: no se registran scripts ni se modifica el precache o `index.html`. Se conserva la implementación del candidato integrado, sin cambiar reglas de datos ni permisos.

La evidencia actual comprende build y 8 tests puros (tracker/monitor, títulos, feedback e iconos mediante fixture). No prueba el montaje real de presentación, notificaciones visibles en la app, navegador, Google ni backend. Esa integración queda para M8 y las pruebas posteriores. La descripción restante es el diseño/candidato integrado de referencia, no activación certificada de este slice. Sin push, merge, PR ni despliegue autorizado.

## Avisos
Consulta acotada cada 60 s sólo con sesión, app visible y red disponible; comprobar al volver, reconectar y completar acciones. Una consulta en vuelo, descarte por generación al cambiar cuenta, backoff hasta 5 min. Mini consulta metadatos de todas sus obras/grupos autorizados: versión/fecha del personal y entregas de asistencia vigentes. SA consulta envíos pendientes de sus obras. Sin descarga/aplicación/confirmación automática de datos; sólo metadatos. Sin solicitar permisos del navegador ni prometer avisos con app cerrada.

Avisos nativos existentes: Revisar y Después. Dedupe persistido por cuenta+alcance+revisión. Después no borra el pendiente; una nueva versión o entrega vuelve a avisar. Máximo tres avisos simultáneos, todos los pendientes visibles en portada. Revocación/logout eliminan avisos y tarjetas de esa cuenta. Revisar revalida permiso y dirige a obra/grupo correcto. Rosters aplicados se comparan por versión y generatedAt, no sólo número.

## Acciones primero
Una portada común: pendientes accionables arriba, enviar asistencia de hoy / compartir personal después; cuenta, dispositivos y desvinculación secundarios. Sin pestañas por transporte ni dos UIs. Cada acción indica obra/grupo. Lista de vínculos y método permanece subordinada; vinculación en wizard existente. Conservar formularios y handlers, foco/Escape/busy guard, temas y targets 44 px. SA conserva revisión humana en su bandeja; Mini revisión de roster y asistencia existentes.

## Verificación integrada posterior
TDD de tracker/monitor (dedupe, defer, cambios, logout/race, offline/hidden, fallo/backoff), resumen servidor/permisos, DOM portada y navegación, navegador tres Minis/nueva versión/avisos/reload/Después/revisión. Regresión unidades/e2e/directo y previews HTTPS. Las pruebas de previews son posteriores y requieren autorización específica; M5 no publica ni modifica main/producción.

Navigation settlement: close invalidates pending home renders; released menu references are cleared. SA awaits the native importer and its existing connected-inbox methods before review. Locally received but unapplied attendance stays in the pending section after the cloud inbox clears.
