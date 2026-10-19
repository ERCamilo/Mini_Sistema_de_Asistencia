"use strict";
(function exposeMiniPeerSessionManager(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniPeerSessionManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniPeerSessionManagerModule() {
    const MAX_LEASE_MS = 300000;
    // Intents outlive replaceable transport entries and own acquisition, not RTC.
    function createIntents() {
        const pending = new Map();
        const cancelled = () => new Error('Conexión Mini retirada. Reintenta.');
        function invalidate(key) {
            const record = pending.get(key);
            if (!record)
                return;
            pending.delete(key);
            record.reject(cancelled());
        }
        function run(key, operation) {
            const existing = pending.get(key);
            if (existing)
                return existing.promise;
            let resolve;
            let reject;
            const result = new Promise((done, fail) => { resolve = done; reject = fail; });
            const token = {
                current: () => { var _a; return ((_a = pending.get(key)) === null || _a === void 0 ? void 0 : _a.token) === token; },
                check: () => { if (!token.current())
                    throw cancelled(); }
            };
            pending.set(key, { token, promise: result, reject });
            // Reserve even the delivered promise before calling code that can re-enter.
            // Cancellation settles the caller; it does not physically abort arbitrary work.
            try {
                void operation(token).then(resolve, reject);
            }
            catch (error) {
                reject(error);
            }
            const finish = () => { if (token.current())
                pending.delete(key); };
            void result.then(finish, finish);
            return result;
        }
        return { run, invalidate, invalidateAll: () => { for (const key of [...pending.keys()])
                invalidate(key); } };
    }
    function create(options = {}) {
        const now = options.now || (() => performance.now());
        const schedule = options.schedule || ((fn, delay) => setTimeout(fn, delay));
        const cancel = options.cancel || ((timer) => clearTimeout(timer));
        function lease(session, startedAt, onRetired, eligibility = {}) {
            const credentialRemaining = () => {
                try {
                    return session.getLeaseRemainingMs ? session.getLeaseRemainingMs() : eligibility.guest === true ? MAX_LEASE_MS : 0;
                }
                catch {
                    return 0;
                }
            };
            const initialRemaining = credentialRemaining();
            const deadline = Math.min(startedAt + MAX_LEASE_MS, now() + (Number.isFinite(initialRemaining) ? Math.max(0, initialRemaining) : 0));
            let stopped = false, channel = null, timer;
            let running = false, tail = Promise.resolve();
            const operations = new Set();
            const waiting = new Set();
            let retirementReason = null;
            function retire(reason = 'unknown') {
                if (stopped)
                    return;
                stopped = true;
                retirementReason = reason === 'lease-expired' ? reason : 'unknown';
                if (timer !== undefined)
                    cancel(timer);
                const failure = () => new Error(reason === 'channel-closed'
                    ? 'El canal se cerró. Reconecta para reintentar.'
                    : 'La conexión expiró o se interrumpió. Reintenta.');
                for (const waiter of waiting)
                    waiter.reject(failure());
                waiting.clear();
                running = false;
                for (const reject of operations)
                    reject(failure());
                operations.clear();
                try {
                    onRetired(retirementReason);
                }
                finally {
                    try {
                        if (eligibility.transportOwnedExternally !== true)
                            session.close();
                    }
                    catch { /* Isolated transport cleanup. */ }
                }
            }
            function valid() {
                if (!stopped && (now() >= deadline || credentialRemaining() <= 0))
                    retire('lease-expired');
                return !stopped;
            }
            function check() {
                if (!valid())
                    return;
                timer = schedule(check, Math.min(1000, deadline - now()));
            }
            check();
            function ready(value) {
                if (!valid())
                    return false;
                channel = value;
                for (const waiter of waiting)
                    waiter.resolve(value);
                waiting.clear();
                return true;
            }
            function authenticated() {
                if (!valid())
                    return Promise.reject(new Error('La conexión expiró. Reintenta.'));
                if ((channel === null || channel === void 0 ? void 0 : channel.readyState) === 'open')
                    return Promise.resolve(channel);
                if ((channel === null || channel === void 0 ? void 0 : channel.readyState) === 'closing' || (channel === null || channel === void 0 ? void 0 : channel.readyState) === 'closed') {
                    retire('channel-closed');
                    return Promise.reject(new Error('El canal se cerró. Reconecta para reintentar.'));
                }
                return new Promise((resolve, reject) => waiting.add({ resolve, reject }));
            }
            function run(operation) {
                if (!valid())
                    return Promise.reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
                let rejectOperation;
                const cancelled = new Promise((_resolve, reject) => { rejectOperation = reject; operations.add(reject); });
                const result = tail.then(async () => {
                    const value = await authenticated();
                    if (!valid() || value.readyState !== 'open')
                        throw new Error('Canal no disponible. Reintenta.');
                    running = true;
                    try {
                        return await operation(value);
                    }
                    finally {
                        running = false;
                    }
                });
                tail = result.catch(() => { });
                const delivered = Promise.race([result, cancelled]);
                void delivered.then(() => operations.delete(rejectOperation), () => operations.delete(rejectOperation));
                return delivered;
            }
            return { session, ready, valid, retire, run, busy: () => running, deadline, getRetirementReason: () => retirementReason };
        }
        return { lease, now };
    }
    return { create, createIntents, MAX_LEASE_MS };
});
