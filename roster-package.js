"use strict";
(function exposeRosterPackage(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniRosterPackage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRosterPackageApi() {
    const SCHEMA = 'mini-roster/v1';
    function text(value, field) {
        if (typeof value !== 'string' || !value.trim())
            throw new Error(`${field} is required`);
        return value.trim();
    }
    function scope(value) {
        return {
            ownerUid: text(value === null || value === void 0 ? void 0 : value.ownerUid, 'scope.ownerUid'),
            siteId: text(value === null || value === void 0 ? void 0 : value.siteId, 'scope.siteId'),
            sourceId: text(value === null || value === void 0 ? void 0 : value.sourceId, 'scope.sourceId')
        };
    }
    function canonical(value) {
        if (Array.isArray(value))
            return `[${value.map(canonical).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }
    function integrityChecksum(value) {
        const input = canonical(value);
        let hash = 2166136261;
        for (let index = 0; index < input.length; index += 1) {
            hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
        }
        return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }
    function body(value) {
        if ((value === null || value === void 0 ? void 0 : value.schema) !== SCHEMA)
            throw new Error(`schema must be ${SCHEMA}`);
        const generatedAt = text(value.generatedAt, 'generatedAt');
        if (new Date(generatedAt).toISOString() !== generatedAt)
            throw new Error('generatedAt must be ISO-8601');
        if (!Array.isArray(value.employees))
            throw new Error('employees must be an array');
        const ids = new Set();
        const employees = value.employees.map((employee, index) => {
            const id = text(employee === null || employee === void 0 ? void 0 : employee.id, `employees[${index}].id`);
            if (ids.has(id))
                throw new Error(`duplicate employee id "${id}"`);
            ids.add(id);
            const result = {
                id,
                number: text(employee.number, `employees[${index}].number`),
                name: text(employee.name, `employees[${index}].name`)
            };
            if (employee.position)
                result.position = text(employee.position, `employees[${index}].position`);
            return result;
        });
        return {
            schema: SCHEMA,
            scope: scope(value.scope),
            rosterVersion: text(value.rosterVersion, 'rosterVersion'),
            generatedAt,
            employees
        };
    }
    function createRosterPackage(value) {
        const safeBody = body({ ...value, schema: SCHEMA });
        return Object.freeze({ ...safeBody, checksum: integrityChecksum(safeBody) });
    }
    function validateRosterPackage(value, expectedScope, expectedVersion) {
        const safeBody = body(value);
        if (value.checksum !== integrityChecksum(safeBody))
            throw new Error('Roster checksum mismatch');
        if (expectedScope && canonical(safeBody.scope) !== canonical(scope(expectedScope))) {
            throw new Error('Roster scope mismatch');
        }
        if (expectedVersion && safeBody.rosterVersion !== expectedVersion) {
            throw new Error('Roster version mismatch');
        }
        return Object.freeze({ ...safeBody, checksum: value.checksum });
    }
    function parseRosterPackage(raw, expectedScope, expectedVersion) {
        return validateRosterPackage(JSON.parse(raw), expectedScope, expectedVersion);
    }
    return {
        SCHEMA,
        CHECKSUM_NOTICE: 'Integrity checksum only; not an authenticity signature.',
        createRosterPackage,
        integrityChecksum,
        parseRosterPackage,
        validateRosterPackage
    };
});
