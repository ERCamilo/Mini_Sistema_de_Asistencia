# Personal Mini → SA

Enviar personal seleccionado por un Mini vinculado para revisarlo en la obra activa de SA. Nombre, ficha, puesto y salario numérico por día; teléfono/correo opcionales. La recepción no crea empleados ni asistencia automáticamente.

Contrato compartido: `mini-roster-proposal/v1`, identidad de propuesta estable, obra SA explícita, IDs locales Mini estables y hasta 500 empleados. Se transfiere por los chunks autenticados y verificados existentes. Recibir en SA usa el canal de presencia vinculado y solicita una propuesta; Mini muestra el envío para confirmar. Desde Mini también puede anunciar personal listo a SA.

SA conserva una bandeja local por dueño, propone nuevos/vinculados/posibles duplicados y permite corregir campos, escoger/crear puestos, vincular, aceptar o dejar pendiente. Aprobar persiste empleados, puestos y vinculación en una transacción de IndexedDB antes de anunciar éxito. Reenvíos usan la misma propuesta o las vinculaciones previas para evitar duplicados. Cambios de obra/dueño o una ficha ocupada después de revisar requieren revisar de nuevo.

Respuesta `mini-roster-result/v1`: IDs SA y datos confirmados para los IDs Mini aprobados. Mini actualiza sus registros existentes sin cambiar sus IDs locales ni perder asistencia, comprueba la propuesta correspondiente y aplica una sola vez. Si se corta el canal, reenviar recupera la resolución ya guardada.

Una fila sin salario o puesto puede recibirse, pero SA exige completarla para crear. El salario individual se convierte usando las horas/día de SA; no altera el salario predeterminado de otros empleados. Coincidencias por ficha/nombre son sugerencias; no hay fusión automática. Mantener compatibilidad con SA→Mini, asistencia y respaldos actuales.

Validar contrato común, selección/consentimiento, datos incompletos, homónimos/fichas repetidas, cambio de obra/dueño, reenvío/reinicio, fallo de persistencia, respuesta incorrecta y vínculo estable. Pruebas de interfaz móvil y flujos existentes en ambos repositorios; publicar PRs separados sin fusionarlos.
