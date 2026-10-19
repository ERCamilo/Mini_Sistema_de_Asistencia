# Plan de saneamiento — identidad y navegación Mini

Fecha: 2026-10-17. Rama: feat/integrate-mini-turn-main-20261015.
Base de revisión: 2d33b02.

## Hallazgos reproducidos
1. En móvil se ocultan las iniciales cuando falla/no existe la foto de Google.
2. El perfil no se actualiza cuando cambian los datos de sesión sin refrescar manualmente la pantalla.
3. Faltan pruebas DOM/browser para foto cargada, foto fallida, cambio de cuenta y salida.
4. El nuevo título de vinculación no coincide con la prueba de navegador anterior.

## Ejecución
- [x] S1: añadir/revisar pruebas de navegador 320/390/1024 para los estados del perfil, navegación y render sin refresco manual; verificar el fallo antes de corregir.
- [x] S2: corregir visibilidad móvil, observar los atributos de sesión y sincronizar perfil y vista de cuenta; preservar alternativa de iniciales y desactivar foto al salir.
- [x] S3: compilar TS, ejecutar tests focalizados, suite completa y pruebas de navegador con Chromium disponible; auditar diff y no alterar flujo TURN.
- [x] S4: documentar resultados; confirmar un commit específico y elaborar un plan de integración GitHub sin adelantar pruebas de dispositivos reales.

Criterio: sin cambios de backend, autenticación, transferencia, persistencia o producción. No fusionar main sin revisión TURN independiente y aceptación en dispositivos reales.

## Resultado y evidencia

- Reproducción RED en Chromium antes de la corrección: 0/9 escenarios (6 por título antiguo y 3 por ausencia de actualización de perfil).
- Corrección de título de vinculación, observación de atributos de cuenta en el DOM y reglas `hidden` para foto/iniciales con CSS del proyecto.
- `PRIVATE_TURN_TOOL_OUTPUT=... npm test`: **1078/1078 PASS**; TypeScript compila sin errores; `git diff --check` PASS.
- `PLAYWRIGHT_MODULE=/tmp/mini-playwright-chromium-20261017.mjs node --test tests/e2e/connections.e2e.mjs`: **12/12 PASS**, vistas 320/390/1024 y claro/oscuro. Uso de Chromium de Snap ya instalado, sin nueva dependencia del proyecto; URL de imagen interceptada con PNG sintético, sin cuenta Google real.
- No se ha acreditado funcionamiento de TURN en dispositivos reales ni revisión independiente del historial importado.
