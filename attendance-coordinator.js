"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceCoordinator` (browser global consumed by index.html).
(function exposeAttendanceCoordinator(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.AttendanceCoordinator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceCoordinatorModule() {
    const OUTBOX_KEY = 'mini-sa-outbox-v1';
    // Nothing drains this outbox yet; cap it so it can never fill localStorage.
    const MAX_OUTBOX_ITEMS = 200;
    const DEFAULT_SCOPE = { ownerUid: 'local-owner', siteId: 'local-site', sourceId: 'mini-app' };
    function defaultUuid() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // RFC4122 v4 compliant fallback
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    function defaultNow() {
        return new Date().toISOString();
    }
    function createAttendanceCoordinator(options) {
        const repository = options.repository;
        const storage = options.storage;
        const nowFn = options.now || defaultNow;
        const uuidFn = options.generateUuid || defaultUuid;
        const baseScope = options.scope || DEFAULT_SCOPE;
        const deviceId = options.deviceId || 'device-local-1';
        let sequence = 0;
        function loadOutbox() {
            const raw = storage.getItem(OUTBOX_KEY);
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
        function persistOutbox(outbox) {
            storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
        }
        function recordAttendance(employee, date, status, hours = 8) {
            if (status !== 'present') {
                const repoResult = repository.setRecord(employee.id, date, status, hours);
                return {
                    status: 'deleted',
                    tombstone: repoResult.tombstone
                };
            }
            // All-or-nothing: the growing outbox write goes first, then the repository.
            // If the repository write fails (e.g. storage quota), restoring the previous
            // outbox is a shrinking write, so nothing is left half-saved.
            const currentOutbox = loadOutbox();
            const outboxRecord = buildOutboxRecord(employee, hours);
            persistOutbox([...currentOutbox, outboxRecord].slice(-MAX_OUTBOX_ITEMS));
            let repoResult;
            try {
                repoResult = repository.setRecord(employee.id, date, status, hours);
            }
            catch (error) {
                persistOutbox(currentOutbox);
                throw error;
            }
            return {
                status: 'saved',
                record: repoResult.record,
                outboxRecord
            };
        }
        function buildOutboxRecord(employee, hours) {
            // Same normalization as AttendanceRepository.setRecord.
            const normalizedHours = parseFloat(String(hours)) || 8;
            sequence += 1;
            const eventId = uuidFn();
            const timestamp = nowFn();
            const envelope = {
                schema: 'mini-attendance/v1',
                eventId,
                scope: { ...baseScope },
                deviceId,
                clientSequence: sequence,
                rosterVersion: 'v1.0.0',
                capturedAt: timestamp,
                rows: [
                    {
                        sourceEmployeeId: employee.id,
                        number: String(employee.number || ''),
                        name: String(employee.name || ''),
                        status: 'present',
                        hours: normalizedHours
                    }
                ]
            };
            return {
                eventId,
                envelope,
                state: 'pending',
                attempts: 0,
                nextAttemptAt: Date.now()
            };
        }
        function getPendingOutbox() {
            return loadOutbox().filter(item => item.state === 'pending' || item.state === 'sending');
        }
        function getAllOutbox() {
            return loadOutbox();
        }
        function acknowledgeEvent(eventId) {
            const outbox = loadOutbox();
            const target = outbox.find(item => item.eventId === eventId);
            if (!target)
                return false;
            target.state = 'ack';
            target.ackedAt = nowFn();
            persistOutbox(outbox);
            return true;
        }
        function markEventFailed(eventId, errorMsg) {
            const outbox = loadOutbox();
            const target = outbox.find(item => item.eventId === eventId);
            if (!target)
                return false;
            target.attempts = (target.attempts || 0) + 1;
            if (target.attempts >= 5) {
                target.state = 'dead';
            }
            else {
                target.state = 'pending';
            }
            target.error = errorMsg || 'Unknown error';
            persistOutbox(outbox);
            return true;
        }
        function clearOutbox() {
            persistOutbox([]);
        }
        return {
            recordAttendance,
            getPendingOutbox,
            getAllOutbox,
            acknowledgeEvent,
            markEventFailed,
            clearOutbox
        };
    }
    return {
        MAX_OUTBOX_ITEMS,
        createAttendanceCoordinator
    };
});
