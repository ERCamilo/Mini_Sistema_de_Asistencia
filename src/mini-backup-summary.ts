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

  function summarize(parsed: unknown): MiniBackupSummaryResult {
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
    return {
      employees,
      attendanceDays,
      attendanceRecords,
      requests,
      workContexts: countWorkContexts(data.workContexts),
      hasSettings: isPlainObject(data.settings) && Object.keys(data.settings).length > 0,
      isEmpty: employees === 0 && attendanceRecords === 0 && requests === 0
    };
  }

  return { summarize };
});
