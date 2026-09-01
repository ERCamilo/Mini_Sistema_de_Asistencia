// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.EmployeeRepository` (browser global consumed by index.html).

interface EmployeeRecord {
  id: EmployeeId;
  name: string;
  number: string;
  position?: string;
  sueldo?: string;
  workContextId?: string;
  paused?: boolean;
  localOnly?: boolean;
  createdAt?: string;
  updatedAt?: string;
  schemaVersion?: number;
  [extra: string]: unknown;
}

interface EmployeeDraftInput {
  id?: EmployeeId | '';
  name: string;
  number: string;
  position?: string;
  sueldo?: string;
  workContextId?: string;
  paused?: boolean;
  [extra: string]: unknown;
}

interface EmployeeTombstoneRecord {
  id: EmployeeId;
  type: 'employee';
  deletedAt: string;
  schemaVersion: 1;
}

interface EmployeeRepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface EmployeeRepositoryOptions {
  storage: EmployeeRepositoryStorage;
  rules?: {
    saveEmployeeDraft(
      users: any[],
      draft: any,
      newEmployeeId?: string
    ): { status: 'saved' | 'conflict'; users: any[]; conflict: any };
    normalizeEmployeeNumber(value: unknown): number | null;
  };
  now?: () => string;
  onSnapshotChanged?: (users: EmployeeRecord[], tombstones: EmployeeTombstoneRecord[]) => void;
}

interface BatchImportResult {
  updatedCount: number;
  createdCount: number;
  skippedCount: number;
  totalValid: number;
  users: EmployeeRecord[];
}

