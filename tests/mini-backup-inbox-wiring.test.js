const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const ui = process.env.T3U2_BASE_UI === '1' ? require('node:child_process').execFileSync('git',['show','HEAD:p2p-roster-ui.js'],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'}) : readFileSync(require.resolve('../p2p-roster-ui.js'), 'utf8');
const between = (start, end) => ui.slice(ui.indexOf(start), ui.indexOf(end, ui.indexOf(start)));

test('passive Mini inbox is backup-only and never arms roster or attendance', () => {
  const listener = between('async function ensureMiniBackupListener', 'async function startMiniBackupInbox');
  assert.match(listener, /isMiniBackupPeer\(peer\)/);
  assert.match(listener, /allowSameApp: true/);
  assert.match(listener, /P2PBackupConsent\.bufferOffers/);
  assert.doesNotMatch(listener, /armRosterReceiver|armAttendanceResponder|armBackupReceiver/);
});

test('incoming backups are only armed after the user accepts, gated to the offer', () => {
  const prompt = between('function promptIncomingBackup', 'let miniBackupAccountWatch');
  const accept = prompt.indexOf('armBackupReceiver(');
  assert.ok(accept > prompt.indexOf('if (!accepted)'), 'receiver armed after the decline branch');
  assert.match(prompt, /expectedOffer: offer/);
  assert.match(prompt, /OFFER_DECISION_MS/);
});

test('backup receiver rejects a transfer that does not match the accepted offer', () => {
  const receiver = between('function armBackupReceiver', 'function isTransferModalOpen');
  assert.match(receiver, /P2PBackupConsent\.matchesOffer\(expectedOffer, parsed\)/);
  assert.match(receiver, /core\.revokeChannel\(channel, mismatch\)/);
});

test('consent is used with Mini peers while SA keeps the direct protocol', () => {
  const send = between('async function sendBackupToPeer', 'async function waitBackupTransfer');
  assert.match(send, /peer\.peerApp !== 'mini' \? 'accepted' : await root\.P2PBackupConsent\.requestConsent/);
  assert.match(send, /entry\.lease\.run/);
  assert.doesNotMatch(send, /stopMiniBackupListener\(peerId\)/);
  const hub = between('async function renderBackupHub', 'async function renderBackupPairing');
  assert.match(hub, /isMini \? '' : uiButton\('Esperar'/);
});

test('mini inbox starts with the passive inbox at boot and when the network returns', () => {
  assert.match(between('async function startPassiveInbox', 'function stopPeerListener'), /startMiniBackupInbox\(\)/);
  assert.match(between('function handleNetworkOnline', '\n  }\n'), /startMiniBackupInbox\(\)/);
});

test('offers are buffered from channel open and released only after authentication', () => {
  const listener = between('async function ensureMiniBackupListener', 'async function startMiniBackupInbox');
  const buffer = listener.indexOf('P2PBackupConsent.bufferOffers(channel, core)');
  const attach = listener.indexOf('pairing.attachTrusted(channel');
  assert.ok(buffer > -1 && buffer < attach, 'buffer before the trusted handshake');
  assert.ok(listener.indexOf('offers.release(') > listener.indexOf('onAuthenticated'), 'release after authentication');
  const wait = between('async function waitBackupTransfer', 'function hasOwn');
  assert.ok(wait.indexOf('bufferOffers(channel, core)') > -1 && wait.indexOf('bufferOffers(channel, core)') < wait.indexOf('pairing.attachTrusted(channel'));
});

test('the Mini inbox heals itself: modal close, foreground return and a watchdog', () => {
  assert.match(between('function closeTransferModal', '\n  }\n'), /startPassiveInbox\(\)/);
  assert.match(between('async function startPassiveInbox', 'function stopPeerListener'), /startMiniBackupInbox\(\)/);
  assert.match(ui, /addEventListener\('visibilitychange'[\s\S]{0,200}refreshMiniBackupInbox/);
  const refresh = between('function refreshMiniBackupInbox', 'async function startMiniBackupInbox');
  assert.match(refresh, /entry\.lease\?\.valid/);
  assert.doesNotMatch(refresh, /stopMiniBackupListener|ensureMiniBackupListener|MAX_AGE/);
});

test('received Mini backups are reviewed with cards, not raw JSON, and restore via the shared path', () => {
  const review = between('async function renderBackupReview', 'async function renderBackupHub');
  assert.match(review, /MiniBackupReview\.buildBackupReviewModel\(parsed, current\)/);
  assert.match(review, /rosterMetric\('users', 'Empleados'/);
  assert.match(review, /Qué cambiará en este Mini/);
  assert.match(review, /data-download-current/);
  assert.match(review, /root\.restoreMiniBackupData\(parsed, \{ stagedTransferId: transferId \}\)/);
  assert.match(review, /showConfirm\(/);
  assert.doesNotMatch(ui, /reviewStagedBackupInMini\(/, 'no entry point opens the JSON textarea anymore');
  const html = require('node:fs').readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /<script src="\.\/mini-backup-review\.js"><\/script>/);
  assert.match(require('node:fs').readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/mini-backup-review\.js'/);
});

test('completed transfer timer cannot clear or rearm a newer transfer', () => {
  const vm = require('node:vm');
  const send = between('async function sendBackupToPeer', 'async function waitBackupTransfer');
  const start = send.indexOf('const finished = activeSession;');
  const end = send.indexOf('}, 1500);', start) + '}, 1500);'.length;
  assert.ok(start >= 0 && end > start);
  const snippet = send.slice(start, end);
  for (const newer of [false, true]) {
    let callback, closed = 0, rearmed = 0;
    const owner = { close() { closed++; } }, next = {};
    const attempt = {consentController:new AbortController()};
    const context = { attempt, activeSendAttempt: attempt, activeSession: owner, activeChannel: 'old', activeManualPeerId: 'old',
      setTimeout(fn, delay) { assert.equal(delay, 1500); callback = fn; },
      startMiniBackupInbox() { rearmed++; return Promise.resolve(); } };
    vm.runInNewContext(snippet, context);
    if (newer) { context.activeSession = next; context.activeChannel = 'new'; context.activeManualPeerId = 'new'; }
    callback();
    assert.equal(closed, newer ? 0 : 1);
    assert.equal(rearmed, newer ? 0 : 1);
    assert.equal(context.activeSession, newer ? next : null);
    assert.equal(context.activeChannel, newer ? 'new' : null);
    assert.equal(context.activeManualPeerId, newer ? 'new' : null);
  }
});

test('sender setup failure rearms only its owner and never exposes provider errors', async () => {
  const vm = require('node:vm');
  const source = between('async function sendBackupToPeer', 'async function waitBackupTransfer');
  for (const stale of [false, true]) {
    let reject, entered, rearmed = 0, dismissed = 0;
    const ready = new Promise(r => { entered = r; });
    const pending = new Promise((_r, r) => { reject = r; });
    const box = { classList: { add() {} }, textContent: '', addEventListener() {} };
    const notice = { dismiss() { dismissed++; }, update(value) { box.textContent = value.description; } };
    const peer = { peerId: 'same-peer', linkToken: 'test', peerApp: 'mini' };
    const ctx = { activeSendAttempt: null, activeSession: null, activeChannel: null, activeManualPeerId: null, inFlightSendNotice: null,
      miniBackupIntents: { invalidate() {} }, cleanupSession() { ctx.activeSendAttempt = null; }, stopMiniBackupListener() {}, shell() {},
      isMiniBackupPeer: () => true, ensureMiniBackupListener: async () => ({ lease: { run() { entered(); return pending; } } }),
      identityStore: { getSelf: async () => ({ deviceId: 'test' }), getPeer: async () => peer },
      peerName: () => 'Mini', morphShell(fn) { fn(); }, body: () => ({ innerHTML: '', querySelector: () => box }),
      backButton: () => '', vectorIcon: () => '', esc: x => x, secondary: () => '', notices: () => ({ show: () => notice }),
      root: { SaMiniP2PBackup: { createMiniBackupPayload: async () => ({}) } },
      core: { validateSignalFrameObject: require('../p2p-core.js').validateSignalFrameObject, deriveTrustedRoute: async () => ({}), SignalingClient: class { close() {} }, createRtcSession() { entered(); return pending; } },
      startMiniBackupInbox() { rearmed++; return Promise.resolve(); } };
    ctx.AbortController=AbortController;
    vm.runInNewContext(source + '; this.send = sendBackupToPeer;', ctx);
    const sending = ctx.send('same-peer'); await ready;
    const newer = {}; if (stale) { ctx.activeSendAttempt = newer; ctx.activeSession = newer; ctx.activeChannel = newer; }
    reject(new Error('synthetic-secret-provider-error')); await sending;
    assert.equal(rearmed, stale ? 0 : 1); assert.equal(dismissed, stale ? 0 : 1);
    assert.equal(ctx.activeSession, stale ? newer : null); assert.equal(ctx.activeChannel, stale ? newer : null);
    assert.equal(ctx.activeManualPeerId, stale ? 'same-peer' : null);
    assert.doesNotMatch(box.textContent, /synthetic-secret/);
  }
});

function inboxHarness(overrides = {}) {
  const vm = require('node:vm');
  const timers = [], options = [], sessions = [], signals = [], handshakes = [];
  let detached = 0, released = 0, prompted = 0;
  const ctx = {
    peerSessionManager: () => require('../mini-peer-session-manager.js').create({ now: () => 0, schedule: () => ({}), cancel() {} }),
    miniBackupListeners: new Map(), MINI_BACKUP_BACKOFF_MS: [1500, 5000], activeManualPeerId: null,
    isNetworkOnline: () => true, isMiniBackupPeer: () => true,
    identityStore: { getSelf: async () => ({ deviceId: 'self' }), listPeers: async () => [inboxPeer] },
    core: { validateSignalFrameObject: require('../p2p-core.js').validateSignalFrameObject, deriveTrustedRoute: async () => ({}), SignalingClient: class {
      constructor() { this.closed = 0; this.listeners = new Set(); signals.push(this); } async connect() {} send() {} onEvent(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); } emit(event) { for (const fn of this.listeners) fn(event); } close() { this.closed++; }
    }, createRtcSession: async opts => {
      options.push(opts); const session = { closed: 0, startNegotiation: async () => {}, close() { this.closed++; opts.onState('closed'); } };
      sessions.push(session); return session;
    } },
    root: { MiniConnectionPresentation: require('../connection-presentation.js'), MiniPeerSessionManager: require('../mini-peer-session-manager.js'), MiniPeerAvailability: require('../mini-peer-availability.js'), P2PBackupConsent: { bufferOffers: () => ({ detach() { detached++; }, release(fn) { released++; fn({}, () => {}); } }) } },
    pairing: { attachTrusted(_channel, opts) { handshakes.push(opts); } },
    promptIncomingBackup() { prompted++; },
    setTimeout(fn, delay) { const timer = { fn, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cancelled = true; }
  };
  Object.assign(ctx, overrides);
  vm.runInNewContext(between('let miniBackupAccountWatch', '// A live lease') + between('async function startMiniBackupInbox', 'async function startPassiveInbox') +
    '; this.ensure = ensureMiniBackupListener; this.stop = stopMiniBackupListener; this.start = startMiniBackupInbox;', ctx);
  return { ctx, timers, options, sessions, signals, handshakes,
    counts: () => ({ detached, released, prompted }) };
}
const inboxPeer = { peerId: 'synthetic', peerApp: 'mini', purpose: 'backup', linkToken: 'synthetic' };
const settleInbox = () => new Promise(resolve => setImmediate(resolve));

test('channel failure retires RTC only; signaling errors retry availability without idle RTC', async () => {
  const h = inboxHarness(), entry = await h.ctx.ensure(inboxPeer); await entry.availability.demand();
  h.options[0].onState('failed');
  assert.equal(entry.lease, null); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry);
  assert.equal(h.signals[0].closed, 0); assert.equal(h.options.length, 1); assert.equal(h.timers.length, 0);
  await entry.availability.demand(); assert.equal(h.options.length, 2);
  h.options[0].onState('disconnected'); assert.equal(entry.session, h.sessions[1]);
  h.signals[0].emit({ type: 'socket-error' }); assert.equal(h.timers.length, 1);
  await h.timers[0].fn(); assert.equal(h.options.length, 2); assert.equal(entry.lease, null);
  const next = h.ctx.miniBackupListeners.get(inboxPeer.peerId); assert.notEqual(next, entry);
  h.signals[0].emit({ type: 'socket-error' }); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), next); assert.equal(next.retryTimer, null);
  h.ctx.stop(inboxPeer.peerId);
});

test('cancelled availability retry cannot delete or close a new same-peer listener', async () => {
  const h = inboxHarness(); await h.ctx.ensure(inboxPeer); h.signals[0].emit({ type: 'socket-error' });
  h.ctx.stop(inboxPeer.peerId); const next = await h.ctx.ensure(inboxPeer);
  await h.timers[0].fn(); await settleInbox();
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), next);
  assert.equal(h.options.length, 0); assert.equal(h.signals[1].closed, 0); h.ctx.stop(inboxPeer.peerId);
});

test('stopped receiver authentication cannot release buffered offers or accept late channels', async () => {
  const h = inboxHarness(); const old = await h.ctx.ensure(inboxPeer); await old.availability.demand();
  const channel = { closed: 0, close() { this.closed++; } };
  h.options[0].onChannel(channel); h.ctx.stop(inboxPeer.peerId);
  const next = await h.ctx.ensure(inboxPeer);
  h.handshakes[0].onAuthenticated(); h.handshakes[0].onError();
  h.options[0].onChannel(channel);
  assert.deepEqual(h.counts(), { detached: 1, released: 0, prompted: 0 });
  assert.equal(channel.closed, 1); assert.equal(h.timers.length, 0);
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), next);
});

