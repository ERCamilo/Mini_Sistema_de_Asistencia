# Mini: candidato de vinculación por Firebase

createdAt: 2026-10-03T06:39:08.214644+00:00
updatedAt: 2026-10-06T17:04:24.000Z
completedAt: pendiente
Responsable de la actualización local: Codex. Estado: M3 revisado; integración local M8 preparada, verificación independiente pendiente.
Base del slice M3: c2f930de49e1c40e54381c74e636834f12fdf8b6.
Rama: review/mini-connections-20261006. Worktree: mini-native-review-20261006.
El candidato de origen y sus evidencias del 2026-10-03 son históricos; no constituyen validación de este slice.

## Integración local M8

El menú de Conexiones, sus rutas directa e internet y los assets locales se incorporan a `index.html` y al precache. La configuración conserva el mismo bloqueo por hostname: en localhost no se inicia Google ni el gateway. Las pruebas de cableado y recuperación ejercitan la UI mediante fixtures; no certifican OAuth humano, permisos efectivos ni servicios externos. Las coberturas Firebase y conexiones ampliadas quedan para M9/M10 y la preparación SA.

## Comportamiento histórico del slice M3
Este slice incorpora la API de vinculación, sus pruebas puras y scripts de laboratorio; no activa el flujo en `index.html` ni en el precache. El cableado de Ajustes y sus pruebas de integración se reservan para M8. Con configuración revisada: Google → código → revisar organización/obra/grupos → confirmar. SDK Auth/App compat oficial 12.19.0 servido desde vendor, sin CDN. El SDK usa la persistencia local ya implementada (`setPersistence('local')`); este slice no cambia esa política ni exige login tras cada recarga. Elegir cuenta al abrir Google. Cerrar limpia la invitación y no revoca permisos ya concedidos. Cerrar durante una petición está bloqueado para evitar una falsa cancelación; timeout de fetch 15 segundos.

Preview no escribe. Confirmación revalida en gateway/servicio. UID procede del Firebase ID token verificado por Admin. Cambiar cuenta invalida resultados tardíos. Un canje adicional conserva grupos anteriores del servidor. Códigos/tokens no entran en localStorage ni backups de Mini. No se cambia personal/asistencia/contexto/P2P al vincular.

La configuración existente de `src/firebase-field-config.ts` se activa sólo para `firebase-circuit-test.mini-sistema-asistencia-preview.pages.dev`, con endpoint `https://firebase-bridge-test.erlin.do` y metadatos públicos del proyecto Auth `phoenix-asistencia-ab641`. En otros hostnames queda en `null`; una configuración inyectada previamente se conserva. M3 no modifica esos valores ni llama al servicio. El adaptador valida firebase.apiKey/authDomain/projectId/appId y endpoint HTTPS de origen sin query/credenciales. Sin configuración, la futura UI informa En preparación y Mini sigue independiente. Emulador sólo con página/servicio/Auth en loopback y projectId demo- explícito. No introducir secretos Admin en cliente.

## Reproducción
Con dependencias locales ya disponibles: `npm test` (compila TS y ejecuta suite). No se instalan dependencias en este traspaso.
Pruebas enfocadas: `node --test tests/firebase-link.test.js tests/firebase-link-presentation.test.js tests/firebase-field-config.test.js`. El cierre de tipos pasa el root UMD a la factory y busca la capacidad opcional de iconos al montar; no requiere tipos ni runtime de M5/M7.

El laboratorio siguiente se conserva como receta histórica para una fase posterior. Requiere el cableado M8 y candidatos SA preparados; no se ejecuta ni se presenta como prueba del slice M3.
Laboratorio de integración contra candidato SA congelado:

```bash
PATH=/home/ubuntu/firebase-lab-20261003/jdk-21.0.12.1+1-jre/bin:$PATH \
SA_LINK_LAB=/home/ubuntu/worktrees/sa-firebase-link-preview-20261003/infra/firebase-link-preview \
MINI_LINK_LOG=/home/ubuntu/agent-bridge/logs/supervisor/mini-firebase-linking-20261003 \
node scripts/firebase-link-lab/run.cjs
```

Requiere dependencias del laboratorio SA instaladas según su lock, Firebase CLI local 15.31.0, Java 21, Chromium /snap/bin/chromium. La suite evita cloud real y borra sólo Firestore emulado demo. No desplegar reglas .generated (incluyen probe de tests). Código de laboratorio es CJS de pruebas, producto nuevo es TS UMD estricto y JS generado.

Para E2E existentes: PLAYWRIGHT_MODULE=/home/ubuntu/agent-bridge/logs/supervisor/mini-firebase-linking-20261003/playwright-system.mjs npm run test:e2e. Wrapper externo selecciona Chromium instalado y downloadsPath en home; evita aislamiento /tmp de Snap. No requiere dependencias nuevas en package.json de Mini.

## Límites y siguiente unidad
Prueba Google ficticio mediante signInWithCredential dentro del SDK browser/emulador; no valida popup OAuth humano. Unit comprueba llamada signInWithPopup, selector de cuenta y persistencia local. Se requiere prueba humana con cuenta secundaria y proyecto/dominios autorizados, después de revisión/configuración del servicio.
La API de vinculación concede acceso sólo cuando se cablea y usa contra el servicio; M3 permanece dormido. Los módulos de roster, asistencia y grants no forman parte de este slice, y la infraestructura SA se prepara por separado. Si se pierde respuesta tras canje, permisos pueden haber quedado concedidos; no afirmar que se deshicieron, revisar grants en unidad siguiente. Modo offline de Firebase no certificado como transporte; Mini independiente preservado y E2E existente cubre datos locales.
La secuencia de slices integra posteriormente el candidato P2P. Originales y refs main permanecen intactos; M3 permite sólo commit local en la nueva rama de revisión. Sin push/merge/deploy ni cambios de rules de producción. Build/SW se sellan mediante herramientas oficiales antes de verificar; la revisión nativa es independiente de cualquier permiso de publicación.

Fuentes SDK: https://firebase.google.com/docs/auth/web/google-signin y https://firebase.google.com/docs/auth/web/auth-state-persistence . Licencia y fuente vendorizada en THIRD_PARTY_NOTICES.md.
