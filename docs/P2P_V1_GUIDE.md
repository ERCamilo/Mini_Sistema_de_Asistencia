# Guía de Arquitectura y Operación P2P v1 — Mini Sistema de Asistencia

Documento de referencia para la versión v1 del subsistema P2P de **Mini Sistema de Asistencia** (Fase F3.P2P / Hito `p2p-ui-hardening`).

---

## 1. Matriz de Capacidades y Superficies de Transporte

La interfaz principal de Transferencias expone una franja compacta (`.mini-p2p-capabilities`) con exactamente cuatro superficies de transporte:

| Capacidad | Dirección | Kind / Schema | Estado en UI | Comportamiento |
| :--- | :--- | :--- | :--- | :--- |
| **Personal** | SA → Mini | `kind: "roster"`<br>`schema: "sa-roster/v1"` | Activo (`is-ready`) | Espera roster enviado por SA; pasa a staging efímero; requiere revisión y confirmación manual previa a la aplicación. |
| **Asistencia** | Mini → SA | Query/Response<br>`attendance-submission/v1` | Activo (`is-ready`) | Escucha peticiones de SA y responde con la asistencia canónica del día/proyecto solicitada. |
| **Backup** | Mini ↔ Mini<br>SA → Mini | `kind: "backup"`<br>`mini-backup/v1`<br>`sa-backup/v1` | Activo (`is-ready`) | Abre el Hub de Respaldos (`data-open-backup-hub`). Permite enviar el respaldo nativo de Mini o recibir respaldos same-app / cross-app. |
| **Archivos** | Futuro | N/A | Deshabilitado (`is-disabled`) | Visible con etiqueta `Próximamente`. Sin listener, sin selector de archivos y con interacción bloqueada (`pointer-events: none; cursor: not-allowed;`). |

---

## 2. Flujos de Usuario

### 2.1 Vinculación Operativa SA ↔ Mini
1. **Inicio**: Mini escanea el código QR de SA o introduce código numérico + clave de 10 caracteres.
2. **Autenticación**: Intercambio de claves efímeras por canal WebRTC, derivación de clave compartida, verificación de SAS (Short Authentication String) y confirmación HMAC mutua.
3. **Persistencia**: Registro del par en `IdentityStore` con rol `sa`. Los pares SA aparecen en la lista de dispositivos vinculados en la portada de Transferencias.

### 2.2 Vinculación Same-App Mini ↔ Mini para Respaldos
1. **Acceso exclusivo**: Accesible únicamente desde el Hub de Respaldos pulsando `Vincular con otro Mini`.
2. **Opt-in explícito**: Requiere `allowSameApp: true` en la configuración de emparejamiento.
3. **Aislamiento**: Los pares same-app **nunca** aparecen en la lista principal de SA ni se enlazan a escuchas de roster o asistencia.

### 2.3 Recepción y Revisión de Roster SA
1. **Transferencia**: Envío fragmentado en chunks de 12 KiB; verificación de SHA-256 sobre los bytes crudos exactos.
2. **Staging**: Validación de formato UTF-8 y esquema `sa-roster/v1`. El roster queda en memoria en estado `pending`.
3. **Previsualización**: Se presentan diferencias (`Nuevos`, `Modificados`, `Sin cambios`) y resolución táctil de conflictos de identidad.
4. **Aplicación**: Sólo tras pulsar `Aplicar roster en Mini` se delega a `employeeRepository.importSaRoster`, actualizando empleados y registrando historial con opción de rollback.

### 2.4 Respuesta de Asistencia Mini → SA
1. **Solicitud**: SA envía una petición autenticada solicitando asistencia.
2. **Generación**: Mini invoca `AttendanceExport.generateAttendanceSubmission()` para construir el payload sellado.
3. **Envío**: Respuesta transmitida por el canal autenticado sin persistir datos intermedios en servidores externos.

### 2.5 Envío y Recepción de Respaldos
1. **Envío**: Desde el Hub de Respaldos, selección del par destinatario y pulsación de `Enviar respaldo`. Se empaquetan los datos nativos de Mini y se transfieren por WebRTC con acuse de recibo autenticado (`backup-staged` o `backup-rejected`).
2. **Recepción**: Almacenamiento en staging de memoria; generación de notificación visual de respaldo listo.

---

## 3. Alcance Deshabilitado y Endurecimiento Genérico (AC-6)

