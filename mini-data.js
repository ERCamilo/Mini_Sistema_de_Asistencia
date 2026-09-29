"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.MiniData` (browser global consumed by index.html).
// Storage v2 (see .sdd-review/mini-storage-v2): attendance lives in IndexedDB,
// one record per day, instead of one big localStorage string (~5 MB cap).
// AttendanceRepository is unchanged: it gets a storage whose `attendance` and
// `attendance_tombstones` keys are kept in memory (synchronous reads) and whose
// changed days are written to IndexedDB in the background.
(function exposeMiniData(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniDataModule() {
    const DB_NAME = 'mini-data';
    const DB_VERSION = 1;
    const DAYS_STORE = 'attendanceDays';
    const META_STORE = 'meta';
    const FLAG_KEY = 'miniDataV2';
    const ATTENDANCE_KEY = 'attendance';
    const TOMBSTONES_KEY = 'attendance_tombstones';
    const V1_KEYS = [ATTENDANCE_KEY, 'weeklyAttendance', TOMBSTONES_KEY];
    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    function isEnabled(storage) {
        return storage.getItem(FLAG_KEY) !== 'off';
    }
    // Days to write (changed or new) and to delete, against what is already stored.
    function diffDays(persisted, next) {
        const puts = [];
        const dates = Object.keys(next).filter(date => isRecord(next[date])).sort();
        for (const date of dates) {
            if (persisted.get(date) !== JSON.stringify(next[date]))
                puts.push({ date, records: next[date] });
        }
        const keep = new Set(dates);
        const deletes = [...persisted.keys()].filter(date => !keep.has(date)).sort();
        return { puts, deletes };
    }
    function createMemoryBackend() {
        const days = new Map();
        const meta = new Map();
        return {
            async readAll() {
                return { days: Object.fromEntries([...days].map(([d, r]) => [d, structuredClone(r)])), meta: Object.fromEntries([...meta].map(([k, v]) => [k, structuredClone(v)])) };
            },
            async write(batch) {
                batch.puts.forEach(p => days.set(p.date, structuredClone(p.records)));
                batch.deletes.forEach(d => days.delete(d));
                Object.entries(batch.meta || {}).forEach(([k, v]) => meta.set(k, structuredClone(v)));
            }
        };
    }
    function request(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function openIdbBackend(factory) {
        const open = factory.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains(DAYS_STORE))
                db.createObjectStore(DAYS_STORE, { keyPath: 'date' });
            if (!db.objectStoreNames.contains(META_STORE))
                db.createObjectStore(META_STORE, { keyPath: 'key' });
        };
        const db = await request(open);
        return {
            async readAll() {
                const tx = db.transaction([DAYS_STORE, META_STORE], 'readonly');
                const [dayRows, metaRows] = await Promise.all([
                    request(tx.objectStore(DAYS_STORE).getAll()),
                    request(tx.objectStore(META_STORE).getAll())
                ]);
                return {
                    days: Object.fromEntries(dayRows.map((row) => [row.date, row.records])),
                    meta: Object.fromEntries(metaRows.map((row) => [row.key, row.value]))
                };
            },
            write(batch) {
                return new Promise((resolve, reject) => {
                    const tx = db.transaction([DAYS_STORE, META_STORE], 'readwrite');
                    const days = tx.objectStore(DAYS_STORE);
                    const meta = tx.objectStore(META_STORE);
                    const updatedAt = new Date().toISOString();
                    batch.puts.forEach(p => days.put({ date: p.date, records: p.records, updatedAt }));
                    batch.deletes.forEach(d => days.delete(d));
                    Object.entries(batch.meta || {}).forEach(([key, value]) => meta.put({ key, value }));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
                });
            }
        };
    }
    function createDayStorage(options) {
        const { backend, fallback } = options;
        let attendanceRaw = null;
        let tombstonesRaw = null;
        let persistedTombstones = null;
        const persisted = new Map();
        let queue = Promise.resolve();
        async function hydrate() {
            const all = await backend.readAll();
            persisted.clear();
            const dates = Object.keys(all.days).sort();
            const days = {};
            for (const date of dates) {
                days[date] = all.days[date];
                persisted.set(date, JSON.stringify(all.days[date]));
            }
            attendanceRaw = dates.length ? JSON.stringify(days) : null;
            tombstonesRaw = typeof all.meta.attendanceTombstones === 'string' ? all.meta.attendanceTombstones : null;
            persistedTombstones = tombstonesRaw;
        }
        async function persistLatest() {
            var _a;
            let next = {};
            try {
                next = attendanceRaw ? JSON.parse(attendanceRaw) : {};
            }
            catch {
                next = {};
            }
            const { puts, deletes } = diffDays(persisted, isRecord(next) ? next : {});
            const tombstones = tombstonesRaw;
            const meta = tombstones !== persistedTombstones ? { attendanceTombstones: tombstones } : undefined;
            if (!puts.length && !deletes.length && !meta)
                return;
            try {
                await backend.write({ puts, deletes, meta });
                puts.forEach(p => persisted.set(p.date, JSON.stringify(p.records)));
                deletes.forEach(d => persisted.delete(d));
                if (meta)
                    persistedTombstones = tombstones;
            }
            catch (error) {
                // Memory keeps the change; the next write retries every unsaved day.
                console.warn('Mini: no se pudo guardar la asistencia en IndexedDB.', error);
                (_a = options.onError) === null || _a === void 0 ? void 0 : _a.call(options, error instanceof Error ? error : new Error(String(error)));
            }
        }
        function schedule() {
            queue = queue.then(persistLatest);
        }
        return {
            hydrate,
            flush: () => queue,
            getItem(key) {
                if (key === ATTENDANCE_KEY)
                    return attendanceRaw;
                if (key === TOMBSTONES_KEY)
                    return tombstonesRaw;
                return fallback.getItem(key);
            },
            setItem(key, value) {
                if (key === ATTENDANCE_KEY) {
                    attendanceRaw = String(value);
                    schedule();
                    return;
                }
                if (key === TOMBSTONES_KEY) {
                    tombstonesRaw = String(value);
                    schedule();
                    return;
                }
                fallback.setItem(key, value);
            },
            removeItem(key) {
                var _a;
                if (key === ATTENDANCE_KEY) {
                    attendanceRaw = null;
                    schedule();
                    return;
                }
                if (key === TOMBSTONES_KEY) {
                    tombstonesRaw = null;
                    schedule();
                    return;
                }
                (_a = fallback.removeItem) === null || _a === void 0 ? void 0 : _a.call(fallback, key);
            }
        };
    }
    function failed(reason) {
        return { status: 'failed', reason };
    }
    function countRecords(days) {
        return Object.values(days).reduce((sum, day) => sum + Object.keys(day).length, 0);
    }
    // One-time v1 -> v2 copy. Resumable: until it is verified, v2 is ignored.
    async function migrateFromV1(options) {
        const { backend } = options;
        const at = (options.now || (() => new Date().toISOString()))();
        try {
            const current = await backend.readAll();
            if (current.meta.migration && current.meta.migration.state === 'verified')
                return { status: 'already-migrated' };
            const source = await options.readSource();
            let parsed = {};
            let tombstones = [];
            try {
                parsed = source.attendanceRaw ? JSON.parse(source.attendanceRaw) : {};
                tombstones = source.tombstonesRaw ? JSON.parse(source.tombstonesRaw) : [];
            }
            catch {
                return failed('La asistencia guardada (v1) no es JSON válido.');
            }
            if (!isRecord(parsed) || !Array.isArray(tombstones))
                return failed('La asistencia guardada (v1) tiene un formato inesperado.');
            const days = {};
            Object.keys(parsed).filter(date => isRecord(parsed[date])).sort().forEach(date => { days[date] = parsed[date]; });
            const deletes = Object.keys(current.days).filter(date => !Object.prototype.hasOwnProperty.call(days, date));
            await backend.write({
                puts: Object.keys(days).map(date => ({ date, records: days[date] })),
                deletes,
                meta: {
                    attendanceTombstones: source.tombstonesRaw,
                    v1Backup: { attendance: source.attendanceRaw, tombstones: source.tombstonesRaw, at },
                    migration: { state: 'written', at }
                }
            });
            const readBack = await backend.readAll();
            for (const date of Object.keys(days)) {
                if (JSON.stringify(readBack.days[date]) !== JSON.stringify(days[date]))
                    return failed(`El día ${date} no coincide al verificar.`);
            }
            const extra = Object.keys(readBack.days).filter(date => !Object.prototype.hasOwnProperty.call(days, date));
            if (extra.length)
                return failed(`Sobran días al verificar: ${extra.join(', ')}.`);
            if (readBack.meta.attendanceTombstones !== source.tombstonesRaw)
                return failed('Los registros borrados no coinciden al verificar.');
            const records = countRecords(days);
            await backend.write({ puts: [], deletes: [], meta: { migration: { state: 'verified', at, days: Object.keys(days).length, records } } });
            return { status: 'migrated', days: Object.keys(days).length, records };
        }
        catch (error) {
            return failed(error instanceof Error ? error.message : String(error));
        }
    }
    async function isVerified(backend) {
        const all = await backend.readAll();
        return !!(all.meta.migration && all.meta.migration.state === 'verified');
    }
    // Rollback ("volver al almacenamiento anterior"): the current v2 data, in v1 shape.
    async function exportAttendance(backend) {
        const all = await backend.readAll();
        const attendance = {};
        Object.keys(all.days).sort().forEach(date => { attendance[date] = all.days[date]; });
        return { attendance, tombstonesRaw: typeof all.meta.attendanceTombstones === 'string' ? all.meta.attendanceTombstones : null };
    }
    // After a rollback v1 is the source again; enabling v2 later migrates from it anew.
    async function markRolledBack(backend, at = new Date().toISOString()) {
        await backend.write({ puts: [], deletes: [], meta: { migration: { state: 'rolled-back', at } } });
    }
    // After v2 is verified and active: free the ~5 MB of attendance in localStorage.
    function releaseV1(storage) {
        V1_KEYS.forEach(key => { var _a; return (_a = storage.removeItem) === null || _a === void 0 ? void 0 : _a.call(storage, key); });
    }
    function createSwitchableStorage(initial) {
        let target = initial;
        return {
            getItem: (key) => target.getItem(key),
            setItem: (key, value) => target.setItem(key, value),
            removeItem: (key) => { var _a; return (_a = target.removeItem) === null || _a === void 0 ? void 0 : _a.call(target, key); },
            use(next) { target = next; },
            current: () => target
        };
    }
    return { DB_NAME, FLAG_KEY, isEnabled, diffDays, createMemoryBackend, openIdbBackend, createDayStorage, migrateFromV1, releaseV1, createSwitchableStorage, isVerified, exportAttendance, markRolledBack };
});
