"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaRepository` (browser global consumed by index.html).
// Saves the Comida section under its own localStorage key, apart from
// attendance and employees, and validates the "comida" section of a backup.
(function exposeComidaRepository(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.ComidaRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaRepositoryModule() {
    const STORAGE_KEY = 'miniComidaV1';
    function store() {
        const found = globalThis.ComidaStore;
        if (!found)
            throw new Error('ComidaStore no está cargado.');
        return found;
    }
    function isQuotaError(error) {
        const e = error;
        return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    }
    function createComidaRepository(options) {
        const normalize = (raw) => store().normalizeState(raw, options.today(), options.newId());
        function load(fallback) {
            let raw = null;
            try {
                raw = options.storage.getItem(STORAGE_KEY);
            }
            catch (error) {
                console.warn('No se pudo leer Comida.', error);
                if (fallback)
                    return fallback;
            }
            return normalize(raw);
        }
        function save(state) {
            try {
                options.storage.setItem(STORAGE_KEY, JSON.stringify(state));
                return { ok: true };
            }
            catch (error) {
                console.warn('No se pudo guardar Comida.', error);
                return { ok: false, quota: isQuotaError(error), error: error instanceof Error ? error.message : String(error) };
            }
        }
        // A readwrite IndexedDB transaction is the writer lock on browsers without Web Locks.
        // The Comida data itself stays in the same localStorage key.
        async function exclusive(work) {
            if (options.locks)
                return options.locks.request(STORAGE_KEY, work);
            const factory = options.indexedDB;
            if (!factory)
                return work();
            const db = await new Promise((resolve, reject) => {
                const request = factory.open('mini-comida-writer', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('writer');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction('writer', 'readwrite');
                    let result;
                    transaction.oncomplete = () => resolve(result);
                    transaction.onabort = () => reject(transaction.error);
                    transaction.objectStore('writer').get(STORAGE_KEY).onsuccess = () => {
                        try {
                            result = work();
                        }
                        catch (error) {
                            reject(error);
                            transaction.abort();
                        }
                    };
                });
            }
            finally {
                db.close();
            }
        }
        function write(state) {
            const result = save(state);
            if (!result.ok)
                throw new Error(result.quota
                    ? 'No se guardó Comida: el almacenamiento está lleno. Exporta un respaldo y libera espacio.'
                    : 'No se pudo guardar Comida. Intenta de nuevo.');
        }
        function update(change) {
            return exclusive(() => {
                const current = normalize(options.storage.getItem(STORAGE_KEY));
                const next = change(current);
                if (next !== current)
                    write(next);
                return next;
            });
        }
        function restore(next, applyOther) {
            return exclusive(() => {
                const previous = options.storage.getItem(STORAGE_KEY);
                write(next);
                try {
                    applyOther();
                }
                catch (error) {
                    if (previous === null)
                        options.storage.removeItem(STORAGE_KEY);
                    else
                        options.storage.setItem(STORAGE_KEY, previous);
                    throw error;
                }
                return next;
            });
        }
        return { load, save, update, restore };
    }
    // The "comida" section of a backup file: must be an object of a known version.
    function parseBackup(section, today, periodId) {
        if (!section || typeof section !== 'object' || Array.isArray(section))
            throw new Error('Los datos de Comida del respaldo no son válidos.');
        const version = section.schemaVersion;
        if (version !== undefined && version !== 1)
            throw new Error('El respaldo de Comida es de una versión más nueva. Actualiza Mini.');
        return store().normalizeState(section, today, periodId);
    }
    return { STORAGE_KEY, createComidaRepository, parseBackup };
});