(function exposeEmployeeRepository(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EmployeeRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeeRepositoryModule() {
  const STORAGE_KEY_USERS = 'users';
  const STORAGE_KEY_TOMBSTONES = 'employee_tombstones';
  const CURRENT_SCHEMA_VERSION = 1;

  function defaultNow(): string {
    return new Date().toISOString();
  }

  function createEmployeeRepository(options: EmployeeRepositoryOptions) {
    const storage = options.storage;
    const nowFn = options.now || defaultNow;
    const rules = options.rules || (typeof globalThis !== 'undefined' && (globalThis as any).EmployeeNumberRules);

    function loadUsers(): EmployeeRecord[] {
      const raw = storage.getItem(STORAGE_KEY_USERS);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function loadTombstones(): EmployeeTombstoneRecord[] {
      const raw = storage.getItem(STORAGE_KEY_TOMBSTONES);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function persistUsers(users: EmployeeRecord[]): void {
      storage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
      options.onSnapshotChanged?.(users, loadTombstones());
    }

    function persistTombstones(tombstones: EmployeeTombstoneRecord[]): void {
      storage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(tombstones));
      options.onSnapshotChanged?.(loadUsers(), tombstones);
    }

    function getAll(filter?: { includePaused?: boolean }): EmployeeRecord[] {
      const users = loadUsers();
      const includePaused = filter?.includePaused !== false;
      if (includePaused) {
        return users.map(u => ({ ...u }));
      }
      return users.filter(u => !u.paused).map(u => ({ ...u }));
    }

    function getById(id: EmployeeId): EmployeeRecord | null {
      const users = loadUsers();
      const found = users.find(u => u.id === id);
      return found ? { ...found } : null;
    }

    function getByNumber(candidateNumber: unknown): EmployeeRecord | null {
      if (!rules) return null;
      const norm = rules.normalizeEmployeeNumber(candidateNumber);
      if (norm === null) return null;
      const users = loadUsers();
      const found = users.find(u => rules.normalizeEmployeeNumber(u.number) === norm);
      return found ? { ...found } : null;
    }

    function generateId(): string {
      return 'u' + Date.now() + Math.random().toString(36).slice(2, 7);
    }

    function save(draft: EmployeeDraftInput, candidateId?: EmployeeId): { status: 'saved' | 'conflict'; employee?: EmployeeRecord; conflict?: any } {
      const users = loadUsers();
      const timestamp = nowFn();
      const isCreate = !draft.id;
      const targetId = draft.id || candidateId || generateId();

      const normalizedDraft: EmployeeDraftInput = {
        ...draft,
        id: isCreate ? '' : draft.id,
        name: String(draft.name || '').trim(),
        number: String(draft.number || '').trim(),
        position: draft.position ? String(draft.position).trim() : '',
        sueldo: draft.sueldo !== undefined && draft.sueldo !== null && String(draft.sueldo).trim() !== '' ? String(draft.sueldo).trim() : undefined,
        workContextId: draft.workContextId ? String(draft.workContextId).trim() : undefined,
        paused: !!draft.paused
      };

      if (rules && typeof rules.saveEmployeeDraft === 'function') {
        const result = rules.saveEmployeeDraft(users, normalizedDraft, targetId);
        if (result.status === 'conflict') {
          return { status: 'conflict', conflict: result.conflict };
        }
        
        const existingRecord = users.find(u => u.id === targetId);

        // Enrich saved employee with metadata
        const updatedUsers = result.users.map((u: any) => {
          if (u.id === targetId) {
            return {
              ...u,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              localOnly: true,
              createdAt: existingRecord?.createdAt || u.createdAt || timestamp,
              updatedAt: timestamp
            };
          }
          return u;
        });

        persistUsers(updatedUsers);
        const saved = updatedUsers.find((u: EmployeeRecord) => u.id === targetId);
        return { status: 'saved', employee: saved ? { ...saved } : undefined };
      }

      // Fallback without rules
      let nextUsers: EmployeeRecord[];
      let savedRecord: EmployeeRecord;

      if (isCreate) {
        savedRecord = {
          ...normalizedDraft,
          id: targetId,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          localOnly: true,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        nextUsers = [...users, savedRecord];
      } else {
        const existing = users.find(u => u.id === targetId);
        savedRecord = {
          ...(existing || {}),
          ...normalizedDraft,
          id: targetId,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          localOnly: true,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp
        };
        nextUsers = users.map(u => (u.id === targetId ? savedRecord : u));
      }

      persistUsers(nextUsers);
      return { status: 'saved', employee: { ...savedRecord } };
    }

    function setPaused(id: EmployeeId, paused: boolean): EmployeeRecord | null {
      const users = loadUsers();
      const existing = users.find(u => u.id === id);
      if (!existing) return null;

      const timestamp = nowFn();
      const updated: EmployeeRecord = {
        ...existing,
        paused: paused ? true : undefined,
        updatedAt: timestamp
      };

      if (!paused) {
        delete updated.paused;
      }

      const nextUsers = users.map(u => (u.id === id ? updated : u));
      persistUsers(nextUsers);
      return { ...updated };
    }

    function remove(id: EmployeeId): boolean {
      const users = loadUsers();
      const existing = users.find(u => u.id === id);
      if (!existing) return false;

      const nextUsers = users.filter(u => u.id !== id);
      persistUsers(nextUsers);

      // Record tombstone
      const tombstones = loadTombstones();
      const newTombstone: EmployeeTombstoneRecord = {
        id,
        type: 'employee',
        deletedAt: nowFn(),
        schemaVersion: CURRENT_SCHEMA_VERSION
      };
      const nextTombstones = [...tombstones.filter((t: EmployeeTombstoneRecord) => t.id !== id), newTombstone];
      persistTombstones(nextTombstones);

      return true;
    }

    function importBatch(incoming: unknown[], mode: 'merge' | 'replace' = 'merge'): BatchImportResult {
      if (!Array.isArray(incoming)) {
        throw new Error('La lista a importar debe ser un arreglo de empleados');
      }

      const valid = incoming.filter((e: any) =>
        e && e.name && e.number !== undefined && e.number !== null && String(e.number).trim() !== ''
      );
      const skippedCount = incoming.length - valid.length;
      const timestamp = nowFn();
      const normalizeNum = rules?.normalizeEmployeeNumber || ((v: any) => parseInt(v, 10) || null);

      if (mode === 'replace') {
        const currentUsers = loadUsers();
        // Generate tombstones for replaced users
        const tombstones = loadTombstones();
        const newTombstones: EmployeeTombstoneRecord[] = currentUsers.map(u => ({
          id: u.id,
          type: 'employee',
          deletedAt: timestamp,
          schemaVersion: CURRENT_SCHEMA_VERSION
        }));
        persistTombstones([...tombstones, ...newTombstones]);

        const nextUsers: EmployeeRecord[] = valid.map((emp: any) => {
          const isPaused = (emp.paused === true || emp.paused === 'true' || emp.status === 'paused' || emp.status === 'inactive' || emp.active === false)
            ? true
            : undefined;

          return {
            id: emp.id || generateId(),
            name: String(emp.name).trim(),
            number: String(emp.number).trim(),
            position: emp.position ? String(emp.position).trim() : '',
            sueldo: emp.sueldo !== undefined && emp.sueldo !== null && String(emp.sueldo).trim() !== '' ? String(emp.sueldo).trim() : undefined,
            workContextId: emp.workContextId ? String(emp.workContextId).trim() : undefined,
            paused: isPaused,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            localOnly: true,
            createdAt: emp.createdAt || timestamp,
            updatedAt: timestamp
          };
        });

        persistUsers(nextUsers);
        return {
          updatedCount: 0,
          createdCount: nextUsers.length,
          skippedCount,
          totalValid: valid.length,
          users: nextUsers
        };
      }

      // Mode: merge
      const currentUsers = loadUsers();
      let updatedCount = 0;
      let createdCount = 0;
      const nextUsers: EmployeeRecord[] = currentUsers.map(u => ({ ...u }));

      valid.forEach((emp: any) => {
        const normNum = normalizeNum(emp.number);
        const isPaused = (emp.paused === true || emp.paused === 'true' || emp.status === 'paused' || emp.status === 'inactive' || emp.active === false)
          ? true
          : (emp.paused === false || emp.active === true || emp.status === 'active')
            ? false
            : undefined;

        const existing = nextUsers.find(u => (emp.id && u.id === emp.id) || (normNum !== null && normalizeNum(u.number) === normNum));
        if (existing) {
          existing.name = String(emp.name).trim();
          if (emp.position !== undefined) existing.position = String(emp.position).trim();
          if (emp.sueldo !== undefined) {
            const s = String(emp.sueldo).trim();
            existing.sueldo = s ? s : undefined;
          }
          if (emp.workContextId !== undefined) {
            const c = String(emp.workContextId).trim();
            existing.workContextId = c ? c : undefined;
          }
          if (isPaused !== undefined) {
            existing.paused = isPaused ? true : undefined;
          }
          existing.updatedAt = timestamp;
          existing.schemaVersion = CURRENT_SCHEMA_VERSION;
          existing.localOnly = true;
          updatedCount++;
        } else {
          nextUsers.push({
            id: emp.id || generateId(),
            name: String(emp.name).trim(),
            number: String(emp.number).trim(),
            position: emp.position ? String(emp.position).trim() : '',
            sueldo: emp.sueldo !== undefined && emp.sueldo !== null && String(emp.sueldo).trim() !== '' ? String(emp.sueldo).trim() : undefined,
            workContextId: emp.workContextId ? String(emp.workContextId).trim() : undefined,
            paused: isPaused ? true : undefined,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            localOnly: true,
            createdAt: emp.createdAt || timestamp,
            updatedAt: timestamp
          });
          createdCount++;
        }
      });

      persistUsers(nextUsers);
      return {
        updatedCount,
        createdCount,
        skippedCount,
        totalValid: valid.length,
        users: nextUsers
      };
    }

    function exportSnapshot(): {
      schemaVersion: 1;
      exportedAt: string;
      employees: EmployeeRecord[];
      tombstones: EmployeeTombstoneRecord[];
    } {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: nowFn(),
        employees: loadUsers().map(u => ({ ...u })),
        tombstones: loadTombstones().map(t => ({ ...t }))
      };
    }

    function getTombstones(): EmployeeTombstoneRecord[] {
      return loadTombstones().map(t => ({ ...t }));
    }

    function clearTombstones(): void {
      persistTombstones([]);
    }

    function clearAll(): void {
      persistUsers([]);
      persistTombstones([]);
    }

    return {
      getAll,
      getById,
      getByNumber,
      save,
      setPaused,
      remove,
      importBatch,
      exportSnapshot,
      getTombstones,
      clearTombstones,
      clearAll
    };
  }

  return {
    createEmployeeRepository
  };
});
