// Local-first persistence boundary. The UI remains on localStorage until its
// dedicated integration work unit; this module makes that transition retryable.

type LocalDbJsonObject = Record<string, unknown>;
interface LocalDbSnapshot {
  schemaVersion: 1;
  users: unknown[];
  attendance: LocalDbJsonObject;
  settings: Record<string, string>;
  lastUpdateTimestamp: string;
  requests?: unknown[];
  templates?: unknown[];
}
interface LocalDbMarker {
  schemaVersion: 1;
  completedAt: string;
}
interface LocalDbStorage {
  getItem(key: string): string | null;
}
interface LocalDbAdapter {
  readMarker(): Promise<LocalDbMarker | null>;
  readSnapshot(): Promise<LocalDbSnapshot | null>;
  writeSnapshot(snapshot: LocalDbSnapshot): Promise<LocalDbSnapshot>;
  migrateSnapshot(snapshot: LocalDbSnapshot, marker: LocalDbMarker): Promise<LocalDbSnapshot>;
}
interface LocalDbOptions {
  storage: LocalDbStorage;
  indexedDB?: IDBFactory;
  adapter?: LocalDbAdapter;
  navigator?: { storage?: { persist?: () => Promise<boolean> } };
  now?: () => Date;
}
type LocalDbMigrationResult =
  | { status: 'disabled' }
  | { status: 'migrated' | 'already-migrated'; snapshot: LocalDbSnapshot; persisted: boolean }
  | { status: 'legacy-authoritative'; reason: string };

