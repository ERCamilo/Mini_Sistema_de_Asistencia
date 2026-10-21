# Mini — conexiones más claras y consistentes

Solo Mini. SA y el servicio no cambian. Se conservan IDs, handlers, permisos, colas, scopes, revisión humana y la lógica de transporte; cambia la estructura visible, el vocabulario y los fallos de maquetación.

## Problema (verificado con capturas a 390 y 320 px)

Hay tres vínculos distintos, pero la persona ve «un vínculo» repartido en botones con nombres cambiantes:

| Vínculo real | Cómo se llama hoy |
|---|---|
| SA por internet (cuenta Google, invitación) | «Asociar a una obra», «Vincular una obra», «Por internet» |
| SA directo (QR o código + clave) | «Conexión directa», «Escanear QR de SA», «Usar código + clave» |
| Otro Mini (copias de seguridad) | «Vincular dispositivo», «Vincular otro Mini», «Respaldos P2P» |

Otros fallos: dos botones de vincular en el inicio sin diferencia clara; la misma pantalla llamada «Vincular dispositivo» / «Dispositivos vinculados» / «Respaldos P2P»; título «Compartir» frente a «Conexiones» en el resto de la app; dos controles de cuenta en la cabecera (avatar solapa el título); doble «volver» («‹» y «Inicio»); elección entre una sola opción con radio + «Continuar»; estado vacío que habla de la obra bajo el encabezado «Dispositivos vinculados»; botón de Google con aspecto activo cuando no está disponible; dos botones del mismo peso por dispositivo.

## Diseño

**Vocabulario fijo.** Acción: **Vincular**. Lista: **Vínculos**. Pantalla: **Conexiones**. Copias de seguridad: **Respaldos**. Desaparecen «Asociar», «Compartir» (como título), «Respaldos P2P» y «Vincular dispositivo».

**Inicio «Conexiones».** Orden: *Por revisar* (sólo si hay), acciones de *mi obra* (sólo si hay una obra vinculada), lista única **Vínculos** (SA directo, obras por internet y Minis, cada uno con su medio como detalle), y una fila secundaria **Respaldos**. Una sola acción primaria fija: **Vincular**. «Actualizar» pasa a icono con nombre accesible. Estado vacío único: icono, «Aún no hay vínculos» y una línea; sin encabezado huérfano.

**Vincular (una pregunta, una pulsación).** Tres tarjetas-botón, sin radio ni «Continuar»:
1. **Obra de SA por internet** — con tu cuenta Google. Deshabilitada con motivo visible si Google no está disponible.
2. **SA, conexión directa** — escanea su QR o escribe su código; ambos equipos abiertos. Abre el escáner (el código queda como alternativa dentro).
3. **Otro Mini** — para pasar copias de seguridad.
Tocar una tarjeta entra directo al flujo existente.

**Cabecera uniforme.** Volver, título y **un** control de cuenta (icono de persona si no hay sesión, inicial o foto si la hay) y cerrar. Sin segundo «volver» dentro del cuerpo, sin avatar solapado, mismos títulos de pantalla en todas las rutas.

**Tarjeta de vínculo.** Una acción principal según estado (Conectar / Reconectar / «Listo»), «Cerrar conexión» como acción secundaria discreta; nombres largos truncados a dos líneas; detalles técnicos plegados.

**Cuenta.** Si Google no está disponible: texto explicativo y **sin** botón de inicio de sesión. Filas alineadas igual que el resto.

## Fuera de alcance
Protocolos, WebRTC, almacenes, textos de SA, flujos nativos de revisión de personal/asistencia, backend.

## Pruebas (antes de implementar)
- Puras: `describePage` (título «Conexiones»), `describeLinkChoices` (3 opciones, deshabilitado con motivo sin Google).
- Fuente/cableado: ya no existen «Asociar a una obra» ni «Vincular dispositivo»; el inicio tiene un solo `data-connections-add`; las tres rutas llaman a los handlers nativos existentes.
- e2e (`connections.e2e.mjs`): inicio, chooser, cabecera con un solo control de cuenta, 320/390 px, temas claro/oscuro, foco, sin desbordes; cuenta sin Google no ofrece inicio de sesión.
- `npm test` y `npm run test:e2e` en verde; sin tutoriales de conexión que regrabar.

## Tareas
1. Helpers puros + tests (títulos, rutas de vincular).
2. Inicio: título, lista única, estado vacío, acción única, refrescar icono.
3. Chooser de tres tarjetas con enrutado a handlers existentes.
4. Cabecera: un control de cuenta, sin doble volver, títulos nativos («Respaldos»).
5. Tarjeta de vínculo y cuenta.
6. Actualizar tests/e2e, versión y novedades; capturas finales.
