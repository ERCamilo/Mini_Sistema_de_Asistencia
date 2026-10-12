interface PrivateTurnUser {
    uid: string;
    getIdToken(forceRefresh?: boolean): Promise<string>;
}
interface PrivateTurnContract {
    ttlUnit: 'seconds';
    expiresAtFormat: 'unix-seconds' | 'unix-milliseconds' | 'iso8601';
}
interface PrivateTurnIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}
interface PrivateTurnConfiguration {
    iceServers: PrivateTurnIceServer[];
    iceTransportPolicy: 'all' | 'relay';
}
interface PrivateTurnOptions {
    enabled: boolean;
    forceRelay?: boolean;
    allowedOrigins?: readonly string[];
    origin: string;
    contract: PrivateTurnContract;
    getUser(): PrivateTurnUser | null;
    fetcher: typeof fetch;
    now?: () => number;
    refreshMarginMs?: number;
    timeoutMs?: number;
}
interface PrivateTurnDiagnostic {
    stage: 'token' | 'request' | 'response' | 'body' | 'validation' | 'cache' | 'shared' | 'guest';
    code: 'START' | 'READY' | 'TOKEN_FAILED' | 'NETWORK_FAILED' | 'HTTP_ERROR' | 'RESPONSE_INVALID' | 'DEADLINE_REACHED' | 'ACCOUNT_CHANGED' | 'CANCELLED';
    elapsedMs: number;
    httpStatus?: number;
    sdkCode?: 'auth/network-request-failed' | 'auth/user-token-expired' | 'auth/invalid-user-token' | 'auth/user-disabled' | 'auth/too-many-requests' | 'auth/internal-error';
    detail?: 'CONTENT_TYPE_INVALID' | 'BODY_TOO_LARGE' | 'BODY_UNAVAILABLE' | 'JSON_INVALID' | 'CONTRACT_INVALID' | 'ROOT_INVALID' | 'USERNAME_INVALID' | 'CREDENTIAL_INVALID' | 'TTL_INVALID' | 'EXPIRY_FORMAT_INVALID' | 'EXPIRY_UNSAFE' | 'EXPIRY_TOO_EARLY' | 'EXPIRY_BEYOND_TTL' | 'ICE_SERVERS_INVALID' | 'ICE_SERVER_INVALID' | 'ICE_FIELDS_INVALID' | 'ICE_URLS_INVALID' | 'ICE_URI_INVALID' | 'ICE_CREDENTIAL_TYPE_INVALID' | 'ICE_CREDENTIAL_MISMATCH' | 'ICE_STUN_CREDENTIALS_INVALID' | 'TURN_SERVER_MISSING';
}
type PrivateTurnObserver = (event: PrivateTurnDiagnostic) => void;
interface PrivateTurnFlight {
    uid: string;
    generation: number;
    controller: AbortController;
    promise: Promise<PrivateTurnConfiguration>;
    observers: Set<PrivateTurnObserver>;
}
(function exposePrivateTurn(root: any, factory: () => unknown) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    if (root) root.PrivateTurn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class PrivateTurnError extends Error {
        constructor(code: string) { super(code); this.name = 'PrivateTurnError'; }
    }
    function failure(code: string): never { throw new PrivateTurnError(code); }
    function record(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) failure('TURN_INVALID_RESPONSE');
        return value as Record<string, unknown>;
    }
    function text(value: unknown, limit: number): string {
        if (typeof value !== 'string' || !value || value.length > limit || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) failure('TURN_INVALID_RESPONSE');
        return value;
    }
    function uri(value: unknown): { url: string; turn: boolean } {
        const url = text(value, 512);
        const match = /^(stun|stuns|turn|turns):([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(url);
        if (!match || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))) failure('TURN_INVALID_RESPONSE');
        try { const host = new URL('http://' + match[2]); if (!host.hostname || host.username || host.password) failure('TURN_INVALID_RESPONSE'); }
        catch { failure('TURN_INVALID_RESPONSE'); }
        return { url, turn: match[1] === 'turn' || match[1] === 'turns' };
    }
    function clone(config: PrivateTurnConfiguration): PrivateTurnConfiguration {
        return { iceTransportPolicy: config.iceTransportPolicy, iceServers: config.iceServers.map(server => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls })) };
    }
    function parse(value: unknown, contract: PrivateTurnContract, now: number, margin: number, policy: 'all' | 'relay', rejected: (detail: PrivateTurnDiagnostic['detail']) => void): { expiresAt: number; config: PrivateTurnConfiguration } {
        function invalid(detail: PrivateTurnDiagnostic['detail']): never {
            rejected(detail);
            return failure('TURN_INVALID_RESPONSE');
        }
        // Reuse the same strict primitives; only label their existing failure branches.
        function checked<T>(detail: PrivateTurnDiagnostic['detail'], read: () => T): T {
            try { return read(); }
            catch (error) {
                if (error instanceof PrivateTurnError) return invalid(detail);
                throw error;
            }
        }
        const body = checked('ROOT_INVALID', () => record(value));
        const username = checked('USERNAME_INVALID', () => text(body.username, 256));
        const credential = checked('CREDENTIAL_INVALID', () => text(body.credential, 1024));
        if (!Number.isSafeInteger(body.ttl) || Number(body.ttl) < 1 || Number(body.ttl) > 300) invalid('TTL_INVALID');
        let expiresAt: number;
        if (contract.expiresAtFormat === 'iso8601') {
            const source = checked('EXPIRY_FORMAT_INVALID', () => text(body.expiresAt, 32));
            expiresAt = Date.parse(source);
            if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== source) invalid('EXPIRY_FORMAT_INVALID');
        } else {
            if (!Number.isSafeInteger(body.expiresAt)) invalid('EXPIRY_FORMAT_INVALID');
            expiresAt = Number(body.expiresAt) * (contract.expiresAtFormat === 'unix-seconds' ? 1000 : 1);
        }
        if (!Number.isSafeInteger(expiresAt)) invalid('EXPIRY_UNSAFE');
        if (expiresAt <= now + margin) invalid('EXPIRY_TOO_EARLY');
        if (expiresAt > now + Number(body.ttl) * 1000 + 5000) invalid('EXPIRY_BEYOND_TTL');
        if (!Array.isArray(body.iceServers) || !body.iceServers.length || body.iceServers.length > 8) invalid('ICE_SERVERS_INVALID');
        let hasTurn = false;
        const iceServers = body.iceServers.map((value: unknown): PrivateTurnIceServer => {
            const server = checked('ICE_SERVER_INVALID', () => record(value));
            if (Object.keys(server).some(key => !['urls', 'username', 'credential', 'credentialType'].includes(key))) invalid('ICE_FIELDS_INVALID');
            const list = Array.isArray(server.urls) ? server.urls : [server.urls];
            if (!list.length || list.length > 8) invalid('ICE_URLS_INVALID');
            const urls = list.map(value => checked('ICE_URI_INVALID', () => uri(value))), isTurn = urls.some(value => value.turn);
            if (server.credentialType !== undefined && server.credentialType !== 'password') invalid('ICE_CREDENTIAL_TYPE_INVALID');
            if (isTurn) {
                if (server.username !== username || server.credential !== credential) invalid('ICE_CREDENTIAL_MISMATCH');
                hasTurn = true;
            } else if (server.username !== undefined || server.credential !== undefined) invalid('ICE_STUN_CREDENTIALS_INVALID');
            return { urls: Array.isArray(server.urls) ? urls.map(value => value.url) : urls[0].url, ...(isTurn ? { username, credential } : {}) };
        });
        if (!hasTurn) invalid('TURN_SERVER_MISSING');
        // Tolerate bounded issuer clock skew without extending local credential reuse.
        return { expiresAt: Math.min(expiresAt, now + Number(body.ttl) * 1000), config: { iceServers, iceTransportPolicy: policy } };
    }
    function createProvider(options: PrivateTurnOptions) {
        const supplied = options.contract;
        if (typeof options.enabled !== 'boolean' || !supplied || supplied.ttlUnit !== 'seconds' || !['unix-seconds', 'unix-milliseconds', 'iso8601'].includes(supplied.expiresAtFormat)) failure('TURN_CONFIGURATION_INVALID');
        const contract: PrivateTurnContract = { ttlUnit: 'seconds', expiresAtFormat: supplied.expiresAtFormat };
        if (options.forceRelay !== undefined && typeof options.forceRelay !== 'boolean') failure('TURN_CONFIGURATION_INVALID');
        const allowed = [...(options.allowedOrigins || [])], privateOrigins = ['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'];
        if (allowed.length > 2 || allowed.some(value => !privateOrigins.includes(value))) failure('TURN_CONFIGURATION_INVALID');
        const policy = options.forceRelay === true ? 'relay' : 'all';
        const enabled = options.enabled, getUser = options.getUser, fetcher = options.fetcher;
        if (enabled) {
            try {
                const page = new URL(options.origin);
                if (page.protocol !== 'https:' || (!['127.0.0.1', 'localhost', '[::1]'].includes(page.hostname) && !allowed.includes(page.origin)) || page.username || page.password || page.search || page.hash || page.pathname !== '/') failure('TURN_CONFIGURATION_INVALID');
            } catch { failure('TURN_CONFIGURATION_INVALID'); }
        }
        const margin = options.refreshMarginMs ?? 15000, timeoutMs = options.timeoutMs ?? 10000, now = options.now || Date.now;
        if (!Number.isSafeInteger(margin) || margin < 0 || margin > 300000 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) failure('TURN_CONFIGURATION_INVALID');
        let generation = 0, observedUid: string | null = null, flight: PrivateTurnFlight | null = null;
        let cache: { uid: string; generation: number; expiresAt: number; config: PrivateTurnConfiguration } | null = null;
        function invalidate(): void {
            generation++;
            cache = null;
            const previous = flight;
            flight = null;
            previous?.controller.abort();
        }
        function current(): PrivateTurnUser | null {
            let user: PrivateTurnUser | null;
            try { user = getUser(); } catch { failure('TURN_UNAVAILABLE'); }
            const uid = user ? text(user.uid, 128) : null;
            if (uid !== observedUid) { invalidate(); observedUid = uid; }
            return user;
        }
        function guard(uid: string, captured: number): void {
            if (current()?.uid !== uid || generation !== captured) failure('TURN_ACCOUNT_CHANGED');
        }
        function time(): number {
            const value = now();
            if (!Number.isSafeInteger(value) || value < 0) failure('TURN_CONFIGURATION_INVALID');
            return value;
        }
        async function load(user: PrivateTurnUser, captured: number, controller: AbortController, notify: PrivateTurnObserver): Promise<PrivateTurnConfiguration> {
            let stage: PrivateTurnDiagnostic['stage'] = 'token', timedOut = false, httpStatus: number | undefined;
            let detail: PrivateTurnDiagnostic['detail'], sdkCode: PrivateTurnDiagnostic['sdkCode'];
            const started = Date.now();
            function emit(code: PrivateTurnDiagnostic['code'] = 'START'): void {
                notify({ stage, code, elapsedMs: Math.max(0, Math.min(30000, Math.floor(Date.now() - started))), ...(httpStatus === undefined ? {} : { httpStatus }), ...(detail ? { detail } : {}), ...(sdkCode ? { sdkCode } : {}) });
            }
            let timer: ReturnType<typeof setTimeout> | undefined;
            let rejectAbort: () => void = () => {};
            const aborted = new Promise<never>((_resolve, reject) => {
                rejectAbort = () => reject(new PrivateTurnError('TURN_UNAVAILABLE'));
                controller.signal.addEventListener('abort', rejectAbort, { once: true });
                timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            });
            async function boundary<T>(promise: Promise<T>): Promise<T> {
                try { const result = await Promise.race([promise, aborted]); guard(user.uid, captured); return result; }
                catch (error) { guard(user.uid, captured); throw error; }
            }
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            try {
                emit();
                const idToken = text(await boundary(user.getIdToken()), 16384);
                stage = 'request'; emit();
                const response = await boundary(fetcher('/api/turn-creds', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
                    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal
                }));
                stage = 'response';
                httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : undefined;
                emit();
                if (!response.ok || response.redirected) failure('TURN_UNAVAILABLE');
                if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) { detail = 'CONTENT_TYPE_INVALID'; failure('TURN_INVALID_RESPONSE'); }
                const declaredLength = response.headers.get('content-length');
                if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 32768)) { detail = 'BODY_TOO_LARGE'; failure('TURN_INVALID_RESPONSE'); }
                if (!response.body) { detail = 'BODY_UNAVAILABLE'; failure('TURN_INVALID_RESPONSE'); }
                stage = 'body'; emit();
                reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8', { fatal: true });
                let bytes = 0, source = '';
                while (true) {
                    const chunk = await boundary(reader.read());
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 32768) { detail = 'BODY_TOO_LARGE'; failure('TURN_INVALID_RESPONSE'); }
                    source += decoder.decode(chunk.value, { stream: true });
                }
                source += decoder.decode();
                stage = 'validation'; emit();
                let raw: unknown;
                try { raw = JSON.parse(source); } catch { detail = 'JSON_INVALID'; failure('TURN_INVALID_RESPONSE'); }
                detail = 'CONTRACT_INVALID';
                const result = parse(raw, contract, time(), margin, policy, reason => { detail = reason; });
                detail = undefined;
                guard(user.uid, captured);
                cache = { uid: user.uid, generation: captured, ...result };
                emit('READY');
                return result.config;
            } catch (error) {
                if (stage === 'token') {
                    try {
                        const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
                        if (typeof code === 'string' && ['auth/network-request-failed', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled', 'auth/too-many-requests', 'auth/internal-error'].includes(code)) sdkCode = code as PrivateTurnDiagnostic['sdkCode'];
                    } catch { /* Never inspect SDK messages or arbitrary objects further. */ }
                }
                let stale = false;
                try { guard(user.uid, captured); } catch { stale = true; }
                emit(stale ? 'ACCOUNT_CHANGED' : timedOut ? 'DEADLINE_REACHED' : controller.signal.aborted ? 'CANCELLED' : stage === 'token' ? 'TOKEN_FAILED' : stage === 'request' ? 'NETWORK_FAILED' : stage === 'response' && httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 300) ? 'HTTP_ERROR' : 'RESPONSE_INVALID');
                guard(user.uid, captured);
                if (error instanceof PrivateTurnError) throw error;
                return failure('TURN_UNAVAILABLE');
            } finally {
                if (timer !== undefined) clearTimeout(timer);
                controller.signal.removeEventListener('abort', rejectAbort);
                controller.abort();
                // Cancellation is best-effort; stale or malformed responses are never cached.
                if (reader) void reader.cancel().catch(() => {});
            }
        }
        async function getConfiguration(observer?: PrivateTurnObserver): Promise<PrivateTurnConfiguration | null> {
            const notify: PrivateTurnObserver = event => { try { observer?.({ ...event }); } catch { /* Diagnostic callbacks cannot change acquisition. */ } };
            if (!enabled) return null;
            const user = current();
            if (!user) { notify({ stage: 'guest', code: 'READY', elapsedMs: 0 }); return null; }
            const captured = generation;
            if (cache && cache.uid === user.uid && cache.generation === captured && cache.expiresAt > time() + margin) { notify({ stage: 'cache', code: 'READY', elapsedMs: 0 }); return clone(cache.config); }
            if (!flight || flight.uid !== user.uid || flight.generation !== captured) {
                const controller = new AbortController();
                const observers = new Set<PrivateTurnObserver>([notify]);
                const broadcast: PrivateTurnObserver = event => { for (const listener of [...observers]) listener(event); };
                const promise = load(user, captured, controller, broadcast).finally(() => { if (flight?.controller === controller) flight = null; });
                flight = { uid: user.uid, generation: captured, controller, promise, observers };
            }
            else {
                notify({ stage: 'shared', code: 'START', elapsedMs: 0 });
                if (flight.observers.size < 8) flight.observers.add(notify);
            }
            const active = flight;
            try {
                const config = await active.promise;
                guard(user.uid, captured);
                return clone(config);
            } finally { active.observers.delete(notify); }
        }
        return { getConfiguration, invalidate };
    }
    return { createProvider };
});