(function exposeLocalDb(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniLocalDb = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalDbApi() {
  const DB_NAME = 'asistencia-mini';
  const DB_VERSION = 1;
  const STORE_NAME = 'app-state';
  const SNAPSHOT_KEY = 'snapshot';
  const MARKER_KEY = 'legacy-migration-v1';
  const OUTBOX_KEY = 'mini-sa-outbox-v1';
  const FEATURE_FLAG_KEY = 'miniLocalDbEnabled';
  const SETTINGS_KEYS = [
    'appTheme',
    'iconStyle',
    'checkMode',
    'reminderConfig',
    'expectedHoursPerDay'
  ];
  function isEnabled(storage: LocalDbStorage): boolean {
    return storage.getItem(FEATURE_FLAG_KEY) !== 'false';
  }

  function isObject(value: unknown): value is LocalDbJsonObject {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function parseJson(raw: string | null, key: string): unknown {
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in legacy key "${key}"`);
    }
  }
  function normalizeAttendance(value: LocalDbJsonObject): LocalDbJsonObject {
    const normalized: LocalDbJsonObject = {};
    for (const [date, records] of Object.entries(value)) {
      if (!isObject(records)) throw new Error(`Invalid attendance day "${date}"`);
      const day: LocalDbJsonObject = {};
      for (const [employeeId, record] of Object.entries(records)) {
        day[employeeId] = typeof record === 'string'
          ? { status: record, hours: 8 }
          : record;
      }
      normalized[date] = day;
    }
    return normalized;
  }

  function readLegacySnapshot(storage: LocalDbStorage): LocalDbSnapshot {
    const parsedUsers = parseJson(storage.getItem('users'), 'users');
    const parsedAttendance = parseJson(storage.getItem('weeklyAttendance'), 'weeklyAttendance');
    const parsedRequests = parseJson(storage.getItem('requests'), 'requests');
    const parsedTemplates = parseJson(storage.getItem('requestTemplates'), 'requestTemplates');
    if (parsedUsers !== null && !Array.isArray(parsedUsers)) {
      throw new Error('Legacy users must be an array');
    }
    if (parsedAttendance !== null && !isObject(parsedAttendance)) {
      throw new Error('Legacy attendance must be an object');
    }
    if (parsedRequests !== null && !Array.isArray(parsedRequests)) {
      throw new Error('Legacy requests must be an array');
    }
    if (parsedTemplates !== null && !Array.isArray(parsedTemplates)) {
      throw new Error('Legacy templates must be an array');
    }

    const settings: Record<string, string> = {};
    for (const key of SETTINGS_KEYS) {
      const value = storage.getItem(key);
      if (value !== null) settings[key] = value;
    }
    const snapshot: LocalDbSnapshot = {
      schemaVersion: 1,
      users: parsedUsers || [],
      attendance: normalizeAttendance(parsedAttendance || {}),
      settings,
      lastUpdateTimestamp: storage.getItem('lastUpdateTimestamp') || ''
    };
    if (parsedRequests !== null) snapshot.requests = parsedRequests as unknown[];
    if (parsedTemplates !== null) snapshot.templates = parsedTemplates as unknown[];
    return snapshot;
  }
  function snapshotsMatch(left: LocalDbSnapshot, right: LocalDbSnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function normalizeSnapshot(value: any): LocalDbSnapshot {
    if (value?.schemaVersion !== 1 || !Array.isArray(value.users) || !isObject(value.attendance)) {
      throw new Error('Invalid local snapshot');
    }
    if (!isObject(value.settings) || Object.values(value.settings).some(item => typeof item !== 'string')) {
      throw new Error('Invalid local settings');
    }
    if (typeof value.lastUpdateTimestamp !== 'string') throw new Error('Invalid update timestamp');
    const normalized: LocalDbSnapshot = {
      schemaVersion: 1,
      users: value.users,
      attendance: value.attendance,
      settings: value.settings,
      lastUpdateTimestamp: value.lastUpdateTimestamp
    };
    if (Array.isArray(value.requests)) normalized.requests = value.requests;
    if (Array.isArray(value.templates)) normalized.templates = value.templates;
    return JSON.parse(JSON.stringify(normalized));
  }

  function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'));
    });
  }
  function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }
  function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
  }

  function createIndexedDbAdapter(indexedDB: IDBFactory): LocalDbAdapter {
    async function read<T>(key: string): Promise<T | null> {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
        await transactionDone(transaction);
        return result === undefined ? null : result as T;
      } finally {
        database.close();
      }
    }

    async function writeVerified(snapshot: LocalDbSnapshot, marker?: LocalDbMarker) {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(snapshot, SNAPSHOT_KEY);
        const verified = await requestResult(store.get(SNAPSHOT_KEY)) as LocalDbSnapshot;
        if (!snapshotsMatch(snapshot, verified)) {
          transaction.abort();
          throw new Error('IndexedDB readback verification failed');
        }
        if (marker) store.put(marker, MARKER_KEY);
        await transactionDone(transaction);
        return verified;
      } finally {
        database.close();
      }
    }
    return {
      readMarker: () => read<LocalDbMarker>(MARKER_KEY),
      readSnapshot: () => read<LocalDbSnapshot>(SNAPSHOT_KEY),
      writeSnapshot: snapshot => writeVerified(snapshot),
      migrateSnapshot: (snapshot, marker) => writeVerified(snapshot, marker)
    };
  }

  function createOutboxStore(indexedDB: IDBFactory) {
    return {
      async load(): Promise<unknown[]> {
        const database = await openDatabase(indexedDB);
        try {
          const transaction = database.transaction(STORE_NAME, 'readonly');
          const result = await requestResult(transaction.objectStore(STORE_NAME).get(OUTBOX_KEY));
          await transactionDone(transaction);
          return Array.isArray(result) ? result : [];
        } finally {
          database.close();
        }
      },
      async save(records: unknown[]): Promise<void> {
        const database = await openDatabase(indexedDB);
        try {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const done = transactionDone(transaction);
          transaction.objectStore(STORE_NAME).put(records, OUTBOX_KEY);
          await done;
        } finally {
          database.close();
        }
      }
    };
  }

  async function requestPersistentStorage(
    navigatorLike?: LocalDbOptions['navigator']
  ): Promise<boolean> {
    try {
      return await navigatorLike?.storage?.persist?.() || false;
    } catch {
      return false;
    }
  }

  function createLocalDb(options: LocalDbOptions) {
    const adapter = options.adapter || (
      options.indexedDB ? createIndexedDbAdapter(options.indexedDB) : null
    );

    async function readState(): Promise<LocalDbSnapshot | null> {
      if (!isEnabled(options.storage) || !adapter || !await adapter.readMarker()) return null;
      const snapshot = await adapter.readSnapshot();
      return snapshot ? normalizeSnapshot(snapshot) : null;
    }
    async function writeState(value: LocalDbSnapshot): Promise<LocalDbSnapshot> {
      if (!isEnabled(options.storage)) throw new Error('Local database is disabled');
      if (!adapter || !await adapter.readMarker()) throw new Error('Local database is not ready');
      return adapter.writeSnapshot(normalizeSnapshot(value));
    }

    async function migrateLegacyData(): Promise<LocalDbMigrationResult> {
      if (!isEnabled(options.storage)) return { status: 'disabled' };
      if (!adapter) {
        return { status: 'legacy-authoritative', reason: 'IndexedDB is unavailable' };
      }

      try {
        const existingMarker = await adapter.readMarker();
        if (existingMarker) {
          const existing = await adapter.readSnapshot();
          if (!existing) {
            return { status: 'legacy-authoritative', reason: 'Migration marker has no snapshot' };
          }
          return {
            status: 'already-migrated',
            snapshot: existing,
            persisted: await requestPersistentStorage(options.navigator)
          };
        }

        const legacy = readLegacySnapshot(options.storage);
        const marker = {
          schemaVersion: 1 as const,
          completedAt: (options.now || (() => new Date()))().toISOString()
        };
        const verified = await adapter.migrateSnapshot(legacy, marker);
        if (!snapshotsMatch(legacy, verified)) {
          return { status: 'legacy-authoritative', reason: 'Migration verification failed' };
        }
        return {
          status: 'migrated',
          snapshot: verified,
          persisted: await requestPersistentStorage(options.navigator)
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Migration failed';
        return { status: 'legacy-authoritative', reason };
      }
    }

    return { migrateLegacyData, readState, writeState };
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    FEATURE_FLAG_KEY,
    SETTINGS_KEYS,
    createIndexedDbAdapter,
    createOutboxStore,
    createLocalDb,
    isEnabled,
    normalizeSnapshot,
    readLegacySnapshot,
    requestPersistentStorage
  };
});
