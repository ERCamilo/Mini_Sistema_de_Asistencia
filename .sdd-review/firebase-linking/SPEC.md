# Mini: vinculación Firebase opcional

Creación: 2026-10-03. Actualización: 2026-10-06. Responsable de esta revisión local: Codex.
Estado: Candidato; revisión independiente y validación pendientes. Conclusión: pendiente.

## Integración M8

M8 activa el menú de Conexiones y las rutas directa/internet en el HTML, con SDK, módulos y estilos locales en precache. Mantiene la configuración de preview sin habilitar servicios en otros hosts. El cableado ya no está diferido; OAuth humano, gateway, permisos efectivos y cobertura ampliada M9/M10/SA siguen sin certificarse en este slice.

## Alcance histórico M3
API de vinculación con SDK oficial Firebase Auth 12.19.0 vendorizado, Google popup y persistencia local del SDK (`setPersistence('local')`), retenida del candidato existente: no es una nueva decisión de producto. En este slice M3 la API está disponible pero no se incorpora a `index.html` ni al precache; la activación desde Ajustes queda para M8. La configuración existente sólo se habilita en `firebase-circuit-test.mini-sistema-asistencia-preview.pages.dev`; usa el endpoint `https://firebase-bridge-test.erlin.do` y metadatos públicos de Auth del proyecto `phoenix-asistencia-ab641`. Fuera de ese hostname queda en `null`, salvo una configuración previamente inyectada. Este slice no cambia proyecto, credenciales ni despliega. Observar cambios de identidad, revisar invitación de un solo uso y confirmar mediante gateway anterior. Mostrar organización/obra/grupos con textContent. Cancelar preview no escribe permisos. Confirmación vuelve a validar en servidor. No cambiar empleados, asistencia, P2P o contexto local; vincular concede permisos y no descarga roster todavía.

## Contratos
No aceptar UID/owner del cliente ni persistir tokens/códigos en almacenamiento Mini. No leer invitación desde URL. Respuestas tardías de otra cuenta no pueden aparecer en la sesión actual. Evitar doble canje y abortar peticiones colgadas. Error de red conserva datos locales y permite volver a revisar. No habilitar confirmación sin preview válida ni tras expiración. HTTP/emulador sólo en loopback explícito de laboratorio. El SDK conserva la sesión localmente según la configuración existente; el adaptador solicita selector de cuenta al abrir el popup y permite cierre de sesión. No se afirma que cada recarga requiera login ni se cambia la política de equipos compartidos.

## Verificación
TDD de estados, cancelación, errores, expiración, aislamiento de cuenta, endpoint y payload inválido. Full Mini. Fixtures DOM verifican carga independiente y capacidad opcional de iconos ausente, presente y cargada después del módulo. Los scripts de navegador contra Auth/Firestore/gateway emulados se conservan como cobertura posterior: requieren M8 y la infraestructura SA, por lo que no se ejecutan ni certifican en M3. No hay prueba de OAuth humano. Mantener candidados SA congelados y registrar documentación/evidencia.

## Pendientes fuera de alcance
Provisionador de mapeos, UI administradora SA, proyecto/dominios Google reales, servidor público, rules revisadas, roster y submissions durables, revisión independiente. No aprobar F4/F5 ni publicación.

Evidencia histórica del candidato anterior (2026-10-03): Mini 613/613, E2E 31/31 y escenario browser SDK/emuladores PASS. No corresponde a este slice aislado. Evidencia M3 actual: RED por módulo ausente y TS2304 observado; cierre tipado local sin declaraciones ambient compartidas; build y 24 tests enfocados PASS. La suite completa y revisión nativa se registran en el documento de tareas y en el handoff de M3.