- **Fuera de alcance absoluto**: Archivos genéricos, documentos de oficina (.docx, .xlsx), fotografías arbitrarias, documentos PDF y binarios ejecutables o desconocidos están completamente excluidos del sistema P2P.
- **Rechazo fail-closed**: Todo frame de transporte con un `kind` distinto de `roster` o `backup`, o con esquemas ajenos a `sa-roster/v1`, `mini-backup/v1` o `sa-backup/v1`, es rechazado inmediatamente. La recepción revoca el canal WebRTC y descarta cualquier dato en tránsito.
- **Ausencia de selectores**: Las superficies P2P no incluyen elementos `<input type="file">` ni llamadas a la API File System (`showOpenFilePicker()`).

---

## 4. Staging Efímero y Regla de Cero Auto-Escritura (AC-4)

- **Principio**: La recepción de datos por P2P jamás equivale a su incorporación o escritura autoritativa.
- **Almacenamiento volátil**: Los respaldos y rosters recibidos residen exclusivamente en memoria (`backupStagedStore` / `pendingRoster`).
- **Límites**: Máximo 3 respaldos pendientes en total por dispositivo receptor. Un cuarto respaldo se rechaza explícitamente sin expulsiones silenciosas.
- **Deduplicación**: Deduplicación previa al límite por `transferId` y SHA-256. Reenviar un respaldo idéntico no consume ranuras adicionales.
- **Limpieza en fallo**: Si la transferencia se interrumpe, si un chunk se corrompe o si el hash SHA-256 final no coincide, el agregado en vuelo se elimina por completo sin dejar mutaciones en IndexedDB ni en almacenamiento local.

---

## 5. Matriz de Restauración y Manejo Cross-App (AC-7)

| Origen → Destino | Esquema | Acción Permitida en Mini | Acción Prohibida |
| :--- | :--- | :--- | :--- |
| **Mini → Mini** | `mini-backup/v1` | **Revisar / Restaurar**<br>Carga el JSON en `modal-restore-backup`. Requiere confirmación explícita mediante `doRestoreBackup()`. | Restauración automática silenciosa sin confirmación del usuario. |
| **SA → Mini** | `sa-backup/v1` | **Descargar / Guardar**<br>Descarga local del archivo JSON crudo con nombre seguro (`sa-backup-...json`). | **Restaurar o Importar** en Mini.<br>Mini no interpreta ni restaura esquemas administrativos de SA. |
| **SA → SA** | `sa-backup/v1` | N/A (Operado en SA) | N/A |

---

## 6. Preservación de Fallbacks Manuales (AC-8)

El funcionamiento del ecosistema no depende obligatoriamente de WebRTC ni de la conectividad P2P. Todos los mecanismos manuales continúan plenamente operativos:

1. **Roster Manual**: Modal `modal-import-employees` disponible para pegar JSON o importar archivo; procesado mediante `employeeRepository.importSaRoster`.
2. **Asistencia Manual**: Botón `shareToWhatsApp()` y generación canónica de texto para compartir reportes diarios por mensajería o portapapeles.
3. **Respaldos Nativos Mini**: Modal `modal-restore-backup`, selector de archivo `.json` (`restore-file-input`), validación en vivo y botón `Restaurar` (`doRestoreBackup()`).

---

## 7. Limitaciones de Navegador y Entorno PWA

- **Compuerta de Red (`navigator.onLine`)**: Si el navegador reporta estar desconectado (`navigator.onLine === false`), no se intentan conexiones WebRTC ni reintentos pasivos de presencia.
- **Suspensión de PWA / Navegador**: Cuando el dispositivo móvil bloquea la pantalla o suspende la pestaña en segundo plano, los timers de JavaScript se retrasan o detienen. Al recuperar el foco, los estados de presencia que excedan el TTL de 60s caducan honestamente a desconectado.
- **Señalización Efímera**: El servicio de señalización se utiliza únicamente para descubrimiento y negociación SDP/ICE (Offer/Answer). No almacena ni registra cuerpos de datos o respaldos.
- **Límite de Tamaño**:
  - Respaldo máximo v1: **25 MiB**.
  - Roster máximo v1: **10 MiB**.

---

## 8. Estado de Verificación y Pruebas Físicas E2E

- **Pruebas de Unidad e Integración Automatizadas**:
  - Suite de Node.js (`node --test`): **100% aprobada** (390 pruebas activas).
  - Cobertura: Integridad SHA-256, chunking, deduplicación, límites de staging, matriz de restauración, compuertas same-app, validación de esquemas y fallbacks manuales.
- **Pruebas E2E Físicas Multi-Dispositivo**:
  - **ESTADO: DIFERIDAS** (Pending physical hardware execution).
  - Las pruebas de campo que involucran dos teléfonos móviles físicos conectados a diferentes redes celulares (NAT simétrico / STUN / TURN) se encuentran diferidas y **NO** se consideran aprobadas de manera sintética hasta completar pruebas de campo con hardware real.
