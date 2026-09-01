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
                paused: !!draft.paused
            };
            if (rules && typeof rules.saveEmployeeDraft === 'function') {
                const result = rules.saveEmployeeDraft(users, normalizedDraft, targetId);
                if (result.status === 'conflict') {
                    return { status: 'conflict', conflict: result.conflict };
                }
                const existingRecord = users.find(u => u.id === targetId);
                // Enrich saved employee with metadata
                const updatedUsers = result.users.map((u) => {
                    if (u.id === targetId) {
                        return {
                            ...u,
                            schemaVersion: CURRENT_SCHEMA_VERSION,
                            localOnly: true,
                            createdAt: (existingRecord === null || existingRecord === void 0 ? void 0 : existingRecord.createdAt) || u.createdAt || timestamp,
                            updatedAt: timestamp
                        };
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
        function importBatch(incoming, mode = 'merge') {
            if (!Array.isArray(incoming)) {
                throw new Error('La lista a importar debe ser un arreglo de empleados');
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
                    return {
                        id: emp.id || generateId(),
                        name: String(emp.name).trim(),
                        number: String(emp.number).trim(),
                        position: emp.position ? String(emp.position).trim() : '',
                        sueldo: emp.sueldo !== undefined && emp.sueldo !== null && String(emp.sueldo).trim() !== '' ? String(emp.sueldo).trim() : undefined,
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
