// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.StorageMaintenance` (browser global consumed by index.html).
// Frees localStorage left full by older versions, without touching real data:
// the duplicated `weeklyAttendance` copy, repeated/obsolete attendance
// tombstones and an outbox that nothing drains. Runs at boot and on demand.

interface MaintenanceStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MaintenanceReport {
  freedChars: number;
  tombstonesRemoved: number;
  outboxRemoved: number;
  duplicateCopyRemoved: boolean;
  beforeChars: number;
  afterChars: number;
}

(function exposeStorageMaintenance(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.StorageMaintenance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStorageMaintenanceModule() {
  const ATTENDANCE_KEY = 'attendance';
  const DUPLICATE_KEY = 'weeklyAttendance';
  const TOMBSTONES_KEY = 'attendance_tombstones';
  const OUTBOX_KEY = 'mini-sa-outbox-v1';
  const MAX_OUTBOX_ITEMS = 200;
  // Browsers allow ~5M UTF-16 characters per origin in localStorage.
  const APPROX_QUOTA_CHARS = 5 * 1024 * 1024;

  function parse(raw: string | null): unknown {
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return undefined; }
  }

  function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function measureStorage(storage: MaintenanceStorage) {
    const items: Array<{ key: string; chars: number }> = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      items.push({ key, chars: key.length + (storage.getItem(key) || '').length });
    }
    items.sort((a, b) => b.chars - a.chars);
    const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
    return { items, totalChars, approxQuotaChars: APPROX_QUOTA_CHARS };
  }

  // Keep one attendance copy. Never delete the duplicate unless the primary is readable.
  function removeDuplicateCopy(storage: MaintenanceStorage): boolean {
    const duplicateRaw = storage.getItem(DUPLICATE_KEY);
    if (duplicateRaw === null) return false;
    const primary = parse(storage.getItem(ATTENDANCE_KEY));
    if (isRecord(primary)) {
      storage.removeItem(DUPLICATE_KEY);
      return true;
    }
    if (storage.getItem(ATTENDANCE_KEY) === null && isRecord(parse(duplicateRaw))) {
      storage.setItem(ATTENDANCE_KEY, duplicateRaw);
      storage.removeItem(DUPLICATE_KEY);
      return true;
    }
    return false;
  }

  function compactTombstones(storage: MaintenanceStorage): number {
    const raw = storage.getItem(TOMBSTONES_KEY);
    const list = parse(raw);
    if (!Array.isArray(list)) return 0;
    const attendance = parse(storage.getItem(ATTENDANCE_KEY));
    const live = isRecord(attendance) ? attendance : {};
    const latest = new Map<string, any>();
    for (const tombstone of list) {
      if (!isRecord(tombstone) || typeof tombstone.date !== 'string' || typeof tombstone.employeeId !== 'string') continue;
      if (isRecord(live[tombstone.date]) && live[tombstone.date][tombstone.employeeId]) continue;
      const key = `${tombstone.date}\u0000${tombstone.employeeId}`;
      const known = latest.get(key);
      if (!known || String(tombstone.deletedAt) > String(known.deletedAt)) latest.set(key, tombstone);
    }
    const kept = [...latest.values()];
    if (kept.length === list.length) return 0;
    storage.setItem(TOMBSTONES_KEY, JSON.stringify(kept));
    return list.length - kept.length;
  }

  function trimOutbox(storage: MaintenanceStorage): number {
    const list = parse(storage.getItem(OUTBOX_KEY));
    if (!Array.isArray(list)) return 0;
    const pending = list.filter(item => isRecord(item) && (item.state === 'pending' || item.state === 'sending'));
    const kept = pending.slice(-MAX_OUTBOX_ITEMS);
    if (kept.length === list.length) return 0;
    storage.setItem(OUTBOX_KEY, JSON.stringify(kept));
    return list.length - kept.length;
  }

  function repairStorage(storage: MaintenanceStorage): MaintenanceReport {
    const beforeChars = measureStorage(storage).totalChars;
    // Order matters on a full device: every step only shrinks storage.
    const duplicateCopyRemoved = removeDuplicateCopy(storage);
    const tombstonesRemoved = compactTombstones(storage);
    const outboxRemoved = trimOutbox(storage);
    const afterChars = measureStorage(storage).totalChars;
    return {
      freedChars: Math.max(0, beforeChars - afterChars),
      tombstonesRemoved,
      outboxRemoved,
      duplicateCopyRemoved,
      beforeChars,
      afterChars
    };
  }

  return { MAX_OUTBOX_ITEMS, APPROX_QUOTA_CHARS, measureStorage, repairStorage };
});
