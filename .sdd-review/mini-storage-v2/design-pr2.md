# Diseño PR 2 de storage v2: velocidad y salida de emergencia

Medido con 16 meses × 60 empleados (Chromium, PC; un celular medio es 3–5× más lento):

| | Antes | Después |
|---|---|---|
| Marcar (toque completo) | 1360 ms | 30 ms |
| Dibujar la lista | 1285 ms | 2 ms |
| Arranque | ~4000 ms | ~720 ms |

## Causas y cambios
1. **Cada lectura re-parseaba todo el historial** (`getRecord` × empleados × render).
   `AttendanceRepository` ahora cachea el historial parseado y lo reutiliza mientras el
   string guardado no cambie; las lecturas siguen devolviendo copias.
2. **Cada toque re-parseaba antes de escribir y otra vez después.** `setRecord` usa
   copy-on-write (sólo copia el día que cambia) y el resultado pasa a ser la caché.
3. **Cada toque reescribía y verificaba la asistencia completa en el snapshot viejo**
   (`asistencia-mini`, MBs en el hilo principal). Con v2 ese snapshot ya no lleva la
   asistencia (`captureDbSnapshot`); los respaldos (`captureLocalSnapshot`) sí.

## Salida de emergencia (Ajustes › Datos)
- Muestra dónde están los datos y cuántos días hay.
- «Volver al almacenamiento anterior»: al reiniciar, copia los días de v2 a localStorage
  y al snapshot viejo, y marca `migration.state = 'rolled-back'`. Si no entran (~5 MB),
  cancela, borra la copia a medias, quita la bandera y sigue en v2 (nunca queda a medias).
- «Usar el almacenamiento nuevo»: vuelve a migrar desde v1 (con lo marcado mientras tanto).

## Sigue pendiente
Empleados/solicitudes/outbox a IndexedDB: hoy ocupan poco; se harán con el outbox
coalescido (unidad 3 del spec) cuando llegue la sincronización con SA/Firebase.
