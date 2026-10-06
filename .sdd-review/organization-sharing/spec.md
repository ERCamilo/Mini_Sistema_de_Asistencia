# Asistencia entre miembros autorizados

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M6 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M6
Modelos de revisión/recibos y API de compartición. Las pruebas preservan marcas locales por defecto, acotan IDs a la obra, validan horas/fechas y exigen selección humana antes de importar. Fixtures del constructor de montaje prueban iconos obligatorios presentes, tardíos y ausentes sin consultar servicios; no prueban navegación completa ni autorización real. Los módulos permanecen dormidos hasta su registro/cableado M8. No se modifica `index.html`, precache funcional, credenciales ni infraestructura SA. El cierre de tipos de organización conserva la capacidad de iconos obligatoria y la consulta tardía del root UMD; no agrega stubs ni dependencias globales de M7.

La descripción restante es el contrato del candidato integrado de referencia. La evidencia actual es build y 30 tests unitarios/fixtures con respuestas simuladas, no prueba de Google, backend, permisos desplegados, navegador o intercambio entre dispositivos. La suite completa se registra en tareas/handoff. Esas validaciones requieren M8 y la infraestructura SA preparada. Sin push, merge, PR ni despliegue autorizado.

## Contrato integrado de referencia

SA autoriza por dispositivo el intercambio dentro de los grupos de una obra. Permiso desactivado por defecto. Ambas instalaciones necesitan cuenta Google, acceso y permiso vigente de SA. La conexión directa existente se conserva y no acredita por sí sola pertenencia organizativa. Primera entrega mediante puente Internet; sin emparejamientos individuales.

Mini elige destinatario y fecha. Cola durable separada de los envíos oficiales a SA. Receptor revisa filas, conserva actual por defecto o aplica las horas recibidas por ID de empleado y obra. Ausencias informativas; no borran marcas. No comparte personal oficial, sueldos, préstamos ni respaldos. Confirmación después de aplicar/rechazar explícitamente. Duplicados idempotentes y replay conflictivo rechazado.

Permisos de ambos extremos revalidados al enviar, consultar y confirmar. Revocación/salida bloquea pendientes. No borra historial/cola al cerrar sesión. UI en menú común: Miembros y asistencia por grupo; SA permite/bloquea compartir en tarjeta Mini. Avisos in-app sin permisos de notificación automáticos.

Pruebas: emulator de permisos/aislamiento/revocaciones/duplicados; unidad de revisión y conflictos; DOM y navegador envío/reload/revisión; circuitos existentes. Cualquier despliegue preview es una decisión posterior separada; este slice no modifica main ni producción.
