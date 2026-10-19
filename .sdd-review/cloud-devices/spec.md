# Dispositivos y acceso por obra

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M6 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M6
API de identidad local y cola con aislamiento por cuenta/alcance y confirmación del contrato esperado. Las lecturas y respuestas de servidor están simuladas; no se validan permisos efectivos del backend ni un dispositivo real. Los módulos permanecen dormidos hasta su registro/cableado M8. No se modifica `index.html`, precache funcional, credenciales ni infraestructura SA. El cierre de tipos de organización conserva la capacidad de iconos obligatoria y la consulta tardía del root UMD; no agrega stubs ni dependencias globales de M7.

La descripción restante es el contrato del candidato integrado de referencia. La evidencia actual es build y 30 tests unitarios/fixtures con respuestas simuladas, no prueba de Google, backend, permisos desplegados, navegador o intercambio entre dispositivos. La suite completa se registra en tareas/handoff. Esas validaciones requieren M8 y la infraestructura SA preparada. Sin push, merge, PR ni despliegue autorizado.

## Contrato integrado de referencia
Cada instalación conserva mini-cloud-device-v1. El servidor deriva el prefijo desde la cuenta verificada. Mini puede editar su nombre y salir de la obra en este dispositivo, con confirmación inline. SA muestra dispositivos, cuenta propietaria, estado, última actividad y pendientes; permite revocar o autorizar de nuevo. Toda lectura de personal y envío exige dispositivo registrado y activo. Refresco, recarga, invitación y reintento no lo reactivan. Revocar o salir conserva el personal local, cola, asistencia e historial del servidor. Otros dispositivos y obras conservan su acceso. Una instalación nueva hereda los grupos autorizados de su cuenta; moderación de nuevos dispositivos por persona queda pendiente. Estado de acceso no equivale a conexión online. Tests de identidad, permisos, aislamiento, revocación, replay e historial, confirmación/cancelación y recarga.
