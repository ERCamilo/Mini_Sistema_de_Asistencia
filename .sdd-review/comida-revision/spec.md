# Correcciones de Comida tras la revisión

- Serializar las escrituras de Comida en el dispositivo y aplicar cada acción sobre la última copia persistida. Mantener compatible `miniComidaV1` y actualizar la vista al recibir cambios de otra pestaña.
- En la restauración de un archivo con Comida, comprobar su escritura antes de aplicar las otras secciones. Conservar el estado previo y ofrecer reintento si falla. Los respaldos anteriores se siguen leyendo.
- Calcular saldos y envíos de Cocina con los pedidos de todas las obras. Detectar cambios en las notas después de compartir el pedido. Mostrar los saldos a favor en la ficha y en el mensaje de cuenta.
- Permitir corregir el precio de un plato ya anotado en una fecha anterior del período abierto. Conservar el precio del menú y el historial de períodos cerrados.
- Seleccionar barras diarias o semanales con toque y teclado. Conservar el foco y actualizar el contador localmente al sumar o quitar un plato. Mostrar los siete días de ambos calendarios en móviles estrechos y mantener etiquetas y contraste.