test('stopped receiver setup does not advance self or route continuations', async () => {
  for (const stage of ['self', 'route']) {
    let resolve, entered, calls = 0;
    const pending = new Promise(r => { resolve = r; }), ready = new Promise(r => { entered = r; });
    const h = inboxHarness();
    if (stage === 'self') h.ctx.identityStore.getSelf = () => { entered(); return pending; };
    else h.ctx.core.deriveTrustedRoute = () => { entered(); return pending; };
    h.ctx.core.createRtcSession = async () => { calls++; return { close() {} }; };
    const setting = h.ctx.ensure(inboxPeer); await ready; h.ctx.stop(inboxPeer.peerId);
    resolve(stage === 'self' ? { deviceId: 'self' } : {}); await setting;
    assert.equal(calls, 0); assert.equal(h.signals.length, 0);
  }
});

test('late receiver factory closes only its own session and leaves replacement untouched', async () => {
  const h = inboxHarness(); let resolve, entered;
  const pending = new Promise(r => { resolve = r; }), ready = new Promise(r => { entered = r; });
  const normalFactory = h.ctx.core.createRtcSession;
  h.ctx.core.createRtcSession = () => { entered(); return pending; };
  const old = await h.ctx.ensure(inboxPeer); const oldSetup = old.availability.demand(); const rejected = assert.rejects(oldSetup); await ready; h.ctx.stop(inboxPeer.peerId);
  h.ctx.core.createRtcSession = normalFactory; const next = await h.ctx.ensure(inboxPeer); await next.availability.demand();
  const late = { closed: 0, close() { this.closed++; } }; resolve(late); await rejected; await settleInbox();
  assert.equal(late.closed, 1); assert.equal(h.sessions[0].closed, 0);
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), next); assert.equal(h.timers.length, 0);
});

test('retired receiver consent actions and expiry cannot arm or respond on an obsolete channel', () => {
  const vm = require('node:vm');
  for (const action of ['accept', 'expire']) {
    const peer = inboxPeer, entry = { stopped: false }, listeners = new Map([[peer.peerId, entry]]);
    let shown, expiry, armed = 0, responded = 0, dismissed = 0;
    const notice = { update() {}, dismiss() { dismissed++; } };
    const ctx = { miniBackupListeners: listeners, OFFER_DECISION_MS: 85000,
      notices: () => ({ show(opts) { shown = opts; return notice; } }), peerName: () => 'Mini', backupSizeLabel: () => '1 KB',
      armBackupReceiver() { armed++; }, receiveNoticeHooks: () => ({}),
      setTimeout(fn) { expiry = fn; return 1; }, clearTimeout() {} };
    vm.runInNewContext(between('function promptIncomingBackup', 'let miniBackupAccountWatch') + '; this.prompt = promptIncomingBackup;', ctx);
    ctx.prompt(peer, { offerId: 'synthetic', size: 1 }, () => { responded++; }, {}, entry);
    listeners.set(peer.peerId, { stopped: false }); entry.stopped = true;
    if (action === 'accept') shown.actions[1].onSelect(); else expiry();
    assert.equal(armed, 0); assert.equal(responded, 0); assert.equal(dismissed, 1);
  }
});

