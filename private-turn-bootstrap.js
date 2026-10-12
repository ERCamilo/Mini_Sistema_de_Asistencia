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
        // Private observations are bounded and never become connection authority.
        const observations = new Map();
        const history = new Map();
        let ordinal = 0, panel = null, output = null;
        const state = (value) => ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(value || '')
            ? value : 'unmeasured';
        function publish(value) {
            var _a, _b, _c;
            if (options.diagnostics !== true || disposed)
                return;
            // No input from errors, stats, session options, or identities reaches this record.
            const record = { session: value.session, credentials: value.credentials, connection: value.connection, relay: value.relay,
                events: (_a = value.events) === null || _a === void 0 ? void 0 : _a.map(event => ({ ...event })), ice: value.ice, gathering: value.gathering, signaling: value.signaling,
                localDescription: value.localDescription, remoteDescription: value.remoteDescription };
            history.set(record.session, record);
            if (history.size > 8)
                history.delete(history.keys().next().value);
            const publishedEpoch = epoch;
            try {
                (_b = options.onDiagnostic) === null || _b === void 0 ? void 0 : _b.call(options, { ...record, events: (_c = record.events) === null || _c === void 0 ? void 0 : _c.map(event => ({ ...event })) });
            }
            catch { /* Observers cannot break RTC. */ }
            if (disposed || epoch !== publishedEpoch)
                return;
            try {
                const doc = root.document;
                if (!(doc === null || doc === void 0 ? void 0 : doc.body))
                    return;
                if (!panel) {
                    panel = doc.createElement('details');
                    panel.setAttribute('data-private-turn-diagnostics', '');
                    panel.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:calc(env(safe-area-inset-left,0px) + 12px);z-index:2147483647;max-width:calc(100vw - 24px);max-height:65vh;overflow:auto;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:12px;padding:0 8px;font:14px sans-serif';
                    const summary = doc.createElement('summary');
                    summary.textContent = 'TURN';
                    summary.setAttribute('aria-label', 'Abrir o cerrar diagnóstico TURN de prueba');
                    summary.style.cssText = 'min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;outline:2px solid var(--accent-color);outline-offset:2px;font-weight:700;list-style:none;position:sticky;top:0;background:var(--card-bg)';
                    output = doc.createElement('div');
                    panel.appendChild(summary);
                    panel.appendChild(output);
                    doc.body.appendChild(panel);
                }
                if (panel === null || panel === void 0 ? void 0 : panel.firstChild)
                    panel.firstChild.setAttribute('title', 'TURN · prueba privada · ' + (record.credentials === 'requesting' ? 'solicitando credenciales' : record.credentials === 'failed' ? 'solicitud fallida' : record.relay === 'verified' ? 'relay verificado' : 'relay sin verificar'));
                if (output)
                    output.textContent = [...history.values()].map(item => diagnosticText(item)).join('\n');
                if (output) {
                    output.style.cssText = 'white-space:pre-wrap;font:12px ui-monospace,monospace;line-height:1.5;overflow-wrap:anywhere;max-width:80vw';
                    output.setAttribute('aria-label', 'Consola TURN sanitizada de prueba');
                }
            }
            catch { /* A missing or unavailable DOM is not a connection failure. */ }
        }
        function append(record, event) {
            if (options.diagnostics !== true || disposed)
                return;
            const events = record.events || (record.events = []);
            events.push({ ...event });
            if (events.length > 32)
                events.shift();
            publish(record);
        }
        const rtcEvents = ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange', 'signalingstatechange'];
        function enumState(value, allowed) { return allowed.includes(value || '') ? value : 'unmeasured'; }
        function clearObservations() {
            for (const stop of [...observations.values()])
                stop();
            observations.clear();
            history.clear();
            try {
                panel === null || panel === void 0 ? void 0 : panel.remove();
            }
            catch { /* Best-effort DOM cleanup. */ }
            panel = null;
            output = null;
        }
        function observe(session, record, captured, capturedScope, elapsed) {
            var _a, _b;
            if (options.diagnostics !== true || disposed || epoch !== captured)
                return;
            const pc = session.pc;
            if (!pc || typeof pc !== 'object')
                return;
            let stopped = false, running = false, retry = 0, timer;
            const originalClose = session.close;
            const valid = () => {
                try {
                    guard(captured, capturedScope);
                    return !stopped;
                }
                catch {
                    return false;
                }
            };
            function stop() {
                var _a, _b;
                if (stopped)
                    return;
                stopped = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                for (const name of rtcEvents) {
                    try {
                        (_a = pc === null || pc === void 0 ? void 0 : pc.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(pc, name, update);
                    }
                    catch { /* Isolated observer. */ }
                }
                try {
                    (_b = pc === null || pc === void 0 ? void 0 : pc.removeEventListener) === null || _b === void 0 ? void 0 : _b.call(pc, 'icecandidateerror', iceError);
                }
                catch { /* Isolated observer. */ }
                if (session.close === close)
                    session.close = originalClose;
                observations.delete(record.session);
            }
            function close() {
                if (valid()) {
                    record.connection = 'closed';
                    publish(record);
                }
                stop();
                originalClose.call(session);
            }
            async function measure() {
                if (running || !valid() || (pc === null || pc === void 0 ? void 0 : pc.connectionState) !== 'connected')
                    return;
                running = true;
                try {
                    const relay = await verifySelectedRelay(pc);
                    if (!valid()) {
                        stop();
                        return;
                    }
                    if ((pc === null || pc === void 0 ? void 0 : pc.connectionState) !== 'connected')
                        return;
                    if (relay) {
                        record.relay = 'verified';
                        append(record, { stage: 'relay', code: 'RELAY_VERIFIED', elapsedMs: elapsed() });
                    }
                    else {
                        append(record, { stage: 'relay', code: 'RELAY_UNMEASURED', elapsedMs: elapsed() });
                        if (retry++ < 3 && timer === undefined)
                            timer = setTimeout(() => { timer = undefined; void measure(); }, 1000);
                    }
                }
                catch { /* Stats cannot change the original session outcome. */ }
                finally {
                    running = false;
                }
            }
            function update() {
                if (!valid()) {
                    stop();
                    return;
                }
                record.connection = state(pc === null || pc === void 0 ? void 0 : pc.connectionState);
                record.ice = enumState(pc === null || pc === void 0 ? void 0 : pc.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']);
                record.gathering = enumState(pc === null || pc === void 0 ? void 0 : pc.iceGatheringState, ['new', 'gathering', 'complete']);
                record.signaling = enumState(pc === null || pc === void 0 ? void 0 : pc.signalingState, ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer', 'closed']);
                record.localDescription = Boolean(pc === null || pc === void 0 ? void 0 : pc.localDescription);
                record.remoteDescription = Boolean(pc === null || pc === void 0 ? void 0 : pc.remoteDescription);
                append(record, { stage: 'rtc', code: 'RTC_STATE', elapsedMs: elapsed(), rtcState: 'connection=' + record.connection + ' ICE=' + record.ice + ' gathering=' + record.gathering + ' signaling=' + record.signaling + ' local=' + record.localDescription + ' remote=' + record.remoteDescription });
                if (record.connection === 'closed' || record.connection === 'failed') {
                    stop();
                    return;
                }
                void measure();
            }
            function iceError(event) {
                if (!valid()) {
                    stop();
                    return;
                }
                const code = event === null || event === void 0 ? void 0 : event.errorCode;
                append(record, { stage: 'rtc', code: 'ICE_ERROR', elapsedMs: elapsed(),
                    ...(Number.isInteger(code) && Number(code) >= 300 && Number(code) <= 701 ? { iceErrorCode: Number(code) } : {}) });
            }
            if (observations.size >= 8)
                observations.values().next().value();
            observations.set(record.session, stop);
            try {
                session.close = close;
                for (const name of rtcEvents)
                    (_a = pc.addEventListener) === null || _a === void 0 ? void 0 : _a.call(pc, name, update);
                (_b = pc.addEventListener) === null || _b === void 0 ? void 0 : _b.call(pc, 'icecandidateerror', iceError);
                update();
            }
            catch {
                stop();
            }
        }
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
                clearObservations();
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
                        clearObservations();
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
        const wrapper = async (sessionOptions) => {
            var _a, _b;
            const record = { session: ++ordinal, credentials: 'requesting', connection: 'unmeasured', relay: 'unmeasured' };
            const capturedScope = scope(), startEpoch = epoch;
            const started = Date.now();
            const elapsed = () => Math.max(0, Math.min(300000, Math.floor(Date.now() - started)));
            append(record, { stage: 'auth', code: 'AUTH_START', elapsedMs: elapsed() });
            let captured = startEpoch;
            let authResolved = false;
            try {
                const next = await resolveAuth();
                guard(startEpoch, capturedScope);
                bind(next);
                captured = epoch;
                authResolved = true;
                append(record, { stage: 'auth', code: (auth === null || auth === void 0 ? void 0 : auth.currentUser) ? 'AUTH_SIGNED_IN' : 'AUTH_GUEST', elapsedMs: elapsed() });
                const uid = ((_a = auth === null || auth === void 0 ? void 0 : auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) || null, bound = auth;
                const acquisitionOffset = elapsed();
                const config = await provider.getConfiguration(options.diagnostics === true ? event => {
                    try {
                        guard(captured, capturedScope);
                        append(record, { ...event, elapsedMs: Math.min(300000, acquisitionOffset + event.elapsedMs) });
                    }
                    catch { /* Ignore stale acquisition events. */ }
                } : undefined);
                guard(captured, capturedScope);
                if (auth !== bound || (((_b = auth === null || auth === void 0 ? void 0 : auth.currentUser) === null || _b === void 0 ? void 0 : _b.uid) || null) !== uid || (identity === 'mini' && miniAuth() !== bound))
                    fail('TURN_BOOTSTRAP_STALE');
                record.credentials = config ? 'available' : 'guest';
                publish(record);
                append(record, { stage: 'rtc', code: 'RTC_START', elapsedMs: elapsed() });
                const session = await original.call(core, config ? { ...sessionOptions, ...config } : sessionOptions);
                // Instrumentation is best-effort and cannot reject a successful factory.
                try {
                    observe(session, record, captured, capturedScope, elapsed);
                }
                catch { /* Isolated observer. */ }
                return session;
            }
            catch (error) {
                try {
                    guard(captured, capturedScope);
                    if (record.credentials === 'requesting')
                        record.credentials = 'failed';
                    else {
                        record.connection = 'failed';
                        append(record, { stage: 'rtc', code: 'RTC_FAILED', elapsedMs: elapsed() });
                    }
                    if (!authResolved)
                        append(record, { stage: 'auth', code: 'AUTH_FAILED', elapsedMs: elapsed() });
                    publish(record);
                }
                catch { /* Suppress stale observations. */ }
                throw error;
            }
        };
        const handle = { active: true, dispose: () => {
                if (disposed)
                    return;
                disposed = true;
                handle.active = false;
                epoch++;
                provider.invalidate();
                clearObservations();
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
    function diagnosticText(value) {
        const credentials = { requesting: 'solicitando', available: 'disponibles', guest: 'invitado (sin solicitud)', failed: 'solicitud fallida' };
        const connections = { new: 'nueva', connecting: 'conectando', connected: 'conectada', disconnected: 'desconectada', failed: 'fallida', closed: 'cerrada', unmeasured: 'sin medir' };
        return 'Sesión ' + value.session + ' · credenciales: ' + credentials[value.credentials] + ' · conexión: ' + connections[value.connection]
            + ' · relay local: ' + (value.relay === 'verified' ? 'verificado durante la conexión' : 'sin verificar')
            + (value.ice ? '\n  RTC · ICE=' + value.ice + ' · gathering=' + value.gathering + ' · signaling=' + value.signaling
                + ' · descripción local=' + Boolean(value.localDescription) + ' · remota=' + Boolean(value.remoteDescription) : '')
            + (value.events || []).map(event => '\n  [' + event.elapsedMs + ' ms] ' + event.stage + ' · ' + event.code
                + (event.httpStatus === undefined ? '' : ' · HTTP=' + event.httpStatus)
                + (event.sdkCode === undefined ? '' : ' · SDK=' + event.sdkCode)
                + (event.detail === undefined ? '' : ' · ' + event.detail)
                + (event.iceErrorCode === undefined ? '' : ' · ICE_ERROR=' + event.iceErrorCode)
                + (event.rtcState === undefined ? '' : ' · ' + event.rtcState)).join('');
    }
    function sanitizeReport(value) {
        const count = (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 100000 ? Number(value[key]) : 0;
        const hash = typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash) ? value.payloadHash : '';
        return { apiRequestSuccess: value.apiRequestSuccess === true, selectedRelay: value.selectedRelay === true, datachannelTransfer: value.datachannelTransfer === true,
            requestCount: count('requestCount'), payloadCount: count('payloadCount'), payloadHash: hash };
    }
    return { install, verifySelectedRelay, sanitizeReport };
});
