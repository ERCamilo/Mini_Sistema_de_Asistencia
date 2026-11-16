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
        function load() {
            let raw = null;
            try {
                raw = options.storage.getItem(STORAGE_KEY);
            }
            catch (error) {
                console.warn('No se pudo leer Comida; se empieza vacío.', error);
            }
            return store().normalizeState(raw, options.today(), options.newId());
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
        return { load, save };
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
