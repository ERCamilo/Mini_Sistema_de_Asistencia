interface PrivateTurnBootstrapAuth {
    currentUser: PrivateTurnUser | null;
    onAuthStateChanged(callback: (user: PrivateTurnUser | null) => void): () => void;
}
interface PrivateTurnBootstrapSession { pc: unknown; channel?: unknown; close(...args: unknown[]): void; getLeaseRemainingMs?: () => number; }
interface PrivateTurnBootstrapCore { createRtcSession(options: Record<string, unknown>): Promise<PrivateTurnBootstrapSession>; }
interface PrivateTurnBootstrapOptions {
    profile?: 'mini-pages-turn-test';
    enabled: boolean;
    forceRelay?: boolean;
    diagnostics?: boolean;
    previewRelease?: { label: string; revision: string };
    onDiagnostic?: (value: PrivateTurnBootstrapDiagnostic) => void;
    allowedOrigins?: readonly string[];
    appIdentity: 'mini' | 'sa';
    contract: PrivateTurnContract;
    loadSaAuth?: () => Promise<PrivateTurnBootstrapAuth>;
    getScope?: () => string;
    now?: () => number;
}
interface PrivateTurnBootstrapDiagnostic {
    session: number;
    credentials: 'requesting' | 'available' | 'guest' | 'failed';
    connection: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' | 'unmeasured';
    relay: 'unmeasured' | 'verified';
    events?: PrivateTurnBootstrapEvent[];
    ice?: string;
    gathering?: string;
    signaling?: string;
    localDescription?: boolean;
    remoteDescription?: boolean;
}
interface PrivateTurnBootstrapEvent {
    stage: PrivateTurnDiagnostic['stage'] | 'auth' | 'rtc' | 'relay' | 'app' | 'channel' | 'signal';
    code: PrivateTurnDiagnostic['code'] | 'AUTH_START' | 'AUTH_SIGNED_IN' | 'AUTH_GUEST' | 'AUTH_FAILED' | 'RTC_START' | 'RTC_STATE' | 'RTC_FAILED' | 'ICE_ERROR' | 'RELAY_VERIFIED' | 'RELAY_UNMEASURED' | 'LOCAL_CLOSE' | 'RTC_CLOSED' | 'APP_ERROR' | 'APP_CONNECTED' | 'APP_CONNECTING' | 'APP_DISCONNECTED' | 'APP_FAILED' | 'APP_CLOSED' | 'APP_OTHER' | 'APP_PAIR_EXPIRED' | 'APP_ICE_UNAVAILABLE' | 'APP_CONNECTION_UNAVAILABLE' | 'APP_CHANNEL_FAILED' | 'APP_CHANNEL_CLOSED' | 'CHANNEL_STATE' | 'CHANNEL_OPEN' | 'CHANNEL_CLOSE' | 'CHANNEL_ERROR' | 'SIGNAL_PEER_LEFT' | 'SIGNAL_SOCKET_CLOSED' | 'SIGNAL_SOCKET_ERROR' | 'SIGNAL_ERROR' | 'TRANSPORT_STATE';
    elapsedMs: number;
    httpStatus?: number;
    sdkCode?: PrivateTurnDiagnostic['sdkCode'];
    detail?: PrivateTurnDiagnostic['detail'];
    iceErrorCode?: number;
    rtcState?: string;
}
interface PrivateTurnBootstrapPeer {
    sctp?: { state?: string; transport?: { state?: string } } | null;
    getStats?(): Promise<{ forEach(callback: (value: { type?: string; dtlsState?: string; iceState?: string }) => void): void }>;
    connectionState?: string;
    iceConnectionState?: string;
    iceGatheringState?: string;
    signalingState?: string;
    localDescription?: unknown;
    remoteDescription?: unknown;
    addEventListener?(name: string, callback: (event?: { errorCode?: unknown; channel?: unknown }) => void): void;
    removeEventListener?(name: string, callback: (event?: { errorCode?: unknown; channel?: unknown }) => void): void;
}
interface PrivateTurnBootstrapChannel {
    readyState?: string;
    addEventListener?(name: string, callback: () => void): void;
    removeEventListener?(name: string, callback: () => void): void;
}
interface PrivateTurnBootstrapHandle { active: boolean; dispose(): void; }
interface PrivateTurnBootstrapRoot {
    location?: { origin: string };
    document?: Document;
    MINI_BUILD_INFO?: { version?: unknown };
    MutationObserver?: typeof MutationObserver;
    navigator?: { clipboard?: { writeText(value: string): Promise<void> } };
    crypto?: { getRandomValues(value: Uint8Array): Uint8Array };
    SaMiniP2P?: PrivateTurnBootstrapCore;
    PrivateTurn?: { createProvider(options: PrivateTurnOptions): { getConfiguration(observer?: PrivateTurnObserver): Promise<PrivateTurnConfiguration | null>; getLeaseRemainingMs?(): number; invalidate(): void } };
    firebase?: { app(name: string): { auth(): PrivateTurnBootstrapAuth } };
    fetch?: typeof fetch;
}
(function exposePrivateTurnBootstrap(root: any, factory: (root: PrivateTurnBootstrapRoot) => unknown) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    if (root) root.PrivateTurnBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root: PrivateTurnBootstrapRoot) {
    let installed: { core: PrivateTurnBootstrapCore; identity: string; wrapper: PrivateTurnBootstrapCore['createRtcSession']; handle: PrivateTurnBootstrapHandle } | null = null;
    let diagnosticNonce = 0;
    function diagnosticLabel(): string {
        try {
            const bytes = new Uint8Array(6);
            if (root.crypto?.getRandomValues) {
                root.crypto.getRandomValues(bytes);
                return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
            }
        } catch { /* Diagnostic labeling must not depend on crypto availability. */ }
        // Diagnostic-only fallback: not authentication or a persistent device identity.
        return 'fallback-' + Math.random().toString(36).slice(2, 14) + '-' + (++diagnosticNonce);
    }
    function fail(code: string): never { throw new Error(code); }
    function install(options: PrivateTurnBootstrapOptions): PrivateTurnBootstrapHandle {
        if (options.enabled !== true) return { active: false, dispose: () => {} };
        const origin = root.location?.origin || '', identity = options.appIdentity, core = root.SaMiniP2P;
        if (options.profile !== undefined && options.profile !== 'mini-pages-turn-test') fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        const publicPreview = options.profile === 'mini-pages-turn-test';
        if (publicPreview && (origin !== 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev' || identity !== 'mini' || options.forceRelay !== true || options.diagnostics !== true || (options.allowedOrigins || []).length)) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        try {
            const url = new URL(origin);
            if (url.protocol !== 'https:' || (!publicPreview && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !(options.allowedOrigins || []).includes(origin)) || url.origin !== origin || !['mini', 'sa'].includes(identity)) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        } catch { fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID'); }
        if ((options.allowedOrigins || []).some(value => !['https://a2.tail2a0a8e.ts.net:8443', 'https://a2.tail2a0a8e.ts.net:8444'].includes(value))) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        if (!core || !root.PrivateTurn || !root.fetch || (identity === 'sa' && !options.loadSaAuth)) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        const metadata = options.previewRelease;
        if (metadata !== undefined && (!metadata || typeof metadata.label !== 'string' || !/^beta [0-9]{1,3}\.[0-9]{1,3}$/.test(metadata.label) || typeof metadata.revision !== 'string' || !/^[a-f0-9]{7,40}$/.test(metadata.revision))) fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        // Capture primitives, never mutable options or newly fetched build metadata.
        const release = metadata ? { label: metadata.label, revision: metadata.revision } : null;
        if (installed) {
            if (installed.core === core && installed.identity === identity && core.createRtcSession === installed.wrapper) return installed.handle;
            fail('TURN_BOOTSTRAP_CONFIGURATION_INVALID');
        }
        const original = core.createRtcSession, fetcher = root.fetch.bind(root), loadSaAuth = options.loadSaAuth;
        const getScope = options.getScope || (() => identity + ':' + origin);
        let disposed = false, epoch = 0, auth: PrivateTurnBootstrapAuth | null = null, pendingAuth: Promise<PrivateTurnBootstrapAuth> | null = null;
        let versionElement: HTMLElement | null = null, ordinaryVersion = '', decoratedVersion = '';
        const doc = root.document;
        let versionObserver: MutationObserver | null = null;
        const decorateVersion = () => {
            if (disposed || !release || identity !== 'mini' || !doc?.getElementById) return;
            const element = doc.getElementById('mini-version');
            const loaded = root.MINI_BUILD_INFO?.version;
            const text = typeof loaded === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(loaded) ? 'v' + loaded : element?.textContent || '';
            if (!element || !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(text)) return;
            versionElement = element; ordinaryVersion = text;
            decoratedVersion = text + ' ' + release.label + ' · ' + release.revision;
            element.textContent = decoratedVersion;
            if (root.MutationObserver) {
                versionObserver = new root.MutationObserver(() => {
                    if (!disposed && element.textContent !== decoratedVersion) element.textContent = decoratedVersion;
                });
                // Storage boot may render after DOM-ready. Observe this label only;
                // never inspect settings, attendance or account DOM.
                versionObserver.observe(element, { childList: true, characterData: true, subtree: true });
            }
        };
        // Capture the document's loaded build after scripts finish. Storage boot
        // may complete later; the label observer preserves this same identity.
        const readyVersion = () => { doc?.removeEventListener?.('DOMContentLoaded', readyVersion); void Promise.resolve().then(decorateVersion); };
        let unsubscribe: () => void = () => {};
        const provider = root.PrivateTurn.createProvider({ enabled: true, profile: options.profile, origin, forceRelay: options.forceRelay, allowedOrigins: options.allowedOrigins, contract: options.contract, getUser: () => auth?.currentUser || null, fetcher, now: options.now });
        // Private observations are bounded and never become connection authority.
        const observations = new Map<number, () => void>();
        const history = new Map<number, PrivateTurnBootstrapDiagnostic>();
        let ordinal = 0, panel: HTMLElement | null = null, output: HTMLElement | null = null;
        let copyButton: HTMLButtonElement | null = null, copyStatus: HTMLElement | null = null, manualCopy: HTMLTextAreaElement | null = null;
        const instance = options.diagnostics === true ? diagnosticLabel() : '';
        const snapshot = () => {
            let utc = 'sin medir';
            try {
                const stamp = options.now ? options.now() : Date.now();
                if (Number.isFinite(stamp)) utc = new Date(stamp).toISOString();
            } catch { /* Clock failures cannot affect diagnostic copying or RTC. */ }
            return 'Diagnóstico TURN · app=' + (identity === 'mini' ? 'Mini' : 'SA')
                + (release ? ' · versión=' + (decoratedVersion || release.label + ' · ' + release.revision) : '')
                + ' · instancia=' + instance + ' · UTC=' + utc + '\n'
                + [...history.values()].map(item => diagnosticText(item)).join("\n");
        };
        async function copyDiagnostics(): Promise<void> {
            const button = copyButton, owner = panel, captured = epoch;
            if (disposed || !button || button.disabled || !owner) return;
            const content = snapshot();
            try { if (output) output.textContent = content; } catch { /* Copy remains available if rendering fails. */ }
            const current = () => !disposed && epoch === captured && panel === owner;
            button.disabled = true;
            try {
                if (!root.navigator?.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
                await root.navigator.clipboard.writeText(content);
                if (current() && copyStatus) {
                    copyStatus.textContent = "Diagnóstico copiado.";
                    if (manualCopy) { manualCopy.remove(); manualCopy = null; }
                }
            } catch {
                if (!current()) return;
                try {
                    if (!manualCopy) {
                        manualCopy = root.document!.createElement("textarea");
                        manualCopy.readOnly = true;
                        manualCopy.setAttribute("aria-label", "Diagnóstico TURN para copiar manualmente");
                        manualCopy.style.cssText = "display:block;box-sizing:border-box;width:100%;min-height:88px;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);outline:2px solid var(--accent-color)";
                        owner.appendChild(manualCopy);
                    }
                    manualCopy.value = content;
                    if (copyStatus) copyStatus.textContent = "Selecciona y copia el diagnóstico manualmente.";
                    manualCopy.focus(); manualCopy.select();
                } catch { /* An unavailable DOM cannot affect the connection. */ }
            } finally { if (current()) button.disabled = false; }
        }
        const state = (value: string | undefined): PrivateTurnBootstrapDiagnostic['connection'] =>
            ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(value || '')
                ? value as PrivateTurnBootstrapDiagnostic['connection'] : 'unmeasured';
        function publish(value: PrivateTurnBootstrapDiagnostic): void {
            if (options.diagnostics !== true || disposed) return;
            // No input from errors, stats, session options, or identities reaches this record.
            const record: PrivateTurnBootstrapDiagnostic = { session: value.session, credentials: value.credentials, connection: value.connection, relay: value.relay,
                events: value.events?.map(event => ({ ...event })), ice: value.ice, gathering: value.gathering, signaling: value.signaling,
                localDescription: value.localDescription, remoteDescription: value.remoteDescription };
            history.set(record.session, record);
            if (history.size > 8) history.delete(history.keys().next().value!);
            const publishedEpoch = epoch;
            try { options.onDiagnostic?.({ ...record, events: record.events?.map(event => ({ ...event })) }); } catch { /* Observers cannot break RTC. */ }
            if (disposed || epoch !== publishedEpoch) return;
            try {
                const doc = root.document;
                if (!doc?.body) return;
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
                    copyButton.type = "button"; copyButton.textContent = "Copiar diagnóstico";
                    copyButton.style.cssText = "min-width:44px;min-height:44px;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:8px;outline:2px solid var(--accent-color);outline-offset:2px";
                    copyButton.onclick = () => { void copyDiagnostics(); };
                    copyStatus = doc.createElement("div"); copyStatus.setAttribute("role", "status");
                    panel.appendChild(summary); panel.appendChild(output); panel.appendChild(copyButton); panel.appendChild(copyStatus); doc.body.appendChild(panel);
                }
                if (panel?.firstChild) (panel.firstChild as HTMLElement).setAttribute('title', 'TURN · prueba privada · ' + (record.credentials === 'requesting' ? 'solicitando credenciales' : record.credentials === 'failed' ? 'solicitud fallida' : record.relay === 'verified' ? 'relay verificado' : 'relay sin verificar'));
                if (output) output.textContent = snapshot();
                if (output) { output.style.cssText = 'white-space:pre-wrap;font:12px ui-monospace,monospace;line-height:1.5;overflow-wrap:anywhere;max-width:80vw'; output.setAttribute('aria-label', 'Consola TURN sanitizada de prueba'); }
            } catch { /* A missing or unavailable DOM is not a connection failure. */ }
        }
        function append(record: PrivateTurnBootstrapDiagnostic, event: PrivateTurnBootstrapEvent): void {
            if (options.diagnostics !== true || disposed) return;
            const events = record.events || (record.events = []);
            events.push({ ...event });
            if (events.length > 32) events.shift();
            publish(record);
        }
        const rtcEvents = ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange', 'signalingstatechange'];
        function enumState(value: string | undefined, allowed: string[]): string { return allowed.includes(value || '') ? value! : 'unmeasured'; }
        function clearObservations(): void {
            for (const stop of [...observations.values()]) stop();
            observations.clear(); history.clear();
            try { panel?.remove(); } catch { /* Best-effort DOM cleanup. */ }
            if (copyButton) copyButton.onclick = null;
            panel = null; output = null; copyButton = null; copyStatus = null; manualCopy = null;
        }
        function observe(session: PrivateTurnBootstrapSession, record: PrivateTurnBootstrapDiagnostic, captured: number, capturedScope: string, elapsed: () => number, stopSignal: () => void): void {
            if (options.diagnostics !== true || disposed || epoch !== captured) { stopSignal(); return; }
            const pc = session.pc as PrivateTurnBootstrapPeer | null;
            if (!pc || typeof pc !== 'object') { stopSignal(); observations.delete(record.session); return; }
            let stopped = false, running = false, retry = 0, timer: ReturnType<typeof setTimeout> | undefined;
            const originalClose = session.close;
            let transportRunning = false, transportReads = 0, lastTransportRead = -Infinity;
            function transportState(): void {
                if (!valid()) return;
                try {
                    append(record, { stage: 'rtc', code: 'TRANSPORT_STATE', elapsedMs: elapsed(),
                        rtcState: 'SCTP=' + enumState(pc?.sctp?.state, ['connecting', 'connected', 'closed']) +
                            ' DTLS=' + enumState(pc?.sctp?.transport?.state, ['new', 'connecting', 'connected', 'closed', 'failed']) });
                } catch { /* Native transport access is diagnostic-only. */ }
            }
            async function transportStats(): Promise<void> {
                const stamp = elapsed();
                if (!valid() || transportRunning || transportReads >= 4 || stamp - lastTransportRead < 1000 || typeof pc?.getStats !== 'function') return;
                transportRunning = true; transportReads++; lastTransportRead = stamp;
                try {
                    const stats = await pc.getStats();
                    if (!valid()) return;
                    // One fixed state summary per read; never retain raw stats or identifiers.
                    let found = false;
                    stats.forEach(row => {
                        if (found || row.type !== 'transport') return;
                        found = true;
                        append(record, { stage: 'rtc', code: 'TRANSPORT_STATE', elapsedMs: elapsed(),
                            rtcState: 'stats DTLS=' + enumState(row.dtlsState, ['new', 'connecting', 'connected', 'closed', 'failed']) +
                                ' ICE=' + enumState(row.iceState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']) });
                    });
                } catch { /* Failed stats cannot alter the connection or close outcome. */ }
                finally { transportRunning = false; }
            }
            const channels = new Map<PrivateTurnBootstrapChannel, () => void>();
            function watchChannel(value: unknown): void {
                if (!valid() || !value || typeof value !== 'object') return;
                const channel = value as PrivateTurnBootstrapChannel;
                if (channels.has(channel) || channels.size >= 1) return;
                const emit = (code: PrivateTurnBootstrapEvent['code']) => {
                    if (!valid()) return;
                    append(record, { stage: 'channel', code, elapsedMs: elapsed(), rtcState: 'ready=' + enumState(channel.readyState, ['connecting', 'open', 'closing', 'closed']) });
                };
                const open = () => emit('CHANNEL_OPEN'), closed = () => emit('CHANNEL_CLOSE'), error = () => emit('CHANNEL_ERROR');
                const callbacks: [string, () => void][] = [['open', open], ['close', closed], ['error', error]];
                channels.set(channel, () => { for (const [name, fn] of callbacks) { try { channel.removeEventListener?.(name, fn); } catch { /* Isolated cleanup. */ } } });
                for (const [name, fn] of callbacks) channel.addEventListener?.(name, fn);
                emit('CHANNEL_STATE');
            }
            const dataChannel = (event?: { channel?: unknown }) => { try { watchChannel(event?.channel); } catch { /* Isolated channel observer. */ } };
            const valid = () => {
                try { guard(captured, capturedScope); return !stopped; } catch { return false; }
            };
            function stop(): void {
                if (stopped) return;
                stopped = true;
                stopSignal();
                for (const detach of channels.values()) detach();
                channels.clear();
                try { pc?.removeEventListener?.('datachannel', dataChannel); } catch { /* Isolated cleanup. */ }
                if (timer !== undefined) clearTimeout(timer);
                for (const name of rtcEvents) {
                    try { pc?.removeEventListener?.(name, update); } catch { /* Isolated observer. */ }
                }
                try { pc?.removeEventListener?.('icecandidateerror', iceError); } catch { /* Isolated observer. */ }
                if (session.close === close) session.close = originalClose;
                observations.delete(record.session);
            }
            function close(...args: unknown[]): void {
                if (valid()) { transportState(); append(record, { stage: 'rtc', code: 'LOCAL_CLOSE', elapsedMs: elapsed() }); record.connection = 'closed'; publish(record); }
                stop(); originalClose.apply(session, args);
            }
            async function measure(): Promise<void> {
                if (running || !valid() || pc?.connectionState !== 'connected') return;
                running = true;
                try {
                    const relay = await verifySelectedRelay(pc);
                    if (!valid()) { stop(); return; }
                    if (pc?.connectionState !== 'connected') return;
                    if (relay) { record.relay = 'verified'; append(record, { stage: 'relay', code: 'RELAY_VERIFIED', elapsedMs: elapsed() }); }
                    else {
                        append(record, { stage: 'relay', code: 'RELAY_UNMEASURED', elapsedMs: elapsed() });
                        if (retry++ < 3 && timer === undefined) timer = setTimeout(() => { timer = undefined; void measure(); }, 1000);
                    }
                } catch { /* Stats cannot change the original session outcome. */ }
                finally { running = false; }
            }
            function update(): void {
                if (!valid()) { stop(); return; }
                record.connection = state(pc?.connectionState);
                record.ice = enumState(pc?.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']);
                record.gathering = enumState(pc?.iceGatheringState, ['new', 'gathering', 'complete']);
                record.signaling = enumState(pc?.signalingState, ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer', 'closed']);
                record.localDescription = Boolean(pc?.localDescription); record.remoteDescription = Boolean(pc?.remoteDescription);
                append(record, { stage: 'rtc', code: 'RTC_STATE', elapsedMs: elapsed(), rtcState: 'connection=' + record.connection + ' ICE=' + record.ice + ' gathering=' + record.gathering + ' signaling=' + record.signaling + ' local=' + record.localDescription + ' remote=' + record.remoteDescription });
                transportState();
                if (record.connection === 'connecting') void transportStats();
                if (record.connection === 'closed' || record.connection === 'failed') { append(record, { stage: 'rtc', code: 'RTC_CLOSED', elapsedMs: elapsed(), rtcState: 'connection=' + record.connection + ' ICE=' + record.ice }); stop(); return; }
                void measure();
            }
            function iceError(event?: { errorCode?: unknown }): void {
                if (!valid()) { stop(); return; }
                const code = event?.errorCode;
                append(record, { stage: 'rtc', code: 'ICE_ERROR', elapsedMs: elapsed(),
                    ...(Number.isInteger(code) && Number(code) >= 300 && Number(code) <= 701 ? { iceErrorCode: Number(code) } : {}) });
            }
            if (!observations.has(record.session) && observations.size >= 8) observations.values().next().value!();
            observations.set(record.session, stop);
            try {
                session.close = close;
                pc.addEventListener?.('datachannel', dataChannel);
                watchChannel(session.channel);
                for (const name of rtcEvents) pc.addEventListener?.(name, update);
                pc.addEventListener?.('icecandidateerror', iceError);
                update();
            } catch { stop(); }
        }
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
            if (auth) { epoch++; provider.invalidate(); clearObservations(); unsubscribe(); }
            auth = next;
            unsubscribe = () => {};
            if (next) {
                let first = true;
                const initialUid = next.currentUser?.uid || null;
                try {
                    unsubscribe = next.onAuthStateChanged(user => {
                        if (first) { first = false; if ((user?.uid || null) === initialUid) return; }
                        epoch++; provider.invalidate(); clearObservations();
                    });
                } catch { fail('TURN_BOOTSTRAP_UNAVAILABLE'); }
            }
        }
        function guard(captured: number, capturedScope: string): void {
            if (disposed || epoch !== captured || core!.createRtcSession !== wrapper || scope() !== capturedScope || root.location?.origin !== origin) fail('TURN_BOOTSTRAP_STALE');
        }
        const wrapper: PrivateTurnBootstrapCore['createRtcSession'] = async sessionOptions => {
            const record: PrivateTurnBootstrapDiagnostic = { session: ++ordinal, credentials: 'requesting', connection: 'unmeasured', relay: 'unmeasured' };
            const capturedScope = scope(), startEpoch = epoch;
            const started = Date.now();
            const elapsed = () => Math.max(0, Math.min(300000, Math.floor(Date.now() - started)));
            append(record, { stage: 'auth', code: 'AUTH_START', elapsedMs: elapsed() });
            let captured = startEpoch;
            let authResolved = false;
            let stopSignal: () => void = () => {};
            try {
                const next = await resolveAuth();
                guard(startEpoch, capturedScope);
                bind(next);
                captured = epoch;
                authResolved = true;
                append(record, { stage: 'auth', code: auth?.currentUser ? 'AUTH_SIGNED_IN' : 'AUTH_GUEST', elapsedMs: elapsed() });
                const uid = auth?.currentUser?.uid || null, bound = auth;
                const acquisitionOffset = elapsed();
                const config = await provider.getConfiguration(options.diagnostics === true ? event => {
                    try { guard(captured, capturedScope); append(record, { ...event, elapsedMs: Math.min(300000, acquisitionOffset + event.elapsedMs) }); } catch { /* Ignore stale acquisition events. */ }
                } : undefined);
                guard(captured, capturedScope);
                if (auth !== bound || (auth?.currentUser?.uid || null) !== uid || (identity === 'mini' && miniAuth() !== bound)) fail('TURN_BOOTSTRAP_STALE');
                record.credentials = config ? 'available' : 'guest'; publish(record);
                append(record, { stage: 'rtc', code: 'RTC_START', elapsedMs: elapsed() });
                const observed = options.diagnostics === true ? { ...sessionOptions } : sessionOptions;
                if (options.diagnostics === true) {
                    const emit = (stage: PrivateTurnBootstrapEvent['stage'], code: PrivateTurnBootstrapEvent['code']) => {
                        try { guard(captured, capturedScope); if (history.has(record.session)) append(record, { stage, code, elapsedMs: elapsed() }); } catch { /* Suppress stale events. */ }
                    };
                    const originalState = sessionOptions.onState;
                    observed.onState = (...args: unknown[]) => {
                        const status = args[0];
                        const codes: Record<string, PrivateTurnBootstrapEvent['code']> = { error: 'APP_ERROR', connected: 'APP_CONNECTED', connecting: 'APP_CONNECTING', disconnected: 'APP_DISCONNECTED', failed: 'APP_FAILED', closed: 'APP_CLOSED' };
                        let code = typeof status === 'string' && Object.prototype.hasOwnProperty.call(codes, status) ? codes[status] : 'APP_OTHER';
                        if (status === 'error') {
                            try {
                                const failures: Record<string, PrivateTurnBootstrapEvent['code']> = {
                                    'La sesión de emparejamiento expiró.': 'APP_PAIR_EXPIRED',
                                    'La conexión ICE P2P dejó de estar disponible.': 'APP_ICE_UNAVAILABLE',
                                    'La conexión P2P dejó de estar disponible.': 'APP_CONNECTION_UNAVAILABLE',
                                    'Canal de datos P2P falló.': 'APP_CHANNEL_FAILED',
                                    'El canal de datos P2P se cerró inesperadamente.': 'APP_CHANNEL_CLOSED'
                                };
                                const message = (args[1] as { message?: unknown } | undefined)?.message;
                                if (typeof message === 'string' && Object.prototype.hasOwnProperty.call(failures, message)) code = failures[message];
                            } catch { /* Unknown errors retain only the fixed APP_ERROR classification. */ }
                        }
                        emit('app', code);
                        if (typeof originalState === 'function') return originalState(...args);
                    };
                    // SignalingClient supports independent subscribers; never replace the application's listener.
                    const signaling = sessionOptions.signaling as { onEvent?: (fn: (event: { type?: unknown }) => void) => () => void } | undefined;
                    try {
                        const off = signaling?.onEvent?.(event => {
                            const codes: Record<string, PrivateTurnBootstrapEvent['code']> = { 'peer-left': 'SIGNAL_PEER_LEFT', 'socket-closed': 'SIGNAL_SOCKET_CLOSED', 'socket-error': 'SIGNAL_SOCKET_ERROR', error: 'SIGNAL_ERROR' };
                            if (typeof event?.type === 'string' && Object.prototype.hasOwnProperty.call(codes, event.type)) emit('signal', codes[event.type]);
                        });
                        if (typeof off === 'function') {
                            let listening = true;
                            stopSignal = () => { if (!listening) return; listening = false; try { off(); } catch { /* Isolated subscriber cleanup. */ } };
                            if (observations.size >= 8) observations.values().next().value!();
                            observations.set(record.session, stopSignal);
                        }
                    } catch { /* Unavailable subscription cannot affect RTC. */ }
                }
                // Capture this configuration's lease before async factory work; a
                // concurrent refresh must not lend a newer lease to an older peer.
                const leaseClock = typeof performance !== 'undefined' ? () => performance.now() : () => Number.POSITIVE_INFINITY;
                const leaseStarted = leaseClock();
                const credentialLease = config ? provider.getLeaseRemainingMs?.() ?? 0 : 300000;
                const session = await original.call(core, config ? { ...observed, ...config } : observed);
                // Instrumentation is best-effort and cannot reject a successful factory.
                try { observe(session, record, captured, capturedScope, elapsed, stopSignal); } catch { stopSignal(); }
                // Separate metadata; never pass it to RTCPeerConnection. Frozen
                // legacy session objects remain valid, but cannot opt into reuse.
                let ownsLeaseMetadata = false;
                try {
                    const leaseRemaining = () => {
                        try {
                            guard(captured, capturedScope);
                            if (!Number.isFinite(leaseStarted)) return 0;
                            return Math.max(0, Math.floor(Math.min(300000, credentialLease) - (leaseClock() - leaseStarted)));
                        } catch { return 0; }
                    };
                    session.getLeaseRemainingMs = leaseRemaining;
                    ownsLeaseMetadata = session.getLeaseRemainingMs === leaseRemaining;
                } catch { /* Optional lease metadata cannot reject factory creation. */ }
                if (config && sessionOptions.demandNegotiation && !ownsLeaseMetadata) {
                    try { session.close?.(); } catch { /* Reject unsafe reuse without leaking errors. */ }
                    fail('TURN_LEASE_METADATA_UNAVAILABLE');
                }
                return session;
            } catch (error) {
                stopSignal(); observations.delete(record.session);
                try {
                    guard(captured, capturedScope);
                    if (record.credentials === 'requesting') record.credentials = 'failed';
                    else { record.connection = 'failed'; append(record, { stage: 'rtc', code: 'RTC_FAILED', elapsedMs: elapsed() }); }
                    if (!authResolved) append(record, { stage: 'auth', code: 'AUTH_FAILED', elapsedMs: elapsed() });
                    publish(record);
                } catch { /* Suppress stale observations. */ }
                throw error;
            }
        };
        const handle: PrivateTurnBootstrapHandle = { active: true, dispose: () => {
            if (disposed) return;
            disposed = true; handle.active = false; epoch++; provider.invalidate(); clearObservations();
            doc?.removeEventListener?.('DOMContentLoaded', readyVersion);
            versionObserver?.disconnect();
            if (versionElement?.textContent === decoratedVersion) versionElement.textContent = ordinaryVersion;
            try { unsubscribe(); } catch { /* Disposal must not expose SDK errors. */ }
            if (core.createRtcSession === wrapper) core.createRtcSession = original;
            if (installed?.handle === handle) installed = null;
        } };
        core.createRtcSession = wrapper;
        installed = { core, identity, wrapper, handle };
        if (release && identity === 'mini' && doc) {
            if (doc.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', readyVersion);
            else readyVersion();
        }
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
    function diagnosticText(value: PrivateTurnBootstrapDiagnostic): string {
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
    function sanitizeReport(value: Record<string, unknown>) {
        const count = (key: string) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 100000 ? Number(value[key]) : 0;
        const hash = typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash) ? value.payloadHash : '';
        return { apiRequestSuccess: value.apiRequestSuccess === true, selectedRelay: value.selectedRelay === true, datachannelTransfer: value.datachannelTransfer === true,
            requestCount: count('requestCount'), payloadCount: count('payloadCount'), payloadHash: hash };
    }
    return { install, verifySelectedRelay, sanitizeReport };
});
