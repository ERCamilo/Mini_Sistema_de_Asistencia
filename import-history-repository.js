"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ImportHistoryRepository` (browser global consumed by index.html).
(function exposeImportHistoryRepository(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.ImportHistoryRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImportHistoryRepositoryModule() {
    const STORAGE_KEY_HISTORY = 'import_history_v1';
    const CURRENT_SCHEMA_VERSION = 1;
    const DEFAULT_MAX_ENTRIES = 3;
    function defaultNow() {
        return new Date().toISOString();
    }
    function defaultId() {
        return 'imp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    }
    function createImportHistoryRepository(options) {
        const storage = options.storage;
        const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
        const nowFn = options.now || defaultNow;
        const idFn = options.generateId || defaultId;
        function loadEntries() {
            const raw = storage.getItem(STORAGE_KEY_HISTORY);
            if (!raw)
                return [];
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        }
        function persistEntries(entries) {
            var _a;
            // Keep only up to maxEntries to preserve local storage budget
            const trimmed = entries.slice(-maxEntries);
            // Conserve quota: only the most recent entry needs the full snapshotBefore.
            // Older entries retain all metadata (summary, source, timestamp, status) but drop heavy snapshots.
            for (let i = 0; i < trimmed.length - 1; i++) {
                if (trimmed[i].snapshotBefore) {
                    trimmed[i].snapshotBefore = { users: [] };
                }
            }
            try {
                storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(trimmed));
            }
            catch {
                // Quota exceeded: retry with aggressive pruning (keep only latest entry without attendance)
                try {
                    const latestOnly = trimmed.slice(-1);
                    if (latestOnly.length > 0 && latestOnly[0].snapshotBefore) {
                        latestOnly[0].snapshotBefore.attendance = undefined;
                    }
                    storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(latestOnly));
                }
                catch {
                    // If still failing, strip snapshot completely to avoid crashing calling process
                    try {
                        const metadataOnly = trimmed.slice(-1).map(e => ({
                            ...e,
                            snapshotBefore: { users: [] }
                        }));
                        storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(metadataOnly));
                    }
                    catch {
                        // Storage quota exhausted at device/browser level; ignore write cleanly
                    }
                }
            }
            (_a = options.onHistoryChanged) === null || _a === void 0 ? void 0 : _a.call(options, trimmed);
        }
        function recordImport(input) {
            var _a, _b;
            const entries = loadEntries();
            const newEntry = {
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
                    users: Array.isArray((_a = input.snapshotBefore) === null || _a === void 0 ? void 0 : _a.users) ? JSON.parse(JSON.stringify(input.snapshotBefore.users)) : [],
                    attendance: ((_b = input.snapshotBefore) === null || _b === void 0 ? void 0 : _b.attendance) ? JSON.parse(JSON.stringify(input.snapshotBefore.attendance)) : undefined
                },
                status: 'applied',
                schemaVersion: CURRENT_SCHEMA_VERSION
            };
            const updated = [...entries, newEntry];
            persistEntries(updated);
            return { ...newEntry };
        }
        function getAll() {
            return loadEntries().map(e => ({ ...e }));
        }
        function getLatest() {
            const entries = loadEntries();
            if (!entries.length)
                return null;
            // Return latest applied entry
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].status === 'applied') {
                    return { ...entries[i] };
                }
            }
            return null;
        }
        function getById(id) {
            const entries = loadEntries();
            const found = entries.find(e => e.id === id);
            return found ? { ...found } : null;
        }
        function rollback(id, repos) {
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
            target.snapshotBefore = { users: [] };
            persistEntries(entries);
            return {
                success: true,
                entry: { ...target },
                message: 'Importación revertida exitosamente'
            };
        }
        function rollbackLatest(repos) {
            const latest = getLatest();
            if (!latest) {
                return { success: false, message: 'No hay ninguna importación disponible para revertir' };
            }
            return rollback(latest.id, repos);
        }
        function clearHistory() {
            persistEntries([]);
        }
        // Auto-heal existing storage on initialization if it exceeds maxEntries or contains stale bloated snapshots
        try {
            const existing = loadEntries();
            if (existing.length > maxEntries || existing.some((e, idx) => { var _a; return idx < existing.length - 1 && ((_a = e.snapshotBefore) === null || _a === void 0 ? void 0 : _a.attendance); })) {
                persistEntries(existing);
            }
        }
        catch {
            // Ignore initial cleanup failure
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