test('shared Mini inbox elects one initiator, authenticates once and reuses the session', async () => {
  for (const selfId of ['a', 'z']) {
    const h = inboxHarness({ identityStore: { getSelf: async () => ({ deviceId: selfId }) } });
    const entry = await h.ctx.ensure(inboxPeer);
    assert.equal(h.options.length, 0); await entry.availability.demand();
    assert.equal(h.options[0].initiator, false); assert.equal(h.options[0].demandNegotiation.localPeerId, selfId);
    const channel = { readyState: 'open', close() {} };
    h.options[0].onChannel(channel); h.handshakes[0].onAuthenticated();
    for (let i = 0; i < 6; i++) {
      const repeated = await h.ctx.ensure(inboxPeer);
      assert.equal(repeated, entry); assert.equal(repeated.session, h.sessions[0]);
      await repeated.lease.run(async value => assert.equal(value, channel));
    }
    assert.equal(h.options.length, 1); assert.equal(h.handshakes.length, 1);
    assert.equal(h.sessions[0].closed, 0); h.ctx.stop(inboxPeer.peerId);
    assert.equal(h.sessions[0].closed, 1);
  }
});

test('incoming offer cannot replace a pending notice, receiver or outgoing operation', () => {
  const vm = require('node:vm');
  for (const busy of ['incoming', 'outgoing']) {
    let replied, shown = 0;
    const entry = { busy: busy === 'incoming', lease: { busy: () => busy === 'outgoing' } };
    const ctx = { notices: () => ({ show() { shown++; } }) };
    vm.runInNewContext(between('function promptIncomingBackup', 'let miniBackupAccountWatch') + '; this.prompt = promptIncomingBackup;', ctx);
    ctx.prompt(inboxPeer, {}, value => { replied = value; }, {}, entry);
    assert.equal(replied, false); assert.equal(shown, 0);
  }
});

test('foreground refresh and modal cleanup do not retire a valid shared lease', () => {
  const vm = require('node:vm'); let checked = 0, retired = 0;
  const ctx = { isNetworkOnline: () => true, miniBackupListeners: new Map([['peer', { lease: { valid() { checked++; return true; }, retire() { retired++; } } }]]) };
  vm.runInNewContext(between('function refreshMiniBackupInbox', 'async function startMiniBackupInbox') + '; this.refresh = refreshMiniBackupInbox;', ctx);
  ctx.refresh(true); ctx.refresh(false);
  assert.equal(checked, 2); assert.equal(retired, 0);
  assert.doesNotMatch(between('function cleanupSession', 'function closeTransferModal'), /miniBackupListeners|stopMiniBackupListener|lease/);
});

test('actual sender reuses one Mini lease for six consented acknowledged sends without close', async () => {
  const vm = require('node:vm'), Manager = require('../mini-peer-session-manager.js');
  let closed = 0, consented = 0, transferred = 0;
  const channel = { readyState: 'open' }, session = { close() { closed++; } };
  const lease = Manager.create({ now: () => 0, schedule: () => ({}), cancel() {} }).lease(session, 0, () => {}, { guest: true });
  lease.ready(channel);
  const entry = { lease, busy: false }, peer = { ...inboxPeer };
  const box = { classList: { add() {}, remove() {} }, addEventListener() {} };
  const ctx = { activeSendAttempt: null, activeSession: null, activeChannel: null, activeManualPeerId: null, inFlightSendNotice: null,
    miniBackupIntents: { invalidate() {} }, cleanupSession() { ctx.activeSendAttempt = null; }, shell() {},
    identityStore: { getSelf: async () => ({ deviceId: 'self', displayName: 'Mini' }), getPeer: async () => peer },
    peerName: () => 'Mini', morphShell(fn) { fn(); }, body: () => ({ innerHTML: '', querySelector: () => box }),
    backButton: () => '', vectorIcon: () => '', esc: x => x, secondary: () => '', notices: () => null,
    isMiniBackupPeer: () => true, ensureMiniBackupListener: async () => entry,
    statusMessage: () => 'Sent', recordP2PActivity() {}, signalTerminalSuccess() {}, core: {},
    root: { P2PBackupConsent: { createOfferId: () => 'offer-' + consented, requestConsent: async value => { assert.equal(value, channel); consented++; return 'accepted'; } },
      SaMiniP2PBackup: { createMiniBackupPayload: async () => ({ size: 1, bytes: new Uint8Array([1]), sha256: 'test' }),
        sendBackupOnChannel: async value => { assert.equal(value, channel); transferred++; return { transfer: {}, ack: {} }; } } },
    backupSizeLabel: () => '1 byte', startMiniBackupInbox: async () => {} };
  ctx.AbortController=AbortController;
  vm.runInNewContext(between('async function sendBackupToPeer', 'async function waitBackupTransfer') + '; this.send = sendBackupToPeer;', ctx);
  for (let i = 0; i < 6; i++) await ctx.send(peer.peerId);
  assert.equal(consented, 6); assert.equal(transferred, 6); assert.equal(closed, 0);
  assert.equal(ctx.activeSession, null); assert.equal(entry.lease, lease);
});

test('actual inbox startup allocates zero credentials or RTC sessions', async () => {
  const h = inboxHarness(); await h.ctx.ensure(inboxPeer); assert.equal(h.options.length, 0);
});

test('actual inbox receives an offer on either ID role without membership allocating RTC', async () => {
  for (const selfId of ['a', 'z']) {
    const h = inboxHarness({ identityStore: { getSelf: async () => ({ deviceId: selfId }) } });
    const entry = await h.ctx.ensure(inboxPeer);
    h.signals[0].emit({ type: 'ready', peerCount: 2 }); assert.equal(h.options.length, 0);
    h.signals[0].emit({ type: 'signal', frame: { v: 1, type: 'offer', data: { type: 'offer', sdp: 'v=0\r\no=- 100 1 IN IP4 0.0.0.0\r\na=ice-ufrag:remote\r\n' } } });
    await settleInbox(); assert.equal(h.options.length, 1); assert.ok(entry.lease); h.ctx.stop(inboxPeer.peerId);
  }
});
test('actual account invalidation stops standby and late factory cannot recreate it', async () => {
  let authChanged, resolve, entered; const ready = new Promise(r => { entered = r; });
  const auth = { currentUser: { uid: 'one' }, onAuthStateChanged(fn) { authChanged = fn; fn(this.currentUser); return () => {}; } };
  const h = inboxHarness(); h.ctx.root.firebase = { app: () => ({ auth: () => auth }) };
  const entry = await h.ctx.ensure(inboxPeer);
  h.ctx.core.createRtcSession = () => { entered(); return new Promise(r => { resolve = r; }); };
  const pending = entry.availability.demand(); const rejected = assert.rejects(pending); await ready;
  authChanged(null); await rejected; await settleInbox(); assert.equal(h.ctx.miniBackupListeners.size, 1); assert.notEqual(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry); assert.equal(h.signals[0].closed, 1);
  let closed = 0; resolve({ close() { closed++; } }); await settleInbox(); assert.equal(closed, 1); h.ctx.stop(inboxPeer.peerId);
});
test('actual lease expiry preserves standby with zero renewal until explicit demand', async () => {
  let now = 0; const h = inboxHarness({ peerSessionManager: () => require('../mini-peer-session-manager.js').create({ now: () => now, schedule: () => ({}), cancel() {} }) });
  const entry = await h.ctx.ensure(inboxPeer); await entry.availability.demand(); now = 300000;
  assert.equal(entry.lease.valid(), false); assert.equal(entry.lease, null); assert.equal(h.signals[0].closed, 0);
  assert.equal(h.options.length, 1); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry);
  await entry.availability.demand(); assert.equal(h.options.length, 2); h.ctx.stop(inboxPeer.peerId);
});

