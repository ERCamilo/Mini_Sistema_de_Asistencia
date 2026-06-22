"use strict";
(function exposeDraftImport(root, factory) {
    const api = { createDraftImport: factory };
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.DraftImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDraftImportApi(rules) {
    const MAX_CHAIN_DEPTH = 5;
    let rowIdCounter = 0;
    function nextRowId() {
        rowIdCounter += 1;
        return `row-${rowIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
    }
    function emptyQueue() {
        return { active: null, resolvedRowIds: [], visited: [], depth: 0, terminated: false, flaggedRowIds: [] };
    }
    function createSession(existingUsers) {
        return { rows: [], existingUsers: [...existingUsers], queue: emptyQueue() };
    }
    function addRow(session, partial) {
        var _a, _b, _c, _d;
        const row = {
            rowId: nextRowId(),
            name: (_a = partial === null || partial === void 0 ? void 0 : partial.name) !== null && _a !== void 0 ? _a : '',
            number: (_b = partial === null || partial === void 0 ? void 0 : partial.number) !== null && _b !== void 0 ? _b : '',
            position: (_c = partial === null || partial === void 0 ? void 0 : partial.position) !== null && _c !== void 0 ? _c : '',
            sueldo: (_d = partial === null || partial === void 0 ? void 0 : partial.sueldo) !== null && _d !== void 0 ? _d : ''
        };
        return { ...session, rows: [...session.rows, row] };
    }
    function updateRow(session, rowId, patch) {
        return {
            ...session,
            rows: session.rows.map(row => (row.rowId === rowId ? { ...row, ...patch } : row))
        };
    }
    function removeRow(session, rowId) {
        return { ...session, rows: session.rows.filter(row => row.rowId !== rowId) };
    }
    function validateDraft(session) {
        const incompleteRowIds = session.rows
            .filter(row => String(row.position).trim() === '')
            .map(row => row.rowId);
        return { ok: incompleteRowIds.length === 0, incompleteRowIds };
    }
    /** Find a conflict for `number` against an existing employee, excluding
     *  nothing (existing employees are never "the row itself"). */
    function findExistingOwner(existingUsers, number) {
        return rules.findEmployeeNumberConflict(existingUsers, number);
    }
    /** Find a conflict for `number` against other draft rows, excluding `selfRowId`. */
    function findDraftOwner(rows, number, selfRowId) {
        const normalizedTarget = rules.normalizeEmployeeNumber(number);
        if (normalizedTarget === null)
            return null;
        return (rows.find(row => row.rowId !== selfRowId && rules.normalizeEmployeeNumber(row.number) === normalizedTarget) || null);
    }
    /** Like `findDraftOwner`, but only considers rows that appear EARLIER than
     *  `selfIndex` in `rows`. Used by `findFirstConflict`'s left-to-right scan
     *  so the FIRST row to claim a number is the "owner" and a LATER row
     *  arriving at the same number is the one reported "in conflict" — this
     *  matches design §3.5's worked example (R1 established first, R2 ←
     *  collides with R1), independent of array mutation order. */
    function findEarlierDraftOwner(rows, number, selfIndex) {
        const normalizedTarget = rules.normalizeEmployeeNumber(number);
        if (normalizedTarget === null)
            return null;
        for (let index = 0; index < selfIndex; index += 1) {
            if (rules.normalizeEmployeeNumber(rows[index].number) === normalizedTarget)
                return rows[index];
        }
        return null;
    }
    function buildExistingOwnerConflict(session, row, owner) {
        return {
            rowId: row.rowId,
            number: row.number,
            ownerKind: 'existing',
            ownerEmployeeId: owner.id,
            ownerRowId: null,
            ownerName: owner.name,
            ownerDetails: { number: owner.number, position: owner.position, sueldo: owner.sueldo },
            message: `${owner.name} ya usa el número ${owner.number}.`,
            suggestedNumber: rules.getNextEmployeeNumber(session.existingUsers),
            actions: ['suggest', 'discard-new', 'return']
        };
    }
    function buildDraftOwnerConflict(session, row, owner) {
        return {
            rowId: row.rowId,
            number: row.number,
            ownerKind: 'draft',
            ownerEmployeeId: null,
            ownerRowId: owner.rowId,
            ownerName: owner.name,
            ownerDetails: null,
            message: `${owner.name || 'Otra fila'} ya usa el número ${owner.number}.`,
            suggestedNumber: rules.getNextEmployeeNumber(session.existingUsers),
            actions: ['suggest', 'proceed', 'return']
        };
    }
    /** Scans rows (skipping any already resolved/flagged) for the first
     *  conflict, with existing-owner precedence over draft-owner per row. */
    function findFirstConflict(session) {
        const skip = new Set([...session.queue.resolvedRowIds, ...session.queue.flaggedRowIds]);
        for (let index = 0; index < session.rows.length; index += 1) {
            const row = session.rows[index];
            if (skip.has(row.rowId))
                continue;
            if (String(row.number).trim() === '')
                continue;
            const existingOwner = findExistingOwner(session.existingUsers, row.number);
            if (existingOwner)
                return buildExistingOwnerConflict(session, row, existingOwner);
            const draftOwner = findEarlierDraftOwner(session.rows, row.number, index);
            if (draftOwner && !skip.has(draftOwner.rowId))
                return buildDraftOwnerConflict(session, row, draftOwner);
        }
        return null;
    }
    function detectConflicts(session) {
        const resetQueue = {
            active: null,
            resolvedRowIds: [...session.queue.resolvedRowIds],
            visited: [],
            depth: 0,
            terminated: false,
            flaggedRowIds: [...session.queue.flaggedRowIds]
        };
        const scanSession = { ...session, queue: resetQueue };
        const active = findFirstConflict(scanSession);
        return { ...scanSession, queue: { ...resetQueue, active } };
    }
    function rescanAfterResolution(session, queue) {
        const scanSession = { ...session, queue };
        const active = findFirstConflict(scanSession);
        return { ...scanSession, queue: { ...queue, active } };
    }
    function resolveSuggest(session, conflict) {
        const rows = session.rows.map(row => row.rowId === conflict.rowId ? { ...row, number: String(conflict.suggestedNumber) } : row);
        const queue = {
            active: null,
            resolvedRowIds: [...session.queue.resolvedRowIds, conflict.rowId],
            visited: [],
            depth: 0,
            terminated: false,
            flaggedRowIds: session.queue.flaggedRowIds
        };
        return rescanAfterResolution({ ...session, rows }, queue);
    }
    function resolveReturn(session, conflict) {
        const queue = {
            active: null,
            resolvedRowIds: [...session.queue.resolvedRowIds, conflict.rowId],
            visited: [],
            depth: 0,
            terminated: false,
            flaggedRowIds: [...session.queue.flaggedRowIds, conflict.rowId]
        };
        return rescanAfterResolution({ ...session, queue }, queue);
    }
    function resolveDiscardNew(session, conflict) {
        const removed = removeRow(session, conflict.rowId);
        const queue = {
            active: null,
            resolvedRowIds: session.queue.resolvedRowIds,
            visited: [],
            depth: 0,
            terminated: false,
            flaggedRowIds: session.queue.flaggedRowIds
        };
        return rescanAfterResolution({ ...removed, queue }, queue);
    }
    function resolveProceed(session, conflict) {
        const key = String(rules.normalizeEmployeeNumber(conflict.number));
        const guardFired = session.queue.visited.includes(key) || session.queue.depth + 1 > MAX_CHAIN_DEPTH;
        if (guardFired) {
            const queue = {
                active: null,
                resolvedRowIds: session.queue.resolvedRowIds,
                visited: session.queue.visited,
                depth: session.queue.depth,
                terminated: true,
                flaggedRowIds: [...session.queue.flaggedRowIds, conflict.rowId]
            };
            return { ...session, queue };
        }
        const visited = [...session.queue.visited, key];
        const depth = session.queue.depth + 1;
        const resolvedRowIds = [...session.queue.resolvedRowIds, conflict.rowId];
        // Resolve who now owns N among the OTHER draft rows (existing employees
        // are never displaced by `proceed`; existing-owner conflicts never
        // offer `proceed` in the first place — see precedence in detectConflicts).
        const skip = new Set([...resolvedRowIds, ...session.queue.flaggedRowIds]);
        const nextOwnerRow = session.rows.find(row => !skip.has(row.rowId) && rules.normalizeEmployeeNumber(row.number) === Number(key));
        if (!nextOwnerRow) {
            const queue = {
                active: null,
                resolvedRowIds,
                visited: [],
                depth: 0,
                terminated: false,
                flaggedRowIds: session.queue.flaggedRowIds
            };
            return rescanAfterResolution({ ...session, queue }, queue);
        }
        const chainedConflict = buildDraftOwnerConflict(session, nextOwnerRow, {
            rowId: conflict.rowId,
            name: conflict.ownerName,
            number: conflict.number,
            position: '',
            sueldo: ''
        });
        // Override ownerName with the actual current row's name for accuracy.
        const currentRow = session.rows.find(row => row.rowId === conflict.rowId);
        const refinedConflict = {
            ...chainedConflict,
            ownerRowId: conflict.rowId,
            ownerName: currentRow ? currentRow.name : conflict.ownerName
        };
        const queue = {
            active: refinedConflict,
            resolvedRowIds,
            visited,
            depth,
            terminated: false,
            flaggedRowIds: session.queue.flaggedRowIds
        };
        return { ...session, queue };
    }
    function resolveActiveConflict(session, action) {
        const conflict = session.queue.active;
        if (!conflict)
            return session;
        if (action === 'suggest')
            return resolveSuggest(session, conflict);
        if (action === 'return')
            return resolveReturn(session, conflict);
        if (action === 'discard-new' && conflict.ownerKind === 'existing')
            return resolveDiscardNew(session, conflict);
        if (action === 'proceed' && conflict.ownerKind === 'draft')
            return resolveProceed(session, conflict);
        // Action not valid for this conflict's ownerKind: no-op (defensive).
        return session;
    }
    function hasUnresolvedConflicts(session) {
        if (session.queue.active !== null)
            return true;
        if (session.queue.flaggedRowIds.length > 0) {
            // A flagged row only blocks commit while it STILL collides.
            for (const rowId of session.queue.flaggedRowIds) {
                const row = session.rows.find(r => r.rowId === rowId);
                if (!row)
                    continue;
                if (String(row.number).trim() === '')
                    continue;
                if (findExistingOwner(session.existingUsers, row.number))
                    return true;
                if (findDraftOwner(session.rows, row.number, row.rowId))
                    return true;
            }
        }
        return false;
    }
    function buildCommitPlan(session, generateId) {
        const validation = validateDraft(session);
        if (!validation.ok) {
            return { ok: false, reason: 'gate', existingUsers: session.existingUsers, newEmployees: [], finalUsers: [] };
        }
        if (hasUnresolvedConflicts(session)) {
            return {
                ok: false,
                reason: 'conflicts',
                existingUsers: session.existingUsers,
                newEmployees: [],
                finalUsers: []
            };
        }
        const usedIds = new Set(session.existingUsers.map(user => user.id));
        const newEmployees = session.rows.map(row => {
            let id = generateId();
            let suffix = 0;
            while (usedIds.has(id)) {
                suffix += 1;
                id = `${id}-${suffix}`;
            }
            usedIds.add(id);
            return {
                id,
                name: row.name,
                number: row.number,
                position: row.position,
                sueldo: row.sueldo
            };
        });
        return {
            ok: true,
            reason: null,
            existingUsers: session.existingUsers,
            newEmployees,
            finalUsers: [...session.existingUsers, ...newEmployees]
        };
    }
    return {
        createSession,
        addRow,
        updateRow,
        removeRow,
        validateDraft,
        detectConflicts,
        resolveActiveConflict,
        buildCommitPlan
    };
});
