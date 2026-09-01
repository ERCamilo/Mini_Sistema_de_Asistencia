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

    function loadAttendance(): AttendanceDataStoreMap {
      const raw = storage.getItem(STORAGE_KEY_ATTENDANCE);
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

    function persistAttendance(data: AttendanceDataStoreMap): void {
      storage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(data));
      options.onSnapshotChanged?.(data, loadTombstones());
    }

    function persistTombstones(tombstones: AttendanceTombstoneRecord[]): void {
      storage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(tombstones));
      options.onSnapshotChanged?.(loadAttendance(), tombstones);
    }

    function getRecord(employeeId: string, date: string): AttendanceRecordEntry | null {
      const all = loadAttendance();
      const rec = all[date]?.[employeeId];
      return rec ? { ...rec } : null;
    }

    function getByDate(date: string): AttendanceDayRecords {
      const all = loadAttendance();
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
      const all = loadAttendance();
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
      const all = loadAttendance();
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
      const all = loadAttendance();
      const timestamp = nowFn();

      if (status === 'absent' || status === 'pending') {
        if (all[date]?.[employeeId]) {
          delete all[date][employeeId];
          if (Object.keys(all[date]).length === 0) {
            delete all[date];
          }
          persistAttendance(all);

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
      persistAttendance(all);

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
      const all = loadAttendance();
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

      if (mode === 'replace') {
        // Generate tombstones for all existing records
        const oldAttendance = loadAttendance();
        const tombstones = loadTombstones();
        const newTombstones: AttendanceTombstoneRecord[] = [];
        for (const date in oldAttendance) {
          if (Object.prototype.hasOwnProperty.call(oldAttendance, date)) {
            for (const empId in oldAttendance[date]) {
              if (Object.prototype.hasOwnProperty.call(oldAttendance[date], empId)) {
                newTombstones.push({
                  date,
                  employeeId: empId,
                  type: 'attendance',
                  deletedAt: timestamp,
                  schemaVersion: CURRENT_SCHEMA_VERSION
                });
              }
            }
          }
        }
        persistTombstones([...tombstones, ...newTombstones]);
      }

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
      return { updatedDays, totalRecords, attendance: current };
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
