# Importar planilla de días (Excel/Sheets → Mini)

## Propuesta
La obra lleva una planilla con una columna por día (`S11` … `S30`, `O01`) y valores en
jornadas (`1.00` = día completo). Mini debe poder leerla pegándola tal cual (copiar
desde Excel/Sheets produce texto separado por tabulaciones) y actualizar **sólo días**
de **empleados que ya existen**.

## Reglas (decididas con el usuario)
| Celda | Efecto |
|---|---|
| vacía | no toca el día en Mini |
| `0.00` | borra la marca de ese día (si había) |
| `> 0` | presente con `horas = valor × horasEsperadas` (8 por defecto, Ajustes del reporte) |
| `2.00` en día doble | un día pagado doble → `horas = valor / 2 × horasEsperadas` |

- **Días dobles:** los domingos se marcan solos; un día que no es domingo se sugiere doble
  cuando la mayoría de sus valores > 0 son ≥ 2 (feriado, p. ej. 24/9 Las Mercedes).
  En la vista previa cada día se puede activar/desactivar como doble.
- **Empleados:** se asocian por la columna `No.` = número del empleado. El nombre se
  compara de forma tolerante (acentos, mayúsculas, 1–2 letras distintas). Si el número
  existe pero el nombre no se parece, la fila queda **desmarcada** hasta que el usuario
  confirme. Sin número coincidente se busca un nombre idéntico; si no, se lista como
  "no encontrado" y no se importa. No se crean ni editan empleados.
- **Posición:** el día queda en la principal (se quita `record.position`).
- **Fechas:** `S11` = letra del mes + día (E F M A M J J A S O N D). Las letras ambiguas
  (M, A, J) se resuelven de atrás hacia adelante: la última columna es la fecha más
  reciente ≤ hoy, y cada columna anterior es la más reciente anterior a la siguiente.
  También se aceptan `11/9` y `2026-09-11`.
- Los colores de la planilla se ignoran.

## Diseño
- `src/sheet-import.ts` → `window.SheetImport` (UMD), puro y testeado:
  `parseSheet(text, {today})`, `planSheetImport(parsed, users, {expectedHours, doubleDates, getRecord})`,
  `applySheetImport(plan, includedRows, repository)`.
- Escritura vía `attendanceRepository.setRecord` / `setDayPosition(null)` (tombstones y
  storage v2 intactos).
- UI: Ajustes → Respaldos e Importación → "Importar planilla de días" (modal con pegar,
  vista previa, días dobles, filas a incluir, Aplicar).
- Deshacer: se registra en el historial de importaciones (`source: 'sheet'`) con
  snapshot de empleados y asistencia → "Deshacer última importación".

## Tareas
1. Tests del módulo (parse, fechas, dobles, plan, apply) → módulo.
2. Cableado en `index.html` + `sw.js` precache + test de wiring.
3. E2E con la tabla real del usuario.
