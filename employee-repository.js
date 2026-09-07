"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.EmployeeRepository` (browser global consumed by index.html).
(function exposeEmployeeRepository(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.EmployeeRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeeRepositoryModule() {
    const STORAGE_KEY_USERS = 'users';
    const STORAGE_KEY_TOMBSTONES = 'employee_tombstones';
    const CURRENT_SCHEMA_VERSION = 1;
    function defaultNow() {
        return new Date().toISOString();
    }
    function isSaTaggedRecord(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return false;
        const record = value;
        return Object.prototype.hasOwnProperty.call(record, 'saEmployeeId')
            || Object.prototype.hasOwnProperty.call(record, 'saProjectId');
    }
    function sanitizeSaLink(value) {
        if (value === undefined)
            return undefined;
        if (typeof value !== 'string' || !value.trim())
            return undefined;
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 128 || /[\s\x00-\x1f\x7f]/.test(trimmed))
            return undefined;
        return trimmed;
    }
    function createEmployeeRepository(options) {
        const storage = options.storage;
        const nowFn = options.now || defaultNow;
        const rules = options.rules || (typeof globalThis !== 'undefined' && globalThis.EmployeeNumberRules);
        function loadUsers() {
            const raw = storage.getItem(STORAGE_KEY_USERS);
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
        function loadTombstones() {
            const raw = storage.getItem(STORAGE_KEY_TOMBSTONES);
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
        function persistUsers(users) {
            var _a;
            storage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
            (_a = options.onSnapshotChanged) === null || _a === void 0 ? void 0 : _a.call(options, users, loadTombstones());
        }
        function persistTombstones(tombstones) {
            var _a;
            storage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(tombstones));
            (_a = options.onSnapshotChanged) === null || _a === void 0 ? void 0 : _a.call(options, loadUsers(), tombstones);
        }
        function getAll(filter) {
            const users = loadUsers();
            const includePaused = (filter === null || filter === void 0 ? void 0 : filter.includePaused) !== false;
            if (includePaused) {
                return users.map(u => ({ ...u }));
            }
            return users.filter(u => !u.paused).map(u => ({ ...u }));
        }
        function getById(id) {
            const users = loadUsers();
            const found = users.find(u => u.id === id);
            return found ? { ...found } : null;
        }
        function getByNumber(candidateNumber) {
            if (!rules)
                return null;
            const norm = rules.normalizeEmployeeNumber(candidateNumber);
            if (norm === null)
                return null;
            const users = loadUsers();
            const found = users.find(u => rules.normalizeEmployeeNumber(u.number) === norm);
            return found ? { ...found } : null;
        }
        function generateId() {
            return 'u' + Date.now() + Math.random().toString(36).slice(2, 7);
        }
        function save(draft, candidateId) {
            const users = loadUsers();
            const timestamp = nowFn();
            const isCreate = !draft.id;
            const targetId = draft.id || candidateId || generateId();
            const normalizedDraft = {
                ...draft,
                id: isCreate ? '' : draft.id,
                name: String(draft.name || '').trim(),
                number: String(draft.number || '').trim(),
                position: draft.position ? String(draft.position).trim() : '',
                sueldo: draft.sueldo !== undefined && draft.sueldo !== null && String(draft.sueldo).trim() !== '' ? String(draft.sueldo).trim() : undefined,
                workContextId: draft.workContextId ? String(draft.workContextId).trim() : undefined,
                paused: !!draft.paused
            };
            // Canonical SA mapping survives single-record edits: the edit form does
            // not capture SA identity, so carry it forward from storage. An explicit
            // SA link on the draft wins; otherwise the stored link is preserved and
            // never silently cleared by a local edit.
            const storedForSave = users.find(u => u.id === targetId);
            const draftSaProject = sanitizeSaLink(draft.saProjectId);
            const draftSaEmployee = sanitizeSaLink(draft.saEmployeeId);
            if (draftSaProject !== undefined)
                normalizedDraft.saProjectId = draftSaProject;
            else if ((storedForSave === null || storedForSave === void 0 ? void 0 : storedForSave.saProjectId) !== undefined)
                normalizedDraft.saProjectId = storedForSave.saProjectId;
            if (draftSaEmployee !== undefined)
                normalizedDraft.saEmployeeId = draftSaEmployee;
            else if ((storedForSave === null || storedForSave === void 0 ? void 0 : storedForSave.saEmployeeId) !== undefined)
                normalizedDraft.saEmployeeId = storedForSave.saEmployeeId;
            if (rules && typeof rules.saveEmployeeDraft === 'function') {
                const result = rules.saveEmployeeDraft(users, normalizedDraft, targetId);
                if (result.status === 'conflict') {
                    return { status: 'conflict', conflict: result.conflict };
                }
                const existingRecord = users.find(u => u.id === targetId);
                // Enrich saved employee with metadata
                const updatedUsers = result.users.map((u) => {
                    if (u.id === targetId) {
                        const enriched = {
                            ...u,
                            schemaVersion: CURRENT_SCHEMA_VERSION,
                            localOnly: true,
                            createdAt: (existingRecord === null || existingRecord === void 0 ? void 0 : existingRecord.createdAt) || u.createdAt || timestamp,
                            updatedAt: timestamp
                        };
                        // `saveEmployeeDraft` rebuilds the record from the draft, so
                        // re-attach the canonical SA link (draft-explicit wins, stored
                        // link otherwise). Local edits never orphan the SA mapping.
                        if (normalizedDraft.saProjectId !== undefined) {
                            enriched.saProjectId = normalizedDraft.saProjectId;
                        }
                        else {
                            delete enriched.saProjectId;
                        }
                        if (normalizedDraft.saEmployeeId !== undefined) {
                            enriched.saEmployeeId = normalizedDraft.saEmployeeId;
                        }
                        else {
                            delete enriched.saEmployeeId;
                        }
                        return enriched;
                    }
                    return u;
                });
                persistUsers(updatedUsers);
                const saved = updatedUsers.find((u) => u.id === targetId);
                return { status: 'saved', employee: saved ? { ...saved } : undefined };
            }
            // Fallback without rules
            let nextUsers;
            let savedRecord;
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
            }
            else {
                const existing = users.find(u => u.id === targetId);
                savedRecord = {
                    ...(existing || {}),
                    ...normalizedDraft,
                    id: targetId,
                    schemaVersion: CURRENT_SCHEMA_VERSION,
                    localOnly: true,
                    createdAt: (existing === null || existing === void 0 ? void 0 : existing.createdAt) || timestamp,
                    updatedAt: timestamp
                };
                nextUsers = users.map(u => (u.id === targetId ? savedRecord : u));
            }
            persistUsers(nextUsers);
            return { status: 'saved', employee: { ...savedRecord } };
        }
        function setPaused(id, paused) {
            const users = loadUsers();
            const existing = users.find(u => u.id === id);
            if (!existing)
                return null;
            const timestamp = nowFn();
            const updated = {
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
        function remove(id) {
            const users = loadUsers();
            const existing = users.find(u => u.id === id);
            if (!existing)
                return false;
            const nextUsers = users.filter(u => u.id !== id);
            persistUsers(nextUsers);
            // Record tombstone
            const tombstones = loadTombstones();
            const newTombstone = {
                id,
                type: 'employee',
                deletedAt: nowFn(),
                schemaVersion: CURRENT_SCHEMA_VERSION
            };
            const nextTombstones = [...tombstones.filter((t) => t.id !== id), newTombstone];
            persistTombstones(nextTombstones);
            return true;
        }
        function getBySaIdentity(saProjectId, saEmployeeId) {
            const project = sanitizeSaLink(saProjectId);
            const employee = sanitizeSaLink(saEmployeeId);
            if (project === undefined || employee === undefined)
                return null;
            const users = loadUsers();
            const found = users.find(u => u.saProjectId === project && u.saEmployeeId === employee);
            return found ? { ...found } : null;
        }
        function importBatch(incoming, mode = 'merge') {
            if (!Array.isArray(incoming)) {
                throw new Error('La lista a importar debe ser un arreglo de empleados');
            }
            // Fail-closed: SA-tagged records must use the versioned SA route
            // (`importSaRoster`) for merge imports. They are never silently matched
            // by employee number. Replace-mode restores (undo/history snapshots
            // carry the canonical SA link) remain allowed so rollback keeps working.
            if (mode !== 'replace' && incoming.some(isSaTaggedRecord)) {
                throw new Error('SA-tagged payload detected: use the SA roster import (sa-roster/v1) instead of the legacy list import');
            }
            const valid = incoming.filter((e) => e && e.name && e.number !== undefined && e.number !== null && String(e.number).trim() !== '');
            const skippedCount = incoming.length - valid.length;
            const timestamp = nowFn();
            const normalizeNum = (rules === null || rules === void 0 ? void 0 : rules.normalizeEmployeeNumber) || ((v) => parseInt(v, 10) || null);
            if (mode === 'replace') {
                const currentUsers = loadUsers();
                // Generate tombstones for replaced users
                const tombstones = loadTombstones();
                const newTombstones = currentUsers.map(u => ({
                    id: u.id,
                    type: 'employee',
                    deletedAt: timestamp,
                    schemaVersion: CURRENT_SCHEMA_VERSION
                }));
                persistTombstones([...tombstones, ...newTombstones]);
                const nextUsers = valid.map((emp) => {
                    const isPaused = (emp.paused === true || emp.paused === 'true' || emp.status === 'paused' || emp.status === 'inactive' || emp.active === false)
                        ? true
                        : undefined;
                    const entry = {
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
                    // Undo/history snapshots carry the canonical SA link; a replace
                    // restore must bring it back rather than drop it.
                    const saProject = sanitizeSaLink(emp.saProjectId);
                    const saEmployee = sanitizeSaLink(emp.saEmployeeId);
                    if (saProject !== undefined)
                        entry.saProjectId = saProject;
                    if (saEmployee !== undefined)
                        entry.saEmployeeId = saEmployee;
                    return entry;
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
            const nextUsers = currentUsers.map(u => ({ ...u }));
            valid.forEach((emp) => {
                const normNum = normalizeNum(emp.number);
                const isPaused = (emp.paused === true || emp.paused === 'true' || emp.status === 'paused' || emp.status === 'inactive' || emp.active === false)
                    ? true
                    : (emp.paused === false || emp.active === true || emp.status === 'active')
                        ? false
                        : undefined;
                const existing = nextUsers.find(u => (emp.id && u.id === emp.id) || (normNum !== null && normalizeNum(u.number) === normNum));
                if (existing) {
                    existing.name = String(emp.name).trim();
                    if (emp.position !== undefined)
                        existing.position = String(emp.position).trim();
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
                }
                else {
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
        function importSaRoster(roster, options = {}) {
            const saApi = (typeof globalThis !== 'undefined' && globalThis.SaRosterImport) || null;
            if (!saApi || typeof saApi.applySaRosterToUsers !== 'function') {
                throw new Error('SA roster import module is not available');
            }
            const currentUsers = loadUsers();
            const normalizeNum = (rules === null || rules === void 0 ? void 0 : rules.normalizeEmployeeNumber) || ((v) => {
                if (v === null || v === undefined || String(v).trim() === '')
                    return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            });
            // Merge-only: the SA route never takes the destructive replace path.
            const applied = saApi.applySaRosterToUsers(currentUsers, roster, {
                generateId: options.generateId || generateId,
                now: nowFn,
                normalizeEmployeeNumber: normalizeNum,
                confirmedLinks: options.confirmedLinks || []
            });
            persistUsers(applied.users);
            return {
                updatedCount: applied.updatedCount,
                createdCount: applied.createdCount,
                linkedCount: applied.linkedCount,
                skippedCount: applied.skippedCount,
                totalValid: applied.totalValid,
                users: applied.users.map(u => ({ ...u })),
                reconciliationCandidates: applied.reconciliationCandidates
            };
        }
        function exportSnapshot() {
            return {
                schemaVersion: CURRENT_SCHEMA_VERSION,
                exportedAt: nowFn(),
                employees: loadUsers().map(u => ({ ...u })),
                tombstones: loadTombstones().map(t => ({ ...t }))
            };
        }
        function getTombstones() {
            return loadTombstones().map(t => ({ ...t }));
        }
        function clearTombstones() {
            persistTombstones([]);
        }
        function clearAll() {
            persistUsers([]);
            persistTombstones([]);
        }
        return {
            getAll,
            getById,
            getByNumber,
            getBySaIdentity,
            save,
            setPaused,
            remove,
            importBatch,
            importSaRoster,
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
