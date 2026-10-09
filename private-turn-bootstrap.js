"use strict";
(function exposePrivateTurnBootstrap(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.PrivateTurnBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    let installed = null;
    function fail(code) { throw new Error(code); }
    function install(options) {
        var _a;
        if (options.enabled !== true)
            return { active: false, dispose: () => { } };
        const origin = ((_a = root.location) === null || _a === void 0 ? void 0 : _a.origin) || '', identity = options.appIdentity, core = root.SaMiniP2P;
        try {
            const url = new URL(origin);
            if (url.protocol !== 'https:' || (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !(options.allowedOrigins || []).includes(origin)) || url.origin !== origin || !['mini', 'sa'].includes(identity))
                fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        }
        catch {
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        }
        if ((options.allowedOrigins || []).some(value => !['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'].includes(value)))
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        if (!core || !root.PrivateTurn || !root.fetch || (identity === 'sa' && !options.loadSaAuth))
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        if (installed) {
            if (installed.core === core && installed.identity === identity && core.createRtcSession === installed.wrapper)
                return installed.handle;
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        }
        const original = core.createRtcSession, fetcher = root.fetch.bind(root), loadSaAuth = options.loadSaAuth;
        const getScope = options.getScope || (() => identity + ':' + origin);
        let disposed = false, epoch = 0, auth = null, pendingAuth = null;
        let unsubscribe = () => { };
        const provider = root.PrivateTurn.createProvider({ enabled: true, origin, forceRelay: options.forceRelay, allowedOrigins: options.allowedOrigins, contract: options.contract, getUser: () => (auth === null || auth === void 0 ? void 0 : auth.currentUser) || null, fetcher, now: options.now });
        function scope() {
            try {
                const value = getScope();
                if (typeof value !== 'string' || !value || value.length > 256)
                    fail('TURN_BOOTSTRAP_STALE');
                return value;
            }
            catch {
                return fail('TURN_BOOTSTRAP_STALE');
            }
        }
        function miniAuth() {
            var _a;
            try {
                return ((_a = root.firebase) === null || _a === void 0 ? void 0 : _a.app('mini-field').auth()) || null;
            }
            catch {
                return null;
            }
        }
        async function resolveAuth() {
            if (identity === 'mini')
                return miniAuth();
            if (!pendingAuth) {
                pendingAuth = loadSaAuth().catch(() => { pendingAuth = null; return fail('TURN_BOOTSTRAP_UNAVAILABLE'); });
            }
            return pendingAuth;
        }
        function bind(next) {
            var _a;
            if (next === auth)
                return;
            if (auth) {
                epoch++;
                provider.invalidate();
                unsubscribe();
            }
            auth = next;
            unsubscribe = () => { };
            if (next) {
                let first = true;
                const initialUid = ((_a = next.currentUser) === null || _a === void 0 ? void 0 : _a.uid) || null;
                try {
                    unsubscribe = next.onAuthStateChanged(user => {
                        if (first) {
                            first = false;
                            if (((user === null || user === void 0 ? void 0 : user.uid) || null) === initialUid)
                                return;
                        }
                        epoch++;
                        provider.invalidate();
                    });
                }
                catch {
                    fail('TURN_BOOTSTRAP_UNAVAILABLE');
                }
            }
        }
        function guard(captured, capturedScope) {
            var _a;
            if (disposed || epoch !== captured || core.createRtcSession !== wrapper || scope() !== capturedScope || ((_a = root.location) === null || _a === void 0 ? void 0 : _a.origin) !== origin)
                fail('TURN_BOOTSTRAP_STALE');
        }
        const wrapper = async (options) => {
            var _a, _b;
            const capturedScope = scope(), startEpoch = epoch;
            const next = await resolveAuth();
            guard(startEpoch, capturedScope);
            bind(next);
            const captured = epoch, uid = ((_a = auth === null || auth === void 0 ? void 0 : auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) || null, bound = auth;
            const config = await provider.getConfiguration();
            guard(captured, capturedScope);
            if (auth !== bound || (((_b = auth === null || auth === void 0 ? void 0 : auth.currentUser) === null || _b === void 0 ? void 0 : _b.uid) || null) !== uid || (identity === 'mini' && miniAuth() !== bound))
                fail('TURN_BOOTSTRAP_STALE');
            return original.call(core, config ? { ...options, ...config } : options);
        };
        const handle = { active: true, dispose: () => {
                if (disposed)
                    return;
                disposed = true;
                handle.active = false;
                epoch++;
                provider.invalidate();
                try {
                    unsubscribe();
                }
                catch { /* Disposal must not expose SDK errors. */ }
                if (core.createRtcSession === wrapper)
                    core.createRtcSession = original;
                if ((installed === null || installed === void 0 ? void 0 : installed.handle) === handle)
                    installed = null;
            } };
        core.createRtcSession = wrapper;
        installed = { core, identity, wrapper, handle };
        return handle;
    }
    async function verifySelectedRelay(pc) {
        try {
            if (!pc || typeof pc !== 'object')
                return false;
            const connection = pc;
            if (connection.connectionState !== 'connected' || typeof connection.getStats !== 'function')
                return false;
            const stats = await connection.getStats();
            if (connection.connectionState !== 'connected' || typeof stats.get !== 'function' || typeof stats.forEach !== 'function')
                return false;
            let relay = false;
            const row = (value) => value && typeof value === 'object' ? value : null;
            stats.forEach(value => {
                const transport = row(value);
                if ((transport === null || transport === void 0 ? void 0 : transport.type) !== 'transport' || transport.dtlsState !== 'connected' || typeof transport.selectedCandidatePairId !== 'string')
                    return;
                const pair = row(stats.get(transport.selectedCandidatePairId));
                if ((pair === null || pair === void 0 ? void 0 : pair.id) !== transport.selectedCandidatePairId || pair.type !== 'candidate-pair' || pair.state !== 'succeeded' || pair.nominated !== true || typeof pair.localCandidateId !== 'string' || typeof pair.remoteCandidateId !== 'string')
                    return;
                const local = row(stats.get(pair.localCandidateId)), remote = row(stats.get(pair.remoteCandidateId));
                if ((local === null || local === void 0 ? void 0 : local.id) !== pair.localCandidateId || (remote === null || remote === void 0 ? void 0 : remote.id) !== pair.remoteCandidateId || (local === null || local === void 0 ? void 0 : local.type) !== 'local-candidate' || (remote === null || remote === void 0 ? void 0 : remote.type) !== 'remote-candidate')
                    return;
                if (local.candidateType === 'relay')
                    relay = true;
            });
            return relay;
        }
        catch {
            return false;
        }
    }
    function sanitizeReport(value) {
        const count = (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 100000 ? Number(value[key]) : 0;
        const hash = typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash) ? value.payloadHash : '';
        return { apiRequestSuccess: value.apiRequestSuccess === true, selectedRelay: value.selectedRelay === true, datachannelTransfer: value.datachannelTransfer === true,
            requestCount: count('requestCount'), payloadCount: count('payloadCount'), payloadHash: hash };
    }
    return { install, verifySelectedRelay, sanitizeReport };
});