test('old offer actions cannot arm a replacement transport in the same availability owner', () => {
  const vm = require('node:vm'); let shown, armed = 0, dismissed = 0;
  const entry = { transport: {}, stopped: false }, notice = { update() {}, dismiss() { dismissed++; } };
  const ctx = { miniBackupListeners: new Map([[inboxPeer.peerId, entry]]), OFFER_DECISION_MS: 85000,
    notices: () => ({ show(options) { shown = options; return notice; } }), peerName: () => 'Mini', backupSizeLabel: () => '1 KB',
    armBackupReceiver() { armed++; }, receiveNoticeHooks: () => ({}), setTimeout: () => ({}), clearTimeout() {} };
  vm.runInNewContext(between('function promptIncomingBackup', 'let miniBackupAccountWatch') + '; this.prompt = promptIncomingBackup;', ctx);
  ctx.prompt(inboxPeer, { offerId: 'old', size: 1 }, () => {}, {}, entry); entry.transport = {};
  shown.actions[1].onSelect(); assert.equal(armed, 0); assert.equal(dismissed, 1);
});

test('returning online restarts only failed signaling without allocating idle RTC', async () => {
  let online = true; const h = inboxHarness({ isNetworkOnline: () => online });
  const entry = await h.ctx.ensure(inboxPeer); online = false;
  h.signals[0].closed = true; h.signals[0].emit({ type: 'socket-error' }); assert.equal(h.timers.length, 0);
  online = true; await h.ctx.ensure(inboxPeer); assert.equal(h.timers.length, 1);
  await h.timers[0].fn(); assert.equal(h.options.length, 0); assert.notEqual(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry);
  h.ctx.stop(inboxPeer.peerId);
});

test('live Mini snapshot closes transport without removing link, availability or stored data', async () => {
 const h=inboxHarness();h.ctx.peerName=peer=>peer.displayName||'Alias Mini';
 const entry=await h.ctx.ensure(inboxPeer);await entry.availability.demand();
 const channel={readyState:'open',close(){}};h.options[0].onChannel(channel);h.handshakes[0].onAuthenticated();
 const vm=require('node:vm');vm.runInNewContext('this.snapshot=miniBackupConnectionSnapshot;this.retire=entry=>closeMiniBackupConnection(entry.peer.peerId);this.subscribe=subscribeMiniBackupConnections;',h.ctx);
 let changed=0;const off=h.ctx.subscribe(()=>changed++);
 assert.equal(h.ctx.snapshot()[0].authenticated,true);assert.equal(h.ctx.snapshot()[0].leaseValid,true);
 h.ctx.retire(entry);assert.equal(entry.availability.getSession(),null);assert.equal(h.signals[0].closed,0);
 assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId),entry);assert.equal(h.ctx.snapshot()[0].state,'available');assert.ok(changed);off();h.ctx.stop(inboxPeer.peerId);
});

test('actual reconnect coalesces clicks, close cancels it, and stale callbacks cannot affect a fresh lease', async () => {
 const h=inboxHarness();h.ctx.peerName=()=> 'Mini';h.ctx.identityStore.getPeer=async()=>inboxPeer;
 const vm=require('node:vm');vm.runInNewContext('this.reconnect=reconnectMiniBackupPeer;this.retire=entry=>closeMiniBackupConnection(entry.peer.peerId);',h.ctx);
 const entry=await h.ctx.ensure(inboxPeer),first=h.ctx.reconnect(inboxPeer.peerId),duplicate=h.ctx.reconnect(inboxPeer.peerId);
 await settleInbox();assert.equal(h.options.length,1);
 h.options[0].onChannel({readyState:'open',close(){}});h.handshakes[0].onAuthenticated();await Promise.all([first,duplicate]);
 assert.equal(entry.state,'connected');h.ctx.retire(entry);assert.equal(h.signals[0].closed,0);
 const second=h.ctx.reconnect(inboxPeer.peerId),rejected=assert.rejects(second);await settleInbox();assert.equal(h.options.length,2);
 h.ctx.retire(entry);const third=h.ctx.reconnect(inboxPeer.peerId);await rejected;await settleInbox();assert.equal(h.options.length,3);
 h.options[1].onState('failed');assert.equal(entry.session,h.sessions[2]);
 h.options[2].onChannel({readyState:'open',close(){}});h.handshakes.at(-1).onAuthenticated();await third;
 assert.equal(entry.state,'connected');assert.equal(h.signals[0].closed,0);h.ctx.stop(inboxPeer.peerId);
});

function reconnectHarness() {
  const h = inboxHarness();
  require('node:vm').runInNewContext('this.reconnect = reconnectMiniBackupPeer; this.closePeer = peerId => { const entry = miniBackupListeners.get(peerId); if (typeof closeMiniBackupConnection === "function") return closeMiniBackupConnection(peerId); if (entry) retireMiniBackupTransport(entry); };', h.ctx);
  h.ctx.identityStore.getPeer = async () => inboxPeer;
  return h;
}

test('close cancels reconnect during peer lookup and permits exactly one new owned connect', async () => {
  const h = reconnectHarness(); let release;
  h.ctx.identityStore.getPeer = () => new Promise(r => { release = r; });
  const old = h.ctx.reconnect(inboxPeer.peerId); const rejected = assert.rejects(old);
  h.ctx.closePeer(inboxPeer.peerId); await rejected; await settleInbox();
  assert.equal(h.options.length, 0);
  h.ctx.identityStore.getPeer = async () => inboxPeer;
  const next = h.ctx.reconnect(inboxPeer.peerId), duplicate = h.ctx.reconnect(inboxPeer.peerId);
  await settleInbox(); assert.equal(h.options.length, 1);
  h.options[0].onChannel({ readyState: 'open', close() {} }); h.handshakes[0].onAuthenticated();
  await Promise.all([next, duplicate]); release(inboxPeer); await settleInbox();
  assert.equal(h.options.length, 1); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId).state, 'connected'); h.ctx.stop(inboxPeer.peerId);
});

test('close cancels reconnect during listener acquisition without later demand', async () => {
  const h = reconnectHarness(); let release;
  h.ctx.identityStore.getSelf = () => new Promise(r => { release = r; });
  const connecting = h.ctx.reconnect(inboxPeer.peerId); const rejected = assert.rejects(Promise.race([connecting, new Promise((_, reject) => setTimeout(() => reject(new Error("test deadline")), 80))]), error => error.message !== "test deadline");
  await settleInbox(); h.ctx.closePeer(inboxPeer.peerId); release({ deviceId: 'self' }); await settleInbox();
  assert.equal(h.options.length, 0); await rejected; assert.equal(h.signals[0].closed, 0); h.ctx.stop(inboxPeer.peerId);
});

