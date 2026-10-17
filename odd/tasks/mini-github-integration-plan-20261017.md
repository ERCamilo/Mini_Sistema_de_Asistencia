# Plan de integración Mini → GitHub (17-10-2026)

## Alcance y estado verificado

- Repo: `ERCamilo/Mini_Sistema_de_Asistencia`, público; `main` publica la PWA directamente (GitHub Pages).
- Rama de trabajo: `feat/integrate-mini-turn-main-20261015`; rama local, todavía sin rama homónima en `origin`.
- `origin/main` remoto verificado en `91ef02340776e554ca8c3121bacdc9a3ef3bfc17`. No hay PR abierto de esta rama.
- La rama incluye el historial de integración TURN y commits posteriores de UX y perfil; validar **todo el diff**, no solo los últimos commits.
- Sanidad local del saneamiento: Node **1078/1078**, navegador sintético **12/12** (320/390/1024, claro/oscuro), TypeScript PASS.
- Los tests sintéticos no prueban sesiones reales, el relay TURN real, dispositivos distintos ni sincronización de datos de producción.
- La revisión de regresión Mini → SA preserva los botones directos `Enviar personal`, `Recibir personal`, `Asistencia`, `Cambiar nombre` y `Desvincular` en el menú, con listeners conservados al navegar; pruebas de navegador en 320/390/1024, claro/oscuro. **No acredita entrega a SA**.
- Bloqueo de contrato: el `main` remoto de SA `ERCamilo/-Sistema-de-asistencia` consultado el 2026-10-17 (commit `90aae6d9ca0b1227c5b07c2221050f71ca1759e0`) no contiene controladores para `mini-roster-offer/v1` / `mini-roster-request/v1` / `mini-roster-result/v1` del emisor Mini. Requiere implementar y verificar receptor en SA, incluyendo selección de obra, revisión/confirmación de personas y mapeo de IDs, antes de declarar funcional Mini → SA personal.

## Puertas de integración

- [x] G0. Documentar plan de saneamiento y guardar correcciones con test RED/GREEN en commit delimitado.
- [x] G1. Compilación, suite de Node y aceptación de navegador de componentes/flujo sintético.
- [ ] G2. Revisión independiente de **todo** el contenido importado de TURN y cambios de UI, incluyendo seguridad, permisos, aislamiento, sesiones, compatibilidad y datos locales. Cerrar CRITICAL/HIGH y registrar limitaciones.
- [ ] G3. Prueba real entre dos dispositivos, incluidos QR, autorización, conexión directa/por Internet con TURN, reconexión, desconexión, expiración, envío multiday, recepción y revisión sin aplicar datos automáticamente; preservar/restaurar sin pérdidas. Confirmar expresamente la recepción de propuestas de empleados Mini → SA en una rama compatible de SA con validación, aceptación y devolución de vínculos; bloquear el merge funcional hasta que exista ese receptor.
- [ ] G4. Decidir alcance del PR: integrado único (TURN+UI), o revisión por bloques/PR apilados para mantener un diff revisable; no mezclar otros worktrees.
- [ ] G5. Tras G2-G4: comparar otra vez `origin/main`; verificar ningún secreto/dato privado; `git push -u origin feat/integrate-mini-turn-main-20261015`; abrir **draft PR** a `main`, documentando pruebas, riesgos, screenshots y limitaciones; sin deploy.
- [ ] G6. Verificar CI GitHub Actions y publicar resultados de browser; resolver observaciones de review. Cambiar PR de draft a listo solamente con G2/G3 completos.
- [ ] G7. Fusionar a `main` solo con autorización final; verificar el despliegue GitHub Pages y plan de reversión si hay problemas.

## Condición explícita

No se autoriza ejecutar un merge a `main` ni desplegar a producción desde este plan. El antiguo dictamen independiente TURN reportó `lens_context_budget_exceeded`, por lo que no puede contarse como aprobación. La interfaz revisada es una parte del alcance, no una aceptación funcional integral de Mini/SA.
