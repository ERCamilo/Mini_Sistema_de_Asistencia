// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaRepository` (browser global consumed by index.html).
// Saves the Comida section under its own localStorage key, apart from
// attendance and employees, and validates the "comida" section of a backup.

interface ComidaRepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ComidaRepositoryOptions {
  storage: ComidaRepositoryStorage;
  today: () => string;
  newId: () => string;
  locks?: LockManager;
  indexedDB?: IDBFactory;
}

interface ComidaRepositorySaveResult {
  ok: boolean;
  quota?: boolean;
  error?: string;
}

interface ComidaRepositoryStoreApi {
  normalizeState(raw: unknown, today: string, periodId: string): ComidaStoreState;
}

(function exposeComidaRepository(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ComidaRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaRepositoryModule() {
  const STORAGE_KEY = 'miniComidaV1';

  function store(): ComidaRepositoryStoreApi {
    const found = (globalThis as any).ComidaStore;
    if (!found) throw new Error('ComidaStore no está cargado.');
    return found;
  }

  function isQuotaError(error: unknown): boolean {
    const e = error as { name?: string; code?: number } | null;
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
  }

  function createComidaRepository(options: ComidaRepositoryOptions) {
    const normalize = (raw: unknown) => store().normalizeState(raw, options.today(), options.newId());

    function load(fallback?: ComidaStoreState) {
      let raw: string | null = null;
      try {
        raw = options.storage.getItem(STORAGE_KEY);
      } catch (error) {
        console.warn('No se pudo leer Comida.', error);
        if (fallback) return fallback;
      }
      return normalize(raw);
    }

    function save(state: unknown): ComidaRepositorySaveResult {
      try {
        options.storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return { ok: true };
      } catch (error) {
        console.warn('No se pudo guardar Comida.', error);
        return { ok: false, quota: isQuotaError(error), error: error instanceof Error ? error.message : String(error) };
      }
    }

    // A readwrite IndexedDB transaction is the writer lock on browsers without Web Locks.
    // The Comida data itself stays in the same localStorage key.
    async function exclusive<T>(work: () => T): Promise<T> {
      if (options.locks) return options.locks.request(STORAGE_KEY, work);
      const factory = options.indexedDB;
      if (!factory) return work();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('mini-comida-writer', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('writer');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<T>((resolve, reject) => {
          const transaction = db.transaction('writer', 'readwrite');
          let result: T;
          transaction.oncomplete = () => resolve(result);
          transaction.onabort = () => reject(transaction.error);
          transaction.objectStore('writer').get(STORAGE_KEY).onsuccess = () => {
            try { result = work(); }
            catch (error) { reject(error); transaction.abort(); }
          };
        });
      } finally { db.close(); }
    }

    function write(state: ComidaStoreState): void {
      const result = save(state);
      if (!result.ok) throw new Error(result.quota
        ? 'No se guardó Comida: el almacenamiento está lleno. Exporta un respaldo y libera espacio.'
        : 'No se pudo guardar Comida. Intenta de nuevo.');
    }

    function update(change: (current: ComidaStoreState) => ComidaStoreState): Promise<ComidaStoreState> {
      return exclusive(() => {
        const current = normalize(options.storage.getItem(STORAGE_KEY));
        const next = change(current);
        if (next !== current) write(next);
        return next;
      });
    }

    return { load, save, update };
  }

  // The "comida" section of a backup file: must be an object of a known version.
  function parseBackup(section: unknown, today: string, periodId: string) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error('Los datos de Comida del respaldo no son válidos.');
    const version = (section as { schemaVersion?: unknown }).schemaVersion;
    if (version !== undefined && version !== 1) throw new Error('El respaldo de Comida es de una versión más nueva. Actualiza Mini.');
    return store().normalizeState(section, today, periodId);
  }

  return { STORAGE_KEY, createComidaRepository, parseBackup };
});
