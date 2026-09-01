// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ImportHistoryRepository` (browser global consumed by index.html).

type ImportSourceType = 'json' | 'photo_ocr' | 'roster_package' | 'backup_restore' | 'manual_draft';
type ImportModeType = 'merge' | 'replace';

interface ImportSummaryData {
  totalIncoming: number;
  createdCount: number;
  updatedCount: number;
  skippedCount?: number;
  conflictsCount?: number;
}

interface ImportSnapshotBefore {
  users: unknown[];
  attendance?: unknown;
}

interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  source: ImportSourceType;
  mode: ImportModeType;
  summary: ImportSummaryData;
  snapshotBefore: ImportSnapshotBefore;
  status: 'applied' | 'rolled_back';
  rolledBackAt?: string;
  schemaVersion: 1;
}

interface ImportHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ImportHistoryOptions {
  storage: ImportHistoryStorage;
  maxEntries?: number;
  now?: () => string;
  generateId?: () => string;
  onHistoryChanged?: (entries: ImportHistoryEntry[]) => void;
}

(function exposeImportHistoryRepository(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ImportHistoryRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImportHistoryRepositoryModule() {
  const STORAGE_KEY_HISTORY = 'import_history_v1';
  const CURRENT_SCHEMA_VERSION = 1;
  const DEFAULT_MAX_ENTRIES = 10;

  function defaultNow(): string {
    return new Date().toISOString();
  }

  function defaultId(): string {
    return 'imp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  function createImportHistoryRepository(options: ImportHistoryOptions) {
    const storage = options.storage;
    const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    const nowFn = options.now || defaultNow;
    const idFn = options.generateId || defaultId;

    function loadEntries(): ImportHistoryEntry[] {
      const raw = storage.getItem(STORAGE_KEY_HISTORY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function persistEntries(entries: ImportHistoryEntry[]): void {
      // Keep only up to maxEntries to preserve local storage budget
      const trimmed = entries.slice(-maxEntries);
      storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(trimmed));
      options.onHistoryChanged?.(trimmed);
    }

    function recordImport(input: {
      source: ImportSourceType;
      mode: ImportModeType;
      summary: ImportSummaryData;
      snapshotBefore: ImportSnapshotBefore;
    }): ImportHistoryEntry {
      const entries = loadEntries();
      const newEntry: ImportHistoryEntry = {
        id: idFn(),
        timestamp: nowFn(),
        source: input.source,
        mode: input.mode,
        summary: {
          totalIncoming: input.summary.totalIncoming || 0,
          createdCount: input.summary.createdCount || 0,
          updatedCount: input.summary.updatedCount || 0,
          skippedCount: input.summary.skippedCount || 0,
          conflictsCount: input.summary.conflictsCount || 0
        },
        snapshotBefore: {
          users: Array.isArray(input.snapshotBefore?.users) ? JSON.parse(JSON.stringify(input.snapshotBefore.users)) : [],
          attendance: input.snapshotBefore?.attendance ? JSON.parse(JSON.stringify(input.snapshotBefore.attendance)) : undefined
        },
        status: 'applied',
        schemaVersion: CURRENT_SCHEMA_VERSION
      };

      const updated = [...entries, newEntry];
      persistEntries(updated);
      return { ...newEntry };
    }

    function getAll(): ImportHistoryEntry[] {
      return loadEntries().map(e => ({ ...e }));
    }

    function getLatest(): ImportHistoryEntry | null {
      const entries = loadEntries();
      if (!entries.length) return null;
      // Return latest applied entry
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].status === 'applied') {
          return { ...entries[i] };
        }
      }
      return null;
    }

    function getById(id: string): ImportHistoryEntry | null {
      const entries = loadEntries();
      const found = entries.find(e => e.id === id);
      return found ? { ...found } : null;
    }

    function rollback(
      id: string,
      repos: { employeeRepository?: any; attendanceRepository?: any }
    ): { success: boolean; entry?: ImportHistoryEntry; message: string } {
      const entries = loadEntries();
      const target = entries.find(e => e.id === id);

      if (!target) {
        return { success: false, message: 'Registro de importación no encontrado' };
      }

      if (target.status === 'rolled_back') {
        return { success: false, message: 'Esta importación ya fue revertida' };
      }

      // Restore employee repository if provided
      if (repos.employeeRepository && Array.isArray(target.snapshotBefore.users)) {
        if (typeof repos.employeeRepository.importBatch === 'function') {
          repos.employeeRepository.importBatch(target.snapshotBefore.users, 'replace');
        }
      }

      // Restore attendance repository if attendance snapshot was saved
      if (repos.attendanceRepository && target.snapshotBefore.attendance) {
        if (typeof repos.attendanceRepository.importBatch === 'function') {
          repos.attendanceRepository.importBatch(target.snapshotBefore.attendance, 'replace');
        }
      }

      target.status = 'rolled_back';
      target.rolledBackAt = nowFn();
      persistEntries(entries);

      return {
        success: true,
        entry: { ...target },
        message: 'Importación revertida exitosamente'
      };
    }

    function rollbackLatest(
      repos: { employeeRepository?: any; attendanceRepository?: any }
    ): { success: boolean; entry?: ImportHistoryEntry; message: string } {
      const latest = getLatest();
      if (!latest) {
        return { success: false, message: 'No hay ninguna importación disponible para revertir' };
      }
      return rollback(latest.id, repos);
    }

    function clearHistory(): void {
      persistEntries([]);
    }

    return {
      recordImport,
      getAll,
      getLatest,
      getById,
      rollback,
      rollbackLatest,
      clearHistory
    };
  }

  return {
    createImportHistoryRepository
  };
});
