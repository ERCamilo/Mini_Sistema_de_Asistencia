const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const ui = readFileSync(require.resolve('../p2p-roster-ui.js'), 'utf8');
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
    const attempt = {};
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
    identityStore: { getSelf: async () => ({ deviceId: 'self' }) },
    core: { validateSignalFrameObject: require('../p2p-core.js').validateSignalFrameObject, deriveTrustedRoute: async () => ({}), SignalingClient: class {
      constructor() { this.closed = 0; this.listeners = new Set(); signals.push(this); } async connect() {} send() {} onEvent(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); } emit(event) { for (const fn of this.listeners) fn(event); } close() { this.closed++; }
    }, createRtcSession: async opts => {
      options.push(opts); const session = { closed: 0, startNegotiation: async () => {}, close() { this.closed++; opts.onState('closed'); } };
      sessions.push(session); return session;
    } },
    root: { MiniPeerSessionManager: require('../mini-peer-session-manager.js'), MiniPeerAvailability: require('../mini-peer-availability.js'), P2PBackupConsent: { bufferOffers: () => ({ detach() { detached++; }, release(fn) { released++; fn({}, () => {}); } }) } },
    pairing: { attachTrusted(_channel, opts) { handshakes.push(opts); } },
    promptIncomingBackup() { prompted++; },
    setTimeout(fn, delay) { const timer = { fn, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cancelled = true; }
  };
  Object.assign(ctx, overrides);
  vm.runInNewContext(between('let miniBackupAccountWatch', '// A live lease') +
    '; this.ensure = ensureMiniBackupListener; this.stop = stopMiniBackupListener;', ctx);
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
  authChanged(null); await rejected; assert.equal(h.ctx.miniBackupListeners.size, 0); assert.equal(h.signals[0].closed, 1);
  let closed = 0; resolve({ close() { closed++; } }); await settleInbox(); assert.equal(closed, 1);
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
  release(inboxPeer); await settleInbox(); assert.equal(h.options.length, 0); assert.equal(h.ctx.miniBackupListeners.size, 0);
});
