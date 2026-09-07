"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.SaRosterImport` (browser global consumed by index.html). Mirrors the
// `draft-import.ts` convention under `module: "none"` (no per-file isolation,
// no imports). All type names are `Sa*`-prefixed to avoid colliding with the
// ambient globals declared by `employee-number-rules.ts`.
//
// Versioned SA roster import contract (Mini consumer side only):
// - SA-tagged payloads MUST use the `sa-roster/v1` envelope. Any SA signal
//   (schema, source, or sa* keys) classifies the payload as SA and forces
//   strict fail-closed validation; SA payloads are NEVER silently treated as
//   legacy.
// - Legacy payloads (bare array or `{ employees }` without SA signals) keep
//   existing behavior and are classified explicitly as legacy.
// - Authoritative SA identity is the exact tuple (saProjectId, saEmployeeId).
//   Employee `number` is NEVER identity for SA records; a number-only match
//   yields an explicit reconciliation candidate requiring confirmation, never
//   an automatic cross-link.
// - `position`, `sueldo` and `paused` are optional and applied only when the
//   key is explicitly present on the SA record.
(function exposeSaRosterImport(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.SaRosterImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSaRosterImportApi() {
    const SCHEMA = 'sa-roster/v1';
    const VERSION = 1;
    const ENVELOPE_ALLOWLIST = ['schema', 'version', 'saProjectId', 'rosterVersion', 'generatedAt', 'employees', 'source'];
    const RECORD_ALLOWLIST = ['saProjectId', 'saEmployeeId', 'number', 'name', 'position', 'sueldo', 'paused'];
    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    function hasOwn(value, key) {
        return Object.prototype.hasOwnProperty.call(value, key);
    }
    function trimmedText(value) {
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    function isValidSaId(value) {
        if (typeof value !== 'string')
            return false;
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 128)
            return false;
        if (trimmed !== value.trim())
            return false;
        // Fail-closed: no whitespace or control characters inside the identifier.
        return !/[\s\x00-\x1f\x7f]/.test(trimmed);
    }
    function normalizeId(value, field) {
        if (!isValidSaId(value))
            throw new Error(`SA roster ${field} is malformed`);
        return value.trim();
    }
    function defaultNormalizeNumber(value) {
        if (value === null || value === undefined || String(value).trim() === '')
            return null;
        const normalized = Number(value);
        return Number.isFinite(normalized) ? normalized : null;
    }
    function recordHasSaSignal(record) {
        return isObject(record) && (hasOwn(record, 'saEmployeeId') || hasOwn(record, 'saProjectId'));
    }
    function classifyImportPayload(parsed) {
        if (Array.isArray(parsed)) {
            if (parsed.some(recordHasSaSignal)) {
                return { kind: 'sa', reason: 'array contains sa identity keys; must use versioned SA envelope' };
            }
            return { kind: 'legacy', reason: 'bare array' };
        }
        if (isObject(parsed)) {
            const employees = hasOwn(parsed, 'employees') ? parsed.employees : undefined;
            const recordsHaveSignal = Array.isArray(employees) && employees.some(recordHasSaSignal);
            if (parsed.schema === SCHEMA ||
                parsed.source === 'sa' ||
                recordsHaveSignal ||
                hasOwn(parsed, 'saEmployeeId') ||
                (hasOwn(parsed, 'saProjectId') && (hasOwn(parsed, 'version') || Array.isArray(employees)))) {
                return { kind: 'sa', reason: 'SA-tagged roster payload' };
            }
            if (Array.isArray(employees))
                return { kind: 'legacy', reason: 'employees object without SA signals' };
            return { kind: 'legacy', reason: 'object without SA signals' };
        }
        return { kind: 'legacy', reason: 'non-object payload' };
    }
    function normalizeSaRecord(raw, index, defaultProjectId) {
        if (!isObject(raw))
            throw new Error(`SA roster employees[${index}] must be an object`);
        const record = raw;
        for (const key of Object.keys(record)) {
            if (RECORD_ALLOWLIST.indexOf(key) < 0)
                throw new Error(`SA roster employees[${index}] has unsupported field "${key}"`);
        }
        const saProjectId = hasOwn(record, 'saProjectId')
            ? normalizeId(record.saProjectId, `employees[${index}].saProjectId`)
            : defaultProjectId;
        const saEmployeeId = normalizeId(record.saEmployeeId, `employees[${index}].saEmployeeId`);
        const number = trimmedText(record.number);
        if (!number)
            throw new Error(`SA roster employees[${index}].number is required`);
        const name = trimmedText(record.name);
        if (!name)
            throw new Error(`SA roster employees[${index}].name is required`);
        const normalized = { saProjectId, saEmployeeId, number, name };
        if (hasOwn(record, 'position')) {
            if (typeof record.position !== 'string')
                throw new Error(`SA roster employees[${index}].position must be a string`);
            normalized.position = record.position.trim();
        }
        if (hasOwn(record, 'sueldo')) {
            const sueldo = record.sueldo;
            if (typeof sueldo !== 'string' && typeof sueldo !== 'number') {
                throw new Error(`SA roster employees[${index}].sueldo must be a string`);
            }
            // Keep an explicit empty string as a clear marker: presence on the
            // normalized record means "SA sent sueldo", value '' means "clear".
            normalized.sueldo = String(sueldo).trim();
        }
        if (hasOwn(record, 'paused')) {
            if (typeof record.paused !== 'boolean')
                throw new Error(`SA roster employees[${index}].paused must be a boolean`);
            normalized.paused = record.paused;
        }
        return normalized;
    }
    // Presence flags for optional fields are recovered from the RAW envelope at
    // apply time (raw key presence decides whether position/sueldo/paused are
    // touched). This helper is kept for plan-time checks.
    function normalizeSaRoster(value) {
        if (!isObject(value))
            throw new Error('SA roster payload must be an object with schema "sa-roster/v1"');
        const envelope = value;
        for (const key of Object.keys(envelope)) {
            if (ENVELOPE_ALLOWLIST.indexOf(key) < 0)
                throw new Error(`SA roster has unsupported field "${key}"`);
        }
        if (envelope.schema !== SCHEMA)
            throw new Error(`SA roster schema must be ${SCHEMA}`);
        if (envelope.version !== VERSION)
            throw new Error('SA roster version must be 1');
        const saProjectId = normalizeId(envelope.saProjectId, 'saProjectId');
        if (!Array.isArray(envelope.employees))
            throw new Error('SA roster employees must be an array');
        let rosterVersion;
        if (hasOwn(envelope, 'rosterVersion') && envelope.rosterVersion !== undefined) {
            const text = trimmedText(envelope.rosterVersion);
            if (!text)
                throw new Error('SA roster rosterVersion is malformed');
            rosterVersion = text;
        }
        let generatedAt;
        if (hasOwn(envelope, 'generatedAt') && envelope.generatedAt !== undefined) {
            if (typeof envelope.generatedAt !== 'string' || !envelope.generatedAt.trim()) {
                throw new Error('SA roster generatedAt is malformed');
            }
            const iso = envelope.generatedAt.trim();
            if (new Date(iso).toISOString() !== iso)
                throw new Error('SA roster generatedAt must be ISO-8601');
            generatedAt = iso;
        }
        const rawEmployees = envelope.employees;
        const employees = rawEmployees.map((raw, index) => normalizeSaRecord(raw, index, saProjectId));
        // Fail-closed payload checks: duplicate SA identities and ambiguous
        // (normalized) numbers are rejected before any persistence or planning.
        const seenIdentities = new Set();
        for (const employee of employees) {
            const key = `${employee.saProjectId}::${employee.saEmployeeId}`;
            if (seenIdentities.has(key)) {
                throw new Error(`SA roster duplicate identity "${employee.saEmployeeId}" in project "${employee.saProjectId}"`);
            }
            seenIdentities.add(key);
        }
        const normalizeNum = defaultNormalizeNumber;
        const seenNumbers = new Map();
        for (const employee of employees) {
            const norm = normalizeNum(employee.number);
            if (norm === null)
                throw new Error(`SA roster employees number "${employee.number}" is malformed`);
            const owner = seenNumbers.get(norm);
            if (owner !== undefined) {
                throw new Error(`SA roster ambiguous number "${employee.number}" (also used by "${owner}")`);
            }
            seenNumbers.set(norm, employee.saEmployeeId);
        }
        const normalized = {
            schema: SCHEMA,
            version: VERSION,
            saProjectId,
            employees
        };
        if (rosterVersion !== undefined)
            normalized.rosterVersion = rosterVersion;
        if (generatedAt !== undefined)
            normalized.generatedAt = generatedAt;
        return normalized;
    }
    function tupleKey(saProjectId, saEmployeeId) {
        return `${saProjectId}::${saEmployeeId}`;
    }
    function buildSaImportPlan(existingUsers, roster, rules) {
        const safeRoster = normalizeSaRoster(JSON.parse(JSON.stringify(roster)));
        const normalizeNum = (rules && rules.normalizeEmployeeNumber) || defaultNormalizeNumber;
        // Corrupt local storage (same SA tuple linked twice) fails closed.
        const existingByTuple = new Map();
        for (const user of existingUsers) {
            if (user.saProjectId !== undefined || user.saEmployeeId !== undefined) {
                if (!isValidSaId(user.saProjectId) || !isValidSaId(user.saEmployeeId)) {
                    throw new Error(`Stored employee "${user.id}" has a malformed SA link`);
                }
                const key = tupleKey(String(user.saProjectId), String(user.saEmployeeId));
                if (existingByTuple.has(key))
                    throw new Error('Stored employees contain a duplicate SA identity');
                existingByTuple.set(key, user);
            }
        }
        const existingById = new Map();
        for (const user of existingUsers) {
            if (!existingById.has(user.id))
                existingById.set(user.id, user);
        }
        const existingByNumber = new Map();
        for (const user of existingUsers) {
            const norm = normalizeNum(user.number);
            if (norm === null)
                continue;
            const list = existingByNumber.get(norm) || [];
            list.push(user);
            existingByNumber.set(norm, list);
        }
        const updates = [];
        const creates = [];
        const reconciliationCandidates = [];
        for (const record of safeRoster.employees) {
            const exact = existingByTuple.get(tupleKey(record.saProjectId, record.saEmployeeId));
            const recordNorm = normalizeNum(record.number);
            if (exact) {
                // An exact-identity update that would steal another employee's number
                // fails closed instead of silently remapping either side.
                if (recordNorm !== null) {
                    const colliders = (existingByNumber.get(recordNorm) || []).filter(u => u.id !== exact.id);
                    if (colliders.length > 0) {
                        throw new Error(`SA roster conflicting link: "${record.name}" (${record.number}) collides with "${colliders[0].name}"`);
                    }
                }
                updates.push({ localId: exact.id, record });
                continue;
            }
            const numberOwners = recordNorm === null ? [] : (existingByNumber.get(recordNorm) || []);
            if (numberOwners.length > 0) {
                // Number-only match: explicit candidate, never an automatic link.
                reconciliationCandidates.push({
                    saProjectId: record.saProjectId,
                    saEmployeeId: record.saEmployeeId,
                    number: record.number,
                    name: record.name,
                    candidates: numberOwners.map(u => ({ id: u.id, number: String(u.number), name: String(u.name) }))
                });
                continue;
            }
            creates.push(record);
        }
        return {
            ok: reconciliationCandidates.length === 0,
            reason: reconciliationCandidates.length > 0 ? 'needs-confirmation' : null,
            roster: safeRoster,
            updates,
            creates,
            reconciliationCandidates,
            totalValid: safeRoster.employees.length
        };
    }
    function applySaRosterToUsers(existingUsers, roster, options = {}) {
        var _a, _b, _c;
        const safeRoster = normalizeSaRoster(JSON.parse(JSON.stringify(roster)));
        const normalizeNum = options.normalizeEmployeeNumber || defaultNormalizeNumber;
        const generateId = options.generateId || (() => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        const now = (options.now && options.now()) || new Date().toISOString();
        const confirmedLinks = options.confirmedLinks || [];
        // Index raw records by tuple to recover explicit-presence flags for the
        // optional fields (position/sueldo/paused apply only when present).
        const rawByTuple = new Map();
        if (isObject(roster) && Array.isArray(roster.employees)) {
            for (const raw of roster.employees) {
                if (!isObject(raw))
                    continue;
                const rec = raw;
                const projectFallback = normalizeId(roster.saProjectId, 'saProjectId');
                const project = hasOwn(rec, 'saProjectId') && typeof rec.saProjectId === 'string' && rec.saProjectId.trim()
                    ? rec.saProjectId.trim()
                    : projectFallback;
                if (typeof rec.saEmployeeId !== 'string')
                    continue;
                rawByTuple.set(tupleKey(project, rec.saEmployeeId.trim()), rec);
            }
        }
        // Also index the normalized input positionally as a fallback.
        const rawList = isObject(roster) && Array.isArray(roster.employees)
            ? roster.employees
            : [];
        function rawFor(record, fallbackIndex) {
            const direct = rawByTuple.get(tupleKey(record.saProjectId, record.saEmployeeId));
            if (direct)
                return direct;
            const positional = rawList[fallbackIndex];
            return isObject(positional) ? positional : null;
        }
        const plan = buildSaImportPlan(existingUsers, safeRoster, { normalizeEmployeeNumber: normalizeNum });
        // Validate explicit confirmations against the candidate list.
        const candidateByTuple = new Map();
        for (const candidate of plan.reconciliationCandidates) {
            candidateByTuple.set(tupleKey(candidate.saProjectId, candidate.saEmployeeId), candidate);
        }
        const confirmedByTuple = new Map();
        for (const link of confirmedLinks) {
            if (!isValidSaId(link.saProjectId) || !isValidSaId(link.saEmployeeId) || !link.localId) {
                throw new Error('SA roster confirmation link is malformed');
            }
            const key = tupleKey(link.saProjectId.trim(), link.saEmployeeId.trim());
            const candidate = candidateByTuple.get(key);
            if (!candidate)
                throw new Error('SA roster confirmation does not match a pending candidate');
            if (!candidate.candidates.some(c => c.id === link.localId)) {
                throw new Error('SA roster confirmation targets an employee that does not share the number');
            }
            if (confirmedByTuple.has(key))
                throw new Error('SA roster duplicate confirmation link');
            confirmedByTuple.set(key, link.localId);
        }
        const nextUsers = existingUsers.map(u => ({ ...u }));
        const byId = new Map();
        for (const user of nextUsers)
            byId.set(user.id, user);
        let updatedCount = 0;
        let linkedCount = 0;
        function applyRecord(target, record, raw) {
            target.number = record.number;
            target.name = record.name;
            const hasPosition = raw ? hasOwn(raw, 'position') : hasOwn(record, 'position');
            const hasSueldo = raw ? hasOwn(raw, 'sueldo') : hasOwn(record, 'sueldo');
            const hasPaused = raw ? hasOwn(raw, 'paused') : hasOwn(record, 'paused');
            if (hasPosition) {
                target.position = record.position !== undefined ? record.position : '';
            }
            if (hasSueldo) {
                if (record.sueldo !== undefined && record.sueldo !== '')
                    target.sueldo = record.sueldo;
                else
                    delete target.sueldo;
            }
            if (hasPaused) {
                if (record.paused === true)
                    target.paused = true;
                else
                    delete target.paused;
            }
            target.saProjectId = record.saProjectId;
            target.saEmployeeId = record.saEmployeeId;
            target.updatedAt = now;
            target.schemaVersion = 1;
        }
        const recordIndexByTuple = new Map();
        safeRoster.employees.forEach((record, index) => {
            recordIndexByTuple.set(tupleKey(record.saProjectId, record.saEmployeeId), index);
        });
        for (const update of plan.updates) {
            const target = byId.get(update.localId);
            if (!target)
                throw new Error('SA roster update target is missing');
            const index = (_a = recordIndexByTuple.get(tupleKey(update.record.saProjectId, update.record.saEmployeeId))) !== null && _a !== void 0 ? _a : 0;
            applyRecord(target, update.record, rawFor(update.record, index));
            updatedCount += 1;
        }
        // Explicitly confirmed number-match links keep the existing local id.
        for (const [key, localId] of confirmedByTuple) {
            const target = byId.get(localId);
            if (!target)
                throw new Error('SA roster link target is missing');
            const record = safeRoster.employees.find(r => tupleKey(r.saProjectId, r.saEmployeeId) === key);
            if (!record)
                throw new Error('SA roster link record is missing');
            const index = (_b = recordIndexByTuple.get(key)) !== null && _b !== void 0 ? _b : 0;
            applyRecord(target, record, rawFor(record, index));
            linkedCount += 1;
        }
        const unconfirmed = new Set();
        for (const candidate of plan.reconciliationCandidates) {
            const key = tupleKey(candidate.saProjectId, candidate.saEmployeeId);
            if (!confirmedByTuple.has(key))
                unconfirmed.add(key);
        }
        // Creates: only records with no exact match AND no number collision, plus
        // reuse of the SA employee id as local id when safe/unoccupied.
        const usedIds = new Set(nextUsers.map(u => u.id));
        let createdCount = 0;
        const safeRosterIndex = new Map();
        safeRoster.employees.forEach((record, index) => {
            safeRosterIndex.set(tupleKey(record.saProjectId, record.saEmployeeId), index);
        });
        for (const record of plan.creates) {
            const key = tupleKey(record.saProjectId, record.saEmployeeId);
            if (unconfirmed.has(key))
                continue;
            let localId = record.saEmployeeId;
            if (!localId || usedIds.has(localId)) {
                localId = generateId();
                let suffix = 0;
                while (usedIds.has(localId)) {
                    suffix += 1;
                    localId = `${localId}-${suffix}`;
                }
            }
            usedIds.add(localId);
            const index = (_c = safeRosterIndex.get(key)) !== null && _c !== void 0 ? _c : 0;
            const raw = rawFor(record, index);
            const entry = {
                id: localId,
                name: record.name,
                number: record.number,
                position: (raw ? hasOwn(raw, 'position') : hasOwn(record, 'position')) && record.position !== undefined ? record.position : '',
                saProjectId: record.saProjectId,
                saEmployeeId: record.saEmployeeId
            };
            if ((raw ? hasOwn(raw, 'sueldo') : hasOwn(record, 'sueldo')) && record.sueldo !== undefined && record.sueldo !== '') {
                entry.sueldo = record.sueldo;
            }
            if ((raw ? hasOwn(raw, 'paused') : hasOwn(record, 'paused')) && record.paused === true) {
                entry.paused = true;
            }
            entry.schemaVersion = 1;
            entry.localOnly = true;
            entry.createdAt = now;
            entry.updatedAt = now;
            nextUsers.push(entry);
            byId.set(localId, entry);
            createdCount += 1;
        }
        const remainingCandidates = plan.reconciliationCandidates.filter(candidate => !confirmedByTuple.has(tupleKey(candidate.saProjectId, candidate.saEmployeeId)));
        return {
            users: nextUsers,
            createdCount,
            updatedCount: updatedCount + linkedCount,
            linkedCount,
            skippedCount: remainingCandidates.length,
            totalValid: safeRoster.employees.length,
            reconciliationCandidates: remainingCandidates
        };
    }
    return {
        SCHEMA,
        VERSION,
        ENVELOPE_ALLOWLIST,
        RECORD_ALLOWLIST,
        classifyImportPayload,
        normalizeSaRoster,
        buildSaImportPlan,
        applySaRosterToUsers
    };
});
