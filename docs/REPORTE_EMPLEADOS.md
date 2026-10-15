# Reporte de empleados por WhatsApp

En **Empleados → Reporte de empleados**, revisar el listado de la obra/cuadrilla seleccionada o de todos. La búsqueda y el filtro Activos/Pausados no recortan el reporte; los pausados también se identifican.

El primer reporte es **Listado completo**. Después de compartirlo o copiarlo para enviarlo, pulsar **Ya lo envié**. Esta confirmación guarda una referencia local: abrir WhatsApp, cancelar o cerrar la vista previa no oculta cambios. Mini prepara el texto y no comprueba envío, destinatario o entrega. En móviles con compartido nativo se elige WhatsApp; en otros se abre su enlace. Si el enlace es demasiado largo, copiar el texto completo para pegarlo, sin truncarlo.

Los siguientes reportes abren en **Solo cambios**. Un empleado nuevo incluye número, nombre, puesto, precio por día y primera asistencia registrada. Para alguien existente, sólo los campos modificados:

```text
33. Ana
Número: 22 → 33
Puesto: Ayudante → Albañil
Precio por día: 900 → 1000
```

También se comparan nombre, otros puestos, estado activo/pausado y primera asistencia. Los empleados sin cambios se omiten. Una fila que ya no pertenece al listado se comunica como **Ya no figura en este listado**, porque podría haberse movido a otra obra; no se afirma que fue eliminada. Un cambio de número se reconoce mediante el ID local existente, sin crear una persona nueva. Se muestra la diferencia neta desde el reporte registrado, no cada edición intermedia.

**Listado completo** sigue disponible. **Actualizar vista previa** incorpora los datos más recientes. Si un empleado cambia después de compartir y antes de pulsar Ya lo envié, la referencia conserva lo revisado/compartido y esa edición queda pendiente. Si otra revisión ya actualizó la referencia, hay que volver a preparar el reporte. Un fallo de guardado se muestra y no confirma silenciosamente.

## Datos y límites

- No cambia el esquema ni la persistencia de empleados/asistencia, ni agrega una tabla. `mini_employee_report_v1` guarda referencias versionadas por listado, usando el guardado de ajustes existente, la protección del arranque y los respaldos locales. **Borrar todos los datos** también borra esta referencia.
- La referencia es local a cada dispositivo, con respaldo/restauración. Otro dispositivo empieza sin referencia si no la restauró. El primer reporte no puede reconstruir precios anteriores a instalar esta función.
- La primera asistencia es el día válido más antiguo presente, con horas positivas, hasta hoy; no es la fecha de creación ni de contratación. Se conserva al archivar días y se corrige si se elimina explícitamente esa marca. Si ya se había archivado el historial antes del primer reporte, sólo se conocen los registros disponibles.
- Una referencia corrupta se informa y no se sustituye silenciosamente. Los respaldos conservan el valor anterior para recuperación. Este mecanismo es una comparación de listados, no un historial de auditoría ni una integración de entrega con WhatsApp.

## Verificación

`npm test`, `npm run build` y `npm run test:e2e`. La prueba `tests/e2e/employee-report.e2e.mjs` usa el Mini real con datos sintéticos; intercepta compartido/WhatsApp/portapapeles sin enviar mensajes. Verifica comparación por ID, confirmación explícita, copia completa, cambios posteriores, persistencia tras recarga, respaldo/restauración, contexto, búsqueda, borrado y cancelación.

Con `AXE_PATH` apuntando a `axe-core/axe.min.js`, comprueba WCAG A/AA en el diálogo, anchos de 320/390/480 px y los cinco temas. CI instala Playwright y axe como herramientas globales de prueba; no son dependencias de la PWA. Se mantiene la suite anterior de asistencia WhatsApp, almacenamiento, puestos, planillas y tutoriales. La prueba de cambio de almacenamiento espera el arranque completo, en lugar de un tiempo fijo sobre un contenedor estático.
