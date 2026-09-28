// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.MiniBackupReview` (browser global consumed by p2p-roster-ui.js).
// Builds the card-based review of a received Mini backup: what it brings and
// what would change on this device if it is restored (restore replaces data).

interface ReviewEmployee {
  id?: unknown;
  name?: unknown;
  number?: unknown;
  position?: unknown;
}

interface ReviewEmployeeLine {
  name: string;
  number: string;
  position: string;
}

interface ReviewCounts {
  employees: number;
  attendanceDays: number;
  attendanceRecords: number;
  firstDay: string | null;
  lastDay: string | null;
}

(function exposeMiniBackupReview(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniBackupReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniBackupReviewModule() {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function asEmployees(value: unknown): ReviewEmployee[] {
    return Array.isArray(value) ? value.filter(isRecord) as ReviewEmployee[] : [];
  }

  function numberKey(value: unknown): string {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    return /^\d+$/.test(clean) ? String(Number(clean)) : clean.toLowerCase();
  }

  function nameKey(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function toLine(employee: ReviewEmployee): ReviewEmployeeLine {
    return {
      name: String(employee.name ?? '').trim() || 'Sin nombre',
      number: String(employee.number ?? '').trim(),
      position: String(employee.position ?? '').trim()
    };
  }

  function countAttendance(employees: ReviewEmployee[], attendance: unknown): ReviewCounts {
    let attendanceDays = 0;
    let attendanceRecords = 0;
    let firstDay: string | null = null;
    let lastDay: string | null = null;
    if (isRecord(attendance)) {
      for (const [day, records] of Object.entries(attendance)) {
        const size = isRecord(records) ? Object.keys(records).length : 0;
        if (!size) continue;
        attendanceDays += 1;
        attendanceRecords += size;
        if (!firstDay || day < firstDay) firstDay = day;
        if (!lastDay || day > lastDay) lastDay = day;
      }
    }
    return { employees: employees.length, attendanceDays, attendanceRecords, firstDay, lastDay };
  }

  // Match incoming employees against this device: same id, else same employee
  // number (007 == 7), else same name ignoring accents/case. Each local employee
  // matches at most once.
  function compareEmployees(incoming: ReviewEmployee[], local: ReviewEmployee[]) {
    const used = new Set<number>();
    const find = (key: (employee: ReviewEmployee) => string, value: string) => {
      if (!value) return -1;
      return local.findIndex((employee, index) => !used.has(index) && key(employee) === value);
    };
    let matched = 0;
    const added: ReviewEmployeeLine[] = [];
    for (const employee of incoming) {
      let index = find(e => String(e.id ?? ''), String(employee.id ?? ''));
      if (index < 0) index = find(e => numberKey(e.number), numberKey(employee.number));
      if (index < 0) index = find(e => nameKey(e.name), nameKey(employee.name));
      if (index < 0) { added.push(toLine(employee)); continue; }
      used.add(index);
      matched += 1;
    }
    const removed = local.filter((_employee, index) => !used.has(index)).map(toLine);
    return { matched, added, removed };
  }

  function byNumber(a: ReviewEmployeeLine, b: ReviewEmployeeLine): number {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name, 'es');
  }

  function buildBackupReviewModel(parsed: unknown, current: { users?: unknown; attendance?: unknown }) {
    const data = isRecord(parsed) ? parsed : {};
    const incoming = asEmployees(data.users);
    const local = asEmployees(current.users);
    const backupCounts = countAttendance(incoming, data.attendance);
    const currentCounts = countAttendance(local, current.attendance);
    const workContexts = Array.isArray(data.workContexts)
      ? data.workContexts.length
      : (isRecord(data.workContexts) && Array.isArray(data.workContexts.contexts) ? data.workContexts.contexts.length : 0);
    return {
      backup: {
        employees: backupCounts.employees,
        attendanceDays: backupCounts.attendanceDays,
        attendanceRecords: backupCounts.attendanceRecords,
        requests: Array.isArray(data.requests) ? data.requests.length : 0,
        workContexts,
        firstDay: backupCounts.firstDay,
        lastDay: backupCounts.lastDay,
        exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null
      },
      current: currentCounts,
      employees: compareEmployees(incoming, local),
      backupEmployees: incoming.map(toLine).sort(byNumber),
      replacesExistingData: currentCounts.employees > 0 || currentCounts.attendanceRecords > 0
    };
  }

  return { buildBackupReviewModel };
});
