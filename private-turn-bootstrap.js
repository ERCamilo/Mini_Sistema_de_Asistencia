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
        let copyButton = null, copyStatus = null, manualCopy = null;
        const snapshot = () => [...history.values()].map(item => diagnosticText(item)).join("\n");
        async function copyDiagnostics() {
            var _a, _b;
            const button = copyButton, owner = panel, captured = epoch;
            if (disposed || !button || button.disabled || !owner)
                return;
            const content = snapshot();
            const current = () => !disposed && epoch === captured && panel === owner;
            button.disabled = true;
            try {
                if (!((_b = (_a = root.navigator) === null || _a === void 0 ? void 0 : _a.clipboard) === null || _b === void 0 ? void 0 : _b.writeText))
                    throw new Error("CLIPBOARD_UNAVAILABLE");
                await root.navigator.clipboard.writeText(content);
                if (current() && copyStatus) {
                    copyStatus.textContent = "Diagnóstico copiado.";
                    if (manualCopy) {
                        manualCopy.remove();
                        manualCopy = null;
                    }
                }
            }
            catch {
                if (!current())
                    return;
                try {
                    if (!manualCopy) {
                        manualCopy = root.document.createElement("textarea");
                        manualCopy.readOnly = true;
                        manualCopy.setAttribute("aria-label", "Diagnóstico TURN para copiar manualmente");
                        manualCopy.style.cssText = "display:block;box-sizing:border-box;width:100%;min-height:88px;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);outline:2px solid var(--accent-color)";
                        owner.appendChild(manualCopy);
                    }
                    manualCopy.value = content;
                    if (copyStatus)
                        copyStatus.textContent = "Selecciona y copia el diagnóstico manualmente.";
                    manualCopy.focus();
                    manualCopy.select();
                }
                catch { /* An unavailable DOM cannot affect the connection. */ }
            }
            finally {
                if (current())
                    button.disabled = false;
            }
        }
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
                    copyButton = doc.createElement("button");
                    copyButton.type = "button";
                    copyButton.textContent = "Copiar diagnóstico";
                    copyButton.style.cssText = "min-width:44px;min-height:44px;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:8px;outline:2px solid var(--accent-color);outline-offset:2px";
                    copyButton.onclick = () => { void copyDiagnostics(); };
                    copyStatus = doc.createElement("div");
                    copyStatus.setAttribute("role", "status");
                    panel.appendChild(summary);
                    panel.appendChild(output);
                    panel.appendChild(copyButton);
                    panel.appendChild(copyStatus);
                    doc.body.appendChild(panel);
                }
                if (panel === null || panel === void 0 ? void 0 : panel.firstChild)
                    panel.firstChild.setAttribute('title', 'TURN · prueba privada · ' + (record.credentials === 'requesting' ? 'solicitando credenciales' : record.credentials === 'failed' ? 'solicitud fallida' : record.relay === 'verified' ? 'relay verificado' : 'relay sin verificar'));
                if (output)
                    output.textContent = snapshot();
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
            if (copyButton)
                copyButton.onclick = null;
            panel = null;
            output = null;
            copyButton = null;
            copyStatus = null;
            manualCopy = null;
        }
        function observe(session, record, captured, capturedScope, elapsed, stopSignal) {
            var _a, _b, _c;
            if (options.diagnostics !== true || disposed || epoch !== captured) {
                stopSignal();
                return;
            }
            const pc = session.pc;
            if (!pc || typeof pc !== 'object') {
                stopSignal();
                observations.delete(record.session);
                return;
            }
            let stopped = false, running = false, retry = 0, timer;
            const originalClose = session.close;
            let transportRunning = false, transportReads = 0, lastTransportRead = -Infinity;
            function transportState() {
                var _a, _b, _c;
                if (!valid())
                    return;
                try {
                    append(record, { stage: 'rtc', code: 'TRANSPORT_STATE', elapsedMs: elapsed(),
                        rtcState: 'SCTP=' + enumState((_a = pc === null || pc === void 0 ? void 0 : pc.sctp) === null || _a === void 0 ? void 0 : _a.state, ['connecting', 'connected', 'closed']) +
                            ' DTLS=' + enumState((_c = (_b = pc === null || pc === void 0 ? void 0 : pc.sctp) === null || _b === void 0 ? void 0 : _b.transport) === null || _c === void 0 ? void 0 : _c.state, ['new', 'connecting', 'connected', 'closed', 'failed']) });
                }
                catch { /* Native transport access is diagnostic-only. */ }
            }
            async function transportStats() {
                const stamp = elapsed();
                if (!valid() || transportRunning || transportReads >= 4 || stamp - lastTransportRead < 1000 || typeof (pc === null || pc === void 0 ? void 0 : pc.getStats) !== 'function')
                    return;
                transportRunning = true;
                transportReads++;
                lastTransportRead = stamp;
                try {
                    const stats = await pc.getStats();
                    if (!valid())
                        return;
                    // One fixed state summary per read; never retain raw stats or identifiers.
                    let found = false;
                    stats.forEach(row => {
                        if (found || row.type !== 'transport')
                            return;
                        found = true;
                        append(record, { stage: 'rtc', code: 'TRANSPORT_STATE', elapsedMs: elapsed(),
                            rtcState: 'stats DTLS=' + enumState(row.dtlsState, ['new', 'connecting', 'connected', 'closed', 'failed']) +
                                ' ICE=' + enumState(row.iceState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']) });
                    });
                }
                catch { /* Failed stats cannot alter the connection or close outcome. */ }
                finally {
                    transportRunning = false;
                }
            }
            const channels = new Map();
            function watchChannel(value) {
                var _a;
                if (!valid() || !value || typeof value !== 'object')
                    return;
                const channel = value;
                if (channels.has(channel) || channels.size >= 1)
                    return;
                const emit = (code) => {
                    if (!valid())
                        return;
                    append(record, { stage: 'channel', code, elapsedMs: elapsed(), rtcState: 'ready=' + enumState(channel.readyState, ['connecting', 'open', 'closing', 'closed']) });
                };
                const open = () => emit('CHANNEL_OPEN'), closed = () => emit('CHANNEL_CLOSE'), error = () => emit('CHANNEL_ERROR');
                const callbacks = [['open', open], ['close', closed], ['error', error]];
                channels.set(channel, () => { var _a; for (const [name, fn] of callbacks) {
                    try {
                        (_a = channel.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(channel, name, fn);
                    }
                    catch { /* Isolated cleanup. */ }
                } });
                for (const [name, fn] of callbacks)
                    (_a = channel.addEventListener) === null || _a === void 0 ? void 0 : _a.call(channel, name, fn);
                emit('CHANNEL_STATE');
            }
            const dataChannel = (event) => { try {
                watchChannel(event === null || event === void 0 ? void 0 : event.channel);
            }
            catch { /* Isolated channel observer. */ } };
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
                var _a, _b, _c;
                if (stopped)
                    return;
                stopped = true;
                stopSignal();
                for (const detach of channels.values())
                    detach();
                channels.clear();
                try {
                    (_a = pc === null || pc === void 0 ? void 0 : pc.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(pc, 'datachannel', dataChannel);
                }
                catch { /* Isolated cleanup. */ }
                if (timer !== undefined)
                    clearTimeout(timer);
                for (const name of rtcEvents) {
                    try {
                        (_b = pc === null || pc === void 0 ? void 0 : pc.removeEventListener) === null || _b === void 0 ? void 0 : _b.call(pc, name, update);
                    }
                    catch { /* Isolated observer. */ }
                }
                try {
                    (_c = pc === null || pc === void 0 ? void 0 : pc.removeEventListener) === null || _c === void 0 ? void 0 : _c.call(pc, 'icecandidateerror', iceError);
                }
                catch { /* Isolated observer. */ }
                if (session.close === close)
                    session.close = originalClose;
                observations.delete(record.session);
            }
            function close(...args) {
                if (valid()) {
                    transportState();
                    append(record, { stage: 'rtc', code: 'LOCAL_CLOSE', elapsedMs: elapsed() });
                    record.connection = 'closed';
                    publish(record);
                }
                stop();
                originalClose.apply(session, args);
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
                transportState();
                if (record.connection === 'connecting')
                    void transportStats();
                if (record.connection === 'closed' || record.connection === 'failed') {
                    append(record, { stage: 'rtc', code: 'RTC_CLOSED', elapsedMs: elapsed(), rtcState: 'connection=' + record.connection + ' ICE=' + record.ice });
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
            if (!observations.has(record.session) && observations.size >= 8)
                observations.values().next().value();
            observations.set(record.session, stop);
            try {
                session.close = close;
                (_a = pc.addEventListener) === null || _a === void 0 ? void 0 : _a.call(pc, 'datachannel', dataChannel);
                watchChannel(session.channel);
                for (const name of rtcEvents)
                    (_b = pc.addEventListener) === null || _b === void 0 ? void 0 : _b.call(pc, name, update);
                (_c = pc.addEventListener) === null || _c === void 0 ? void 0 : _c.call(pc, 'icecandidateerror', iceError);
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
            var _a, _b, _c;
            const record = { session: ++ordinal, credentials: 'requesting', connection: 'unmeasured', relay: 'unmeasured' };
            const capturedScope = scope(), startEpoch = epoch;
            const started = Date.now();
            const elapsed = () => Math.max(0, Math.min(300000, Math.floor(Date.now() - started)));
            append(record, { stage: 'auth', code: 'AUTH_START', elapsedMs: elapsed() });
            let captured = startEpoch;
            let authResolved = false;
            let stopSignal = () => { };
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
                const observed = options.diagnostics === true ? { ...sessionOptions } : sessionOptions;
                if (options.diagnostics === true) {
                    const emit = (stage, code) => {
                        try {
                            guard(captured, capturedScope);
                            if (history.has(record.session))
                                append(record, { stage, code, elapsedMs: elapsed() });
                        }
                        catch { /* Suppress stale events. */ }
                    };
                    const originalState = sessionOptions.onState;
                    observed.onState = (...args) => {
                        var _a;
                        const status = args[0];
                        const codes = { error: 'APP_ERROR', connected: 'APP_CONNECTED', connecting: 'APP_CONNECTING', disconnected: 'APP_DISCONNECTED', failed: 'APP_FAILED', closed: 'APP_CLOSED' };
                        let code = typeof status === 'string' && Object.prototype.hasOwnProperty.call(codes, status) ? codes[status] : 'APP_OTHER';
                        if (status === 'error') {
                            try {
                                const failures = {
                                    'La sesión de emparejamiento expiró.': 'APP_PAIR_EXPIRED',
                                    'La conexión ICE P2P dejó de estar disponible.': 'APP_ICE_UNAVAILABLE',
                                    'La conexión P2P dejó de estar disponible.': 'APP_CONNECTION_UNAVAILABLE',
                                    'Canal de datos P2P falló.': 'APP_CHANNEL_FAILED',
                                    'El canal de datos P2P se cerró inesperadamente.': 'APP_CHANNEL_CLOSED'
                                };
                                const message = (_a = args[1]) === null || _a === void 0 ? void 0 : _a.message;
                                if (typeof message === 'string' && Object.prototype.hasOwnProperty.call(failures, message))
                                    code = failures[message];
                            }
                            catch { /* Unknown errors retain only the fixed APP_ERROR classification. */ }
                        }
                        emit('app', code);
                        if (typeof originalState === 'function')
                            return originalState(...args);
                    };
                    // SignalingClient supports independent subscribers; never replace the application's listener.
                    const signaling = sessionOptions.signaling;
                    try {
                        const off = (_c = signaling === null || signaling === void 0 ? void 0 : signaling.onEvent) === null || _c === void 0 ? void 0 : _c.call(signaling, event => {
                            const codes = { 'peer-left': 'SIGNAL_PEER_LEFT', 'socket-closed': 'SIGNAL_SOCKET_CLOSED', 'socket-error': 'SIGNAL_SOCKET_ERROR', error: 'SIGNAL_ERROR' };
                            if (typeof (event === null || event === void 0 ? void 0 : event.type) === 'string' && Object.prototype.hasOwnProperty.call(codes, event.type))
                                emit('signal', codes[event.type]);
                        });
                        if (typeof off === 'function') {
                            let listening = true;
                            stopSignal = () => { if (!listening)
                                return; listening = false; try {
                                off();
                            }
                            catch { /* Isolated subscriber cleanup. */ } };
                            if (observations.size >= 8)
                                observations.values().next().value();
                            observations.set(record.session, stopSignal);
                        }
                    }
                    catch { /* Unavailable subscription cannot affect RTC. */ }
                }
                const session = await original.call(core, config ? { ...observed, ...config } : observed);
                // Instrumentation is best-effort and cannot reject a successful factory.
                try {
                    observe(session, record, captured, capturedScope, elapsed, stopSignal);
                }
                catch {
                    stopSignal();
                }
                return session;
            }
            catch (error) {
                stopSignal();
                observations.delete(record.session);
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
