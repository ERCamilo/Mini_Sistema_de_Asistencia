# Restauración de respaldos de Mini

- Comprobar con datos ficticios el recorrido por archivo y por la conexión directa entre dispositivos. El archivo conserva Comida, incluidos pedidos históricos, pagos y cierres. Avisar que Conexiones incluye los datos de asistencia y que Comida se transfiere por archivo, como indica la especificación de Comida.
- Mostrar qué contiene un archivo, pedir confirmación para reemplazar datos y conservar el respaldo para reintentar si falla. Aceptar respaldos anteriores sin Comida y respaldos cuyo único contenido sea Comida. Rechazar versiones incompatibles antes de escribir.
- Esperar la persistencia de asistencia en IndexedDB antes de confirmar una restauración. Si falla algún paso, recuperar los datos previos y mantener disponible la copia entrante. Evitar envíos repetidos desde el mismo control.
- Verificar las transferencias grandes de respaldos y documentar la diferencia con la respuesta de asistencia Mini → SA.
