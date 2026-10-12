const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const providerSource = fs.readFileSync(require.resolve('../private-turn.js'), 'utf8');
const bootstrapSource = fs.readFileSync(require.resolve('../private-turn-bootstrap.js'), 'utf8');
const contract = { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  let requests = 0, listeners = new Set(), scope = 'one', time = 1700000000000, factoryCalls = [], appNames = [];
  const auth = { currentUser: { uid: 'one', getIdToken: async () => 'synthetic-token' }, onAuthStateChanged(fn) { listeners.add(fn); fn(auth.currentUser); return () => listeners.delete(fn); } };
  const original = async options => { factoryCalls.push(options); return { pc: {}, close() {} }; };
  const root = { console, URL, Promise, Map, Set, WeakMap, AbortController, TextDecoder, setTimeout, clearTimeout,
    location: { origin: 'https://127.0.0.1:9443' }, SaMiniP2P: { createRtcSession: original },
    firebase: { app(name) { appNames.push(name); return { auth: () => auth }; } },
    fetch: async () => { requests++; return Response.json({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: time + 300000, iceServers: [{ urls: 'turn:turn.test.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] }); }, ...overrides };
  vm.runInNewContext(providerSource, root); vm.runInNewContext(bootstrapSource, root);
  const options = { enabled: true, appIdentity: 'mini', contract, getScope: () => scope, now: () => time };
  return { root, auth, options, original, install: changes => root.PrivateTurnBootstrap.install({ ...options, ...changes }),
    requests: () => requests, calls: () => factoryCalls, appNames, listeners: () => listeners.size,
    setUser(user) { auth.currentUser = user; for (const fn of [...listeners]) fn(user); }, setScope(value) { scope = value; }, advance(value) { time += value; } };
}
test('no opt-in leaves factory unchanged; guest uses exact original options', async () => {
  const f = fixture(); f.install({ enabled: false }); assert.equal(f.root.SaMiniP2P.createRtcSession, f.original); assert.equal(f.listeners(), 0);
  f.auth.currentUser = null; const handle = f.install(); const opts = { signaling: {} }; await f.root.SaMiniP2P.createRtcSession(opts);
  assert.equal(f.calls()[0], opts); assert.equal(f.requests(), 0); handle.dispose(); assert.equal(f.root.SaMiniP2P.createRtcSession, f.original);
});
test('enabled bootstrap rejects HTTP and foreign origins', () => {
  for (const origin of ['http://127.0.0.1', 'https://foreign.invalid']) assert.throws(() => fixture({ location: { origin } }).install(), /TURN_BOOTSTRAP_CONFIGURATION_INVALID/);
});
test('Mini resolves only the existing named account and supplies ordinary TURN fallback', async () => {
  const f = fixture(); const handle = f.install(); await f.root.SaMiniP2P.createRtcSession({ signaling: {} });
  assert.equal(f.calls()[0].iceTransportPolicy, 'all'); assert.ok(f.appNames.length); assert.ok(f.appNames.every(name => name === 'mini-field')); assert.equal(f.requests(), 1); handle.dispose();
});
test('SA waits for primary modular Auth once and never consults compat account', async () => {
  const f = fixture({ firebase: { app() { throw new Error('wrong SDK'); } } }); const gate = deferred(); let imports = 0;
  const handle = f.install({ appIdentity: 'sa', loadSaAuth: () => { imports++; return gate.promise; } });
  const a = f.root.SaMiniP2P.createRtcSession({}), b = f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.calls().length, 0); gate.resolve(f.auth); await Promise.all([a, b]);
  assert.equal(imports, 1); assert.equal(f.calls().length, 2); assert.equal(f.calls()[0].iceTransportPolicy, 'all'); handle.dispose();
});
test('SDK named app can appear after bootstrap without creating a new one', async () => {
  const f = fixture(); let ready = false; f.root.firebase.app = () => { if (!ready) throw new Error('not initialized'); return { auth: () => f.auth }; };
  const handle = f.install(); const guest = {}; await f.root.SaMiniP2P.createRtcSession(guest); assert.equal(f.calls()[0], guest);
  ready = true; await f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.requests(), 1); handle.dispose();
});
test('logout and new same-UID session invalidate cached credentials', async () => {
  const f = fixture(); const handle = f.install(); await f.root.SaMiniP2P.createRtcSession({});
  const previous = f.auth.currentUser; f.setUser(null); await f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.requests(), 1);
  f.setUser(previous); await f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.requests(), 2); f.advance(285001); await f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.requests(), 3); handle.dispose();
});
for (const change of ['scope', 'dispose', 'factory ownership', 'logout']) test(`cannot create RTC after ${change} changes during credentials`, async () => {
  const gate = deferred(), entered = deferred(); const f = fixture(); f.root.fetch = async () => { entered.resolve(); return gate.promise; };
  const handle = f.install(); const pending = f.root.SaMiniP2P.createRtcSession({}); const rejected = assert.rejects(pending, /TURN_(BOOTSTRAP_STALE|ACCOUNT_CHANGED)/); await entered.promise;
  if (change === 'scope') f.setScope('two'); else if (change === 'dispose') handle.dispose(); else if (change === 'factory ownership') f.root.SaMiniP2P.createRtcSession = async () => ({}); else f.setUser(null);
  gate.resolve(Response.json({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: 1700000300000, iceServers: [{ urls: 'turn:turn.test.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] }));
  await rejected; assert.equal(f.calls().length, 0); handle.dispose();
});
test('signed relay failure never falls through and dispose preserves another owner', async () => {
  const f = fixture({ fetch: async () => { throw new Error('synthetic-secret'); } }); const handle = f.install();
  await assert.rejects(f.root.SaMiniP2P.createRtcSession({}), /TURN_UNAVAILABLE/); assert.equal(f.calls().length, 0);
  const other = async () => ({}); f.root.SaMiniP2P.createRtcSession = other; handle.dispose(); assert.equal(f.root.SaMiniP2P.createRtcSession, other); assert.equal(f.listeners(), 0);
});
test('installation is owned and idempotent without duplicate listeners', async () => {
  const f = fixture(); const one = f.install(), two = f.install(); assert.equal(one, two); await f.root.SaMiniP2P.createRtcSession({}); assert.equal(f.listeners(), 1); one.dispose(); two.dispose(); assert.equal(f.listeners(), 0);
});
function statsFixture(change = () => {}) {
  const rows = new Map([['transport', { id: 'transport', type: 'transport', dtlsState: 'connected', selectedCandidatePairId: 'pair' }],
    ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' }],
    ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay', address: 'synthetic-address' }], ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'host' }]]);
  change(rows); return { connectionState: 'connected', getStats: async () => rows };
}
test('selected successful nominated relay pair is verified without returning stats', async () => {
  const f = fixture(); assert.equal(await f.root.PrivateTurnBootstrap.verifySelectedRelay(statsFixture()), true);
});
for (const [name, change] of [
  ['merely gathered', rows => { delete rows.get('transport').selectedCandidatePairId; }], ['unconnected transport', rows => { rows.get('transport').dtlsState = 'connecting'; }],
  ['failed pair', rows => { rows.get('pair').state = 'failed'; }], ['not nominated', rows => { rows.get('pair').nominated = false; }],
  ['non-selected relay', rows => { rows.get('local').candidateType = 'host'; rows.set('unused', { id: 'unused', type: 'local-candidate', candidateType: 'relay' }); }],
  ['missing candidate', rows => { rows.delete('remote'); }]
]) test(`rejects ${name} as relay proof`, async () => { const f = fixture(); assert.equal(await f.root.PrivateTurnBootstrap.verifySelectedRelay(statsFixture(change)), false); });
test('rejects stale connection state and missing stats', async () => {
  const f = fixture(); const pc = statsFixture(); pc.getStats = async () => { pc.connectionState = 'closed'; return new Map(); };
  assert.equal(await f.root.PrivateTurnBootstrap.verifySelectedRelay(pc), false); assert.equal(await f.root.PrivateTurnBootstrap.verifySelectedRelay({}), false);
});
test('report includes only booleans, bounded counters and payload hash', () => {
  const f = fixture(); const report = f.root.PrivateTurnBootstrap.sanitizeReport({ apiRequestSuccess: true, selectedRelay: false, datachannelTransfer: true, requestCount: 2, payloadCount: 2, payloadHash: 'a'.repeat(64), credential: 'synthetic-secret', address: 'synthetic-address', uid: 'synthetic-user' });
  const serialized = JSON.stringify(report); assert.doesNotMatch(serialized, /synthetic/); assert.equal(report.payloadHash, 'a'.repeat(64)); assert.equal(report.requestCount, 2);
});

test('bootstrap explicit force relay does not become ordinary signed policy',async()=>{const f=fixture();const h=f.install({forceRelay:true});await f.root.SaMiniP2P.createRtcSession({});assert.equal(f.calls()[0].iceTransportPolicy,'relay');h.dispose();});
test('configured exact private HTTPS origin is passed through to provider',async()=>{const origin='https://a2.tail2a0a8e.ts.net:8444';const f=fixture({location:{origin}});const h=f.install({allowedOrigins:[origin]});await f.root.SaMiniP2P.createRtcSession({});assert.equal(f.calls()[0].iceTransportPolicy,'all');h.dispose();});
test('remote-only relay is not forced caller local-relay proof',async()=>{const f=fixture();assert.equal(await f.root.PrivateTurnBootstrap.verifySelectedRelay(statsFixture(rows=>{rows.get('local').candidateType='host';rows.get('remote').candidateType='relay';})),false);});

const flushDiagnostics = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function diagnosticPeer(connected = true, change = () => {}) {
  const pc = statsFixture(change), events = new Map();
  pc.connectionState = connected ? 'connected' : 'new';
  pc.addEventListener = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  pc.removeEventListener = (name, fn) => events.get(name)?.delete(fn);
  pc.fire = state => { pc.connectionState = state; for (const fn of [...(events.get('connectionstatechange') || [])]) fn(); };
  pc.listenerCount = () => [...events.values()].reduce((sum, set) => sum + set.size, 0);
  return pc;
}
function diagnosticFixture(pc, changes = {}) {
  const records = []; let closed = 0;
  const session = { pc, close() { closed++; pc.fire('closed'); } };
  const f = fixture({ SaMiniP2P: { createRtcSession: async () => session }, ...changes });
  const handle = f.install({ diagnostics: true, onDiagnostic: record => records.push(record) });
  return { f, handle, records, session, closed: () => closed };
}
test('private diagnostics measure already connected session and preserve only safe scalar fields', async () => {
  const d = diagnosticFixture(diagnosticPeer());
  assert.equal(await d.f.root.SaMiniP2P.createRtcSession({}), d.session); await flushDiagnostics();
  assert.deepEqual(Object.keys(d.records.at(-1)).sort(), ['connection', 'credentials', 'relay', 'session']);
  assert.equal(d.records[0].credentials, 'requesting'); assert.equal(d.records.at(-1).credentials, 'available');
  assert.equal(d.records.at(-1).relay, 'verified'); assert.equal(d.records.at(-1).session, 1);
  assert.doesNotMatch(JSON.stringify(d.records), /synthetic|token|password|address|payload|uid/i); d.handle.dispose();
});
test('connection event verifies relay; missing stats remain unmeasured, not direct transport proof', async () => {
  const pc = diagnosticPeer(false), d = diagnosticFixture(pc); await d.f.root.SaMiniP2P.createRtcSession({});
  assert.equal(d.records.at(-1).relay, 'unmeasured'); pc.fire('connected'); await flushDiagnostics(); assert.equal(d.records.at(-1).relay, 'verified'); d.handle.dispose();
  const absent = diagnosticFixture(diagnosticPeer(true, rows => rows.delete('remote')));
  await absent.f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics(); assert.equal(absent.records.at(-1).relay, 'unmeasured'); absent.handle.dispose();
});
for (const action of ['close', 'dispose', 'account']) test(`diagnostics suppress late stats and clean listeners after ${action}`, async () => {
  const gate = deferred(), pc = diagnosticPeer(), d = diagnosticFixture(pc); pc.getStats = () => gate.promise;
  await d.f.root.SaMiniP2P.createRtcSession({}); assert.equal(pc.listenerCount(), 2);
  if (action === 'close') d.session.close(); else if (action === 'dispose') d.handle.dispose(); else d.f.setUser(null);
  const count = d.records.length; gate.resolve(await statsFixture().getStats()); await flushDiagnostics();
  assert.equal(d.records.length, count); assert.equal(pc.listenerCount(), 0); assert.equal(d.records.some(r => r.relay === 'verified'), false);
  if (action === 'close') assert.equal(d.closed(), 1); d.handle.dispose();
});
test('observer exceptions never change RTC creation; diagnostics disabled have no listeners or callbacks', async () => {
  const pc = diagnosticPeer(), f = fixture({ SaMiniP2P: { createRtcSession: async () => ({ pc, close() {} }) } });
  const handle = f.install({ diagnostics: true, onDiagnostic() { throw new Error('synthetic-secret'); } });
  await f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics(); handle.dispose();
  const ordinary = fixture({ SaMiniP2P: { createRtcSession: async () => ({ pc, close() {} }) } });
  let called = 0; const h = ordinary.install({ onDiagnostic() { called++; } }); await ordinary.root.SaMiniP2P.createRtcSession({});
  assert.equal(pc.listenerCount(), 0); assert.equal(called, 0); h.dispose();
});
test('credential errors render only fixed failure and guest remains token-free', async () => {
  const failed = diagnosticFixture(diagnosticPeer(), { fetch: async () => { throw new Error('synthetic-secret'); } });
  await assert.rejects(failed.f.root.SaMiniP2P.createRtcSession({}), /TURN_UNAVAILABLE/);
  assert.equal(failed.records.at(-1).credentials, 'failed'); assert.doesNotMatch(JSON.stringify(failed.records), /synthetic/); failed.handle.dispose();
  const guest = diagnosticFixture(diagnosticPeer()); guest.f.auth.currentUser = null;
  await guest.f.root.SaMiniP2P.createRtcSession({}); assert.equal(guest.f.requests(), 0); assert.equal(guest.records.at(-1).credentials, 'guest'); guest.handle.dispose();
});

function diagnosticDocument() {
  const elements = [];
  function createElement(tag) {
    const element = { tag, style: {}, textContent: '', children: [], attributes: {}, removed: false,
      get firstChild() { return this.children[0]; }, setAttribute(name, value) { this.attributes[name] = value; }, appendChild(child) { this.children.push(child); }, remove() { this.removed = true; } };
    elements.push(element); return element;
  }
  return { body: createElement('body'), createElement, elements };
}
test('private renderer is secret-free, history and observers bounded, disposal removes owned panel', async () => {
  const doc = diagnosticDocument(), peers = [];
  const f = fixture({ document: doc, SaMiniP2P: { createRtcSession: async () => { const pc = diagnosticPeer(); peers.push(pc); return { pc, close() { pc.fire('closed'); } }; } } });
  const h = f.install({ diagnostics: true });
  for (let i = 0; i < 12; i++) { await f.root.SaMiniP2P.createRtcSession({ credential: 'synthetic-secret' }); await flushDiagnostics(); }
  assert.equal(doc.body.children.length, 1);
  const panel = doc.body.children[0], output = panel.children[1];
  assert.equal(output.textContent.split('\n').length, 8); assert.match(output.textContent, /Sesión 12/);
  assert.match(output.textContent, /relay local: verificado durante la conexión/);
  assert.doesNotMatch(output.textContent, /synthetic|payload|candidate|token|uid|https?:/i);
  assert.equal(peers.reduce((sum, pc) => sum + pc.listenerCount(), 0), 16);
  h.dispose(); assert.equal(panel.removed, true); assert.equal(peers.reduce((sum, pc) => sum + pc.listenerCount(), 0), 0);
});
test('factory errors do not rewrite successful credential acquisition as request failure', async () => {
  const records = [], f = fixture({ SaMiniP2P: { createRtcSession: async () => { throw new Error('synthetic RTC failure'); } } });
  const h = f.install({ diagnostics: true, onDiagnostic: value => records.push(value) });
  await assert.rejects(f.root.SaMiniP2P.createRtcSession({}), /synthetic RTC failure/);
  assert.equal(records.at(-1).credentials, 'available'); assert.equal(records.at(-1).connection, 'failed'); h.dispose();
});

test('private stats retries are bounded and disposal cancels owned timers', async () => {
  const timers = new Map(); let timerId = 0, statsCalls = 0;
  const pc = diagnosticPeer(true, rows => rows.delete('transport'));
  const originalStats = pc.getStats; pc.getStats = async () => { statsCalls++; return originalStats(); };
  const d = diagnosticFixture(pc, { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  await d.f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics();
  for (let i = 0; i < 3; i++) {
    assert.equal(timers.size, 1);
    const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); await flushDiagnostics();
  }
  assert.equal(statsCalls, 4); assert.equal(timers.size, 0); assert.equal(d.records.at(-1).relay, 'unmeasured'); d.handle.dispose();
  const second = diagnosticFixture(diagnosticPeer(true, rows => rows.delete('transport')), { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  await second.f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics(); assert.equal(timers.size, 1);
  second.handle.dispose(); assert.equal(timers.size, 0);
});

test('scope change during stats suppresses proof and detaches observers', async () => {
  const gate = deferred(), pc = diagnosticPeer(), d = diagnosticFixture(pc); pc.getStats = () => gate.promise;
  await d.f.root.SaMiniP2P.createRtcSession({}); const count = d.records.length; d.f.setScope('two');
  gate.resolve(await statsFixture().getStats()); await flushDiagnostics();
  assert.equal(d.records.length, count); assert.equal(pc.listenerCount(), 0); d.handle.dispose();
});
test('disposal inside observer cannot recreate diagnostic DOM', async () => {
  const doc = diagnosticDocument(), f = fixture({ document: doc }); let handle;
  handle = f.install({ diagnostics: true, onDiagnostic() { handle.dispose(); } });
  await assert.rejects(f.root.SaMiniP2P.createRtcSession({}), /TURN_BOOTSTRAP_STALE/);
  assert.equal(doc.body.children.length, 0);
});
