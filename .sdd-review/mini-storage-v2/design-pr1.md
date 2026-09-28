# Diseño PR 1 de storage v2: la asistencia pasa a IndexedDB

Cubre las unidades 1, 2 y 4 del spec (base, repositorio y migración) sólo para la asistencia,
que es lo que llena el celular. Empleados, solicitudes y ajustes siguen en localStorage
(son chicos) y pasan en el PR 2 junto con el outbox (unidad 3).

## Idea
`AttendanceRepository` ya recibe su almacenamiento por inyección (`getItem/setItem`).
En vez de reescribir el repositorio (lógica probada), se le da un almacenamiento nuevo:
- `MiniData.createDayStorage`: mantiene `attendance` y `attendance_tombstones` en memoria
  (lecturas sincrónicas, como hoy) y persiste en IndexedDB **sólo los días que cambiaron**
  (un registro por día en `mini-data/attendanceDays`). El resto de las claves va a localStorage.
- `attendanceStorage` (proxy conmutables) arranca en localStorage y pasa a IndexedDB
  cuando la migración está verificada.

## Migración (reanudable, verificada)
1. Si `meta.migration.state === 'verified'`: nada que migrar.
2. Si no: fuente v1 = snapshot IndexedDB `asistencia-mini` (si está habilitado y existe),
   si no `localStorage.attendance` (o `weeklyAttendance`). JSON corrupto → se queda en v1.
3. Una transacción: todos los días + tombstones + copia cruda de v1 (`meta.v1Backup`) +
   `migration.state = 'written'`; se borran días que sobren de un intento anterior.
4. Se relee todo y se compara día por día (JSON idéntico) y los tombstones. Sólo entonces
   `state = 'verified'`. Si falla: v2 se ignora y la app sigue en v1.
5. Recién con v2 activo se borran de localStorage `attendance`, `weeklyAttendance` y
   `attendance_tombstones` (liberan los ~5 MB). La copia v1 queda en `meta.v1Backup` y en
   el snapshot `asistencia-mini`.

## Cambios en index.html
- `bootStorage()` corre antes de `init()`; ante cualquier error la app sigue en v1.
- `loadData`, `writeLegacyMirror` y `applyLocalSnapshot` no tocan la asistencia en v2.
- «Borrar todo» y la reparación de almacenamiento usan `attendanceStorage`.
- Si una escritura a IndexedDB falla se avisa y se reintenta con la próxima marca.

## Fuera de este PR
Empleados/solicitudes/outbox a IndexedDB, quitar la asistencia del snapshot completo,
«volver al almacenamiento anterior» en Ajustes (hoy: bandera `miniDataV2=off`).
