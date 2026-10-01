"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.EmployeePositions` (browser global consumed by index.html).
// Up to 3 positions per employee. The principal stays in `position` (so every
// existing screen keeps working); `positionSaId` is its SA id and
// `extraPositions` holds up to 2 more. Each day's attendance record may carry
// `position` when the employee has more than one.
(function exposeEmployeePositions(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.EmployeePositions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeePositionsModule() {
    const MAX_POSITIONS = 3;
    const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
    const key = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function entry(name, saPositionId) {
        const id = clean(saPositionId);
        return id ? { name, saPositionId: id } : { name };
    }
    function dedupe(list) {
        const seen = new Set();
        const out = [];
        for (const item of list) {
            if (!item.name || seen.has(key(item.name)))
                continue;
            seen.add(key(item.name));
            out.push(item);
            if (out.length === MAX_POSITIONS)
                break;
        }
        return out;
    }
    function positionsOf(employee) {
        if (!employee)
            return [];
        const list = [];
        const principal = clean(employee.position);
        if (principal)
            list.push(entry(principal, employee.positionSaId));
        if (Array.isArray(employee.extraPositions)) {
            for (const extra of employee.extraPositions) {
                if (extra && typeof extra === 'object')
                    list.push(entry(clean(extra.name), extra.saPositionId));
            }
        }
        return dedupe(list);
    }
    const hasMultiple = (employee) => positionsOf(employee).length > 1;
    // The day's position: the chosen one if it is still one of the employee's, else the principal.
    function dayPosition(employee, record) {
        const positions = positionsOf(employee);
        if (positions.length < 2)
            return null;
        const chosen = clean(record && record.position);
        return (chosen && positions.find(p => key(p.name) === key(chosen))) || positions[0];
    }
    // WhatsApp markup characters would break the imported format.
    const forWhatsApp = (name) => name.replace(/[_*~`]/g, ' ').replace(/\s+/g, ' ').trim();
    function whatsappSuffix(employee, record) {
        const day = dayPosition(employee, record);
        const name = day ? forWhatsApp(day.name) : '';
        return name ? ` _${name}_` : '';
    }
    function submissionFields(employee, record) {
        const day = dayPosition(employee, record);
        if (!day)
            return {};
        return day.saPositionId ? { positionName: day.name, saPositionId: day.saPositionId } : { positionName: day.name };
    }
    function toFields(list) {
        const [principal, ...extras] = dedupe(list);
        const fields = { position: principal ? principal.name : '', extraPositions: extras };
        if (principal && principal.saPositionId)
            fields.positionSaId = principal.saPositionId;
        return fields;
    }
    // Form names (principal first); SA ids are kept for names that did not change.
    function fromNames(names, previous) {
        const known = positionsOf(previous);
        return toFields(names.map(clean).filter(Boolean).map(name => {
            const match = known.find(p => key(p.name) === key(name));
            return entry(name, match && match.saPositionId);
        }));
    }
    // `positions` from an SA roster: [{ id?, name }], principal first.
    function fromSaPositions(raw) {
        if (!Array.isArray(raw))
            throw new Error('positions must be an array');
        if (raw.length > MAX_POSITIONS)
            throw new Error(`positions allows at most ${MAX_POSITIONS} items`);
        return toFields(raw.map((item, index) => {
            const name = item && typeof item === 'object' ? clean(item.name) : '';
            if (!name)
                throw new Error(`positions[${index}].name is required`);
            return entry(name, item.id);
        }));
    }
    const label = (employee) => positionsOf(employee).map(p => p.name).join(' · ');
    return { MAX_POSITIONS, positionsOf, hasMultiple, dayPosition, whatsappSuffix, submissionFields, fromNames, fromSaPositions, label };
});
