// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.WorkContextManager` (browser global consumed by index.html).

type WorkContextType = 'project' | 'squad' | 'custom';

interface WorkContext {
  id: string;
  name: string;
  type: WorkContextType;
  color?: string;
  createdAt: string;
  schemaVersion: 1;
}

interface WorkContextStateSnapshot {
  schemaVersion: 1;
  contexts: WorkContext[];
  activeContextId: string | null;
}

interface WorkContextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface WorkContextManagerOptions {
  storage: WorkContextStorage;
  now?: () => string;
  generateId?: () => string;
  onStateChanged?: (snapshot: WorkContextStateSnapshot) => void;
}

(function exposeWorkContextModule(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.WorkContextManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorkContextModule() {
  const STORAGE_KEY_CONTEXTS = 'local_work_contexts_v1';
  const STORAGE_KEY_ACTIVE = 'local_work_active_context_v1';
  const CURRENT_SCHEMA_VERSION = 1;

  function defaultNow(): string {
    return new Date().toISOString();
  }

  function defaultId(): string {
    return 'ctx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  function createWorkContextManager(options: WorkContextManagerOptions) {
    const storage = options.storage;
    const nowFn = options.now || defaultNow;
    const idFn = options.generateId || defaultId;

    function loadContexts(): WorkContext[] {
      const raw = storage.getItem(STORAGE_KEY_CONTEXTS);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function persistContexts(contexts: WorkContext[]): void {
      storage.setItem(STORAGE_KEY_CONTEXTS, JSON.stringify(contexts));
      notify();
    }

    function getActiveId(): string | null {
      const val = storage.getItem(STORAGE_KEY_ACTIVE);
      return val && val !== 'null' && val !== 'all' ? val : null;
    }

    function setActive(contextId: string | null): void {
      if (!contextId || contextId === 'all') {
        if (storage.removeItem) storage.removeItem(STORAGE_KEY_ACTIVE);
        else storage.setItem(STORAGE_KEY_ACTIVE, 'null');
      } else {
        storage.setItem(STORAGE_KEY_ACTIVE, String(contextId));
      }
      notify();
    }

    function notify(): void {
      if (options.onStateChanged) {
        options.onStateChanged({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          contexts: getAll(),
          activeContextId: getActiveId()
        });
      }
    }

    function getAll(): WorkContext[] {
      return loadContexts().map(c => ({ ...c }));
    }

    function getById(id: string): WorkContext | null {
      const all = loadContexts();
      const found = all.find(c => c.id === id);
      return found ? { ...found } : null;
    }

    function getActive(): WorkContext | null {
      const activeId = getActiveId();
      if (!activeId) return null;
      return getById(activeId);
    }

    function saveContext(input: {
      id?: string;
      name: string;
      type?: WorkContextType;
      color?: string;
    }): WorkContext {
      const contexts = loadContexts();
      const cleanName = String(input.name || '').trim();
      if (!cleanName) {
        throw new Error('El nombre del contexto no puede estar vacío.');
      }

      if (input.id) {
        const index = contexts.findIndex(c => c.id === input.id);
        if (index !== -1) {
          const updated: WorkContext = {
            ...contexts[index],
            name: cleanName,
            type: input.type || contexts[index].type || 'project',
            color: input.color !== undefined ? input.color : contexts[index].color
          };
          contexts[index] = updated;
          persistContexts(contexts);
          return { ...updated };
        }
      }

      const newContext: WorkContext = {
        id: input.id || idFn(),
        name: cleanName,
        type: input.type || 'project',
        color: input.color,
        createdAt: nowFn(),
        schemaVersion: CURRENT_SCHEMA_VERSION
      };

      contexts.push(newContext);
      persistContexts(contexts);
      return { ...newContext };
    }

    function removeContext(id: string, repos?: { employeeRepository?: any }): void {
      let contexts = loadContexts();
      contexts = contexts.filter(c => c.id !== id);
      persistContexts(contexts);

      if (getActiveId() === id) {
        setActive(null);
      }

      // Unassign from employees if employee repository is passed
      if (repos?.employeeRepository && typeof repos.employeeRepository.getAll === 'function') {
        const allEmps = repos.employeeRepository.getAll();
        const affected = allEmps.filter((e: any) => e.workContextId === id);
        affected.forEach((e: any) => {
          repos.employeeRepository.save({
            ...e,
            workContextId: undefined
          });
        });
      }
    }

    function assignEmployeeContext(
      employeeId: string,
      contextId: string | null,
      employeeRepo: any
    ): void {
      if (!employeeRepo || typeof employeeRepo.getById !== 'function' || typeof employeeRepo.save !== 'function') {
        return;
      }
      const emp = employeeRepo.getById(employeeId);
      if (!emp) return;

      employeeRepo.save({
        ...emp,
        workContextId: contextId && contextId !== 'all' ? contextId : undefined
      });
    }

    function bulkAssignContext(
      employeeIds: string[],
      contextId: string | null,
      employeeRepo: any
    ): { assignedCount: number } {
      if (!employeeRepo || typeof employeeRepo.getById !== 'function' || typeof employeeRepo.save !== 'function') {
        return { assignedCount: 0 };
      }

      let count = 0;
      employeeIds.forEach(empId => {
        const emp = employeeRepo.getById(empId);
        if (emp) {
          employeeRepo.save({
            ...emp,
            workContextId: contextId && contextId !== 'all' ? contextId : undefined
          });
          count++;
        }
      });

      return { assignedCount: count };
    }

    function filterEmployees(employees: any[], contextId?: string | null): any[] {
      const target = contextId !== undefined ? contextId : getActiveId();
      if (!target || target === 'all') {
        return employees;
      }
      return employees.filter(e => e.workContextId === target);
    }

    function exportSnapshot(): WorkContextStateSnapshot {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        contexts: getAll(),
        activeContextId: getActiveId()
      };
    }

    function importSnapshot(snapshot: any): void {
      if (!snapshot || typeof snapshot !== 'object') return;
      if (Array.isArray(snapshot.contexts)) {
        persistContexts(snapshot.contexts);
      }
      if (snapshot.activeContextId !== undefined) {
        setActive(snapshot.activeContextId);
      }
    }

    function clearAll(): void {
      persistContexts([]);
      setActive(null);
    }

    return {
      getAll,
      getById,
      getActive,
      getActiveId,
      setActive,
      saveContext,
      removeContext,
      assignEmployeeContext,
      bulkAssignContext,
      filterEmployees,
      exportSnapshot,
      importSnapshot,
      clearAll
    };
  }

  return {
    createWorkContextManager
  };
});
