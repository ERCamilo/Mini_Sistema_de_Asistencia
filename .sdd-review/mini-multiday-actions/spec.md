# Mini: acciones claras y varios días de asistencia

Actualización del slice: 2026-10-06. Responsable: Codex. Estado: M6 preparado; revisión nativa pendiente. Creación original: no registrada.

## Alcance actual M6
Selección/validación de fechas de 1 a 31 días, vista previa y cola/revisión por contratos diarios. Las pruebas puras verifican límites, días vacíos, orden, identidades estables y validación antes de importar; el selector y el envío/revisión reales de la aplicación quedan para M8. Los módulos permanecen dormidos hasta su registro/cableado M8. No se modifica `index.html`, precache funcional, credenciales ni infraestructura SA. El cierre de tipos de organización conserva la capacidad de iconos obligatoria y la consulta tardía del root UMD; no agrega stubs ni dependencias globales de M7.

La descripción restante es el contrato del candidato integrado de referencia. La evidencia actual es build y 30 tests unitarios/fixtures con respuestas simuladas, no prueba de Google, backend, permisos desplegados, navegador o intercambio entre dispositivos. La suite completa se registra en tareas/handoff. Esas validaciones requieren M8 y la infraestructura SA preparada. Sin push, merge, PR ni despliegue autorizado.

## Contrato integrado de referencia

Una selección común permite Un día / Varios días, intervalo de hasta 31 días, acceso Últimos 7 días y selección individual. Fechas reales, ordenadas, sin repetir; días sin marcas se explican y no se envían. Vista previa por fecha, destino humano, personas y horas; revisión explícita antes de envío. Mini→SA y Mini→miembro autorizado usan los contratos diarios actuales sin cambios de servidor. Guardar todos los días en una transacción local antes de transmitir; al fallar conservar únicamente los días no confirmados, con las mismas identidades/secuencias. No enviar datos de otra cuenta, obra, grupo o destinatario.

Recepción Mini→Mini: seleccionar varios días del mismo remitente, un envío por día, comparar por fecha, conservar local por defecto; opción explícita Aplicar todo este día. Validar todas las fechas, identidades y horas antes de una única importación merge. Revalidar permisos, presencia del envío y marcas locales inmediatamente antes de aplicar; conservar recibos para confirmar recepción tras una recarga sin reaplicar.

Iconos vectoriales semánticos (enviar, calendario, compartir, personal, actualizar, volver), textos sin roster/JSON/IDs en las decisiones habituales. Corregir dirección del flujo directo: Mini comparte con SA, SA solicita fechas. SA directo ya admite rango; mantener ese contrato y el respaldo Mini↔Mini independiente. No ampliar permisos ni canales directos Mini↔Mini de respaldo a asistencia.

Verificar unitarias rojas antes de implementación; Playwright real SA+Minis con varios días, días vacíos, selección parcial, rechazo de fechas/scope, fallos intermedios/red/recarga, revisión conjunta sin aplicación automática, recibos/ack, cambios de horas y no duplicados. Revisar cinco temas, móvil 360/390 y escritorio, targets>=44px y foco. Pruebas de vista previa posteriores requieren autorización; SA/backend/main permanecen sin cambios en M6.

Regresión detectada durante Playwright: una recarga inmediata tras borrar podía recuperar la copia de personal antigua. El reset deja un marcador síncrono con el snapshot vacío y la asistencia por día deja un marcador separado; el siguiente arranque completa ambos guardados antes de hidratar. Sólo retirar cada marcador después de confirmar su escritura. Si falla, no restaurar datos antiguos ni anunciar éxito prematuramente.
