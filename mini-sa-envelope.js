"use strict";
(function exposeMiniEnvelope(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniSaEnvelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniEnvelopeApi() {
    const SCHEMA = 'mini-attendance/v1';
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    function text(value, field) {
        if (typeof value !== 'string' || !value.trim())
            throw new Error(`${field} is required`);
        return value.trim();
    }
    function iso(value) {
        const result = text(value, 'capturedAt');
        if (new Date(result).toISOString() !== result)
            throw new Error('capturedAt must be ISO-8601');
        return result;
    }
    function freeze(value) {
        if (value && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    }
    function normalizeScope(value) {
        return {
            ownerUid: text(value === null || value === void 0 ? void 0 : value.ownerUid, 'scope.ownerUid'),
            siteId: text(value === null || value === void 0 ? void 0 : value.siteId, 'scope.siteId'),
            sourceId: text(value === null || value === void 0 ? void 0 : value.sourceId, 'scope.sourceId')
        };
    }
    function normalizeEnvelope(value) {
        if ((value === null || value === void 0 ? void 0 : value.schema) !== SCHEMA)
            throw new Error(`schema must be ${SCHEMA}`);
        const eventId = text(value.eventId, 'eventId');
        if (!UUID.test(eventId))
            throw new Error('eventId must be a UUID');
        if (!Number.isSafeInteger(value.clientSequence) || value.clientSequence < 1) {
            throw new Error('clientSequence must be a positive integer');
        }
        if (!Array.isArray(value.rows) || !value.rows.length)
            throw new Error('rows are required');
        const rows = value.rows.map((row, index) => {
            if ((row === null || row === void 0 ? void 0 : row.status) !== 'present')
                throw new Error(`rows[${index}].status must be present`);
            if (!Number.isFinite(row.hours) || row.hours <= 0 || row.hours > 24) {
                throw new Error(`rows[${index}].hours must be greater than 0 and at most 24`);
            }
            return {
                sourceEmployeeId: text(row.sourceEmployeeId, `rows[${index}].sourceEmployeeId`),
                number: text(row.number, `rows[${index}].number`),
                name: text(row.name, `rows[${index}].name`),
                status: 'present',
                hours: row.hours
            };
        });
        return freeze({
            schema: SCHEMA,
            eventId,
            scope: normalizeScope(value.scope),
            deviceId: text(value.deviceId, 'deviceId'),
            clientSequence: value.clientSequence,
            rosterVersion: text(value.rosterVersion, 'rosterVersion'),
            capturedAt: iso(value.capturedAt),
            rows
        });
    }
    function createEnvelope(value, uuid) {
        var _a, _b;
        const eventId = (value === null || value === void 0 ? void 0 : value.eventId) || (uuid === null || uuid === void 0 ? void 0 : uuid()) || ((_b = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a));
        return normalizeEnvelope({ ...value, schema: SCHEMA, eventId });
    }
    function createOutbox(store, options = {}) {
        const now = options.now || Date.now;
        const maxAttempts = options.maxAttempts || 5;
        const baseDelay = options.baseDelayMs || 1000;
        async function enqueue(value) {
            const envelope = normalizeEnvelope(value);
            const records = await store.load();
            const existing = records.find(record => record.eventId === envelope.eventId);
            if (existing)
                return existing;
            const record = {
                eventId: envelope.eventId, envelope, state: 'pending', attempts: 0, nextAttemptAt: 0
            };
            await store.save([...records, record]);
            return record;
        }
        async function processNext(transport) {
            if (!transport)
                return null;
            const records = await store.load();
            const index = records.findIndex(record => (record.state === 'sending' ||
                (record.state === 'pending' && record.nextAttemptAt <= now())));
            if (index < 0)
                return null;
            let record = {
                ...records[index], state: 'sending', attempts: records[index].attempts + 1
            };
            records[index] = record;
            await store.save(records);
            try {
                const ack = await transport(normalizeEnvelope(record.envelope));
                if (!ack.acknowledged || ack.eventId !== record.eventId)
                    throw new Error('Invalid ACK');
                record = { ...record, state: 'ack', error: undefined };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Transport failed';
                record = record.attempts >= maxAttempts
                    ? { ...record, state: 'dead', error: message }
                    : {
                        ...record,
                        state: 'pending',
                        nextAttemptAt: now() + baseDelay * 2 ** (record.attempts - 1),
                        error: message
                    };
            }
            records[index] = record;
            await store.save(records);
            return record;
        }
        return { enqueue, processNext, list: () => store.load() };
    }
    return { SCHEMA, createEnvelope, createOutbox, normalizeEnvelope };
});
