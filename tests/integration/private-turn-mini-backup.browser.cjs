// Component acceptance: real Mini modules and native WebRTC, not the full app page.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { X509Certificate, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { browserLaunchReason } = require('./private-turn.browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const modules = ['p2p-core.js', 'p2p-pairing.js', 'mini-backup-summary.js', 'p2p-backup-bridge.js', 'p2p-backup-consent.js'];
let phase = 'CAPABILITY';
async function main() {
  assert.ok(process.env.PLAYWRIGHT_MODULE); assert.ok(process.env.PRIVATE_TURN_TOOL_OUTPUT);
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const { startDevServer } = await import(pathToFileURL(path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'dev-server.mjs')).href);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-backup-browser-'));
  const devs = [], contexts = []; let browser, upstream, requests = 0, blocked = 0;
  try {
    const keyPath = path.join(temporary, 'own.key'), certPath = path.join(temporary, 'own.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const key = await fs.readFile(keyPath), cert = await fs.readFile(certPath);
    const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    upstream = http.createServer((req, res) => {
      assert.equal(req.url, '/turn-creds'); assert.equal(req.method, 'POST'); requests++;
      let body = ''; req.on('data', chunk => { body += chunk; assert.ok(body.length <= 20000); });
      req.on('end', () => { assert.deepEqual(JSON.parse(body), { idToken: 'synthetic-token' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: Date.now() + 300000, iceServers: [{ urls: 'turn:synthetic.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] })); });
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const fixture = path.join(temporary, 'app'); await fs.mkdir(fixture);
    for (const name of [...modules, 'firebase-field-config.js']) await fs.copyFile(path.join(ROOT, name), path.join(fixture, name));
    await fs.writeFile(path.join(fixture, 'index.html'), '<html><script src="./firebase-field-config.js"></script>' + modules.map(name => '<script src="./' + name + '"></script>').join('') + '<textarea id="restore-backup-textarea"></textarea><section id="modal-restore-backup" hidden></section></html>');
    phase = 'BROWSER_LAUNCH';
    try { browser = await chromium.launch({ args: ['--ignore-certificate-errors-spki-list=' + spki, '--disable-background-networking'] }); }
    catch (error) { phase += '_' + browserLaunchReason(error); throw new Error('BROWSER_UNAVAILABLE'); }
    const ports = new Set();
    async function pageFor(forceRelay) {
      const dev = await startDevServer({ forwardPort: upstream.address().port, port: 0, tls: { key, cert }, appRoot: fixture, assets: ['index.html', 'firebase-field-config.js', ...modules], bootstrap: { enabled: true, appIdentity: 'mini', canonicalRoot: ROOT, contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' }, forceRelay } });
      devs.push(dev); ports.add(new URL(dev.origin).port);
      const context = await browser.newContext(); contexts.push(context);
      await context.route('**/*', route => { const u = new URL(route.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname) && ports.has(u.port)) return route.continue(); blocked++; return route.abort(); });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const listeners = new Set(); window.authNames = [];
        const user = { uid: 'synthetic-user', getIdToken: async () => 'synthetic-token' };
        window.mockAuth = { currentUser: user, onAuthStateChanged(fn) { listeners.add(fn); fn(this.currentUser); return () => listeners.delete(fn); } };
        window.setGuest = () => { window.mockAuth.currentUser = null; for (const fn of listeners) fn(null); };
        window.firebase = { app(name) { window.authNames.push(name); if (name !== 'mini-field') throw new Error('WRONG_AUTH'); return { auth: () => window.mockAuth }; } };
        window.NativeRtc = window.RTCPeerConnection;
      });
      phase = 'MOCK_PAGE_LOAD'; await page.goto(dev.origin); phase = 'BOOTSTRAP_READY'; await page.waitForFunction(() => !!window.privateTurnTest?.active);
      return page;
    }
    phase = 'SIGNED_POLICY';
    const pages = [await pageFor(false), await pageFor(true)];
    for (let i = 0; i < pages.length; i++) {
      const before = requests;
      phase = 'SIGNED_FACTORY_' + i; const result = await pages[i].evaluate(async () => {
        let config; window.RTCPeerConnection = class { constructor(value) { config = value; } close() {} };
        const session = await window.SaMiniP2P.createRtcSession({ initiator: false, signaling: { expiresAt: null, onEvent: () => () => {}, connect: async () => {}, send() {}, close() {} } }); session.close();
        window.RTCPeerConnection = window.NativeRtc; window.setGuest();
        const make = () => new Map([['transport', { id: 'transport', type: 'transport', dtlsState: 'connected', selectedCandidatePairId: 'pair' }], ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' }], ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay' }], ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'relay' }]]);
        const selected = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => make() });
        const gathered = make(); delete gathered.get('transport').selectedCandidatePairId;
        const gatheredOnly = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => gathered });
        return { policy: config.iceTransportPolicy, servers: config.iceServers.length, namedAuth: window.authNames.every(name => name === 'mini-field'), selected, gatheredOnly };
      });
      phase = 'SIGNED_ASSERT_' + i; assert.deepEqual(result, { policy: i ? 'relay' : 'all', servers: 1, namedAuth: true, selected: true, gatheredOnly: false }); assert.equal(requests - before, 1);
    }
    phase = 'MINI_PAIRING';
    const connected = new Set();
    for (let i = 0; i < 2; i++) await pages[i].exposeFunction('signalBridge', async (type, data) => {
      if (type === 'connect') { connected.add(i); if (connected.size === 2) for (const page of pages) await page.evaluate(() => window.signalEvent({ type: 'ready', peerCount: 2 })); return; }
      if (type === 'ice' && !data.candidate) return;
      await pages[1 - i].evaluate(({ type, data }) => window.signalEvent({ type: 'signal', frame: { v: 1, type, data } }), { type, data });
    });
    const descriptor = await pages[0].evaluate(async () => {
      const core = window.SaMiniP2P;
      const descriptor = await core.makePairDescriptor({ deviceId: 'mini-1', appType: 'mini', displayName: 'Synthetic Mini 1' });
      return core.decodePairDescriptor(core.encodePairDescriptor(descriptor), { allowSameApp: true });
    });
    // Receiver's subscription is installed before the initiator can publish any SDP.
    for (const i of [1, 0]) await pages[i].evaluate(async ({ i, descriptor }) => {
      const core = window.SaMiniP2P;
      window.failure = false; window.saved = []; window.stageStore = window.SaMiniP2PBackup.createBackupStagingStore();
      window.data = { schemaVersion: 1, exportedAt: '2026-09-15T00:00:00Z', users: [{ id: 'synthetic-employee', name: i === 0 ? 'Synthetic sender employee' : 'Existing receiver employee' }], attendance: { '2026-09-15': { 'synthetic-employee': { checkIn: '08:00' } } }, requests: [] };
      window.beforeData = JSON.stringify(window.data); window.buildMiniBackupData = () => window.data;
      const store = { async savePeer(peer, options) { if (!options.allowSameApp || peer.peerApp !== 'mini' || peer.purpose !== 'backup') throw new Error('WRONG_PURPOSE'); window.saved.push(peer); return peer; } };
      window.session = await core.createRtcSession({ initiator: i === 0, iceServers: [], signaling: { expiresAt: null, onEvent(fn) { window.signalEvent = fn; return () => {}; }, connect: () => window.signalBridge('connect'), send(type, data) { void window.signalBridge(type, data).catch(() => { window.failure = true; }); }, close() {} }, onChannel(channel) {
        window.channel = channel; window.offerInbox = window.P2PBackupConsent.bufferOffers(channel, core);
        window.pairing = window.SaMiniP2PPairing.attachPairing(channel, { self: { deviceId: 'mini-' + (i + 1), appType: 'mini', displayName: 'Synthetic Mini ' + (i + 1) }, descriptor, initiator: i === 0, store, allowSameApp: true, onCandidate: candidate => { window.candidate = candidate; }, onLinked: peer => { window.peer = peer; }, onError: () => { window.failure = true; } });
      } });
    }, { i, descriptor });
    for (const page of pages) await page.waitForFunction(() => !!window.candidate || window.failure, null, { timeout: 20000 });
    assert.equal(await pages[0].evaluate(() => window.candidate.sas), await pages[1].evaluate(() => window.candidate.sas));
    for (const page of pages) await page.evaluate(() => window.candidate.accept());
    for (const page of pages) { await page.waitForFunction(() => !!window.peer || window.failure); assert.deepEqual(await page.evaluate(() => ({ failed: window.failure, authenticated: window.SaMiniP2P.isChannelAuthenticated(window.channel), purpose: window.peer.purpose, app: window.peer.peerApp, connected: window.session.pc.connectionState })), { failed: false, authenticated: true, purpose: 'backup', app: 'mini', connected: 'connected' }); }
    phase = 'CONSENT_DECLINE';
    await pages[1].evaluate(() => { window.acceptOffer = false; window.offerInbox.release((offer, reply) => {
      if (window.acceptOffer) {
        const core = window.SaMiniP2P, bridge = window.SaMiniP2PBackup;
        const receiver = core.createTransferReceiver({ channel: window.channel, onError: () => { window.failure = true; }, onComplete(result) { const staged = window.stageStore.stageBackup({ ...result, sourceApp: 'mini', sourcePeerId: window.peer.peerId, sourcePeerName: window.peer.displayName }); bridge.sendBackupStagedAck(window.channel, { transferId: result.transferId, sha256: result.sha256, schema: result.schema }); } });
        let finished = false;
        const handler = async event => {
          if (core.parseControl(event.data)) return;
          if (typeof event.data === 'string') { const meta = JSON.parse(event.data); if (meta.type === 'start' && !window.P2PBackupConsent.matchesOffer(offer, meta)) { window.failure = true; return; } if (meta.type === 'end') finished = true; }
          await receiver(event); if (finished) window.channel.removeEventListener('message', handler);
        };
        window.channel.addEventListener('message', handler);
      }
      reply(window.acceptOffer);
    }); });
    async function sendBackup() { return pages[0].evaluate(async () => {
      const core = window.SaMiniP2P, bridge = window.SaMiniP2PBackup;
      const payload = await bridge.createMiniBackupPayload(); window.payload = payload;
      const decision = await window.P2PBackupConsent.requestConsent(window.channel, core, { offerId: window.P2PBackupConsent.createOfferId(), schema: 'mini-backup/v1', size: payload.size, senderName: 'Synthetic Mini 1' }, { timeoutMs: 10000 });
      if (decision !== 'accepted') return { decision, sent: false };
      await bridge.sendBackupOnChannel(window.channel, { bytes: payload.bytes, schema: 'mini-backup/v1', timeoutMs: 10000 });
      return { decision, sent: true, size: payload.size, sha256: payload.sha256, expectedText: payload.json };
    }); }
    assert.deepEqual(await sendBackup(), { decision: 'declined', sent: false });
    assert.deepEqual(await pages[1].evaluate(() => ({ count: window.stageStore.getPendingCount(), unchanged: JSON.stringify(window.data) === window.beforeData })), { count: 0, unchanged: true });
    phase = 'CONSENT_ACCEPT_AND_STAGE'; await pages[1].evaluate(() => { window.acceptOffer = true; }); const sent = await sendBackup();
    assert.equal(sent.decision, 'accepted'); assert.equal(sent.sent, true);
    phase = 'EXPLICIT_REVIEW_NO_RESTORE';
    const proof = await pages[1].evaluate(expectedText => {
      const bridge = window.SaMiniP2PBackup, staged = window.stageStore.listStaged()[0]; window.openedModal = null;
      window.openModal = id => { window.openedModal = id; }; window.validateRestoreTextarea = () => { window.validationRequested = true; };
      const review = bridge.reviewStagedBackupInMini(staged);
      return { count: window.stageStore.getPendingCount(), schema: staged.schema, sourceApp: staged.sourceApp, sha256: staged.sha256, size: staged.size, exact: review.text === expectedText, textareaExact: document.getElementById('restore-backup-textarea').value === review.text, modal: window.openedModal, validationRequested: window.validationRequested, unchanged: JSON.stringify(window.data) === window.beforeData, failed: window.failure };
    }, sent.expectedText);
    assert.deepEqual(proof, { count: 1, schema: 'mini-backup/v1', sourceApp: 'mini', sha256: sent.sha256, size: sent.size, exact: true, textareaExact: true, modal: 'modal-restore-backup', validationRequested: true, unchanged: true, failed: false });
    phase = 'REPEATED_CONSENT_ACCEPT_AND_STAGE';
    for (let attempt = 0; attempt < 2; attempt++) {
      const repeated = await sendBackup();
      assert.equal(repeated.decision, 'accepted'); assert.equal(repeated.sent, true);
    }
    assert.deepEqual(await pages[1].evaluate(() => ({ count: window.stageStore.getPendingCount(), unchanged: JSON.stringify(window.data) === window.beforeData, failed: window.failure })), { count: 1, unchanged: true, failed: false });
    assert.equal(requests, 2); assert.equal(blocked, 0);
    for (const page of pages) await page.evaluate(() => { window.offerInbox.detach(); window.pairing.detach(); window.session.close(); window.privateTurnTest.dispose(); });
    console.log(JSON.stringify({ scope: 'production-module-component-fixture', independentMiniContexts: 2, sameAppBackupPairing: true, consentDeclineUnchanged: true, nativeHostBackupTransfers: 3, stagingAck: true, explicitReviewNoRestore: true, mockSignedPolicies: ['all', 'relay'], controlledMockSelectedRelay: true, externalRequests: 0, liveTurnProof: false }));
  } finally { for (const context of contexts) await context.close(); await browser?.close(); for (const dev of devs) await dev.close(); if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); } await fs.rm(temporary, { recursive: true, force: true }); }
}
if (require.main === module) void main().catch(error => { console.error('mini-backup-browser:failed:' + phase + ':' + (error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : error?.name === 'TimeoutError' ? 'TIMEOUT' : 'OPERATION'));  process.exitCode = 1; });