for (const wake of ['send', 'incoming']) test(`delayed reconnect cannot retire transport acquired by ${wake}`, async () => {
  const h = reconnectHarness(), entry = await h.ctx.ensure(inboxPeer); let release;
  h.ctx.identityStore.getPeer = () => new Promise(r => { release = r; });
  const connecting = h.ctx.reconnect(inboxPeer.peerId); const rejected = assert.rejects(Promise.race([connecting, new Promise((_, reject) => setTimeout(() => reject(new Error("test deadline")), 80))]), error => error.message !== "test deadline");
  if (wake === 'send') {
    const box = { classList: { add() {}, remove() {} }, addEventListener() {} };
    Object.assign(h.ctx, { activeSendAttempt: null, activeSession: null, activeChannel: null, activeManualPeerId: null, inFlightSendNotice: null,
      cleanupSession() { h.ctx.activeSendAttempt = null; }, shell() {}, peerName: () => 'Mini', morphShell(fn) { fn(); },
      body: () => ({ innerHTML: '', querySelector: () => box }), backButton: () => '', vectorIcon: () => '', esc: x => x, secondary: () => '', notices: () => null,
      statusMessage: () => 'Sent', recordP2PActivity() {}, signalTerminalSuccess() {}, backupSizeLabel: () => '1 byte', startMiniBackupInbox: async () => {} });
    h.ctx.root.SaMiniP2PBackup = { createMiniBackupPayload: async () => ({ size: 1, bytes: new Uint8Array([1]), sha256: 'test' }), sendBackupOnChannel: async () => ({ transfer: {}, ack: {} }) };
    h.ctx.root.P2PBackupConsent.createOfferId = () => 'synthetic'; h.ctx.root.P2PBackupConsent.requestConsent = async () => 'accepted';
    h.ctx.identityStore.getPeer = async () => inboxPeer;
    h.ctx.AbortController=AbortController;
    require('node:vm').runInNewContext(between('async function sendBackupToPeer', 'async function waitBackupTransfer') + '; this.send = sendBackupToPeer;', h.ctx);
    const sending = h.ctx.send(inboxPeer.peerId); await settleInbox();
    assert.equal(h.options.length, 1); h.options[0].onChannel({ readyState: 'open', close() {} }); h.handshakes[0].onAuthenticated(); await sending;
  }
  else { h.signals[0].emit({ type: 'signal', frame: { v: 1, type: 'offer', data: { type: 'offer', sdp: 'v=0\r\no=- 123 1 IN IP4 0.0.0.0\r\na=ice-ufrag:synthetic\r\n' } } }); await settleInbox(); }
  // The real availability owner is exercised, not a substitute transport counter.
  assert.equal(h.options.length, 1); const owned = entry.session;
  release(inboxPeer); await settleInbox(); await rejected;
  assert.equal(entry.session, owned); assert.equal(owned.closed, 0); h.ctx.stop(inboxPeer.peerId);
});

test('reconnect refuses a busy transfer without retiring its transport', async () => {
  const h = reconnectHarness(), entry = await h.ctx.ensure(inboxPeer); await entry.availability.demand();
  const owned = entry.session; entry.busy = true;
  await assert.rejects(Promise.race([h.ctx.reconnect(inboxPeer.peerId), new Promise((_, reject) => setTimeout(() => reject(new Error("test deadline")), 80))]), error => error.message !== "test deadline"); assert.equal(owned.closed, 0); assert.equal(entry.session, owned); h.ctx.stop(inboxPeer.peerId);
});

test('unlink invalidates a lookup intent even when the peer has no listener', async () => {
  const h = reconnectHarness(); let release;
  h.ctx.identityStore.getPeer = () => new Promise(r => { release = r; });
  const connecting = h.ctx.reconnect(inboxPeer.peerId); const rejected = assert.rejects(connecting);
  assert.equal(h.ctx.stop(inboxPeer.peerId), false); await rejected;
  release(inboxPeer); await settleInbox(); assert.equal(h.options.length, 0); assert.equal(h.ctx.miniBackupListeners.size, 0);
});

test('a stopped old owner cannot cancel a replacement acquisition intent', async () => {
  const h = reconnectHarness(), old = await h.ctx.ensure(inboxPeer); h.ctx.stop(inboxPeer.peerId);
  const replacement = await h.ctx.ensure(inboxPeer); const connecting = h.ctx.reconnect(inboxPeer.peerId);
  assert.equal(h.ctx.stop(inboxPeer.peerId, old), false); await settleInbox(); assert.equal(h.options.length, 1);
  h.options[0].onChannel({ readyState: 'open', close() {} }); h.handshakes[0].onAuthenticated(); await connecting;
  assert.equal(replacement.state, 'connected'); h.ctx.stop(inboxPeer.peerId);
});

test('account logout cancels a pending lookup before any listener exists', async () => {
  const h = reconnectHarness(); let release, accountChanged;
  h.ctx.root.firebase = { app: () => ({ auth: () => ({ currentUser: { uid: 'synthetic' }, onAuthStateChanged(fn) { accountChanged = fn; fn({ uid: 'synthetic' }); return () => {}; } }) }) };
  h.ctx.identityStore.getPeer = () => new Promise(r => { release = r; });
  const connecting = h.ctx.reconnect(inboxPeer.peerId); const rejected = assert.rejects(connecting);
  assert.equal(typeof accountChanged, 'function'); accountChanged(null); await rejected;
  release(inboxPeer); await settleInbox(); assert.equal(h.options.length, 0); assert.equal(h.ctx.miniBackupListeners.size, 1); h.ctx.stop(inboxPeer.peerId);
});

for (const delayed of ['lookup', 'factory']) test(`manual reconnect revokes an armed retry before delayed ${delayed} and ignores its queued callback`, async () => {
  const h = reconnectHarness(), entry = await h.ctx.ensure(inboxPeer);
  h.signals[0].emit({ type: 'socket-error' }); const automatic = h.timers[0]; assert.equal(entry.retryTimer, automatic);
  let resumeLookup, resumeFactory, factoryOptions;
  if (delayed === 'lookup') h.ctx.identityStore.getPeer = () => new Promise(resolve => { resumeLookup = resolve; });
  h.ctx.core.createRtcSession = options => { factoryOptions = options; return new Promise(resolve => { resumeFactory = resolve; }); };
  const connecting = h.ctx.reconnect(inboxPeer.peerId), duplicate = h.ctx.reconnect(inboxPeer.peerId);
  assert.equal(connecting, duplicate);
  const outcome = connecting.then(() => 'connected', () => 'cancelled');
  await settleInbox(); await automatic.fn();
  if (resumeLookup) resumeLookup(inboxPeer); await settleInbox();
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry, 'queued old retry must not replace manually acquired listener');
  assert.equal(h.signals[0].closed, 0); assert.equal(automatic.cancelled, true); assert.equal(entry.retryTimer, null);
  assert.ok(resumeFactory, 'manual demand reaches its owned factory');
  resumeFactory({ startNegotiation: async () => {}, close() {} }); await settleInbox();
  factoryOptions.onChannel({ readyState: 'open', close() {} }); h.handshakes[0].onAuthenticated();
  assert.equal(await outcome, 'connected'); h.ctx.stop(inboxPeer.peerId);
});

test('manual failure returns automatic availability recovery to a fresh bounded retry owner', async () => {
 for (const stage of ['lookup', 'factory']) {
  const h = reconnectHarness(), entry = await h.ctx.ensure(inboxPeer);
  h.signals[0].emit({ type: 'socket-error' }); const oldTimer = h.timers[0];
  if(stage === 'lookup') h.ctx.identityStore.getPeer = async () => { throw new Error('synthetic lookup failure'); };
  else h.ctx.core.createRtcSession = async () => { throw new Error('synthetic factory failure'); };
  await assert.rejects(h.ctx.reconnect(inboxPeer.peerId));
  assert.equal(oldTimer.cancelled, true); assert.notEqual(entry.retryTimer, oldTimer);
  const recovery = entry.retryTimer; assert.ok(recovery); assert.equal(recovery.delay, 1500);
  await oldTimer.fn(); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry); assert.equal(h.signals[0].closed, 0);
  await recovery.fn(); const replacement = h.ctx.miniBackupListeners.get(inboxPeer.peerId);
  assert.notEqual(replacement, entry); assert.equal(h.signals[0].closed, 1); assert.equal(h.options.length, 0); h.ctx.stop(inboxPeer.peerId);
 }
});

test('manual reconnect cancels closed-socket setup rearming without disabling later socket failure recovery', async () => {
 const h = reconnectHarness(), entry = await h.ctx.ensure(inboxPeer);
 h.signals[0].emit({ type: 'socket-error' }); const oldTimer = h.timers[0]; h.signals[0].closed = true;
 const connecting = h.ctx.reconnect(inboxPeer.peerId); const outcome = connecting.then(() => 'connected', () => 'cancelled');
 await settleInbox(); const setupTimer = h.timers[1]; assert.ok(setupTimer);
 assert.equal(oldTimer.cancelled, true); assert.equal(setupTimer.cancelled, true); assert.equal(entry.retryTimer, null);
 await oldTimer.fn(); await setupTimer.fn(); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), entry);
 h.options[0].onChannel({readyState:'open',close(){}}); h.handshakes[0].onAuthenticated(); assert.equal(await outcome,'connected');
 h.signals[0].closed = false; h.signals[0].emit({type:'socket-error'}); assert.ok(entry.retryTimer); assert.notEqual(entry.retryTimer,setupTimer);
 await entry.retryTimer.fn(); assert.notEqual(h.ctx.miniBackupListeners.get(inboxPeer.peerId),entry); h.ctx.stop(inboxPeer.peerId);
});

