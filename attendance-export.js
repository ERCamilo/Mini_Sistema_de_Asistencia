"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceExport` (browser global consumed by index.html).
// module:"none" gives every src/*.ts one shared global scope, so all type names here
// are AttExport-prefixed to avoid colliding with other modules.
(function exposeAttendanceExport(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root) {
        root.AttendanceExport = api;
        root.AttendanceResponse = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceExportApi() {
    'use strict';
    const ATTENDANCE_SUBMISSION_SCHEMA = 'attendance-submission/v1';
    const ATTENDANCE_REQUEST_SCHEMA = 'attendance-request/v1';
    const ATTENDANCE_RESPONSE_SCHEMA = 'attendance-response/v1';
    const ATTENDANCE_SUBMISSION_ENVELOPE_KEYS = [
        'schema',
        'submissionId',
        'saProjectId',
        'scope',
        'deviceId',
        'rosterVersion',
        'capturedAt',
        'workDate',
        'rows',
        'clientSequence',
        'excludedCount',
        'errorSummary'
    ];
    const ATTENDANCE_SUBMISSION_ROW_KEYS = [
        'miniLocalId',
        'number',
        'name',
        'normalHours',
        'overtimeHours',
        'status',
        'saEmployeeId'
    ];
    const ATTENDANCE_SUBMISSION_SCOPE_KEYS = ['ownerUid', 'siteId', 'sourceId'];
    const ATTENDANCE_SUBMISSION_ERROR_SUMMARY_KEYS = ['unparsedFragments', 'codes'];
    const ATTENDANCE_REQUEST_KEYS = [
        'schema',
        'requestId',
        'saProjectId',
        'fromDate',
        'toDate'
    ];
    const DEFAULT_SCOPE = {
        ownerUid: 'local-owner',
        siteId: 'local-site',
        sourceId: 'mini-app'
    };
    const SA_ID_MAX_LENGTH = 128;
    const SA_ID_FORBIDDEN_RE = /[\s\x00-\x1f\x7f]/;
    const WORKDATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const MAX_RANGE_DAYS = 31;
    function defaultNow() {
        return new Date().toISOString();
    }
    function defaultUuid() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    function deepFreeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(deepFreeze);
            Object.freeze(value);
        }
        return value;
    }
    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    function checkExactKeys(value, allowed, label) {
        if (!isPlainObject(value))
            throw new TypeError(`${label} must be an object`);
        const actualKeys = Object.keys(value);
        for (const key of actualKeys) {
            if (!allowed.includes(key)) {
                throw new TypeError(`${label} contains unsupported field "${key}"`);
            }
        }
    }
    function trimmedText(value, label) {
        if (typeof value !== 'string')
            throw new TypeError(`${label} must be a string`);
        const trimmed = value.trim();
        if (!trimmed)
            throw new TypeError(`${label} is required`);
        return trimmed;
    }
    function normalizeAttendanceSubmissionId(value) {
        if (typeof value !== 'string')
            return '';
        const trimmed = value.trim();
        if (!trimmed)
            return '';
        if (trimmed.length > SA_ID_MAX_LENGTH)
            return '';
        if (SA_ID_FORBIDDEN_RE.test(trimmed))
            return '';
        return trimmed;
    }
    function requireCanonicalSaId(value, label) {
        const normalized = normalizeAttendanceSubmissionId(value);
        if (!normalized) {
            throw new TypeError(`${label} must be a canonical ID (trimmed, 1-128 chars, no whitespace/control)`);
        }
        return normalized;
    }
    function validateCalendarDate(value, label) {
        const text = trimmedText(value, label);
        const match = WORKDATE_RE.exec(text);
        if (!match)
            throw new TypeError(`${label} must be YYYY-MM-DD`);
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (month < 1 || month > 12)
            throw new TypeError(`${label} must be YYYY-MM-DD`);
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        if (day < 1 || day > daysInMonth)
            throw new TypeError(`${label} must be YYYY-MM-DD`);
        const roundTrip = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
        if (roundTrip !== text)
            throw new TypeError(`${label} must be YYYY-MM-DD`);
        return text;
    }
    function parseUtcDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    }
    function rangeDays(fromDate, toDate) {
        const t1 = parseUtcDate(fromDate);
        const t2 = parseUtcDate(toDate);
        const diff = t2 - t1;
        return Math.round(diff / 86400000) + 1;
    }
    function listDatesInRange(fromDate, toDate) {
        const dates = [];
        const tStart = parseUtcDate(fromDate);
        const tEnd = parseUtcDate(toDate);
        let cur = tStart;
        while (cur <= tEnd) {
            dates.push(new Date(cur).toISOString().slice(0, 10));
            cur += 86400000;
        }
        return dates;
    }
    function validateScope(value) {
        checkExactKeys(value, ATTENDANCE_SUBMISSION_SCOPE_KEYS, 'scope');
        const rec = value;
        return {
            ownerUid: trimmedText(rec.ownerUid, 'scope.ownerUid'),
            siteId: trimmedText(rec.siteId, 'scope.siteId'),
            sourceId: trimmedText(rec.sourceId, 'scope.sourceId')
        };
    }
    function validateRow(row, index) {
        checkExactKeys(row, ATTENDANCE_SUBMISSION_ROW_KEYS, `rows[${index}]`);
        const rec = row;
        const miniLocalId = trimmedText(rec.miniLocalId, `rows[${index}].miniLocalId`);
        const number = trimmedText(rec.number, `rows[${index}].number`);
        const name = trimmedText(rec.name, `rows[${index}].name`);
        if (typeof rec.normalHours !== 'number' || !Number.isFinite(rec.normalHours) || rec.normalHours < 0) {
            throw new TypeError(`rows[${index}].normalHours must be finite and >= 0`);
        }
        if (typeof rec.overtimeHours !== 'number' || !Number.isFinite(rec.overtimeHours) || rec.overtimeHours < 0) {
            throw new TypeError(`rows[${index}].overtimeHours must be finite and >= 0`);
        }
        const total = rec.normalHours + rec.overtimeHours;
        if (!(total > 0) || total > 24) {
            throw new TypeError(`rows[${index}] hours must sum to > 0 and <= 24`);
        }
        if (rec.status !== 'present') {
            throw new TypeError(`rows[${index}].status must be present`);
        }
        const safe = {
            miniLocalId,
            number,
            name,
            normalHours: rec.normalHours,
            overtimeHours: rec.overtimeHours,
            status: 'present'
        };
        if (Object.prototype.hasOwnProperty.call(rec, 'saEmployeeId')) {
            safe.saEmployeeId = requireCanonicalSaId(rec.saEmployeeId, `rows[${index}].saEmployeeId`);
        }
        return safe;
    }
    function validateAttendanceSubmission(value, expectedSaProjectId) {
        checkExactKeys(value, ATTENDANCE_SUBMISSION_ENVELOPE_KEYS, 'envelope');
        const rec = value;
        if (rec.schema !== ATTENDANCE_SUBMISSION_SCHEMA) {
            throw new TypeError(`schema must be ${ATTENDANCE_SUBMISSION_SCHEMA}`);
        }
        const submissionId = trimmedText(rec.submissionId, 'submissionId');
        if (!UUID_RE.test(submissionId))
            throw new TypeError('submissionId must be a UUID');
        const saProjectId = requireCanonicalSaId(rec.saProjectId, 'saProjectId');
        if (expectedSaProjectId !== undefined && expectedSaProjectId !== null) {
            const expected = requireCanonicalSaId(expectedSaProjectId, 'expectedSaProjectId');
            if (saProjectId !== expected)
                throw new TypeError('saProjectId mismatch');
        }
        const scope = validateScope(rec.scope);
        const deviceId = trimmedText(rec.deviceId, 'deviceId');
        const rosterVersion = trimmedText(rec.rosterVersion, 'rosterVersion');
        const capturedAt = trimmedText(rec.capturedAt, 'capturedAt');
        if (new Date(capturedAt).toISOString() !== capturedAt) {
            throw new TypeError('capturedAt must be ISO-8601');
        }
        const workDay = validateCalendarDate(rec.workDate, 'workDate');
        if (!Array.isArray(rec.rows) || !rec.rows.length) {
            throw new TypeError('rows are required');
        }
        const rows = rec.rows.map((r, i) => validateRow(r, i));
        const seenMini = new Set();
        const seenSa = new Set();
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            if (seenMini.has(row.miniLocalId)) {
                throw new TypeError(`rows[${index}].miniLocalId is duplicated`);
            }
            seenMini.add(row.miniLocalId);
            if (row.saEmployeeId !== undefined) {
                if (seenSa.has(row.saEmployeeId)) {
                    throw new TypeError(`rows[${index}].saEmployeeId is duplicated`);
                }
                seenSa.add(row.saEmployeeId);
            }
        }
        const result = {
            schema: ATTENDANCE_SUBMISSION_SCHEMA,
            submissionId,
            saProjectId,
            scope,
            deviceId,
            rosterVersion,
            capturedAt,
            workDate: workDay,
            rows
        };
        if (Object.prototype.hasOwnProperty.call(rec, 'clientSequence')) {
            if (!Number.isSafeInteger(rec.clientSequence) || rec.clientSequence < 1) {
                throw new TypeError('clientSequence must be a positive safe integer');
            }
            result.clientSequence = rec.clientSequence;
        }
        if (Object.prototype.hasOwnProperty.call(rec, 'excludedCount')) {
            if (!Number.isSafeInteger(rec.excludedCount) || rec.excludedCount < 0) {
                throw new TypeError('excludedCount must be a safe integer >= 0');
            }
            result.excludedCount = rec.excludedCount;
        }
        if (Object.prototype.hasOwnProperty.call(rec, 'errorSummary')) {
            checkExactKeys(rec.errorSummary, ATTENDANCE_SUBMISSION_ERROR_SUMMARY_KEYS, 'errorSummary');
            const err = rec.errorSummary;
            if (!Number.isSafeInteger(err.unparsedFragments) || err.unparsedFragments < 0) {
                throw new TypeError('errorSummary.unparsedFragments must be an integer >= 0');
            }
            if (!Array.isArray(err.codes)) {
                throw new TypeError('errorSummary.codes must be an array');
            }
            for (let i = 0; i < err.codes.length; i++) {
                if (typeof err.codes[i] !== 'string') {
                    throw new TypeError(`errorSummary.codes[${i}] must be a string`);
                }
            }
            result.errorSummary = {
                unparsedFragments: err.unparsedFragments,
                codes: [...err.codes]
            };
        }
        return deepFreeze(result);
    }
    function validateAttendanceRequest(raw) {
        if (!isPlainObject(raw))
            throw new TypeError('attendance-request must be an object');
        const allowed = [...ATTENDANCE_REQUEST_KEYS, 'type'];
        checkExactKeys(raw, allowed, 'attendance-request');
        const schema = raw.schema;
        if (schema !== ATTENDANCE_REQUEST_SCHEMA) {
            throw new TypeError(`schema must be ${ATTENDANCE_REQUEST_SCHEMA}`);
        }
        const requestId = trimmedText(raw.requestId, 'requestId');
        if (requestId.length > SA_ID_MAX_LENGTH) {
            throw new TypeError('requestId exceeds maximum length');
        }
        const saProjectId = requireCanonicalSaId(raw.saProjectId, 'saProjectId');
        const fromDate = validateCalendarDate(raw.fromDate, 'fromDate');
        const toDate = validateCalendarDate(raw.toDate, 'toDate');
        const days = rangeDays(fromDate, toDate);
        if (days < 1) {
            throw new TypeError('fromDate must be less than or equal to toDate');
        }
        if (days > MAX_RANGE_DAYS) {
            throw new TypeError(`Date range (${days} days) exceeds maximum allowed range of ${MAX_RANGE_DAYS} days`);
        }
        const normalized = {
            schema: ATTENDANCE_REQUEST_SCHEMA,
            requestId,
            saProjectId,
            fromDate,
            toDate
        };
        if (raw.type === 'attendance-request') {
            normalized.type = 'attendance-request';
        }
        return deepFreeze(normalized);
    }
    function generateAttendanceSubmission(options) {
        var _a, _b, _c, _d;
        if (!options || typeof options !== 'object') {
            throw new TypeError('Options must be provided');
        }
        const workDay = validateCalendarDate(options.workDate, 'workDate');
        const saProjectId = requireCanonicalSaId(options.saProjectId, 'saProjectId');
        // Retrieve attendance records for this workDay without mutating local storage
        let dayRecords = {};
        if (options.repository && typeof options.repository.getByDate === 'function') {
            dayRecords = options.repository.getByDate(workDay) || {};
        }
        else if (options.attendanceData && typeof options.attendanceData === 'object') {
            dayRecords = options.attendanceData[workDay] || {};
        }
        else if (typeof ((_a = globalThis.attendanceRepository) === null || _a === void 0 ? void 0 : _a.getByDate) === 'function') {
            dayRecords = globalThis.attendanceRepository.getByDate(workDay) || {};
        }
        else if (globalThis.attendanceData && typeof globalThis.attendanceData === 'object') {
            dayRecords = globalThis.attendanceData[workDay] || {};
        }
        // Retrieve employees
        let employeesList = [];
        if (Array.isArray(options.employees)) {
            employeesList = options.employees;
        }
        else if (options.employeeRepository && typeof options.employeeRepository.getAll === 'function') {
            employeesList = options.employeeRepository.getAll() || [];
        }
        else if (Array.isArray(globalThis.users)) {
            employeesList = globalThis.users;
        }
        else if (typeof ((_b = globalThis.employeeRepository) === null || _b === void 0 ? void 0 : _b.getAll) === 'function') {
            employeesList = globalThis.employeeRepository.getAll() || [];
        }
        const empMap = new Map();
        for (const emp of employeesList) {
            if (emp && emp.id)
                empMap.set(String(emp.id), emp);
        }
        const rows = [];
        let excludedCount = 0;
        const errorCodes = new Set();
        const expectedHours = options.expectedHours && options.expectedHours > 0 ? options.expectedHours : 8;
        const empEntries = Object.entries(dayRecords);
        for (const [empId, rec] of empEntries) {
            if (!rec || rec.status !== 'present')
                continue;
            const emp = empMap.get(empId) || { id: empId, name: empId, number: '' };
            // Check project match: if employee has an SA project that does NOT match target project, exclude
            const empProject = emp.saProjectId ? normalizeAttendanceSubmissionId(emp.saProjectId) : '';
            if (empProject && empProject !== saProjectId) {
                excludedCount += 1;
                errorCodes.add('PROJECT_MISMATCH');
                continue;
            }
            // Check unlinked option: if unlinked rows should be excluded
            const empSaId = emp.saEmployeeId ? normalizeAttendanceSubmissionId(emp.saEmployeeId) : '';
            if (!empSaId && options.includeUnlinked === false) {
                excludedCount += 1;
                errorCodes.add('UNLINKED_EMPLOYEE');
                continue;
            }
            // Calculate normal and overtime hours
            let normalHours = 0;
            let overtimeHours = 0;
            if (typeof rec.normalHours === 'number' &&
                Number.isFinite(rec.normalHours) &&
                rec.normalHours >= 0 &&
                typeof rec.overtimeHours === 'number' &&
                Number.isFinite(rec.overtimeHours) &&
                rec.overtimeHours >= 0) {
                normalHours = rec.normalHours;
                overtimeHours = rec.overtimeHours;
            }
            else {
                const total = typeof rec.hours === 'number' && Number.isFinite(rec.hours)
                    ? rec.hours
                    : (parseFloat(rec.hours) || 8);
                if (total <= 0 || total > 24 || !Number.isFinite(total)) {
                    excludedCount += 1;
                    errorCodes.add('INVALID_HOURS');
                    continue;
                }
                normalHours = Math.min(total, expectedHours);
                overtimeHours = Math.max(0, total - expectedHours);
            }
            const totalSum = normalHours + overtimeHours;
            if (!(totalSum > 0) || totalSum > 24) {
                excludedCount += 1;
                errorCodes.add('INVALID_HOURS');
                continue;
            }
            const row = {
                miniLocalId: String(emp.id).trim(),
                number: String((_c = emp.number) !== null && _c !== void 0 ? _c : '').trim() || String(emp.id).trim(),
                name: String((_d = emp.name) !== null && _d !== void 0 ? _d : '').trim() || String(emp.id).trim(),
                normalHours,
                overtimeHours,
                status: 'present'
            };
            // Only include saEmployeeId when present and valid
            if (empSaId) {
                row.saEmployeeId = empSaId;
            }
            rows.push(row);
        }
        // Carry only data actually present: if no valid present rows, return null
        if (rows.length === 0) {
            return null;
        }
        // Sort rows for deterministic snapshot output
        rows.sort((a, b) => a.miniLocalId.localeCompare(b.miniLocalId));
        const uuidFn = options.generateUuid || defaultUuid;
        const nowFn = options.now || defaultNow;
        const scope = options.scope ? validateScope(options.scope) : DEFAULT_SCOPE;
        const deviceId = trimmedText(options.deviceId || 'mini-device', 'deviceId');
        const rosterVersion = trimmedText(options.rosterVersion || 'v1.0.0', 'rosterVersion');
        const submission = {
            schema: ATTENDANCE_SUBMISSION_SCHEMA,
            submissionId: uuidFn(),
            saProjectId,
            scope,
            deviceId,
            rosterVersion,
            capturedAt: nowFn(),
            workDate: workDay,
            rows
        };
        if (options.clientSequence !== undefined && options.clientSequence >= 1) {
            submission.clientSequence = options.clientSequence;
        }
        if (excludedCount > 0) {
            submission.excludedCount = excludedCount;
            submission.errorSummary = {
                unparsedFragments: excludedCount,
                codes: Array.from(errorCodes).sort()
            };
        }
        return validateAttendanceSubmission(submission, saProjectId);
    }
    function generateAttendanceSubmissionsForRange(options) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('Options must be provided');
        }
        const fromDate = validateCalendarDate(options.fromDate, 'fromDate');
        const toDate = validateCalendarDate(options.toDate, 'toDate');
        const saProjectId = requireCanonicalSaId(options.saProjectId, 'saProjectId');
        const days = rangeDays(fromDate, toDate);
        if (days < 1) {
            throw new TypeError('fromDate must be less than or equal to toDate');
        }
        if (days > MAX_RANGE_DAYS) {
            throw new TypeError(`Date range (${days} days) exceeds maximum allowed range of ${MAX_RANGE_DAYS} days`);
        }
        const dateList = listDatesInRange(fromDate, toDate);
        const submissions = [];
        for (const workDate of dateList) {
            const sub = generateAttendanceSubmission({
                ...options,
                workDate,
                saProjectId
            });
            if (sub) {
                submissions.push(sub);
            }
        }
        return submissions;
    }
    function isChannelAuthSafe(channel, isAuthFn) {
        var _a;
        if (!channel)
            return false;
        if (typeof isAuthFn === 'function') {
            try {
                return isAuthFn(channel);
            }
            catch {
                return false;
            }
        }
        if (typeof ((_a = globalThis.SaMiniP2P) === null || _a === void 0 ? void 0 : _a.isChannelAuthenticated) === 'function') {
            try {
                return globalThis.SaMiniP2P.isChannelAuthenticated(channel);
            }
            catch {
                return false;
            }
        }
        if (typeof channel.isAuthenticated === 'function') {
            try {
                return channel.isAuthenticated();
            }
            catch {
                return false;
            }
        }
        if (typeof channel.authenticated === 'boolean') {
            return channel.authenticated;
        }
        return false;
    }
    function handleAttendanceRequest(rawRequest, context = {}) {
        // 1. Channel authentication check (fail closed)
        if (context.channel) {
            const isAuth = isChannelAuthSafe(context.channel, context.isChannelAuthenticated);
            if (!isAuth) {
                throw new Error('Canal P2P no autenticado.');
            }
        }
        // 2. Peer verification: only answer SA peers (fail closed)
        if (context.peer) {
            if (!context.peer || context.peer.peerApp !== 'sa') {
                throw new Error('Peer remoto no es SA compatible.');
            }
        }
        // 3. Strict request validation
        const req = validateAttendanceRequest(rawRequest);
        // 4. Project identity match (fail closed)
        let expectedProject = context.expectedSaProjectId;
        if (expectedProject === undefined || expectedProject === null) {
            if (context.peer && typeof context.peer.saProjectId === 'string') {
                expectedProject = context.peer.saProjectId;
            }
        }
        if (expectedProject !== undefined && expectedProject !== null) {
            const expectedNorm = normalizeAttendanceSubmissionId(expectedProject);
            if (expectedNorm && req.saProjectId !== expectedNorm) {
                throw new TypeError(`saProjectId mismatch: expected "${expectedNorm}", got "${req.saProjectId}"`);
            }
        }
        // 5. Produce canonical submissions per workDate without mutating local attendance
        const submissions = generateAttendanceSubmissionsForRange({
            fromDate: req.fromDate,
            toDate: req.toDate,
            saProjectId: req.saProjectId,
            repository: context.repository,
            attendanceData: context.attendanceData,
            employees: context.employees,
            employeeRepository: context.employeeRepository,
            scope: context.scope,
            deviceId: context.deviceId,
            rosterVersion: context.rosterVersion,
            expectedHours: context.expectedHours,
            now: context.now,
            generateUuid: context.generateUuid,
            includeUnlinked: context.includeUnlinked
        });
        const response = {
            schema: ATTENDANCE_RESPONSE_SCHEMA,
            requestId: req.requestId,
            saProjectId: req.saProjectId,
            ok: true,
            fromDate: req.fromDate,
            toDate: req.toDate,
            submissions
        };
        return deepFreeze(response);
    }
    function sendAttendanceResponse(channel, response, isAuthFn) {
        if (!channel || channel.readyState !== 'open') {
            throw new Error('Canal P2P no disponible para enviar respuesta.');
        }
        if (!isChannelAuthSafe(channel, isAuthFn)) {
            throw new Error('Canal P2P no autenticado.');
        }
        channel.send(JSON.stringify(response));
    }
    function attachAttendanceResponder(channel, peer, context = {}) {
        if (!channel || typeof channel.addEventListener !== 'function') {
            return () => { };
        }
        const handler = (event) => {
            try {
                if (typeof (event === null || event === void 0 ? void 0 : event.data) !== 'string')
                    return;
                let parsed;
                try {
                    parsed = JSON.parse(event.data);
                }
                catch {
                    return;
                }
                if (!parsed || parsed.schema !== ATTENDANCE_REQUEST_SCHEMA)
                    return;
                const response = handleAttendanceRequest(parsed, {
                    channel,
                    peer,
                    ...context
                });
                sendAttendanceResponse(channel, response, context.isChannelAuthenticated);
            }
            catch (error) {
                try {
                    let reqId = '';
                    let projId = '';
                    try {
                        const p = JSON.parse(event === null || event === void 0 ? void 0 : event.data);
                        if (typeof (p === null || p === void 0 ? void 0 : p.requestId) === 'string')
                            reqId = p.requestId;
                        if (typeof (p === null || p === void 0 ? void 0 : p.saProjectId) === 'string')
                            projId = p.saProjectId;
                    }
                    catch (_) { }
                    if (reqId && channel && channel.readyState === 'open' && isChannelAuthSafe(channel, context.isChannelAuthenticated)) {
                        const errorMsg = error instanceof Error ? error.message : String(error || 'Error');
                        const errResponse = {
                            schema: ATTENDANCE_RESPONSE_SCHEMA,
                            requestId: reqId,
                            saProjectId: projId,
                            ok: false,
                            error: errorMsg
                        };
                        channel.send(JSON.stringify(errResponse));
                    }
                }
                catch (_) { }
            }
        };
        channel.addEventListener('message', handler);
        return () => {
            try {
                channel.removeEventListener('message', handler);
            }
            catch (_) { }
        };
    }
    return {
        ATTENDANCE_SUBMISSION_SCHEMA,
        ATTENDANCE_REQUEST_SCHEMA,
        ATTENDANCE_RESPONSE_SCHEMA,
        ATTENDANCE_SUBMISSION_ENVELOPE_KEYS,
        ATTENDANCE_SUBMISSION_ROW_KEYS,
        ATTENDANCE_REQUEST_KEYS,
        MAX_RANGE_DAYS,
        normalizeAttendanceSubmissionId,
        validateCalendarDate,
        rangeDays,
        validateAttendanceRequest,
        validateAttendanceSubmission,
        generateAttendanceSubmission,
        generateAttendanceSubmissionsForRange,
        handleAttendanceRequest,
        sendAttendanceResponse,
        attachAttendanceResponder
    };
});
