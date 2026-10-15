# Reporte de empleados para WhatsApp

Desde Empleados en Mini, revisar y compartir un listado legible o sólo cambios desde el último reporte que el usuario registró como enviado. No se modifica el esquema ni los datos canónicos de empleados/asistencia. Una referencia local versionada por obra/cuadrilla (o todos) guarda los campos reportados e IDs estables; se incluye en los respaldos/estado local existentes como un ajuste adicional.

Un empleado nuevo incluye nombre, número, puesto principal, salario por día y primera asistencia registrada. Los cambios muestran sólo campos modificados: `Precio por día: 900 → 1000`, `Número: 22 → 33`, etc.; sin cambios no aparece. Incluir nombres, otros puestos y estado pausado/activo cuando cambien. Si una ficha deja de estar en ese listado, indicarlo sin afirmar que fue eliminada. No comparar por número/nombre: usar ID local para reconocer cambios de ficha.

El primer reporte es completo. La primera asistencia proviene del día válido más antiguo presente y con horas positivas hasta hoy. Una fecha ya reportada se conserva al archivar días (sin tombstones) y se recalcula al borrar explícitamente esa marca. Si el historial anterior al primer reporte ya se archivó, decir "Primera asistencia registrada", no inventar una fecha de ingreso.

Revisar o abrir WhatsApp no mueve la referencia. Tras compartir/copiar, el usuario puede pulsar `Ya lo envié`; se registra exactamente la versión revisada, de modo que ediciones posteriores sigan pendientes. Cancelar no oculta cambios. Una referencia actualizada por otra pestaña exige reabrir/revisar; un fallo de almacenamiento no confirma el reporte. Abrir WhatsApp prepara texto, no demuestra envío o entrega. Para textos largos ofrecer compartir nativo/copia sin truncar.

UI táctil ≥44 px, tokens de los cinco temas, una acción primaria por etapa, vista previa con texto y estado inline. Reutilizar modal, portapapeles, iconos vectoriales y scope de obra/cuadrilla actuales. Mantener búsqueda/filtros de empleados independientes del contenido: el reporte usa la obra/cuadrilla completa, incluyendo pausados.

TDD del formato, diferencias por ID, referencia por scope, cuota/concurrencia, archivo/borrado de primera asistencia y confirmación explícita. Probar flujo real móvil/temas, reporte sin cambios, cambios posteriores a compartir y WhatsApp de asistencia anterior. `npm test`, build y E2E antes de publicar PR hacia main; no fusionar.
