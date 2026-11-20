// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.MiniBackupSummary` (browser global consumed by index.html and the P2P bridge).
// One place decides what a Mini backup contains, so file restore, P2P send and
// P2P review agree on what an "empty" backup is (and never restore one).

interface MiniBackupSummaryResult {
  employees: number;
  attendanceDays: number;
  attendanceRecords: number;
  requests: number;
  workContexts: number;
  hasSettings: boolean;
  comida: { clients: number; orders: number; payments: number; closedPeriods: number } | null;
  isEmpty: boolean;
}

(function exposeMiniBackupSummary(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniBackupSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniBackupSummaryModule() {
  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function countWorkContexts(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (isPlainObject(value) && Array.isArray(value.contexts)) return value.contexts.length;
    return 0;
  }

  function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  function summarize(parsed: unknown, { allowComida = false } = {}): MiniBackupSummaryResult {
    const data = isPlainObject(parsed) ? parsed : {};
    const employees = Array.isArray(data.users) ? data.users.length : 0;
    let attendanceDays = 0;
    let attendanceRecords = 0;
    if (isPlainObject(data.attendance)) {
      for (const day of Object.values(data.attendance)) {
        const records = isPlainObject(day) ? Object.keys(day).length : 0;
        if (records > 0) attendanceDays += 1;
        attendanceRecords += records;
      }
    }
    const requests = Array.isArray(data.requests) ? data.requests.length : 0;
    const food = allowComida && isPlainObject(data.comida) ? data.comida : null;
    const comida = food && {
      clients: list(food.clients).length,
      orders: list(food.orders).length,
      payments: list(food.payments).length,
      closedPeriods: list(food.periods).filter(period => isPlainObject(period) && typeof period.end === 'string').length
    };
    const hasFood = food && comida && (Object.values(comida).some(count => count > 0)
      || ['dishes', 'categories', 'purchases', 'pausedPersonIds'].some(key => list(food[key]).length > 0)
      || (isPlainObject(food.notes) && Object.keys(food.notes).length > 0));
    return {
      employees,
      attendanceDays,
      attendanceRecords,
      requests,
      workContexts: countWorkContexts(data.workContexts),
      hasSettings: isPlainObject(data.settings) && Object.keys(data.settings).length > 0,
      comida,
      isEmpty: employees === 0 && attendanceRecords === 0 && requests === 0 && !hasFood
    };
  }

  function validate(parsed: unknown, { allowComida = false } = {}) {
    if (!isPlainObject(parsed) || (parsed.schema !== undefined && parsed.schema !== 'mini-backup/v1')) {
      throw new Error('El archivo no es un respaldo de Mini.');
    }
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
      throw new Error('La versión del respaldo no es compatible. Actualiza Mini e inténtalo de nuevo.');
    }
    for (const [key, label] of [['users', 'empleados'], ['requests', 'solicitudes'], ['templates', 'plantillas']]) {
      if (parsed[key] !== undefined && (!Array.isArray(parsed[key]) || !parsed[key].every(isPlainObject))) {
        throw new Error('La lista de ' + label + ' no es válida.');
      }
    }
    if (parsed.attendance !== undefined && (!isPlainObject(parsed.attendance) || !Object.values(parsed.attendance).every(isPlainObject))) {
      throw new Error('La asistencia no es válida.');
    }
    if (parsed.settings !== undefined && (!isPlainObject(parsed.settings)
      || !Object.values(parsed.settings).every(value => value === null || typeof value === 'string'))) {
      throw new Error('Los ajustes no son válidos.');
    }
    if (parsed.workContexts !== undefined && !Array.isArray(parsed.workContexts)
      && (!isPlainObject(parsed.workContexts) || !Array.isArray(parsed.workContexts.contexts)
        || (parsed.workContexts.activeContextId != null && typeof parsed.workContexts.activeContextId !== 'string'))) {
      throw new Error('Las obras y cuadrillas no son válidas.');
    }
    if (parsed.comida !== undefined) {
      if (!allowComida) throw new Error('Comida se restaura mediante el archivo de respaldo.');
      const food = parsed.comida;
      if (!isPlainObject(food)
        || ['clients', 'orders', 'payments', 'periods', 'dishes', 'categories', 'purchases', 'pausedPersonIds']
          .some(key => food[key] !== undefined && !Array.isArray(food[key]))
        || ['notes', 'sent'].some(key => food[key] !== undefined && !isPlainObject(food[key]))) {
        throw new Error('Los datos de Comida del respaldo no son válidos.');
      }
      if (food.schemaVersion !== undefined && food.schemaVersion !== 1) {
        throw new Error('El respaldo de Comida es de una versión más nueva. Actualiza Mini.');
      }
    }
    return summarize(parsed, { allowComida });
  }

  return { summarize, validate };
});
