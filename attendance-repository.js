"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceRepository` (browser global consumed by index.html).
(function exposeAttendanceRepository(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.AttendanceRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceRepositoryModule() {
    const STORAGE_KEY_ATTENDANCE = 'attendance';
    const STORAGE_KEY_TOMBSTONES = 'attendance_tombstones';
    const CURRENT_SCHEMA_VERSION = 1;
    function defaultNow() {
        return new Date().toISOString();
    }
    function createAttendanceRepository(options) {
        const storage = options.storage;
        const nowFn = options.now || defaultNow;
        function loadAttendance() {
            const raw = storage.getItem(STORAGE_KEY_ATTENDANCE);
            if (!raw)
                return {};
            try {
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                    return {};
                // Normalize legacy format: string status -> object { status, hours }
                const normalized = {};
                for (const date in parsed) {
                    if (Object.prototype.hasOwnProperty.call(parsed, date) && parsed[date] && typeof parsed[date] === 'object') {
                        normalized[date] = {};
                        for (const empId in parsed[date]) {
                            if (Object.prototype.hasOwnProperty.call(parsed[date], empId)) {
                                const rec = parsed[date][empId];
                                if (typeof rec === 'string') {
                                    normalized[date][empId] = { status: 'present', hours: 8, schemaVersion: CURRENT_SCHEMA_VERSION, localOnly: true };
                                }
                                else if (rec && typeof rec === 'object' && rec.status === 'present') {
                                    normalized[date][empId] = {
                                        ...rec,
                                        status: 'present',
                                        hours: typeof rec.hours === 'number' ? rec.hours : (parseFloat(rec.hours) || 8),
                                        schemaVersion: rec.schemaVersion || CURRENT_SCHEMA_VERSION,
                                        localOnly: rec.localOnly !== false
                                    };
                                }
                            }
                        }
                    }
                }
                return normalized;
            }
            catch {
                return {};
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
        function persistAttendance(data) {
            var _a;
            storage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(data));
            (_a = options.onSnapshotChanged) === null || _a === void 0 ? void 0 : _a.call(options, data, loadTombstones());
        }
        function persistTombstones(tombstones) {
            var _a;
            storage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(tombstones));
            (_a = options.onSnapshotChanged) === null || _a === void 0 ? void 0 : _a.call(options, loadAttendance(), tombstones);
        }
        function getRecord(employeeId, date) {
            var _a;
            const all = loadAttendance();
            const rec = (_a = all[date]) === null || _a === void 0 ? void 0 : _a[employeeId];
            return rec ? { ...rec } : null;
        }
        function getByDate(date) {
            const all = loadAttendance();
            const day = all[date] || {};
            const result = {};
            for (const id in day) {
                if (Object.prototype.hasOwnProperty.call(day, id)) {
                    result[id] = { ...day[id] };
                }
            }
            return result;
        }
        function getByEmployee(employeeId, fromDate, toDate) {
            var _a;
            const all = loadAttendance();
            const result = {};
            for (const date in all) {
                if (Object.prototype.hasOwnProperty.call(all, date)) {
                    if (fromDate && date < fromDate)
                        continue;
                    if (toDate && date > toDate)
                        continue;
                    if ((_a = all[date]) === null || _a === void 0 ? void 0 : _a[employeeId]) {
                        result[date] = { ...all[date][employeeId] };
                    }
                }
            }
            return result;
        }
        function getDateRange(fromDate, toDate) {
            const all = loadAttendance();
            const result = {};
            for (const date in all) {
                if (Object.prototype.hasOwnProperty.call(all, date)) {
                    if (date >= fromDate && date <= toDate) {
                        result[date] = {};
                        for (const id in all[date]) {
                            if (Object.prototype.hasOwnProperty.call(all[date], id)) {
                                result[date][id] = { ...all[date][id] };
                            }
                        }
                    }
                }
            }
            return result;
        }
        function setRecord(employeeId, date, status, hours = 8) {
            var _a;
            const all = loadAttendance();
            const timestamp = nowFn();
            if (status === 'absent' || status === 'pending') {
                if ((_a = all[date]) === null || _a === void 0 ? void 0 : _a[employeeId]) {
                    delete all[date][employeeId];
                    if (Object.keys(all[date]).length === 0) {
                        delete all[date];
                    }
                    persistAttendance(all);
                    // Register tombstone
                    const tombstones = loadTombstones();
                    const tombstone = {
                        date,
                        employeeId,
                        type: 'attendance',
                        deletedAt: timestamp,
                        schemaVersion: CURRENT_SCHEMA_VERSION
                    };
                    const nextTombstones = [
                        ...tombstones.filter((t) => !(t.date === date && t.employeeId === employeeId)),
                        tombstone
                    ];
                    persistTombstones(nextTombstones);
                    return { status: 'deleted', tombstone };
                }
                return { status: 'deleted' };
            }
            // Status === 'present'
            if (!all[date])
                all[date] = {};
            const existing = all[date][employeeId];
            const parsedHours = parseFloat(String(hours)) || 8;
            const record = {
                ...(existing || {}),
                status: 'present',
                hours: parsedHours,
                schemaVersion: CURRENT_SCHEMA_VERSION,
                localOnly: true,
                createdAt: (existing === null || existing === void 0 ? void 0 : existing.createdAt) || timestamp,
                updatedAt: timestamp
            };
            all[date][employeeId] = record;
            persistAttendance(all);
            // Clean any existing tombstone for this same day+employee
            const tombstones = loadTombstones();
            if (tombstones.some((t) => t.date === date && t.employeeId === employeeId)) {
                persistTombstones(tombstones.filter((t) => !(t.date === date && t.employeeId === employeeId)));
            }
            return { status: 'saved', record: { ...record } };
        }
        function deleteRecord(employeeId, date) {
            const result = setRecord(employeeId, date, 'absent');
            return result.status === 'deleted' && !!result.tombstone;
        }
        function getAll() {
            const all = loadAttendance();
            const result = {};
            for (const d in all) {
                if (Object.prototype.hasOwnProperty.call(all, d)) {
                    result[d] = {};
                    for (const id in all[d]) {
                        if (Object.prototype.hasOwnProperty.call(all[d], id)) {
                            result[d][id] = { ...all[d][id] };
                        }
                    }
                }
            }
            return result;
        }
        function clearAll() {
            persistAttendance({});
        }
        function importBatch(incoming, mode = 'merge') {
            if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
                throw new Error('Los datos de asistencia a importar deben ser un mapa de fechas a registros');
            }
            const timestamp = nowFn();
            const current = mode === 'replace' ? {} : loadAttendance();
            const parsed = incoming;
            let updatedDays = 0;
            let totalRecords = 0;
            if (mode === 'replace') {
                // Generate tombstones for all existing records
                const oldAttendance = loadAttendance();
                const tombstones = loadTombstones();
                const newTombstones = [];
                for (const date in oldAttendance) {
                    if (Object.prototype.hasOwnProperty.call(oldAttendance, date)) {
                        for (const empId in oldAttendance[date]) {
                            if (Object.prototype.hasOwnProperty.call(oldAttendance[date], empId)) {
                                newTombstones.push({
                                    date,
                                    employeeId: empId,
                                    type: 'attendance',
                                    deletedAt: timestamp,
                                    schemaVersion: CURRENT_SCHEMA_VERSION
                                });
                            }
                        }
                    }
                }
                persistTombstones([...tombstones, ...newTombstones]);
            }
            for (const date in parsed) {
                if (Object.prototype.hasOwnProperty.call(parsed, date) && parsed[date] && typeof parsed[date] === 'object') {
                    if (!current[date])
                        current[date] = {};
                    let dayChanged = false;
                    for (const empId in parsed[date]) {
                        if (Object.prototype.hasOwnProperty.call(parsed[date], empId)) {
                            const rec = parsed[date][empId];
                            let item = null;
                            if (typeof rec === 'string' && rec === 'present') {
                                item = {
                                    status: 'present',
                                    hours: 8,
                                    schemaVersion: CURRENT_SCHEMA_VERSION,
                                    localOnly: true,
                                    createdAt: timestamp,
                                    updatedAt: timestamp
                                };
                            }
                            else if (rec && typeof rec === 'object' && rec.status === 'present') {
                                const existing = current[date][empId];
                                item = {
                                    ...rec,
                                    status: 'present',
                                    hours: typeof rec.hours === 'number' ? rec.hours : (parseFloat(rec.hours) || 8),
                                    schemaVersion: CURRENT_SCHEMA_VERSION,
                                    localOnly: true,
                                    createdAt: (existing === null || existing === void 0 ? void 0 : existing.createdAt) || rec.createdAt || timestamp,
                                    updatedAt: timestamp
                                };
                            }
                            if (item) {
                                current[date][empId] = item;
                                dayChanged = true;
                                totalRecords += 1;
                            }
                        }
                    }
                    if (dayChanged) {
                        updatedDays += 1;
                    }
                }
            }
            persistAttendance(current);
            return { updatedDays, totalRecords, attendance: current };
        }
        function exportSnapshot() {
            return {
                schemaVersion: CURRENT_SCHEMA_VERSION,
                exportedAt: nowFn(),
                attendance: getAll(),
                tombstones: loadTombstones().map(t => ({ ...t }))
            };
        }
        function getTombstones() {
            return loadTombstones().map(t => ({ ...t }));
        }
        function clearTombstones() {
            persistTombstones([]);
        }
        return {
            getRecord,
            getByDate,
            getByEmployee,
            getDateRange,
            setRecord,
            deleteRecord,
            getAll,
            clearAll,
            importBatch,
            exportSnapshot,
            getTombstones,
            clearTombstones
        };
    }
    return {
        createAttendanceRepository
    };
});
