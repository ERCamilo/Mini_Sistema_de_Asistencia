"use strict";
(function exposeMiniPeerSessionManager(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniPeerSessionManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniPeerSessionManagerModule() {
    const MAX_LEASE_MS = 300000;
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
            function retire() {
                if (stopped)
                    return;
                stopped = true;
                if (timer !== undefined)
                    cancel(timer);
                for (const waiter of waiting)
                    waiter.reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
                waiting.clear();
                running = false;
                for (const reject of operations)
                    reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
                operations.clear();
                try {
                    onRetired();
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
                    retire();
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
            return { session, ready, valid, retire, run, busy: () => running, deadline };
        }
        return { lease, now };
    }
    return { create, MAX_LEASE_MS };
});
