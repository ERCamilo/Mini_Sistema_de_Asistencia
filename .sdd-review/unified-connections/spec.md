# Una sola interfaz de conexiones

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M7 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M7
Controlador compartido TS/JS y CSS de pantallas, con los cuatro tests puros de selección de transporte y guards. El código conserva la agrupación de cuenta/dispositivos SA ya implementada; este slice no escribe en SA ni repite esa implementación. El JS canónico de Mini se copiará como espejo a SA en S7. No se registra el script/CSS ni se modifica `index.html` o precache funcional: la activación Mini queda para M8 y la integración SA para S7.

La evidencia actual verifica estados direct/internet, disponibilidad, bloqueo por operación activa y rechazo de valores desconocidos; no certifica montaje/restauración DOM, QR/cámara, contraste renderizado, agrupación SA real, navegador, Google ni backend. La descripción y resultados siguientes pertenecen al diseño/candidato integrado anterior; no se reproducen ni se presentan como validación de este slice. Sin push, merge, PR ni despliegue autorizado.

## Referencia del candidato integrado

Corrección solicitada por el usuario: las pestañas conservaban dos interfaces. Sustituirlas por un inicio único: cuenta Google, una lista de vínculos y una acción Vincular. Las tarjetas muestran el medio como detalle y usan acciones de personal, asistencia y desvinculación. El medio se elige dentro del flujo de crear vínculo. Los formularios de operaciones se muestran por tarea, nunca como dos paneles completos seleccionables.

Preservar sesiones, permisos, identificadores y datos. No asociar identidades directa/Google por nombre. Google no implica presencia en línea. SA presenta dispositivos por internet de la obra actual; Mini presenta obras/grupos autorizados y vínculos directos. Mantener las confirmaciones de revocación/salida y revisión humana del personal/asistencia.

Controlador TS compartido con adaptadores DOM; reutilizar formularios y handlers por movimiento de nodos. Inicio conserva tarjetas directas y por internet juntas; sin tablist ni pestañas. Pasos directos y revisión se muestran en el mismo shell; finalizar vuelve al inicio. Bloquear navegación si hay operación en curso. Restaurar los nodos al cerrar sin reinicializar Firebase.

Pruebas antes de implementar: Jest DOM para ambas apps exige lista común sin pestañas, cuenta única, acciones por tarea, restauración de mismos nodos y guards; debe fallar en el candidato anterior. Luego Mini unidades/build, SA unidades/lint, circuitos browser Google y WebRTC, pruebas móviles y artefactos/precache. La publicación de previews es una decisión posterior separada. Este slice no publica ni cambia backend/identidades.