test('armed retry cannot stop manual acquisition while shared signaling setup is suspended', async () => {
 const h = reconnectHarness(); let release;
 const Base = h.ctx.core.SignalingClient;
 h.ctx.core.SignalingClient = class extends Base { connect() { return new Promise(resolve => { release = resolve; }); } };
 const setup = h.ctx.ensure(inboxPeer); await settleInbox(); const entry = h.ctx.miniBackupListeners.get(inboxPeer.peerId);
 h.signals[0].emit({type:'socket-error'}); const automatic = entry.retryTimer;
 const connecting = h.ctx.reconnect(inboxPeer.peerId), outcome = connecting.then(()=>'connected',()=>'cancelled');
 await settleInbox(); await automatic.fn(); assert.equal(entry.stopped,false); assert.equal(h.signals[0].closed,0); assert.equal(automatic.cancelled,true);
 release(); await setup; await settleInbox(); assert.equal(h.options.length,1);
 h.options[0].onChannel({readyState:'open',close(){}}); h.handshakes[0].onAuthenticated(); assert.equal(await outcome,'connected'); h.ctx.stop(inboxPeer.peerId);
});

function accountInboxHarness(initial = null) {
 const h = inboxHarness(); let changed;
 const auth = { currentUser: initial, onAuthStateChanged(fn) { changed = fn; return () => { changed = null; }; } };
 h.ctx.root.firebase = { app: () => ({ auth: () => auth }) };
 return { ...h, auth, change(user) { auth.currentUser = user; changed?.(user); } };
}
const authenticatedOffer = { type:'signal', frame:{v:1,type:'offer',data:{type:'offer',sdp:'v=0\r\no=- 300 1 IN IP4 0.0.0.0\r\na=ice-ufrag:restored\r\n'}} };

test('persisted auth hydration rearms current credential-free receiver on attendance without opening a menu', async () => {
 const h = accountInboxHarness(); await h.ctx.start(); await settleInbox(); const old = h.ctx.miniBackupListeners.get(inboxPeer.peerId);
 assert.ok(old); assert.equal(h.options.length,0); h.change({uid:'restored'}); await settleInbox();
 const current = h.ctx.miniBackupListeners.get(inboxPeer.peerId); assert.ok(current,'auth hydration must prepare new standby without menu/focus'); assert.notEqual(current,old);
 assert.equal(old.stopped,true); assert.equal(h.signals[0].closed,1); assert.equal(h.options.length,0);
 h.signals.at(-1).emit(authenticatedOffer); await settleInbox(); assert.equal(h.options.length,1); assert.ok(current.lease); h.ctx.stop(inboxPeer.peerId);
});

test('rapid account changes retire old owners and ignore older delayed peer listings', async () => {
 const h = accountInboxHarness({uid:'A'}); await h.ctx.start(); await settleInbox(); let releaseB;
 h.ctx.identityStore.listPeers = () => new Promise(r=>{releaseB=r;}); h.change({uid:'B'}); await settleInbox();
 h.ctx.identityStore.listPeers = async()=>[inboxPeer]; h.change({uid:'C'}); await settleInbox();
 const current = h.ctx.miniBackupListeners.get(inboxPeer.peerId); assert.ok(current); const count=h.signals.length;
 releaseB([inboxPeer]); await settleInbox(); assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId),current); assert.equal(h.signals.length,count); assert.equal(h.options.length,0);
 h.change(null); await settleInbox(); const guest=h.ctx.miniBackupListeners.get(inboxPeer.peerId); assert.ok(guest); assert.notEqual(guest,current); h.ctx.stop(inboxPeer.peerId);
});

for(const invalidation of ['stop','shutdown']) test(`delayed account peer listing cannot resurrect receivers after ${invalidation}`,async()=>{
 const h=accountInboxHarness();await h.ctx.start();await settleInbox();let release;
 h.ctx.identityStore.listPeers=()=>new Promise(r=>{release=r;});h.change({uid:'restored'});await settleInbox();
 if(invalidation==='stop')h.ctx.stop(inboxPeer.peerId);
 else require('node:vm').runInNewContext('stopAllMiniBackupListeners();',h.ctx);
 release([inboxPeer]);await settleInbox();assert.equal(h.ctx.miniBackupListeners.size,0);assert.equal(h.options.length,0);
 if(invalidation==='shutdown'){h.change({uid:'later'});await settleInbox();assert.equal(h.ctx.miniBackupListeners.size,0);}
});

test('older auth setup continuation cannot replace or stop newest account standby',async()=>{
 const h=accountInboxHarness({uid:'A'});await h.ctx.start();await settleInbox();let release;
 h.ctx.identityStore.getSelf=()=>new Promise(r=>{release=r;});h.change({uid:'B'});await settleInbox();const old=h.ctx.miniBackupListeners.get(inboxPeer.peerId);
 h.ctx.identityStore.getSelf=async()=>({deviceId:'self'});h.change({uid:'C'});await settleInbox();const current=h.ctx.miniBackupListeners.get(inboxPeer.peerId);
 release({deviceId:'self'});await settleInbox();assert.notEqual(old,current);assert.equal(old.stopped,true);assert.equal(current.stopped,false);assert.equal(h.signals.at(-1).closed,0);assert.equal(h.options.length,0);h.ctx.stop(inboxPeer.peerId);
});

