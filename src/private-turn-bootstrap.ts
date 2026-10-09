interface PrivateTurnBootstrapAuth {
    currentUser: PrivateTurnUser | null;
    onAuthStateChanged(callback: (user: PrivateTurnUser | null) => void): () => void;
}
interface PrivateTurnBootstrapSession { pc: unknown; close(): void; }
interface PrivateTurnBootstrapCore { createRtcSession(options: Record<string, unknown>): Promise<PrivateTurnBootstrapSession>; }
interface PrivateTurnBootstrapOptions {
    enabled: boolean;
    forceRelay?: boolean;
    allowedOrigins?: readonly string[];
    appIdentity: 'mini' | 'sa';
    contract: PrivateTurnContract;
    loadSaAuth?: () => Promise<PrivateTurnBootstrapAuth>;
    getScope?: () => string;
    now?: () => number;
}
interface PrivateTurnBootstrapHandle { active: boolean; dispose(): void; }
interface PrivateTurnBootstrapRoot {
    location?: { origin: string };
    SaMiniP2P?: PrivateTurnBootstrapCore;
    PrivateTurn?: { createProvider(options: PrivateTurnOptions): { getConfiguration(): Promise<PrivateTurnConfiguration | null>; invalidate(): void } };
    firebase?: { app(name: string): { auth(): PrivateTurnBootstrapAuth } };
    fetch?: typeof fetch;
}
(function exposePrivateTurnBootstrap(root: any, factory: (root: PrivateTurnBootstrapRoot) => unknown) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    if (root) root.PrivateTurnBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root: PrivateTurnBootstrapRoot) {
    let installed: { core: PrivateTurnBootstrapCore; identity: string; wrapper: PrivateTurnBootstrapCore['createRtcSession']; handle: PrivateTurnBootstrapHandle } | null = null;
    function fail(code: string): never { throw new Error(code); }
    function install(options: PrivateTurnBootstrapOptions): PrivateTurnBootstrapHandle {
        if (options.enabled !== true) return { active: false, dispose: () => {} };
        const origin = root.location?.origin || '', identity = options.appIdentity, core = root.SaMiniP2P;
        try {
            const url = new URL(origin);
            if (url.protocol !== 'https:' || (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !(options.allowedOrigins || []).includes(origin)) || url.origin !== origin || !['mini', 'sa'].includes(identity)) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        } catch { fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID'); }
        if ((options.allowedOrigins || []).some(value => !['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'].includes(value))) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        if (!core || !root.PrivateTurn || !root.fetch || (identity === 'sa' && !options.loadSaAuth)) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        if (installed) {
            if (installed.core === core && installed.identity === identity && core.createRtcSession === installed.wrapper) return installed.handle;
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        }
        const original = core.createRtcSession, fetcher = root.fetch.bind(root), loadSaAuth = options.loadSaAuth;
        const getScope = options.getScope || (() => identity + ':' + origin);
        let disposed = false, epoch = 0, auth: PrivateTurnBootstrapAuth | null = null, pendingAuth: Promise<PrivateTurnBootstrapAuth> | null = null;
        let unsubscribe: () => void = () => {};
        const provider = root.PrivateTurn.createProvider({ enabled: true, origin, forceRelay: options.forceRelay, allowedOrigins: options.allowedOrigins, contract: options.contract, getUser: () => auth?.currentUser || null, fetcher, now: options.now });
        function scope(): string {
            try { const value = getScope(); if (typeof value !== 'string' || !value || value.length > 256) fail('TURN_BOOTSTRAP_STALE'); return value; }
            catch { return fail('TURN_BOOTSTRAP_STALE'); }
        }
        function miniAuth(): PrivateTurnBootstrapAuth | null {
            try { return root.firebase?.app('mini-field').auth() || null; } catch { return null; }
        }
        async function resolveAuth(): Promise<PrivateTurnBootstrapAuth | null> {
            if (identity === 'mini') return miniAuth();
            if (!pendingAuth) {
                pendingAuth = loadSaAuth!().catch(() => { pendingAuth = null; return fail('TURN_BOOTSTRAP_UNAVAILABLE'); });
            }
            return pendingAuth;
        }
        function bind(next: PrivateTurnBootstrapAuth | null): void {
            if (next === auth) return;
            if (auth) { epoch++; provider.invalidate(); unsubscribe(); }
            auth = next;
            unsubscribe = () => {};
            if (next) {
                let first = true;
                const initialUid = next.currentUser?.uid || null;
                try {
                    unsubscribe = next.onAuthStateChanged(user => {
                        if (first) { first = false; if ((user?.uid || null) === initialUid) return; }
                        epoch++; provider.invalidate();
                    });
                } catch { fail('TURN_BOOTSTRAP_UNAVAILABLE'); }
            }
        }
        function guard(captured: number, capturedScope: string): void {
            if (disposed || epoch !== captured || core!.createRtcSession !== wrapper || scope() !== capturedScope || root.location?.origin !== origin) fail('TURN_BOOTSTRAP_STALE');
        }
        const wrapper: PrivateTurnBootstrapCore['createRtcSession'] = async options => {
            const capturedScope = scope(), startEpoch = epoch;
            const next = await resolveAuth();
            guard(startEpoch, capturedScope);
            bind(next);
            const captured = epoch, uid = auth?.currentUser?.uid || null, bound = auth;
            const config = await provider.getConfiguration();
            guard(captured, capturedScope);
            if (auth !== bound || (auth?.currentUser?.uid || null) !== uid || (identity === 'mini' && miniAuth() !== bound)) fail('TURN_BOOTSTRAP_STALE');
            return original.call(core, config ? { ...options, ...config } : options);
        };
        const handle: PrivateTurnBootstrapHandle = { active: true, dispose: () => {
            if (disposed) return;
            disposed = true; handle.active = false; epoch++; provider.invalidate();
            try { unsubscribe(); } catch { /* Disposal must not expose SDK errors. */ }
            if (core.createRtcSession === wrapper) core.createRtcSession = original;
            if (installed?.handle === handle) installed = null;
        } };
        core.createRtcSession = wrapper;
        installed = { core, identity, wrapper, handle };
        return handle;
    }
    async function verifySelectedRelay(pc: unknown): Promise<boolean> {
        try {
            if (!pc || typeof pc !== 'object') return false;
            const connection = pc as { connectionState?: string; getStats?: () => Promise<ReadonlyMap<string, unknown>> };
            if (connection.connectionState !== 'connected' || typeof connection.getStats !== 'function') return false;
            const stats = await connection.getStats();
            if (connection.connectionState !== 'connected' || typeof stats.get !== 'function' || typeof stats.forEach !== 'function') return false;
            let relay = false;
            const row = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null;
            stats.forEach(value => {
                const transport = row(value);
                if (transport?.type !== 'transport' || transport.dtlsState !== 'connected' || typeof transport.selectedCandidatePairId !== 'string') return;
                const pair = row(stats.get(transport.selectedCandidatePairId));
                if (pair?.id !== transport.selectedCandidatePairId || pair.type !== 'candidate-pair' || pair.state !== 'succeeded' || pair.nominated !== true || typeof pair.localCandidateId !== 'string' || typeof pair.remoteCandidateId !== 'string') return;
                const local = row(stats.get(pair.localCandidateId)), remote = row(stats.get(pair.remoteCandidateId));
                if (local?.id !== pair.localCandidateId || remote?.id !== pair.remoteCandidateId || local?.type !== 'local-candidate' || remote?.type !== 'remote-candidate') return;
                if (local.candidateType === 'relay') relay = true;
            });
            return relay;
        } catch { return false; }
    }
    function sanitizeReport(value: Record<string, unknown>) {
        const count = (key: string) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 100000 ? Number(value[key]) : 0;
        const hash = typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash) ? value.payloadHash : '';
        return { apiRequestSuccess: value.apiRequestSuccess === true, selectedRelay: value.selectedRelay === true, datachannelTransfer: value.datachannelTransfer === true,
            requestCount: count('requestCount'), payloadCount: count('payloadCount'), payloadHash: hash };
    }
    return { install, verifySelectedRelay, sanitizeReport };
});
