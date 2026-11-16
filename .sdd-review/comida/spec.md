# Comida (sección opcional)

Sección de Mini para anotar quién pide comida cada día, mandar el pedido a la cocina, cobrar por períodos y registrar compras de insumos. Maqueta de referencia (privada del propietario): https://claude.ai/artifact/6EJqqU41QHNNCuhsSvHZ1y. No cambia Asistencia, Empleados ni el esquema de asistencia.

## Decisiones tomadas

- **Entrada:** el lugar de «Reportes y Solicitudes» en la barra se muestra una sola vez como casilla vacía `[+]`. El usuario elige Reportes o Comida; desde entonces la casilla no vuelve. En Más hay un acceso a cada uno y un interruptor que decide cuál ocupa la barra. Sin un quinto botón.
- **Pantalla Comida:** acento naranja en toda la pantalla, definido para los cinco temas (dark, light, contrast, ocean, sol). Selector superior Pedidos | Cocina | Facturación.
- **Pedidos:** barra de fecha, contadores Platos / Total / Sin pedir, botón «Enviar Pedido» en el acento (fila propia), fila «Plato:» con los platos del menú, buscador, Empleados y Clientes. Contador por persona `− 0 +`: el número es el total de platos del día, + añade el plato elegido, − quita el último. − deshabilitado en 0; + se pinta con el acento cuando la persona ya pidió.
- **Sin presencia automática:** anotar comida no marca asistencia.
- **Clientes:** personas de solo comida, numeradas `C01`, `C02`… en su propia serie. Viven solo en Comida; no aparecen en Empleados, asistencia, reportes ni envíos a SA.
- **Cocina:** platos (nombre, precio, costo estimado, icono, foto opcional, en menú sí/no) y compras de insumos con la pantalla de Mi Tiendita 4.0: ventas contra compras, rubros, billetes +100…+1,000, historial con editar y borrar. Los rubros los crea el usuario (nombre e icono) desde una casilla `[+]`; empiezan vacíos y se pueden eliminar. Cada compra guarda nombre e icono del rubro, así borrar un rubro no borra su historial.
- **Facturación:** por cobrar, vendido, cobrado y ganancia (= vendido − compras; el costo del plato solo estima cuánto deja). Deudores con ficha: deuda, compras por plato, movimientos y pago en efectivo total o parcial.
- **Períodos de cobro:** el usuario cierra el período con un botón (pensado cada 21 días; Mini recuerda al llegar al día 21, no cierra solo). El cierre incluye el día de hoy; el nuevo período empieza mañana. Los días de períodos cerrados son de solo lectura. La deuda pendiente pasa al período nuevo.
- **Precio congelado:** cada pedido guarda el precio y el costo del momento.
- **Hojas:** usan el gestor de modales de Mini (Atrás cierra); se abren sobre la barra, el + central gira a ✕ y cierra; al cerrar bajan con la animación inversa.
- **Animaciones:** contadores que ruedan, «+1» flotante y barras que crecen, solo en Comida (resto de Mini: issue #35). Respetan `prefers-reduced-motion`.
- **Fuera de alcance:** pedidos por adelantado (issue #36), compartir comida entre teléfonos, grupos personalizados de clientes.

## Reglas de cálculo (módulo puro `src/comida-ledger.ts`)

- Importes enteros en pesos; nunca decimales sueltos.
- **Saldo** = pedidos − pagos de la persona.
- **Cuenta pendiente:** los pagos se aplican a los pedidos más antiguos primero; la cuenta lista solo lo que queda sin pagar, con el saldo parcial del pedido a medio pagar.
- **Mensaje a la cocina:** agrupa por plato y precio; con o sin precios.
- **Cambios desde el envío:** se compara la composición (plato, precio, cantidad), no solo el total de platos.
- **Períodos:** cerrar exige un período abierto que empezó hoy o antes; un día está bloqueado si es anterior al inicio del período abierto.

## Datos

- Almacén propio, separado de asistencia. Entra en el respaldo de Mini como sección nueva y opcional; un respaldo viejo sin ella se restaura igual.
- No viaja por P2P ni a SA.
- Un empleado con saldo pendiente no se puede borrar (sí pausar).

## Estado (MVP 2.18.0)

Entregado: tareas 1 a 7. Módulos `src/comida-ledger.ts`, `src/comida-store.ts`, `src/comida-repository.ts` y `src/comida-ui.ts`, estilos en `comida.css`, cableado en `index.html` y `sw.js`. Pruebas: `tests/comida-*.test.js` y `tests/e2e/comida.e2e.mjs`.

Quedan fuera del MVP: fotos de platos (peso en el almacenamiento), Deshacer en los avisos (Mini no tiene avisos con acción; se usan confirmaciones antes de borrar), animación de cierre en las demás hojas de Mini, pedidos por adelantado (#36) y animaciones en el resto de Mini (#35).

## Tareas

1. Módulo puro `comida-ledger` con TDD (saldo, cuenta pendiente, mensaje a la cocina, cambios desde el envío, períodos, resumen).
2. Repositorio local y sección de respaldo, con prueba de compatibilidad con respaldos viejos.
3. Casilla de la barra, accesos en Más y pantalla Comida vacía; actualizar `tests/field-requests-ui.test.js` (hoy exige `id="nav-requests"` en la barra).
4. Pedidos y mensaje a la cocina.
5. Cocina: platos, rubros y compras.
6. Facturación, pagos y cierre de período.
7. Tokens del acento en los cinco temas, `APP_VERSION` y novedades, E2E en móvil.

`npm test` verde en cada paso; PR hacia main sin fusionar hasta revisión.