function preparationHarness() {
  const vm = require('node:vm'), fs = require('node:fs');
  const deadlines = [], context = { module: { exports: {} }, setTimeout(fn) { const timer = { fn, cancelled: false }; deadlines.push(timer); return timer; }, clearTimeout(timer) { timer.cancelled = true; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../mini-peer-availability.js'), 'utf8'), context);
  const h = inboxHarness(); h.ctx.root.MiniPeerAvailability = context.module.exports;
  return { h, deadlines };
}
test('preparation expiry after channel open clears entry and rejects readiness without trusted auth', async () => {
  const { h, deadlines } = preparationHarness(), entry = await h.ctx.ensure(inboxPeer);
  await entry.availability.demand();
  h.options[0].onChannel({ readyState: 'open', close() {} });
  const pending = entry.lease.run(async () => 'should not send');
  const rejected = assert.rejects(pending);
  assert.equal(deadlines[0].cancelled, false, 'channel/factory are not trusted readiness');
  deadlines[0].fn(); await rejected;
  assert.equal(entry.session, null); assert.equal(entry.lease, null); assert.equal(h.signals[0].closed, 0);
  assert.equal(h.counts().released, 0); h.ctx.stop(inboxPeer.peerId);
});
test('trusted readiness clears preparation deadline but queued old deadline and auth cannot alter replacement', async () => {
  const { h, deadlines } = preparationHarness(), entry = await h.ctx.ensure(inboxPeer);
  await entry.availability.demand(); h.options[0].onChannel({ readyState: 'open', close() {} });
  h.handshakes[0].onAuthenticated(); assert.equal(deadlines[0].cancelled, true); assert.equal(entry.authenticated, true);
  entry.availability.retire(); await entry.availability.demand();
  const current = entry.session; deadlines[0].fn(); h.handshakes[0].onAuthenticated();
  assert.equal(entry.session, current); assert.equal(entry.authenticated, false); assert.equal(h.sessions[1].closed, 0);
  h.ctx.stop(inboxPeer.peerId);
});

test('production snapshots expose only safe owned observations and distinguish manual close from stale transport events', async () => {
 const h=inboxHarness();h.ctx.peerName=()=> 'Mini';const entry=await h.ctx.ensure(inboxPeer);const vm=require('node:vm');vm.runInNewContext('this.snapshot=miniBackupConnectionSnapshot;this.close=closeMiniBackupConnection;',h.ctx);
 await entry.availability.demand();try {
 let snapshot=h.ctx.snapshot()[0];assert.equal(snapshot.phase,'preparing');assert.ok(snapshot.preparationRemainingMs>0);assert.equal(snapshot.linkFingerprint,null);
 h.options[0].onChannel({readyState:'open',close(){}});assert.equal(h.ctx.snapshot()[0].phase,'authenticating');h.handshakes[0].onAuthenticated();assert.equal(h.ctx.snapshot()[0].phase,'ready');assert.equal(h.ctx.snapshot()[0].channelRemainingMs,300000);
 h.ctx.close(inboxPeer.peerId);snapshot=h.ctx.snapshot()[0];assert.equal(snapshot.lastCloseReason,'manual');assert.equal(snapshot.channelRemainingMs,null);assert.equal(snapshot.phase,'standby');
 await entry.availability.demand();h.options[0].onState('failed');assert.equal(h.ctx.snapshot()[0].lastCloseReason,'manual','stale transport must not relabel current details');h.options[1].onState('failed');assert.equal(h.ctx.snapshot()[0].lastCloseReason,'transport-error');
 assert.doesNotMatch(JSON.stringify(h.ctx.snapshot()),/linkToken|room|proof|sdp|credential/);
 }finally{h.ctx.stop(inboxPeer.peerId);}
});
test('fingerprint completion cannot publish into a stopped account or changed link owner', async () => {
 const h=inboxHarness();h.ctx.peerName=()=> 'Mini';const pending=[];h.ctx.root.MiniConnectionPresentation={...require('../connection-presentation.js'),createLinkFingerprint:()=>new Promise(resolve=>pending.push(resolve))};
 const first=await h.ctx.ensure(inboxPeer);try {assert.equal(pending.length,1);h.ctx.stop(inboxPeer.peerId);const second=await h.ctx.ensure(inboxPeer);pending[0]('012345-abcdef-012345-abcdef');await settleInbox();assert.equal(first.linkFingerprint,null);assert.equal(second.linkFingerprint,null);
 pending[1]('abcdef-012345-abcdef-012345');await settleInbox();assert.equal(second.linkFingerprint,'abcdef-012345-abcdef-012345');}finally{h.ctx.stop(inboxPeer.peerId);}
});

test('idle snapshot has no fabricated close and socket loss is classified without idle RTC', async () => {
 const h=inboxHarness();h.ctx.peerName=()=> 'Mini';const vm=require('node:vm');vm.runInNewContext('this.snapshot=miniBackupConnectionSnapshot;',h.ctx);await h.ctx.ensure(inboxPeer);
 try {assert.equal(h.ctx.snapshot()[0].lastCloseReason,null);assert.equal(h.ctx.snapshot()[0].phase,'standby');h.signals[0].emit({type:'socket-closed'});assert.equal(h.ctx.snapshot()[0].lastCloseReason,'signaling-loss');assert.equal(h.options.length,0);}finally{h.ctx.stop(inboxPeer.peerId);}
});
test('changed link and account transition suppress late display fingerprints', async () => {
 for(const change of ['link','account']){
 const h=inboxHarness();const peer={...inboxPeer};let resolve,authCallback;h.ctx.root.MiniConnectionPresentation={...require('../connection-presentation.js'),createLinkFingerprint:()=>new Promise(r=>{resolve=r;})};
 h.ctx.root.firebase={app:()=>({auth:()=>({currentUser:{uid:'A'},onAuthStateChanged(fn){authCallback=fn;return ()=>{};}})})};
 const entry=await h.ctx.ensure(peer);try {if(change==='link')peer.linkToken='replaced-token';else authCallback({uid:'B'});resolve('012345-abcdef-012345-abcdef');await settleInbox();assert.equal(entry.linkFingerprint,null);}finally{h.ctx.stop(inboxPeer.peerId);}
 }
});
test('actual lease expiry classification reaches the owned card and reads the existing deadline', async () => {
 let now=0;const manager=require('../mini-peer-session-manager.js').create({now:()=>now,schedule:()=>({}),cancel(){}});
 const h=inboxHarness({peerSessionManager:()=>manager});h.ctx.peerName=()=> 'Mini';const vm=require('node:vm');vm.runInNewContext('this.snapshot=miniBackupConnectionSnapshot;',h.ctx);const entry=await h.ctx.ensure(inboxPeer);await entry.availability.demand();
 try {h.options[0].onChannel({readyState:'open',close(){}});h.handshakes[0].onAuthenticated();now=60000;assert.equal(h.ctx.snapshot()[0].channelRemainingMs,240000);now=300000;assert.equal(h.ctx.snapshot()[0].lastCloseReason,'lease-expired');assert.equal(h.ctx.snapshot()[0].channelRemainingMs,null);}finally{h.ctx.stop(inboxPeer.peerId);}
});

test('a published fingerprint becomes unknown after link replacement and never requires standby setup to wait', async () => {
 const h=inboxHarness();h.ctx.peerName=()=> 'Mini';const peer={...inboxPeer};let resolve;
 h.ctx.root.MiniConnectionPresentation={...require('../connection-presentation.js'),createLinkFingerprint:()=>new Promise(r=>{resolve=r;})};
 const vm=require('node:vm');vm.runInNewContext('this.snapshot=miniBackupConnectionSnapshot;',h.ctx);const entry=await h.ctx.ensure(peer);
 try {assert.ok(entry.availability,'standby must not await display digest');resolve('012345-abcdef-012345-abcdef');await settleInbox();assert.equal(h.ctx.snapshot()[0].linkFingerprint,'012345-abcdef-012345-abcdef');peer.linkToken='new-token';assert.equal(h.ctx.snapshot()[0].linkFingerprint,null);}finally{h.ctx.stop(inboxPeer.peerId);}
});

function acceptedReceiverHarness() {
 const vm=require('node:vm'),Core=require('../p2p-core.js'),timers=[],updates=[],responses=[],events=new Map();let now=0;
 const channel={readyState:'open',addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},removeEventListener(type,fn){events.get(type)?.delete(fn);},close(){this.readyState='closed';this.closed=(this.closed||0)+1;},send(){}};
 Core.markChannelAuthenticated(channel);
 const schedule=(fn,delay)=>{const timer={fn,delay,due:now+delay,cancelled:false};timers.push(timer);return timer;},cancel=timer=>{if(timer)timer.cancelled=true;};
 const consentContext={module:{exports:{}},setTimeout:schedule,clearTimeout:cancel,setInterval:schedule,clearInterval:cancel};vm.runInNewContext(readFileSync(require.resolve('../p2p-backup-consent.js'),'utf8'),consentContext);
 const entry={transport:{},stopped:false,busy:false,retryTimer:null,detachReceiver:null};const peer={...inboxPeer};let stageOptions,noticeOptions,stageResolve;const stageReady=new Promise(resolve=>{stageResolve=resolve;});
 const ctx={root:{P2PBackupConsent:consentContext.module.exports},core:{...Core,validateTransferStart:value=>Core.validateTransferStart(JSON.parse(JSON.stringify(value)))},activeTransferPeerId:null,refreshMiniP2PHeader:async()=>{},body:()=>null,renderError(){},boundedUserSafeError:()=> 'Validación fallida',miniBackupListeners:new Map([[peer.peerId,entry]]),OFFER_DECISION_MS:85000,
 notices:()=>({show(options){noticeOptions=options;return {update(value){updates.push(value);},dismiss(){}};}}),peerName:()=> 'Mini',backupSizeLabel:()=> '2 bytes',receiveNoticeHooks:()=>({onProgress(){},onStaged(){updates.push({title:'staged'});},onFailed(reason){updates.push({title:'Respaldo no recibido',description:reason});}}),setTimeout:schedule,clearTimeout:cancel,
 stageReceivedBackup(_result,_peer,_channel,options){stageOptions=options;stageResolve();}};
 vm.runInNewContext(between('const backupReceiverCleanups','function isTransferModalOpen')+between('function promptIncomingBackup','let miniBackupAccountWatch')+';this.prompt=promptIncomingBackup;',ctx);
 function accept(){ctx.prompt(peer,{offerId:'accepted-test',schema:'mini-backup/v1',size:2,senderName:'Mini'},value=>responses.push(value),channel,entry);noticeOptions.actions[1].onSelect();}
 return {ctx,entry,peer,channel,timers,updates,responses,accept,advance(ms){now+=ms;for(const timer of [...timers])if(!timer.cancelled&&timer.due<=now){timer.cancelled=true;timer.fn();}},emit(type,data){for(const fn of [...events.get(type)||[]])fn({data});},stage:()=>stageOptions,async waitForStage(){let timeout;try{await Promise.race([stageReady,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('stage callback missing')),1000);})]);}finally{clearTimeout(timeout);}},events};
}
test('accepted receiver without START settles owned 20s guard without closing shared transport or replying twice',()=>{
 const h=acceptedReceiverHarness();h.accept();const timeout=h.timers.find(timer=>timer.delay===20000);
 try{h.advance(20000);assert.equal(h.entry.busy,false,'accepted receiver must release busy when no data starts for20s');assert.ok(timeout);assert.equal(h.entry.detachReceiver,null);assert.deepEqual(h.responses,[true]);assert.equal(h.channel.readyState,'open');assert.equal(h.channel.closed||0,0);assert.equal(h.events.get('message').size,0);assert.equal(h.updates.at(-1).title,'Respaldo no recibido');timeout.fn();assert.equal(h.updates.filter(v=>v.title==='Respaldo no recibido').length,1);}
 finally{h.entry.detachReceiver?.();}
});
for(const terminal of ['close','error','detach'])test('accepted receiver cleans up before START on '+terminal,()=>{
 const h=acceptedReceiverHarness();h.accept();const timeout=h.timers.find(timer=>timer.delay===20000);
 try{if(terminal==='detach')h.entry.detachReceiver();else h.emit(terminal);assert.ok(timeout);assert.equal(timeout.cancelled,true);const before=h.updates.length;timeout.fn();assert.equal(h.updates.length,before);assert.equal(h.entry.busy,false);assert.equal(h.entry.detachReceiver,null);assert.equal(h.channel.closed||0,0);}
 finally{h.entry.detachReceiver?.();}
});
test('a cancelled old guard cannot clear a replacement receiver, busy state or notice',()=>{
 const h=acceptedReceiverHarness();h.accept();const old=h.timers.find(timer=>timer.delay===20000);h.entry.detachReceiver();h.entry.busy=false;h.accept();const replacement=h.entry.detachReceiver,before=h.updates.length;
 try{assert.ok(old);old.fn();assert.equal(h.entry.busy,true);assert.equal(h.entry.detachReceiver,replacement);assert.equal(h.updates.length,before);}finally{h.entry.detachReceiver?.();}
});
test('matching validated START cancels pre-start timer despite delayed chunks and asynchronous staging',async()=>{
 const h=acceptedReceiverHarness(),Core=require('../p2p-core.js'),frames=[];const sender={readyState:'open',bufferedAmount:0,send(frame){frames.push(frame);},addEventListener(){},removeEventListener(){}};Core.markChannelAuthenticated(sender);await Core.sendPayload(sender,{kind:'backup',schema:'mini-backup/v1',bytes:new Uint8Array([1,2])});h.accept();const timeout=h.timers.find(timer=>timer.delay===20000);
 try{h.emit('message',frames[0]);assert.ok(timeout);assert.equal(timeout.cancelled,true);timeout.fn();assert.equal(h.entry.busy,true);assert.equal(h.channel.readyState,'open');h.emit('message',frames[1]);h.emit('message',frames[2]);await h.waitForStage();assert.ok(h.stage());assert.equal(h.entry.busy,true,'completion detach must not release busy during staging');timeout.fn();assert.equal(h.entry.busy,true);h.stage().onStaged({transferId:'test'});assert.equal(h.entry.busy,false);}
 finally{h.entry.detachReceiver?.();}
});
for(const malformed of [true,false])test('malformed or mismatched START cannot be treated as a valid guard start: '+malformed,async()=>{
 const h=acceptedReceiverHarness(),Core=require('../p2p-core.js');h.accept();const timeout=h.timers.find(timer=>timer.delay===20000);
 try{h.emit('message',JSON.stringify({protocol:Core.TRANSFER_PROTOCOL,type:'start',transferId:'123e4567-e89b-12d3-a456-426614174000',kind:'backup',schema:'mini-backup/v1',size:malformed?2:3,chunkSize:malformed?1:Core.CHUNK_SIZE,totalChunks:1,sha256:'a'.repeat(64)}));await settleInbox();assert.equal(h.channel.readyState,'closed');assert.equal(h.entry.busy,false);assert.equal(h.stage(),undefined);assert.ok(timeout);const count=h.updates.length;timeout.fn();assert.equal(h.updates.length,count);}finally{h.entry.detachReceiver?.();}
});


