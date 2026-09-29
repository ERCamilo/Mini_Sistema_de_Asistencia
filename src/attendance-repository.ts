// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceRepository` (browser global consumed by index.html).

interface AttendanceRecordEntry {
  status: 'present';
  hours: number;
  createdAt?: string;
  updatedAt?: string;
  schemaVersion?: number;
  localOnly?: boolean;
  [extra: string]: unknown;
}

interface AttendanceDayRecords {
  [employeeId: string]: AttendanceRecordEntry;
}

interface AttendanceDataStoreMap {
  [date: string]: AttendanceDayRecords;
}

interface AttendanceTombstoneRecord {
  date: string;
  employeeId: string;
  type: 'attendance';
  deletedAt: string;
  schemaVersion: 1;
}

interface AttendanceRepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AttendanceRepositoryOptions {
  storage: AttendanceRepositoryStorage;
  now?: () => string;
  onSnapshotChanged?: (attendance: AttendanceDataStoreMap, tombstones: AttendanceTombstoneRecord[]) => void;
}

(function exposeAttendanceRepository(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.AttendanceRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceRepositoryModule() {
  const STORAGE_KEY_ATTENDANCE = 'attendance';
  const STORAGE_KEY_TOMBSTONES = 'attendance_tombstones';
  const CURRENT_SCHEMA_VERSION = 1;

  function defaultNow(): string {
    return new Date().toISOString();
  }

  function createAttendanceRepository(options: AttendanceRepositoryOptions) {
    const storage = options.storage;
    const nowFn = options.now || defaultNow;

    // Read cache: the history is parsed once and reused until the stored string
    // changes. Only read functions use it, and they always return copies.
    let cachedRaw: string | null | undefined;
    let cachedView: AttendanceDataStoreMap = {};

    function readView(): AttendanceDataStoreMap {
      const raw = storage.getItem(STORAGE_KEY_ATTENDANCE);
      if (raw !== cachedRaw) {
        cachedView = parseAttendance(raw);
        cachedRaw = raw;
      }
      return cachedView;
    }

    // Fresh, mutable copy for writes.
    function loadAttendance(): AttendanceDataStoreMap {
      return parseAttendance(storage.getItem(STORAGE_KEY_ATTENDANCE));
    }

    function parseAttendance(raw: string | null): AttendanceDataStoreMap {
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        
        // Normalize legacy format: string status -> object { status, hours }
        const normalized: AttendanceDataStoreMap = {};
        for (const date in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, date) && parsed[date] && typeof parsed[date] === 'object') {
            normalized[date] = {};
            for (const empId in parsed[date]) {
              if (Object.prototype.hasOwnProperty.call(parsed[date], empId)) {
                const rec = parsed[date][empId];
                if (typeof rec === 'string') {
                  normalized[date][empId] = { status: 'present', hours: 8, schemaVersion: CURRENT_SCHEMA_VERSION, localOnly: true };
                } else if (rec && typeof rec === 'object' && rec.status === 'present') {
                  normalized[date][empId] = {
                    ...rec,
                    status: 'present',
                    hours: typeof rec.hours === 'number' ? rec.hours : (parseFloat(rec.hours) || 8),
                    schemaVersion: rec.schemaVersion || CURRENT_SCHEMA_VERSION,
                    localOnly: rec.localOnly !== false
                  };
                }
              }
            }
          }
        }
        return normalized;
      } catch {
        return {};
      }
    }

    function loadTombstones(): AttendanceTombstoneRecord[] {
      const raw = storage.getItem(STORAGE_KEY_TOMBSTONES);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    // `adopt`: the caller hands `data` over (never mutates it again), so it
    // becomes the read cache and the next read needs no parse.
    function persistAttendance(data: AttendanceDataStoreMap, adopt = false): void {
      const raw = JSON.stringify(data);
      storage.setItem(STORAGE_KEY_ATTENDANCE, raw);
      if (adopt) {
        cachedRaw = raw;
        cachedView = data;
      }
      options.onSnapshotChanged?.(data, loadTombstones());
    }

    // Copy-on-write for one day: other days are shared with the (read-only) cache.
    function withDayCopy(date: string): AttendanceDataStoreMap {
      const all: AttendanceDataStoreMap = { ...readView() };
      if (all[date]) all[date] = { ...all[date] };
      return all;
    }

    function persistTombstones(tombstones: AttendanceTombstoneRecord[]): void {
      storage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(tombstones));
      options.onSnapshotChanged?.(getAll(), tombstones);
    }

    function getRecord(employeeId: string, date: string): AttendanceRecordEntry | null {
      const all = readView();
      const rec = all[date]?.[employeeId];
      return rec ? { ...rec } : null;
    }

    function getByDate(date: string): AttendanceDayRecords {
      const all = readView();
      const day = all[date] || {};
      const result: AttendanceDayRecords = {};
      for (const id in day) {
        if (Object.prototype.hasOwnProperty.call(day, id)) {
          result[id] = { ...day[id] };
        }
      }
      return result;
    }

    function getByEmployee(employeeId: string, fromDate?: string, toDate?: string): Record<string, AttendanceRecordEntry> {
      const all = readView();
      const result: Record<string, AttendanceRecordEntry> = {};
      for (const date in all) {
        if (Object.prototype.hasOwnProperty.call(all, date)) {
          if (fromDate && date < fromDate) continue;
          if (toDate && date > toDate) continue;
          if (all[date]?.[employeeId]) {
            result[date] = { ...all[date][employeeId] };
          }
        }
      }
      return result;
    }

    function getDateRange(fromDate: string, toDate: string): AttendanceDataStoreMap {
      const all = readView();
      const result: AttendanceDataStoreMap = {};
      for (const date in all) {
        if (Object.prototype.hasOwnProperty.call(all, date)) {
          if (date >= fromDate && date <= toDate) {
            result[date] = {};
            for (const id in all[date]) {
              if (Object.prototype.hasOwnProperty.call(all[date], id)) {
                result[date][id] = { ...all[date][id] };
              }
            }
          }
        }
      }
      return result;
    }

    function setRecord(
      employeeId: string,
      date: string,
      status: 'present' | 'absent' | 'pending',
      hours: number = 8
    ): { status: 'saved' | 'deleted'; record?: AttendanceRecordEntry; tombstone?: AttendanceTombstoneRecord } {
      const all = withDayCopy(date);
      const timestamp = nowFn();

      if (status === 'absent' || status === 'pending') {
        if (all[date]?.[employeeId]) {
          delete all[date][employeeId];
          if (Object.keys(all[date]).length === 0) {
            delete all[date];
          }
          persistAttendance(all, true);

          // Register tombstone
          const tombstones = loadTombstones();
          const tombstone: AttendanceTombstoneRecord = {
            date,
            employeeId,
            type: 'attendance',
            deletedAt: timestamp,
            schemaVersion: CURRENT_SCHEMA_VERSION
          };
          const nextTombstones = [
            ...tombstones.filter((t: AttendanceTombstoneRecord) => !(t.date === date && t.employeeId === employeeId)),
            tombstone
          ];
          persistTombstones(nextTombstones);
          return { status: 'deleted', tombstone };
        }
        return { status: 'deleted' };
      }

      // Status === 'present'
      if (!all[date]) all[date] = {};
      const existing = all[date][employeeId];
      const parsedHours = parseFloat(String(hours)) || 8;

      const record: AttendanceRecordEntry = {
        ...(existing || {}),
        status: 'present',
        hours: parsedHours,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        localOnly: true,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      };

      all[date][employeeId] = record;
      persistAttendance(all, true);

      // Clean any existing tombstone for this same day+employee
      const tombstones = loadTombstones();
      if (tombstones.some((t: AttendanceTombstoneRecord) => t.date === date && t.employeeId === employeeId)) {
        persistTombstones(tombstones.filter((t: AttendanceTombstoneRecord) => !(t.date === date && t.employeeId === employeeId)));
      }

      return { status: 'saved', record: { ...record } };
    }

    function deleteRecord(employeeId: string, date: string): boolean {
      const result = setRecord(employeeId, date, 'absent');
      return result.status === 'deleted' && !!result.tombstone;
    }

    function getAll(): AttendanceDataStoreMap {
      const all = readView();
      const result: AttendanceDataStoreMap = {};
      for (const d in all) {
        if (Object.prototype.hasOwnProperty.call(all, d)) {
          result[d] = {};
          for (const id in all[d]) {
            if (Object.prototype.hasOwnProperty.call(all[d], id)) {
              result[d][id] = { ...all[d][id] };
            }
          }
        }
      }
      return result;
    }

    // Archival removal ("Archivar meses antiguos"): whole days leave this device
    // without tombstones, because the goal is to free space, not to sync deletions.
    function removeDays(dates: string[]): number {
      const all = loadAttendance();
      let removed = 0;
      for (const date of dates) {
        if (Object.prototype.hasOwnProperty.call(all, date)) {
          delete all[date];
          removed += 1;
        }
      }
      if (removed) persistAttendance(all);
      return removed;
    }

    function clearAll(): void {
      persistAttendance({});
    }

    function importBatch(
      incoming: unknown,
      mode: 'merge' | 'replace' = 'merge'
    ): { updatedDays: number; totalRecords: number; attendance: AttendanceDataStoreMap } {
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        throw new Error('Los datos de asistencia a importar deben ser un mapa de fechas a registros');
      }

      const timestamp = nowFn();
      const current = mode === 'replace' ? {} : loadAttendance();
      const parsed = incoming as Record<string, Record<string, unknown>>;
      let updatedDays = 0;
      let totalRecords = 0;

      const previous = mode === 'replace' ? loadAttendance() : null;

      for (const date in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, date) && parsed[date] && typeof parsed[date] === 'object') {
          if (!current[date]) current[date] = {};
          let dayChanged = false;

          for (const empId in parsed[date]) {
            if (Object.prototype.hasOwnProperty.call(parsed[date], empId)) {
              const rec = parsed[date][empId] as any;
              let item: AttendanceRecordEntry | null = null;

              if (typeof rec === 'string' && rec === 'present') {
                item = {
                  status: 'present',
                  hours: 8,
                  schemaVersion: CURRENT_SCHEMA_VERSION,
                  localOnly: true,
                  createdAt: timestamp,
                  updatedAt: timestamp
                };
              } else if (rec && typeof rec === 'object' && rec.status === 'present') {
                const existing = current[date][empId];
                item = {
                  ...rec,
                  status: 'present',
                  hours: typeof rec.hours === 'number' ? rec.hours : (parseFloat(rec.hours) || 8),
                  schemaVersion: CURRENT_SCHEMA_VERSION,
                  localOnly: true,
                  createdAt: existing?.createdAt || rec.createdAt || timestamp,
                  updatedAt: timestamp
                };
              }

              if (item) {
                current[date][empId] = item;
                dayChanged = true;
                totalRecords += 1;
              }
            }
          }

          if (dayChanged) {
            updatedDays += 1;
          }
        }
      }

      persistAttendance(current);
      reconcileTombstones(current, previous, timestamp);
      return { updatedDays, totalRecords, attendance: current };
    }

    function tombstoneKey(date: string, employeeId: string): string {
      return `${date}\u0000${employeeId}`;
    }

    // A tombstone marks a record that was deleted. Keep one per day+employee
    // (the latest), drop the ones whose record exists again, and add tombstones
    // only for records that `replace` really removed. Hydrating with the same
    // data is therefore a no-op instead of growing storage on every launch.
    function reconcileTombstones(
      current: AttendanceDataStoreMap,
      previous: AttendanceDataStoreMap | null,
      timestamp: string
    ): void {
      const stored = loadTombstones();
      const latest = new Map<string, AttendanceTombstoneRecord>();
      for (const tombstone of stored) {
        if (!tombstone || typeof tombstone.date !== 'string' || typeof tombstone.employeeId !== 'string') continue;
        if (current[tombstone.date]?.[tombstone.employeeId]) continue;
        const key = tombstoneKey(tombstone.date, tombstone.employeeId);
        const known = latest.get(key);
        if (!known || String(tombstone.deletedAt) > String(known.deletedAt)) latest.set(key, tombstone);
      }
      if (previous) {
        for (const date of Object.keys(previous)) {
          for (const employeeId of Object.keys(previous[date] || {})) {
            if (current[date]?.[employeeId]) continue;
            latest.set(tombstoneKey(date, employeeId), {
              date,
              employeeId,
              type: 'attendance',
              deletedAt: timestamp,
              schemaVersion: CURRENT_SCHEMA_VERSION
            });
          }
        }
      }
      const next = [...latest.values()];
      if (next.length !== stored.length || next.some((tombstone, index) => tombstone !== stored[index])) {
        persistTombstones(next);
      }
    }

    function exportSnapshot(): {
      schemaVersion: 1;
      exportedAt: string;
      attendance: AttendanceDataStoreMap;
      tombstones: AttendanceTombstoneRecord[];
    } {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: nowFn(),
        attendance: getAll(),
        tombstones: loadTombstones().map(t => ({ ...t }))
      };
    }

    function getTombstones(): AttendanceTombstoneRecord[] {
      return loadTombstones().map(t => ({ ...t }));
    }

    function clearTombstones(): void {
      persistTombstones([]);
    }

    return {
      getRecord,
      getByDate,
      getByEmployee,
      getDateRange,
      setRecord,
      deleteRecord,
      getAll,
      clearAll,
      removeDays,
      importBatch,
      exportSnapshot,
      getTombstones,
      clearTombstones
    };
  }

  return {
    createAttendanceRepository
  };
});
