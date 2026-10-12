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
  assert.deepEqual(Object.keys(d.records.at(-1)).sort(), ['connection', 'credentials', 'events', 'gathering', 'ice', 'localDescription', 'relay', 'remoteDescription', 'session', 'signaling']);
  assert.equal(d.records[0].credentials, 'requesting'); assert.equal(d.records.at(-1).credentials, 'available');
  assert.equal(d.records.at(-1).relay, 'verified'); assert.equal(d.records.at(-1).session, 1);
  assert.doesNotMatch(JSON.stringify(d.records), /synthetic|password|address|payload|uid/i); d.handle.dispose();
});
test('connection event verifies relay; missing stats remain unmeasured, not direct transport proof', async () => {
  const pc = diagnosticPeer(false), d = diagnosticFixture(pc); await d.f.root.SaMiniP2P.createRtcSession({});
  assert.equal(d.records.at(-1).relay, 'unmeasured'); pc.fire('connected'); await flushDiagnostics(); assert.equal(d.records.at(-1).relay, 'verified'); d.handle.dispose();
  const absent = diagnosticFixture(diagnosticPeer(true, rows => rows.delete('remote')));
  await absent.f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics(); assert.equal(absent.records.at(-1).relay, 'unmeasured'); absent.handle.dispose();
});
for (const action of ['close', 'dispose', 'account']) test(`diagnostics suppress late stats and clean listeners after ${action}`, async () => {
  const gate = deferred(), pc = diagnosticPeer(), d = diagnosticFixture(pc); pc.getStats = () => gate.promise;
  await d.f.root.SaMiniP2P.createRtcSession({}); assert.equal(pc.listenerCount(), 6);
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
      focus() { this.focused = true; }, select() { this.selected = true; },
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
  assert.match(panel.style.cssText, /top:calc\(env\(safe-area-inset-top/);
  assert.match(panel.style.cssText, /left:calc\(env\(safe-area-inset-left/);
  assert.match(panel.style.cssText, /z-index:2147483647/);
  assert.doesNotMatch(panel.style.cssText, /bottom:/);
  assert.equal(panel.children[0].textContent, "TURN");
  assert.match(panel.children[0].style.cssText, /min-width:44px/);
  assert.match(panel.children[0].style.cssText, /min-height:44px/);
  assert.equal(panel.children[0].attributes["aria-label"], "Abrir o cerrar diagnóstico TURN de prueba");
  assert.equal((output.textContent.match(/Sesión /g) || []).length, 8); assert.match(output.textContent, /Sesión 12/);
  assert.match(output.textContent, /relay local: verificado durante la conexión/);
  assert.doesNotMatch(output.textContent, /synthetic|payload|candidate|uid|https?:/i);
  assert.equal(peers.reduce((sum, pc) => sum + pc.listenerCount(), 0), 48);
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

test('console shows precise safe HTTP stage and bounded events without raw errors', async () => {
  const d = diagnosticFixture(diagnosticPeer(false), { fetch: async () => Response.json({ error: 'synthetic-secret' }, { status: 401 }) });
  await assert.rejects(d.f.root.SaMiniP2P.createRtcSession({}));
  const last = d.records.at(-1); assert.equal(last.events.at(-1).code, 'HTTP_ERROR');
  assert.equal(last.events.at(-1).httpStatus, 401); assert.equal(last.events.at(-1).stage, 'response');
  assert.doesNotMatch(JSON.stringify(last), /synthetic|password|address|uid/); d.handle.dispose();
});
test('console records observable ICE gathering and signaling without retaining event contents', async () => {
  const pc = diagnosticPeer(false), handlers = new Map();
  const originalAdd = pc.addEventListener; pc.addEventListener = (name, fn) => { handlers.set(name, fn); originalAdd(name, fn); };
  const d = diagnosticFixture(pc); await d.f.root.SaMiniP2P.createRtcSession({});
  pc.iceConnectionState = 'checking'; pc.iceGatheringState = 'gathering'; pc.signalingState = 'have-local-offer';
  pc.localDescription = { sdp: 'synthetic-secret' }; pc.remoteDescription = null;
  handlers.get('icegatheringstatechange')(); handlers.get('signalingstatechange')();
  handlers.get('icecandidateerror')({ errorCode: 701, url: 'synthetic-secret', errorText: 'secret' });
  for (let i = 0; i < 60; i++) handlers.get('icegatheringstatechange')();
  const last = d.records.at(-1); assert.equal(last.ice, 'checking'); assert.equal(last.gathering, 'gathering');
  assert.equal(last.signaling, 'have-local-offer'); assert.equal(last.localDescription, true); assert.equal(last.remoteDescription, false);
  assert.equal(last.events.length, 32); assert.ok(last.events.some(e => e.code === 'RTC_STATE'));
  assert.doesNotMatch(JSON.stringify(last), /synthetic|sdp|url|errorText/); d.handle.dispose(); assert.equal(pc.listenerCount(), 0);
});

function copyConsoleFixture(clipboard) {
  const doc = diagnosticDocument();
  const f = fixture({ document: doc, navigator: clipboard === undefined ? {} : { clipboard }, SaMiniP2P: { createRtcSession: async () => ({ pc: diagnosticPeer(false), close() {} }) } });
  doc.body.textContent = 'PRIVATE_ATTENDANCE_ACCOUNT_PAIRING';
  const h = f.install({ diagnostics: true });
  return { f, h, doc, button: () => doc.elements.find(element => element.tag === 'button'), output: () => doc.body.children[0].children[1] };
}
test('copy console takes a fresh sanitized snapshot including all retained sessions', async () => {
  const copies = [], c = copyConsoleFixture({ writeText: async text => copies.push(text) });
  await c.f.root.SaMiniP2P.createRtcSession({});
  const button = c.button(); assert.ok(button, 'copy button exists');
  assert.equal(button.textContent, 'Copiar diagnóstico'); assert.match(button.style.cssText, /min-height:44px/);
  await c.f.root.SaMiniP2P.createRtcSession({ credential: 'PRIVATE_SESSION_SECRET' });
  button.onclick(); await flushDiagnostics();
  assert.equal(copies.length, 1); assert.equal(copies[0], c.output().textContent);
  assert.match(copies[0], /Sesión 1/); assert.match(copies[0], /Sesión 2/);
  assert.doesNotMatch(copies[0], /PRIVATE_|synthetic-token|synthetic-password/);
  assert.ok(c.doc.elements.some(element => element.textContent === 'Diagnóstico copiado.')); c.h.dispose();
});
for (const reason of ['unavailable', 'denied']) test(`copy console provides selectable fallback when clipboard ${reason}`, async () => {
  const c = copyConsoleFixture(reason === 'unavailable' ? undefined : { writeText: async () => { throw new Error('PRIVATE_DENIAL'); } });
  await c.f.root.SaMiniP2P.createRtcSession({}); assert.ok(c.button(), 'copy button exists');
  c.button().onclick(); await flushDiagnostics();
  const fallback = c.doc.elements.find(element => element.tag === 'textarea'); assert.ok(fallback);
  assert.equal(fallback.readOnly, true); assert.equal(fallback.value, c.output().textContent);
  assert.equal(fallback.focused, true); assert.equal(fallback.selected, true);
  assert.equal(fallback.attributes['aria-label'], 'Diagnóstico TURN para copiar manualmente');
  assert.ok(c.doc.elements.some(element => element.textContent === 'Selecciona y copia el diagnóstico manualmente.'));
  c.h.dispose(); assert.equal(c.button().onclick, null);
});
test('pending clipboard completion cannot revive disposed console or accept stale clicks', async () => {
  const gate = deferred(), copies = [], c = copyConsoleFixture({ writeText: text => { copies.push(text); return gate.promise; } });
  await c.f.root.SaMiniP2P.createRtcSession({}); const button = c.button(); assert.ok(button);
  const click = button.onclick; click(); click(); assert.equal(copies.length, 1);
  c.h.dispose(); gate.resolve(); await flushDiagnostics(); click();
  assert.equal(copies.length, 1); assert.equal(button.onclick, null);
  assert.ok(!c.doc.elements.some(element => element.textContent === 'Diagnóstico copiado.'));
});

test('account invalidation suppresses pending clipboard feedback and removes handler', async () => {
  const gate = deferred(), c = copyConsoleFixture({ writeText: () => gate.promise });
  await c.f.root.SaMiniP2P.createRtcSession({}); const button = c.button();
  button.onclick(); c.f.setUser(null); gate.resolve(); await flushDiagnostics();
  assert.equal(button.onclick, null); assert.equal(c.doc.body.children[0].removed, true);
  assert.ok(!c.doc.elements.some(element => element.textContent === 'Diagnóstico copiado.')); c.h.dispose();
});

test('console and copy preserve precise contract reason without exposing response data', async () => {
  const doc = diagnosticDocument(), copies = [], f = fixture({ document: doc, navigator: { clipboard: { writeText: async value => copies.push(value) } }, fetch: async () => Response.json({ username: 'PRIVATE_USER', credential: 'PRIVATE_PASSWORD', ttl: '300', expiresAt: 1700000300000, iceServers: [] }) });
  const h = f.install({ diagnostics: true });
  await assert.rejects(f.root.SaMiniP2P.createRtcSession({}), /TURN_INVALID_RESPONSE/);
  const output = doc.body.children[0].children[1]; assert.match(output.textContent, /validation.*RESPONSE_INVALID.*TTL_INVALID/);
  assert.doesNotMatch(output.textContent, /PRIVATE_|1700000300000|iceServers/);
  doc.elements.find(e => e.tag === 'button').onclick(); await flushDiagnostics();
  assert.equal(copies[0], output.textContent); assert.equal(f.calls().length, 0); h.dispose();
});

test('diagnostics preserve callbacks and record sanitized signaling, channel and local close events', async () => {
  const pc = diagnosticPeer(false), records = [], listeners = new Set();
  const channel = diagnosticPeer(false); channel.readyState = 'connecting';
  channel.fireEvent = name => { for (const fn of [...(channel.events?.get(name) || [])]) fn(); };
  const channelListeners = new Map();
  channel.addEventListener = (name, fn) => { if (!channelListeners.has(name)) channelListeners.set(name, new Set()); channelListeners.get(name).add(fn); };
  channel.removeEventListener = (name, fn) => channelListeners.get(name)?.delete(fn);
  let captured, appCalls = 0;
  const session = { pc, channel, close() { pc.fire('closed'); } };
  const f = fixture({ SaMiniP2P: { createRtcSession: async options => { captured = options; return session; } } });
  const handle = f.install({ diagnostics: true, onDiagnostic: value => records.push(value) });
  const signaling = { onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  await f.root.SaMiniP2P.createRtcSession({ signaling, onState(status, error) { appCalls++; assert.equal(status, 'error'); assert.equal(error.message, 'secret-error'); }, onChannel(value) { appCalls++; assert.equal(value, channel); } });
  for (const fn of listeners) fn({ type: 'peer-left', reason: 'secret-room', error: 'secret-error' });
  captured.onChannel(channel); captured.onState('error', new Error('secret-error'));
  channel.readyState = 'open'; for (const fn of channelListeners.get('open') || []) fn();
  channel.readyState = 'closed'; for (const fn of channelListeners.get('close') || []) fn();
  session.close('secret-reason');
  assert.equal(appCalls, 2);
  const events = records.flatMap(value => value.events || []);
  for (const code of ['SIGNAL_PEER_LEFT', 'APP_ERROR', 'CHANNEL_OPEN', 'CHANNEL_CLOSE', 'LOCAL_CLOSE']) assert.ok(events.some(event => event.code === code), code);
  assert.doesNotMatch(JSON.stringify(records), /secret-/);
  assert.equal(listeners.size, 0);
  assert.equal([...channelListeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  handle.dispose();
});


test('diagnostic signaling subscriptions clean up pending factories on account change and rejection', async () => {
  for (const action of ['account', 'reject']) {
    const listeners = new Set(), records = []; let release;
    const f = fixture({ SaMiniP2P: { createRtcSession: () => new Promise((resolve, reject) => { release = { resolve, reject }; }) } });
    const handle = f.install({ diagnostics: true, onDiagnostic: value => records.push(value) });
    const promise = f.root.SaMiniP2P.createRtcSession({ signaling: { onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); } } });
    while (!release) await Promise.resolve();
    assert.equal(listeners.size, 1);
    if (action === 'account') {
      f.setUser(null); assert.equal(listeners.size, 0);
      release.resolve({ pc: diagnosticPeer(false), close() {} }); await promise;
    } else { release.reject(new Error('private-factory-error')); await assert.rejects(promise, /private-factory-error/); }
    assert.equal(listeners.size, 0);
    assert.doesNotMatch(JSON.stringify(records), /private-factory-error/);
    handle.dispose();
  }
});
test('application callback exceptions retain their original semantics and unknown states remain sanitized', async () => {
  let observed;
  const records = [], f = fixture({ SaMiniP2P: { createRtcSession: async options => { observed = options; return { pc: diagnosticPeer(false), close() {} }; } } });
  const handle = f.install({ diagnostics: true, onDiagnostic: value => { records.push(value); if ((value.events || []).some(event => event.code === 'APP_OTHER')) throw new Error('observer-error'); } });
  await f.root.SaMiniP2P.createRtcSession({ onState() { throw new Error('application-error'); } });
  assert.throws(() => observed.onState('__proto__', { message: 'private-error' }), /application-error/);
  assert.ok(records.at(-1).events.some(event => event.code === 'APP_OTHER'));
  assert.doesNotMatch(JSON.stringify(records), /private-error|__proto__|observer-error/);
  handle.dispose();
});


test('close diagnostic error reasons are fixed allowlisted classes, never original messages', async () => {
  let observed, forwarded = 0;
  const records = [], f = fixture({ SaMiniP2P: { createRtcSession: async options => { observed = options; return { pc: diagnosticPeer(false), close() {} }; } } });
  const handle = f.install({ diagnostics: true, onDiagnostic: value => records.push(value) });
  await f.root.SaMiniP2P.createRtcSession({ onState() { forwarded++; } });
  for (const [message, code] of [
    ['La sesión de emparejamiento expiró.', 'APP_PAIR_EXPIRED'],
    ['La conexión ICE P2P dejó de estar disponible.', 'APP_ICE_UNAVAILABLE'],
    ['La conexión P2P dejó de estar disponible.', 'APP_CONNECTION_UNAVAILABLE'],
    ['Canal de datos P2P falló.', 'APP_CHANNEL_FAILED'],
    ['El canal de datos P2P se cerró inesperadamente.', 'APP_CHANNEL_CLOSED']
  ]) {
    observed.onState('error', new Error(message));
    assert.equal(records.at(-1).events.at(-1).code, code);
    assert.ok(!JSON.stringify(records).includes(message));
  }
  observed.onState('error', { get message() { throw new Error('private-getter'); } });
  assert.equal(records.at(-1).events.at(-1).code, 'APP_ERROR'); assert.equal(forwarded, 6);
  handle.dispose();
});

test('connecting transport states are bounded and preclose snapshot contains no raw stats', async () => {
  const pc = diagnosticPeer(false);
  pc.connectionState = 'connecting'; pc.iceConnectionState = 'connected';
  pc.sctp = { state: 'connecting', transport: { state: 'connecting' } };
  let calls = 0; pc.getStats = async () => { calls++; return new Map([['secret', { type: 'transport', dtlsState: 'connecting', iceState: 'connected', address: 'secret-address' }]]); };
  const d = diagnosticFixture(pc); await d.f.root.SaMiniP2P.createRtcSession({}); await flushDiagnostics();
  for (let i = 0; i < 50; i++) pc.fire('connecting');
  assert.ok(calls <= 4); assert.ok(d.records.at(-1).events.some(e => e.code === 'TRANSPORT_STATE' && /DTLS=connecting/.test(e.rtcState)));
  pc.sctp.state = 'closed'; pc.sctp.transport.state = 'failed'; d.session.close();
  assert.ok(d.records.at(-1).events.some(e => e.code === 'TRANSPORT_STATE' && /SCTP=closed.*DTLS=failed/.test(e.rtcState)));
  assert.doesNotMatch(JSON.stringify(d.records), /secret-address/); assert.equal(d.records.at(-1).relay, 'unmeasured'); d.handle.dispose();
});

test('late connecting transport stats cannot revive closed diagnostic history', async () => {
  const pc = diagnosticPeer(false), pending = deferred();
  pc.connectionState = 'connecting'; pc.getStats = () => pending.promise;
  const d = diagnosticFixture(pc); await d.f.root.SaMiniP2P.createRtcSession({});
  d.session.close(); const count = d.records.length;
  pending.resolve(new Map([['secret', { type: 'transport', dtlsState: 'connected', iceState: 'connected' }]]));
  await flushDiagnostics(); assert.equal(d.records.length, count); assert.equal(pc.listenerCount(), 0); d.handle.dispose();
});

test('diagnostic origin label is stable per install and distinct across independent consoles', async () => {
  const consoles = [copyConsoleFixture(), copyConsoleFixture()];
  const labels = [];
  for (const c of consoles) {
    await c.f.root.SaMiniP2P.createRtcSession({});
    const first = c.output().textContent;
    assert.match(first, /^Diagnóstico TURN · app=Mini · instancia=[a-z0-9-]{1,48} · UTC=2023-11-14T22:13:20.000Z\n/);
    labels.push(first.match(/instancia=([a-z0-9-]+)/)[1]);
    await c.f.root.SaMiniP2P.createRtcSession({});
    assert.equal(c.output().textContent.match(/instancia=([a-z0-9-]+)/)[1], labels.at(-1));
  }
  assert.notEqual(labels[0], labels[1]);
  consoles.forEach(c => c.h.dispose());
});
test('copy refreshes UTC time without a new event and fallback retains exactly that snapshot', async () => {
  let captured; const c = copyConsoleFixture({ writeText: async value => { captured = value; throw new Error('denied'); } });
  await c.f.root.SaMiniP2P.createRtcSession({}); c.f.advance(1234);
  c.button().onclick(); await flushDiagnostics();
  assert.match(captured, /UTC=2023-11-14T22:13:21.234Z/);
  assert.equal(c.doc.elements.find(e => e.tag === 'textarea').value, captured);
  assert.equal(c.output().textContent, captured); c.h.dispose();
});
for (const appIdentity of ['mini', 'sa']) test(`export includes only fixed ${appIdentity} app identity and crypto bytes`, async () => {
  const doc = diagnosticDocument(), f = fixture({ document: doc, crypto: { getRandomValues(bytes) { bytes.fill(171); return bytes; } } });
  const h = f.install({ diagnostics: true, appIdentity, loadSaAuth: async () => f.auth });
  await f.root.SaMiniP2P.createRtcSession({ uid: 'PRIVATE_UID', name: 'PRIVATE_DEVICE', room: 'PRIVATE_ROOM', initiator: 'PRIVATE_ROLE' });
  const text = doc.body.children[0].children[1].textContent;
  assert.match(text, new RegExp('app=' + (appIdentity === 'mini' ? 'Mini' : 'SA') + ' · instancia=abababababab'));
  assert.doesNotMatch(text, /PRIVATE_|synthetic-|https:|turn\.test|\bone\b/); h.dispose();
});
test('throwing crypto and invalid diagnostic clock do not reject RTC or emit unsafe time text', async () => {
  const doc = diagnosticDocument(), f = fixture({ document: doc, crypto: { getRandomValues() { throw new Error('PRIVATE_CRYPTO'); } } });
  const h = f.install({ diagnostics: true, now: () => NaN }); f.auth.currentUser = null;
  await f.root.SaMiniP2P.createRtcSession({});
  const text = doc.body.children[0].children[1].textContent;
  assert.match(text, /instancia=fallback-[a-z0-9-]+ · UTC=sin medir/);
  assert.doesNotMatch(text, /PRIVATE_CRYPTO|NaN|Invalid Date/); h.dispose();
});

test('reinstall creates a new temporary console label without accessing persistence', async () => {
  const doc = diagnosticDocument(); let byte = 0;
  const f = fixture({ document: doc, crypto: { getRandomValues(bytes) { bytes.fill(++byte); return bytes; } } });
  Object.defineProperty(f.root, 'localStorage', { get() { throw new Error('PRIVATE_PERSISTENCE'); } });
  const first = f.install({ diagnostics: true }); await f.root.SaMiniP2P.createRtcSession({});
  const label = doc.body.children[0].children[1].textContent.match(/instancia=([a-z0-9-]+)/)[1];
  first.dispose();
  const second = f.install({ diagnostics: true }); await f.root.SaMiniP2P.createRtcSession({});
  assert.notEqual(doc.body.children[1].children[1].textContent.match(/instancia=([a-z0-9-]+)/)[1], label);
  second.dispose();
});

test('private lease is separate from RTC options and retires with auth ownership', async () => {
  let mono = 100;
  const f = fixture({ performance: { now: () => mono } }); const handle = f.install();
  const session = await f.root.SaMiniP2P.createRtcSession({});
  assert.equal(session.getLeaseRemainingMs(), 300000);
  assert.equal(f.calls()[0].getLeaseRemainingMs, undefined);
  assert.equal(f.calls()[0].deadline, undefined);
  mono += 5000; assert.equal(session.getLeaseRemainingMs(), 295000);
  f.setUser(null); assert.equal(session.getLeaseRemainingMs(), 0); handle.dispose();
});
test('guest proposed lease is five minutes without token acquisition', async () => {
  let mono = 100; const f = fixture({ performance: { now: () => mono } }); f.auth.currentUser = null;
  const handle = f.install(); const session = await f.root.SaMiniP2P.createRtcSession({});
  assert.equal(f.requests(), 0); assert.equal(session.getLeaseRemainingMs(), 300000);
  mono += 300000; assert.equal(session.getLeaseRemainingMs(), 0); handle.dispose();
});

test('lease metadata cannot reject a frozen legacy session', async () => {
  const frozen = Object.freeze({ pc: {}, close() {} }); const f = fixture({ SaMiniP2P: { createRtcSession: async () => frozen }, performance: { now: () => 100 } });
  const handle = f.install(); assert.equal(await f.root.SaMiniP2P.createRtcSession({}), frozen); handle.dispose();
});
test('async factory time reduces the exact configuration lease', async () => {
  let mono = 100; const f = fixture({ performance: { now: () => mono }, SaMiniP2P: { createRtcSession: async () => { mono += 20000; return { pc: {}, close() {} }; } } });
  const handle = f.install(); const session = await f.root.SaMiniP2P.createRtcSession({}); assert.equal(session.getLeaseRemainingMs(), 280000); handle.dispose();
});
