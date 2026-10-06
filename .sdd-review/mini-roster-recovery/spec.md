# Recuperar personal después de borrar datos

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M4 preparado; revisión nativa pendiente. Fecha de creación original: no registrada.

## Alcance del slice M4
APIs de recuperación de `local-db`, `mini-data` y guardia de versiones, con sus tests deterministas. Se conserva la implementación del candidato: marcadores de reset durables permiten completar una limpieza interrumpida sin devolver datos anteriores; una escritura fallida conserva el marcador para reintentar. La recuperación de roster sólo admite la misma versión ya aceptada cuando el personal local está vacío; recuentos desconocidos y versiones anteriores/ambiguas siguen cerrados. No cambia el esquema de datos del usuario.

El cableado del borrado desde `index.html`, la revisión/aplicación P2P y las pruebas nuevas de UI quedan para M8. Este slice no modifica esa UI, no borra datos reales y no certifica navegador ni backend. La descripción siguiente expresa el resultado integrado previsto, no activación completa de M4.

## Resultado integrado

El borrado total elimina el registro local de versiones aplicadas junto al personal; conserva la cuenta y los vínculos. La revisión y la aplicación vuelven a comprobar el personal real del repositorio. Para instalaciones ya afectadas, únicamente una versión exactamente igual a la última aplicada puede recuperarse cuando todo el personal local está vacío. Versiones anteriores, ambiguas, malformadas y duplicados con personal existente siguen bloqueados. No se aplica automáticamente ni se elimina asistencia o personal de otras obras para facilitar la recuperación.

Pruebas M4: reset interrumpido y fallido en las dos capas de almacenamiento; guardia con personal vacío/existente/desconocido y protección de frescura. RED: 41 pruebas verdes y 5 fallos esperados antes de la implementación. GREEN enfocado: 46/46. La suite completa y evidencia del commit se registran en el documento de tareas/handoff.

Pruebas diferidas M8: restauración de un roster aceptado y bloqueo de duplicado; revisión del recuento vivo en UI; cancelación/confirmación del borrado y limpieza de guardias cacheadas. Borrado real en navegador, recarga y recuperación Firebase requieren el slice integrado; no se ejecutan aquí. No hay permiso de publicación, push, merge ni despliegue. SA, backend, originales y main permanecen sin cambios.
