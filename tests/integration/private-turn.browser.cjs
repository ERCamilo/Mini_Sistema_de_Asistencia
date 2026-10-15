const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { X509Certificate, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const SA = '/home/ubuntu/worktrees/sa-private-turn-test-20261008';
const stage = { value: 'CAPABILITY' };
const contract = { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' };
function browserLaunchReason(error) {
    const full = String(error?.message || '');
    if (full.includes("Executable doesn't exist")) return 'EXECUTABLE_MISSING';
    const stderr = full.split('\n').filter(line => line.includes('[err]')).join('\n');
    if (/No usable sandbox|Failed to move to new namespace|Failed to create.*namespace/i.test(stderr)) return 'SANDBOX_UNAVAILABLE';
    if (/error while loading shared libraries/i.test(stderr)) return 'NATIVE_LIBRARY_UNAVAILABLE';
    if (/not a snap cgroup|snap-confine|cannot.*snap/i.test(stderr)) return 'SNAP_RUNTIME_UNAVAILABLE';
    return 'UNAVAILABLE';
}
async function main() {
    assert.ok(process.env.PLAYWRIGHT_MODULE, 'select the existing Playwright module explicitly');
    assert.ok(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'compile the development tool first');
    const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
    const { startDevServer } = await import(pathToFileURL(path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'dev-server.mjs')).href);
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-browser-'));
    const devs = []; let browser, upstream, requests = 0, blocked = 0;
    try {
        const keyPath = path.join(temporary, 'own-test.key'), certPath = path.join(temporary, 'own-test.crt');
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
        const cert = await fs.readFile(certPath), key = await fs.readFile(keyPath);
        const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
        upstream = http.createServer((req, res) => {
            assert.equal(req.url, '/turn-creds'); assert.equal(req.method, 'POST'); requests++;
            let body = ''; req.on('data', chunk => { body += chunk; assert.ok(body.length <= 20000); });
            req.on('end', () => { assert.deepEqual(JSON.parse(body), { idToken: 'synthetic-token' }); res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: Date.now() + 300000, iceServers: [{ urls: 'turn:synthetic.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] })); });
        });
        await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
        stage.value = 'BROWSER_LAUNCH';
        try { browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--ignore-certificate-errors-spki-list=' + spki, '--disable-background-networking'] }); }
        catch (error) { stage.value += '_' + browserLaunchReason(error); throw new Error('BROWSER_UNAVAILABLE'); }
        const permittedPorts = new Set();
        const miniCore = await fs.readFile(path.join(ROOT, 'p2p-core.js'), 'utf8');
        const saCore = await fs.readFile(path.join(SA, 'js/p2p/P2PCore.js'), 'utf8');
        for (const identity of ['mini', 'sa']) {
            const fixtureRoot = path.join(temporary, identity); await fs.mkdir(fixtureRoot, { recursive: true });
            if (identity === 'mini') {
                await fs.writeFile(path.join(fixtureRoot, 'p2p-core.js'), miniCore);
                await fs.writeFile(path.join(fixtureRoot, 'firebase-field-config.js'), await fs.readFile(path.join(ROOT, 'firebase-field-config.js')));
                await fs.writeFile(path.join(fixtureRoot, 'index.html'), '<html><script src="./firebase-field-config.js"></script><script>window.configBeforeAuth=!!window.MiniFirebaseFieldConfig</script><script src="./p2p-core.js"></script></html>');
            } else {
                await fs.mkdir(path.join(fixtureRoot, 'js/p2p'), { recursive: true }); await fs.mkdir(path.join(fixtureRoot, 'js/modules/data'), { recursive: true });
                await fs.writeFile(path.join(fixtureRoot, 'js/p2p/P2PCore.js'), saCore);
                await fs.writeFile(path.join(fixtureRoot, 'js/modules/data/firebase.js'), 'export const auth=window.mockAuth;export const onAuthStateChanged=(auth,fn)=>{if(auth!==window.mockAuth)throw new Error("WRONG_AUTH");return auth.subscribe(fn);};');
                await fs.writeFile(path.join(fixtureRoot, 'index.html'), '<html><script src="js/p2p/P2PCore.js"></script></html>');
            }
            const assets = identity === 'mini' ? ['index.html', 'p2p-core.js', 'firebase-field-config.js'] : ['index.html', 'js/p2p/P2PCore.js', 'js/modules/data/firebase.js'];
            for (const mode of ['disabled', 'ordinary', 'forced']) {
                const dev = await startDevServer({ forwardPort: upstream.address().port, port: 0, tls: { key, cert }, appRoot: fixtureRoot, assets,
                    ...(mode === 'disabled' ? {} : { bootstrap: { enabled: true, appIdentity: identity, contract, canonicalRoot: ROOT, forceRelay: mode === 'forced' } }) });
                devs.push(dev); permittedPorts.add(new URL(dev.origin).port);
                const context = await browser.newContext();
                await context.route('**/*', route => { const url = new URL(route.request().url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) && permittedPorts.has(url.port)) return route.continue(); blocked++; return route.abort(); });
                stage.value = identity.toUpperCase() + '_' + mode.toUpperCase() + '_LOAD'; const page = await context.newPage(); let pageErrors = 0; page.on('pageerror', () => { pageErrors++; });
                await page.addInitScript(({ identity }) => {
                    const listeners = new Set(), user = { uid: 'synthetic-user', getIdToken: async () => 'synthetic-token' };
                    window.mockAuth = { currentUser: user, subscribe(fn) { listeners.add(fn); fn(this.currentUser); return () => listeners.delete(fn); } };
                    window.setMockUser = value => { window.mockAuth.currentUser = value ? user : null; for (const fn of [...listeners]) fn(window.mockAuth.currentUser); };
                    window.mockNames = []; window.configs = []; window.NativeRtc = window.RTCPeerConnection;
                    if (identity === 'mini') { window.mockAuth.onAuthStateChanged = fn => window.mockAuth.subscribe(fn); window.firebase = { app(name) { window.mockNames.push(name); if (name !== 'mini-field') throw new Error('WRONG_AUTH'); return { auth: () => window.mockAuth }; } }; }
                    window.RTCPeerConnection = class { constructor(config) { window.configs.push({ policy: config.iceTransportPolicy ?? null, servers: config.iceServers.length, customIdentity: config.iceServers === window.customServers }); this.connectionState = 'new'; } close() { this.connectionState = 'closed'; } };
                }, { identity });
                await page.goto(dev.origin); await page.waitForFunction(() => !!window.SaMiniP2P);
                const before = requests;
                stage.value = identity.toUpperCase() + '_' + mode.toUpperCase() + '_AUTH_FACTORY'; const result = await page.evaluate(async ({ mode, identity }) => {
                    const factory = window.SaMiniP2P; const signal = () => ({ expiresAt: null, connect: async () => {}, onEvent: () => () => {}, send() {}, close() {} });
                    window.customServers = [];
                    const options = { initiator: false, signaling: signal(), iceServers: window.customServers };
                    const first = await factory.createRtcSession(options); first.close();
                    window.setMockUser(false); const guest = await factory.createRtcSession({ ...options, signaling: signal() }); guest.close();
                    window.setMockUser(true); const again = await factory.createRtcSession({ ...options, signaling: signal() }); again.close();
                    const namesCorrect = identity === 'sa' ? !window.firebase : window.mockNames.every(name => name === 'mini-field');
                    const active = !!window.privateTurnTest?.active; window.privateTurnTest?.dispose();
                    let controlledRelayStats = null;
                    if (mode !== 'disabled') {
                        const make = () => new Map([
                            ['transport', { id: 'transport', type: 'transport', dtlsState: 'connected', selectedCandidatePairId: 'pair' }],
                            ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' }],
                            ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay' }],
                            ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'relay' }]
                        ]);
                        const selected = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => make() });
                        const gathered = make(); delete gathered.get('transport').selectedCandidatePairId;
                        const gatheredOnly = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => gathered });
                        const stale = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'closed', getStats: async () => make() });
                        controlledRelayStats = { selected, gatheredOnly, stale };
                    }
                    return { configs: window.configs, namesCorrect, active, controlledRelayStats, configBeforeAuth: identity === 'mini' ? window.configBeforeAuth : true };
                }, { mode, identity });
                stage.value = identity.toUpperCase() + '_' + mode.toUpperCase() + '_ASSERT'; assert.equal(result.namesCorrect, true); assert.equal(result.active, mode !== 'disabled'); assert.equal(pageErrors, 0);
                const expected = mode === 'forced' ? 'relay' : mode === 'ordinary' ? 'all' : null;
                assert.equal(result.configs[0].policy, expected); assert.equal(result.configs[1].policy, null); assert.equal(result.configs[1].customIdentity, true);
                assert.equal(requests - before, mode === 'disabled' ? 0 : 2); if (mode !== 'disabled') { assert.equal(result.configBeforeAuth, true); assert.deepEqual(result.controlledRelayStats, { selected: true, gatheredOnly: false, stale: false }); }
                if (identity === 'mini' && mode === 'disabled') {
                    // Actual Mini and SA factories, native WebRTC, empty ICE servers and memory signaling only.
                    await page.evaluate(() => { window.MiniCore = window.SaMiniP2P; window.RTCPeerConnection = window.NativeRtc; window.setMockUser(false); });
                    await page.addScriptTag({ content: saCore });
                    stage.value = 'HOST_ONLY_FACTORIES'; const proof = await page.evaluate(async () => {
                        const callbacks = {}, connected = new Set(), sessions = []; let channelA, channelB;
                        let ready; const opened = new Promise(resolve => { ready = resolve; });
                        const signal = side => ({ expiresAt: null, onEvent(fn) { callbacks[side] = fn; return () => { delete callbacks[side]; }; },
                            async connect() { connected.add(side); if (connected.size === 2) setTimeout(() => { callbacks.a?.({ type: 'ready', peerCount: 2 }); callbacks.b?.({ type: 'ready', peerCount: 2 }); }, 0); },
                            send(type, data) { if (type === 'ice' && !data.candidate) return; setTimeout(() => { void callbacks[side === 'a' ? 'b' : 'a']?.({ type: 'signal', frame: { v: 1, type, data } }); }, 0); }, close() {} });
                        const onA = channel => { channelA = channel; if (channelB) ready(); }, onB = channel => { channelB = channel; if (channelA) ready(); };
                        let timeout; const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('HOST_CHANNEL_TIMEOUT')), 20000); });
                        try {
                            sessions.push(await window.SaMiniP2P.createRtcSession({ signaling: signal('b'), initiator: false, iceServers: [], onChannel: onB }));
                            sessions.push(await window.MiniCore.createRtcSession({ signaling: signal('a'), initiator: true, iceServers: [], onChannel: onA }));
                            await Promise.race([opened, deadline]);
                            const exchange = (from, to, payload) => new Promise((resolve, reject) => { to.onmessage = event => event.data === payload ? resolve() : reject(new Error('HOST_PAYLOAD_MISMATCH')); from.send(payload); });
                            await Promise.race([exchange(channelA, channelB, 'synthetic-mini-to-sa'), deadline]); await Promise.race([exchange(channelB, channelA, 'synthetic-sa-to-mini'), deadline]);
                            return { messages: 2, connected: sessions.every(session => session.pc.connectionState === 'connected') };
                        } finally { clearTimeout(timeout); for (const session of sessions) session.close(); }
                    });
                    assert.deepEqual(proof, { messages: 2, connected: true });
                }
                await context.close();
            }
        }
        assert.equal(blocked, 0);
        console.log(JSON.stringify({ syntheticAppModes: 6, sdkAccountsCorrect: true, accountLifecycleRefresh: true, externalRequests: 0, controlledMockRelayStats: true, hostOnlyMessages: 2, liveTurnProof: false }));
    } finally { await browser?.close(); for (const dev of devs) await dev.close(); if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); } await fs.rm(temporary, { recursive: true }); }
}
module.exports = { browserLaunchReason };
if (require.main === module) void main().catch(() => { console.error('private-turn-browser:failed:' + stage.value); process.exitCode = 1; });
