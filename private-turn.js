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
    function parse(value, contract, now, margin, policy) {
        const body = record(value), username = text(body.username, 256), credential = text(body.credential, 1024);
        if (!Number.isSafeInteger(body.ttl) || Number(body.ttl) < 1 || Number(body.ttl) > 300)
            failure('TURN_INVALID_RESPONSE');
        let expiresAt;
        if (contract.expiresAtFormat === 'iso8601') {
            const source = text(body.expiresAt, 32);
            expiresAt = Date.parse(source);
            if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== source)
                failure('TURN_INVALID_RESPONSE');
        }
        else {
            if (!Number.isSafeInteger(body.expiresAt))
                failure('TURN_INVALID_RESPONSE');
            expiresAt = Number(body.expiresAt) * (contract.expiresAtFormat === 'unix-seconds' ? 1000 : 1);
        }
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= now + margin || expiresAt > now + Number(body.ttl) * 1000)
            failure('TURN_INVALID_RESPONSE');
        if (!Array.isArray(body.iceServers) || !body.iceServers.length || body.iceServers.length > 8)
            failure('TURN_INVALID_RESPONSE');
        let hasTurn = false;
        const iceServers = body.iceServers.map((value) => {
            const server = record(value);
            if (Object.keys(server).some(key => !['urls', 'username', 'credential', 'credentialType'].includes(key)))
                failure('TURN_INVALID_RESPONSE');
            const list = Array.isArray(server.urls) ? server.urls : [server.urls];
            if (!list.length || list.length > 8)
                failure('TURN_INVALID_RESPONSE');
            const urls = list.map(uri), isTurn = urls.some(value => value.turn);
            if (server.credentialType !== undefined && server.credentialType !== 'password')
                failure('TURN_INVALID_RESPONSE');
            if (isTurn) {
                if (server.username !== username || server.credential !== credential)
                    failure('TURN_INVALID_RESPONSE');
                hasTurn = true;
            }
            else if (server.username !== undefined || server.credential !== undefined)
                failure('TURN_INVALID_RESPONSE');
            return { urls: Array.isArray(server.urls) ? urls.map(value => value.url) : urls[0].url, ...(isTurn ? { username, credential } : {}) };
        });
        if (!hasTurn)
            failure('TURN_INVALID_RESPONSE');
        return { expiresAt, config: { iceServers, iceTransportPolicy: policy } };
    }
    function createProvider(options) {
        var _a, _b;
        const supplied = options.contract;
        if (typeof options.enabled !== 'boolean' || !supplied || supplied.ttlUnit !== 'seconds' || !['unix-seconds', 'unix-milliseconds', 'iso8601'].includes(supplied.expiresAtFormat))
            failure('TURN_CONFIGURATION_INVALID');
        const contract = { ttlUnit: 'seconds', expiresAtFormat: supplied.expiresAtFormat };
        if (options.forceRelay !== undefined && typeof options.forceRelay !== 'boolean')
            failure('TURN_CONFIGURATION_INVALID');
        const allowed = [...(options.allowedOrigins || [])], privateOrigins = ['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'];
        if (allowed.length > 2 || allowed.some(value => !privateOrigins.includes(value)))
            failure('TURN_CONFIGURATION_INVALID');
        const policy = options.forceRelay === true ? 'relay' : 'all';
        const enabled = options.enabled, getUser = options.getUser, fetcher = options.fetcher;
        if (enabled) {
            try {
                const page = new URL(options.origin);
                if (page.protocol !== 'https:' || (!['127.0.0.1', 'localhost', '[::1]'].includes(page.hostname) && !allowed.includes(page.origin)) || page.username || page.password || page.search || page.hash || page.pathname !== '/')
                    failure('TURN_CONFIGURATION_INVALID');
            }
            catch {
                failure('TURN_CONFIGURATION_INVALID');
            }
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
        async function load(user, captured, controller) {
            let timer;
            let rejectAbort = () => { };
            const aborted = new Promise((_resolve, reject) => {
                rejectAbort = () => reject(new PrivateTurnError('TURN_UNAVAILABLE'));
                controller.signal.addEventListener('abort', rejectAbort, { once: true });
                timer = setTimeout(() => controller.abort(), timeoutMs);
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
                const idToken = text(await boundary(user.getIdToken()), 16384);
                const response = await boundary(fetcher('/api/turn-creds', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
                    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal
                }));
                if (!response.ok || response.redirected)
                    failure('TURN_UNAVAILABLE');
                if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || ''))
                    failure('TURN_INVALID_RESPONSE');
                const declaredLength = response.headers.get('content-length');
                if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 32768))
                    failure('TURN_INVALID_RESPONSE');
                if (!response.body)
                    failure('TURN_INVALID_RESPONSE');
                reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8', { fatal: true });
                let bytes = 0, source = '';
                while (true) {
                    const chunk = await boundary(reader.read());
                    if (chunk.done)
                        break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 32768)
                        failure('TURN_INVALID_RESPONSE');
                    source += decoder.decode(chunk.value, { stream: true });
                }
                source += decoder.decode();
                let raw;
                try {
                    raw = JSON.parse(source);
                }
                catch {
                    failure('TURN_INVALID_RESPONSE');
                }
                const result = parse(raw, contract, time(), margin, policy);
                guard(user.uid, captured);
                cache = { uid: user.uid, generation: captured, ...result };
                return result.config;
            }
            catch (error) {
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
        async function getConfiguration() {
            if (!enabled)
                return null;
            const user = current();
            if (!user)
                return null;
            const captured = generation;
            if (cache && cache.uid === user.uid && cache.generation === captured && cache.expiresAt > time() + margin)
                return clone(cache.config);
            if (!flight || flight.uid !== user.uid || flight.generation !== captured) {
                const controller = new AbortController();
                const promise = load(user, captured, controller).finally(() => { if ((flight === null || flight === void 0 ? void 0 : flight.controller) === controller)
                    flight = null; });
                flight = { uid: user.uid, generation: captured, controller, promise };
            }
            const config = await flight.promise;
            guard(user.uid, captured);
            return clone(config);
        }
        return { getConfiguration, invalidate };
    }
    return { createProvider };
});