test('production cleanup promptly abandons sender consent while stale cancel/finally cannot touch a newer send',async()=>{
 const vm=require('node:vm'),Core=require('../p2p-core.js'),Consent=require('../p2p-backup-consent.js'),Manager=require('../mini-peer-session-manager.js');
 const listeners=new Set(),sent=[],notices=[],buttons=new Map();let transfers=0;
 const channel={readyState:'open',send(value){sent.push(value);},addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){if(type==='message')listeners.delete(fn);}};
 const lease=Manager.create({now:()=>0,schedule:()=>({}),cancel(){}}).lease({close(){throw Error('shared transport closed');}},0,()=>{},{guest:true,transportOwnedExternally:true});lease.ready(channel);
 const entry={lease,busy:false},peer={...inboxPeer};const box={classList:{add(){},remove(){}},textContent:'',addEventListener(type,fn){buttons.set(type,fn);}};
 const ctx={AbortController,activeSendAttempt:null,activeSession:null,activeChannel:null,activeManualPeerId:null,inFlightSendNotice:null,activePairConfirmation:null,activeAttendanceResponderDetach:null,activeBackupReceiverDetach:null,cleanupQrScanner(){},shell(){},renderBackupHub(){},
 identityStore:{getSelf:async()=>({deviceId:'self',displayName:'Mini'}),getPeer:async()=>peer},peerName:()=> 'Mini',morphShell(fn){fn();},body:()=>({innerHTML:'',querySelector:()=>box}),backButton:()=>'',vectorIcon:()=>'',esc:value=>value,secondary:()=>'',
 notices:()=>({show(){const notice={updates:[],dismissed:0,update(value){this.updates.push(value);},dismiss(){this.dismissed++;}};notices.push(notice);return notice;}}),
 root:{P2PBackupConsent:{...Consent,requestConsent:(ch,core,offer,options)=>Consent.requestConsent(ch,core,offer,{...options,timeoutMs:50,resendMs:10})},SaMiniP2PBackup:{createMiniBackupPayload:async()=>({size:2,bytes:new Uint8Array([1,2]),sha256:'synthetic'}),sendBackupOnChannel:async()=>{transfers++;return {};}}},
 core:{...Core,sendControl:(ch,type,value)=>Core.sendControl(ch,type,JSON.parse(JSON.stringify(value)))},isMiniBackupPeer:()=>true,ensureMiniBackupListener:async()=>entry,miniBackupIntents:{invalidate(){}},backupSizeLabel:()=> '2 bytes',statusMessage:()=>'',recordP2PActivity(){},signalTerminalSuccess(){},startMiniBackupInbox:async()=>{}};
 vm.runInNewContext(between('function cleanupSession','function closeTransferModal')+between('async function sendBackupToPeer','async function waitBackupTransfer')+';this.send=sendBackupToPeer;this.cancel=cleanupSession;',ctx);
 const old=ctx.send(peer.peerId);await settleInbox();const oldCancel=buttons.get('click');ctx.cancel();const fresh=ctx.send(peer.peerId);
 try{assert.equal(await Promise.race([old.then(()=> 'settled'),new Promise(r=>setImmediate(()=>r('pending')))]),'settled');await settleInbox();const current=ctx.activeSendAttempt,notice=notices.at(-1);assert.ok(current);oldCancel();assert.equal(ctx.activeSendAttempt,current);assert.equal(notices.at(-1),notice);assert.equal(notice.dismissed,0);
 const offers=sent.map(Core.parseControl).filter(Boolean);const accepted={data:JSON.stringify({protocol:Core.CONTROL_PROTOCOL,type:'backup-offer-reply',data:{offerId:offers.at(-1).data.offerId,accepted:true}})};for(const listener of [...listeners])listener(accepted);await fresh;assert.equal(transfers,1);assert.equal(lease.busy(),false);assert.equal(listeners.size,0);
 }finally{ctx.cancel();await Promise.all([old,fresh]);lease.retire();}
});
