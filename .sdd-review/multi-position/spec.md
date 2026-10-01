# Varias posiciones por empleado (Mini ↔ SA)

## Decisiones (usuario, 2026-10-01)
- Hasta 3 posiciones por empleado; la primera es la principal.
- Llegan desde SA (roster) o se cargan a mano.
- En Mini se muestran como chips (toggles) en la tarjeta de asistencia.
- WhatsApp: si el empleado tiene **más de una** posición, siempre se agrega ` _Posición_`
  después de las horas (también la principal). Con una sola, la línea no cambia.
- Opción C (repartir horas entre posiciones el mismo día) queda para después.

## Modelo (Mini)
- `employee.position` sigue siendo la principal (todas las pantallas existentes siguen igual).
- `employee.positionSaId?`: id SA de la principal. `employee.extraPositions?: [{ name, saPositionId? }]` (máx. 2).
- Registro del día: `record.position?` sólo si se eligió una posición que no es la principal.
- `src/employee-positions.ts` concentra las reglas (posiciones, posición del día, sufijo WhatsApp, campos SA).

## Contratos
- Roster SA → Mini (`sa-roster/v1`): fila admite `positions?: [{ id?, name }]` (máx. 3, principal primero).
  Si viene, manda; si sólo viene `position` (SA viejo), se actualiza la principal y se conservan las extras.
- Envío Mini → SA (`attendance-submission/v1`): fila admite `positionName?` y `saPositionId?`
  (sólo empleados con más de una posición).
- WhatsApp: `NNN. Nombre  *8h* _Posición_`.

## Compatibilidad (ambas apps validan campos de forma estricta)
1. SA debe aceptar el sufijo de WhatsApp y los campos nuevos de la fila **antes** de que Mini los mande.
2. Un Mini viejo rechaza un roster con `positions`: SA exporta `positions` recién cuando los Minis se actualizaron
   (se actualizan solos al abrirse). Falla cerrada: no se pierden datos.
Orden: SA (parche) + Mini juntos; los Minis se actualizan al abrir.
