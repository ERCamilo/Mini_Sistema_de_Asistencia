"use strict";
(function exposePrivateTurn(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.PrivateTurn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class PrivateTurnError extends Error {
        constructor(code) { super(code); this.name = 'PrivateTurnError'; }
    }
    function failure(code) { throw new PrivateTurnError(code); }
    function record(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            failure('TURN_INVALID_RESPONSE');
        return value;
    }
    function text(value, limit) {
        if (typeof value !== 'string' || !value || value.length > limit || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value))
            failure('TURN_INVALID_RESPONSE');
        return value;
    }
    function uri(value) {
        const url = text(value, 512);
        const match = /^(stun|stuns|turn|turns):([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(url);
        if (!match || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535)))
            failure('TURN_INVALID_RESPONSE');
        try {
            const host = new URL('http://' + match[2]);
            if (!host.hostname || host.username || host.password)
                failure('TURN_INVALID_RESPONSE');
        }
        catch {
            failure('TURN_INVALID_RESPONSE');
        }
        return { url, turn: match[1] === 'turn' || match[1] === 'turns' };
    }
    function clone(config) {
        return { iceTransportPolicy: config.iceTransportPolicy, iceServers: config.iceServers.map(server => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls })) };
    }
    function parse(value, contract, now, margin, policy, rejected) {
        function invalid(detail) {
            rejected(detail);
            return failure('TURN_INVALID_RESPONSE');
        }
        // Reuse the same strict primitives; only label their existing failure branches.
        function checked(detail, read) {
            try {
                return read();
            }
            catch (error) {
                if (error instanceof PrivateTurnError)
                    return invalid(detail);
                throw error;
            }
        }
        const body = checked('ROOT_INVALID', () => record(value));
        const username = checked('USERNAME_INVALID', () => text(body.username, 256));
        const credential = checked('CREDENTIAL_INVALID', () => text(body.credential, 1024));
        if (!Number.isSafeInteger(body.ttl) || Number(body.ttl) < 1 || Number(body.ttl) > 300)
            invalid('TTL_INVALID');
        let expiresAt;
        if (contract.expiresAtFormat === 'iso8601') {
            const source = checked('EXPIRY_FORMAT_INVALID', () => text(body.expiresAt, 32));
            expiresAt = Date.parse(source);
            if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== source)
                invalid('EXPIRY_FORMAT_INVALID');
        }
        else {
            if (!Number.isSafeInteger(body.expiresAt))
                invalid('EXPIRY_FORMAT_INVALID');
            expiresAt = Number(body.expiresAt) * (contract.expiresAtFormat === 'unix-seconds' ? 1000 : 1);
        }
        if (!Number.isSafeInteger(expiresAt))
            invalid('EXPIRY_UNSAFE');
        if (expiresAt <= now + margin)
            invalid('EXPIRY_TOO_EARLY');
        if (expiresAt > now + Number(body.ttl) * 1000 + (contract.clockSource === 'issuer' ? 1000 : 5000))
            invalid('EXPIRY_BEYOND_TTL');
        if (!Array.isArray(body.iceServers) || !body.iceServers.length || body.iceServers.length > 8)
            invalid('ICE_SERVERS_INVALID');
        let hasTurn = false;
        const iceServers = body.iceServers.map((value) => {
            const server = checked('ICE_SERVER_INVALID', () => record(value));
            if (Object.keys(server).some(key => !['urls', 'username', 'credential', 'credentialType', 'expiresAt'].includes(key)))
                invalid('ICE_FIELDS_INVALID');
            const list = Array.isArray(server.urls) ? server.urls : [server.urls];
            if (!list.length || list.length > 8)
                invalid('ICE_URLS_INVALID');
            const urls = list.map(value => checked('ICE_URI_INVALID', () => uri(value))), isTurn = urls.some(value => value.turn);
            // Issuer metadata must match the already validated root value, without guessing units.
            if ('expiresAt' in server && (!isTurn || server.expiresAt !== body.expiresAt))
                invalid('ICE_FIELDS_INVALID');
            if (server.credentialType !== undefined && server.credentialType !== 'password')
                invalid('ICE_CREDENTIAL_TYPE_INVALID');
            if (isTurn) {
                if (server.username !== username || server.credential !== credential)
                    invalid('ICE_CREDENTIAL_MISMATCH');
                hasTurn = true;
            }
            else if (server.username !== undefined || server.credential !== undefined)
                invalid('ICE_STUN_CREDENTIALS_INVALID');
            return { urls: Array.isArray(server.urls) ? urls.map(value => value.url) : urls[0].url, ...(isTurn ? { username, credential } : {}) };
        });
        if (!hasTurn)
            invalid('TURN_SERVER_MISSING');
        // Tolerate bounded issuer clock skew without extending local credential reuse.
        return { expiresAt: Math.min(expiresAt, now + Number(body.ttl) * 1000), config: { iceServers, iceTransportPolicy: policy } };
    }
    function createProvider(options) {
        var _a, _b;
        const supplied = options.contract;
        if (typeof options.enabled !== 'boolean' || !supplied || supplied.ttlUnit !== 'seconds' || !['unix-seconds', 'unix-milliseconds', 'iso8601'].includes(supplied.expiresAtFormat))
            failure('TURN_CONFIGURATION_INVALID');
        if (supplied.clockSource !== undefined && !['client', 'issuer'].includes(supplied.clockSource))
            failure('TURN_CONFIGURATION_INVALID');
        const contract = { ttlUnit: 'seconds', expiresAtFormat: supplied.expiresAtFormat, clockSource: supplied.clockSource || 'client' };
        if (options.forceRelay !== undefined && typeof options.forceRelay !== 'boolean')
            failure('TURN_CONFIGURATION_INVALID');
        if (options.profile !== undefined && options.profile !== 'mini-pages-turn-test')
            failure('TURN_CONFIGURATION_INVALID');
        const publicPreview = options.profile === 'mini-pages-turn-test';
        if (publicPreview && (options.origin !== 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev' || options.forceRelay !== true || contract.clockSource !== 'issuer' || contract.expiresAtFormat !== 'unix-seconds' || (options.allowedOrigins || []).length))
            failure('TURN_CONFIGURATION_INVALID');
        const allowed = [...(options.allowedOrigins || [])], privateOrigins = ['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'];
        if (allowed.length > 2 || allowed.some(value => !privateOrigins.includes(value)))
            failure('TURN_CONFIGURATION_INVALID');
        const policy = options.forceRelay === true ? 'relay' : 'all';
        const enabled = options.enabled, getUser = options.getUser, fetcher = options.fetcher;
        if (enabled && !publicPreview) {
            try {
                const page = new URL(options.origin);
                if (page.protocol !== 'https:' || (!['127.0.0.1', 'localhost', '[::1]'].includes(page.hostname) && !allowed.includes(page.origin)) || page.username || page.password || page.search || page.hash || page.pathname !== '/')
                    failure('TURN_CONFIGURATION_INVALID');
            }
            catch {
                failure('TURN_CONFIGURATION_INVALID');
            }
        }
        const monotonicNow = options.monotonicNow || (() => performance.now());
        function monotonic() {
            const value = monotonicNow();
            if (!Number.isFinite(value) || value < 0)
                failure('TURN_CONFIGURATION_INVALID');
            return value;
        }
        const margin = (_a = options.refreshMarginMs) !== null && _a !== void 0 ? _a : 15000, timeoutMs = (_b = options.timeoutMs) !== null && _b !== void 0 ? _b : 10000, now = options.now || Date.now;
        if (!Number.isSafeInteger(margin) || margin < 0 || margin > 300000 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
            failure('TURN_CONFIGURATION_INVALID');
        let generation = 0, observedUid = null, flight = null;
        let cache = null;
        function invalidate() {
            generation++;
            cache = null;
            const previous = flight;
            flight = null;
            previous === null || previous === void 0 ? void 0 : previous.controller.abort();
        }
        function current() {
            let user;
            try {
                user = getUser();
            }
            catch {
                failure('TURN_UNAVAILABLE');
            }
            const uid = user ? text(user.uid, 128) : null;
            if (uid !== observedUid) {
                invalidate();
                observedUid = uid;
            }
            return user;
        }
        function guard(uid, captured) {
            var _a;
            if (((_a = current()) === null || _a === void 0 ? void 0 : _a.uid) !== uid || generation !== captured)
                failure('TURN_ACCOUNT_CHANGED');
        }
        function time() {
            const value = now();
            if (!Number.isSafeInteger(value) || value < 0)
                failure('TURN_CONFIGURATION_INVALID');
            return value;
        }
        async function load(user, captured, controller, notify) {
            let stage = 'token', timedOut = false, httpStatus;
            let detail, sdkCode;
            const started = Date.now(), requestStarted = contract.clockSource === 'issuer' ? monotonic() : 0;
            function emit(code = 'START') {
                notify({ stage, code, elapsedMs: Math.max(0, Math.min(30000, Math.floor(Date.now() - started))), ...(httpStatus === undefined ? {} : { httpStatus }), ...(detail ? { detail } : {}), ...(sdkCode ? { sdkCode } : {}) });
            }
            let timer;
            let rejectAbort = () => { };
            const aborted = new Promise((_resolve, reject) => {
                rejectAbort = () => reject(new PrivateTurnError('TURN_UNAVAILABLE'));
                controller.signal.addEventListener('abort', rejectAbort, { once: true });
                timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            });
            async function boundary(promise) {
                try {
                    const result = await Promise.race([promise, aborted]);
                    guard(user.uid, captured);
                    return result;
                }
                catch (error) {
                    guard(user.uid, captured);
                    throw error;
                }
            }
            let reader;
            try {
                emit();
                const idToken = text(await boundary(user.getIdToken()), 16384);
                stage = 'request';
                emit();
                const response = await boundary(fetcher(publicPreview ? 'https://turn-api.erlin.do/turn-creds' : '/api/turn-creds', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
                    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal
                }));
                stage = 'response';
                httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : undefined;
                emit();
                if (!response.ok || response.redirected)
                    failure('TURN_UNAVAILABLE');
                if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
                    detail = 'CONTENT_TYPE_INVALID';
                    failure('TURN_INVALID_RESPONSE');
                }
                const declaredLength = response.headers.get('content-length');
                if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 32768)) {
                    detail = 'BODY_TOO_LARGE';
                    failure('TURN_INVALID_RESPONSE');
                }
                if (!response.body) {
                    detail = 'BODY_UNAVAILABLE';
                    failure('TURN_INVALID_RESPONSE');
                }
                stage = 'body';
                emit();
                reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8', { fatal: true });
                let bytes = 0, source = '';
                while (true) {
                    const chunk = await boundary(reader.read());
                    if (chunk.done)
                        break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 32768) {
                        detail = 'BODY_TOO_LARGE';
                        failure('TURN_INVALID_RESPONSE');
                    }
                    source += decoder.decode(chunk.value, { stream: true });
                }
                source += decoder.decode();
                stage = 'validation';
                emit();
                let raw;
                try {
                    raw = JSON.parse(source);
                }
                catch {
                    detail = 'JSON_INVALID';
                    failure('TURN_INVALID_RESPONSE');
                }
                detail = 'CONTRACT_INVALID';
                let reference = time(), reserve = 0;
                if (contract.clockSource === 'issuer') {
                    const issuedDate = response.headers.get(publicPreview ? 'Date' : 'X-Turn-Issued-Date');
                    if (!issuedDate) {
                        detail = 'CLOCK_MISSING';
                        failure('TURN_INVALID_RESPONSE');
                    }
                    const issued = Date.parse(issuedDate);
                    if (!Number.isSafeInteger(issued) || issued < 0 || new Date(issued).toUTCString() !== issuedDate) {
                        detail = 'CLOCK_INVALID';
                        failure('TURN_INVALID_RESPONSE');
                    }
                    // Offset allowance is not a credential lifetime allowance.
                    if (Math.abs(reference - issued) > 1800000) {
                        detail = 'CLOCK_SKEW_EXCEEDED';
                        failure('TURN_INVALID_RESPONSE');
                    }
                    reserve = Math.max(0, monotonic() - requestStarted) + 1000;
                    reference = issued;
                }
                const result = parse(raw, contract, reference, margin + reserve, policy, reason => { detail = reason; });
                detail = undefined;
                guard(user.uid, captured);
                cache = { uid: user.uid, generation: captured, ...result, ...(contract.clockSource === 'issuer' ? { deadline: requestStarted + (result.expiresAt - reference) - 1000 } : {}) };
                emit('READY');
                return result.config;
            }
            catch (error) {
                if (stage === 'token') {
                    try {
                        const code = error && typeof error === 'object' ? error.code : null;
                        if (typeof code === 'string' && ['auth/network-request-failed', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled', 'auth/too-many-requests', 'auth/internal-error'].includes(code))
                            sdkCode = code;
                    }
                    catch { /* Never inspect SDK messages or arbitrary objects further. */ }
                }
                let stale = false;
                try {
                    guard(user.uid, captured);
                }
                catch {
                    stale = true;
                }
                emit(stale ? 'ACCOUNT_CHANGED' : timedOut ? 'DEADLINE_REACHED' : controller.signal.aborted ? 'CANCELLED' : stage === 'token' ? 'TOKEN_FAILED' : stage === 'request' ? 'NETWORK_FAILED' : stage === 'response' && httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 300) ? 'HTTP_ERROR' : 'RESPONSE_INVALID');
                guard(user.uid, captured);
                if (error instanceof PrivateTurnError)
                    throw error;
                return failure('TURN_UNAVAILABLE');
            }
            finally {
                if (timer !== undefined)
                    clearTimeout(timer);
                controller.signal.removeEventListener('abort', rejectAbort);
                controller.abort();
                // Cancellation is best-effort; stale or malformed responses are never cached.
                if (reader)
                    void reader.cancel().catch(() => { });
            }
        }
        async function getConfiguration(observer) {
            const notify = event => { try {
                observer === null || observer === void 0 ? void 0 : observer({ ...event });
            }
            catch { /* Diagnostic callbacks cannot change acquisition. */ } };
            if (!enabled)
                return null;
            const user = current();
            if (!user) {
                notify({ stage: 'guest', code: 'READY', elapsedMs: 0 });
                return null;
            }
            const captured = generation;
            if (cache && cache.uid === user.uid && cache.generation === captured && (cache.deadline === undefined ? cache.expiresAt > time() + margin : cache.deadline > monotonic() + margin)) {
                notify({ stage: 'cache', code: 'READY', elapsedMs: 0 });
                return clone(cache.config);
            }
            if (!flight || flight.uid !== user.uid || flight.generation !== captured) {
                const controller = new AbortController();
                const observers = new Set([notify]);
                const broadcast = event => { for (const listener of [...observers])
                    listener(event); };
                const promise = load(user, captured, controller, broadcast).finally(() => { if ((flight === null || flight === void 0 ? void 0 : flight.controller) === controller)
                    flight = null; });
                flight = { uid: user.uid, generation: captured, controller, promise, observers };
            }
            else {
                notify({ stage: 'shared', code: 'START', elapsedMs: 0 });
                if (flight.observers.size < 8)
                    flight.observers.add(notify);
            }
            const active = flight;
            try {
                const config = await active.promise;
                guard(user.uid, captured);
                return clone(config);
            }
            finally {
                active.observers.delete(notify);
            }
        }
        function getLeaseRemainingMs() {
            const user = current();
            if (!enabled || !user || !cache || cache.uid !== user.uid || cache.generation !== generation)
                return 0;
            return Math.max(0, Math.min(300000, Math.floor((cache.deadline === undefined ? cache.expiresAt - time() : cache.deadline - monotonic()))));
        }
        return { getConfiguration, getLeaseRemainingMs, invalidate };
    }
    return { createProvider };
});
