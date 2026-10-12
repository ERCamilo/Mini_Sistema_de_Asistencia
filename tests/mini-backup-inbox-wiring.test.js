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
  const prompt = between('function promptIncomingBackup', 'function stopMiniBackupListener');
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
      cleanupSession() { ctx.activeSendAttempt = null; }, stopMiniBackupListener() {}, shell() {},
      isMiniBackupPeer: () => true, ensureMiniBackupListener: async () => ({ lease: { run() { entered(); return pending; } } }),
      identityStore: { getSelf: async () => ({ deviceId: 'test' }), getPeer: async () => peer },
      peerName: () => 'Mini', morphShell(fn) { fn(); }, body: () => ({ innerHTML: '', querySelector: () => box }),
      backButton: () => '', vectorIcon: () => '', esc: x => x, secondary: () => '', notices: () => ({ show: () => notice }),
      root: { SaMiniP2PBackup: { createMiniBackupPayload: async () => ({}) } },
      core: { deriveTrustedRoute: async () => ({}), SignalingClient: class { close() {} }, createRtcSession() { entered(); return pending; } },
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
    core: { deriveTrustedRoute: async () => ({}), SignalingClient: class {
      constructor() { this.closed = 0; signals.push(this); } close() { this.closed++; }
    }, createRtcSession: async opts => {
      options.push(opts); const session = { closed: 0, close() { this.closed++; opts.onState('closed'); } };
      sessions.push(session); return session;
    } },
    root: { P2PBackupConsent: { bufferOffers: () => ({ detach() { detached++; }, release(fn) { released++; fn({}, () => {}); } }) } },
    pairing: { attachTrusted(_channel, opts) { handshakes.push(opts); } },
    promptIncomingBackup() { prompted++; },
    setTimeout(fn, delay) { const timer = { fn, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cancelled = true; }
  };
  Object.assign(ctx, overrides);
  vm.runInNewContext(between('function stopMiniBackupListener', '// A live lease') +
    '; this.ensure = ensureMiniBackupListener; this.stop = stopMiniBackupListener;', ctx);
  return { ctx, timers, options, sessions, signals, handshakes,
    counts: () => ({ detached, released, prompted }) };
}
const inboxPeer = { peerId: 'synthetic', peerApp: 'mini', purpose: 'backup', linkToken: 'synthetic' };
const settleInbox = () => new Promise(resolve => setImmediate(resolve));

test('receiver retry retires its owner once and stale callbacks cannot rearm its replacement', async () => {
  const h = inboxHarness(), old = await h.ctx.ensure(inboxPeer);
  h.options[0].onState('failed');
  assert.equal(h.timers.length, 1, 'close callback cannot recursively schedule retries');
  h.timers[0].fn(); await settleInbox();
  const replacement = h.ctx.miniBackupListeners.get(inboxPeer.peerId);
  assert.notEqual(replacement, old); assert.equal(old.stopped, true);
  assert.equal(h.sessions[0].closed, 1);
  h.options[0].onState('disconnected');
  assert.equal(h.timers.length, 1); assert.equal(replacement.retryTimer, null);
  h.timers[0].fn(); await settleInbox();
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), replacement);
  assert.equal(h.options.length, 2, 'expired timer cannot create an orphan listener');
});

test('cancelled receiver retry cannot delete or close a new same-peer listener', async () => {
  const h = inboxHarness(); await h.ctx.ensure(inboxPeer); h.options[0].onState('failed');
  h.ctx.stop(inboxPeer.peerId); const next = await h.ctx.ensure(inboxPeer);
  h.timers[0].fn(); await settleInbox();
  assert.equal(h.ctx.miniBackupListeners.get(inboxPeer.peerId), next);
  assert.equal(h.sessions[1].closed, 0); assert.equal(h.options.length, 2);
});

test('stopped receiver authentication cannot release buffered offers or accept late channels', async () => {
  const h = inboxHarness(); await h.ctx.ensure(inboxPeer);
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
  const oldSetup = h.ctx.ensure(inboxPeer); await ready; h.ctx.stop(inboxPeer.peerId);
  h.ctx.core.createRtcSession = normalFactory; const next = await h.ctx.ensure(inboxPeer);
  const late = { closed: 0, close() { this.closed++; } }; resolve(late); await oldSetup;
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
    vm.runInNewContext(between('function promptIncomingBackup', 'function stopMiniBackupListener') + '; this.prompt = promptIncomingBackup;', ctx);
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
    assert.equal(h.options[0].initiator, selfId < inboxPeer.peerId);
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
    vm.runInNewContext(between('function promptIncomingBackup', 'function stopMiniBackupListener') + '; this.prompt = promptIncomingBackup;', ctx);
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
  const lease = Manager.create({ now: () => 0, schedule: () => ({}), cancel() {} }).lease(session, 0, () => {});
  lease.ready(channel);
  const entry = { lease, busy: false }, peer = { ...inboxPeer };
  const box = { classList: { add() {}, remove() {} }, addEventListener() {} };
  const ctx = { activeSendAttempt: null, activeSession: null, activeChannel: null, activeManualPeerId: null, inFlightSendNotice: null,
    cleanupSession() { ctx.activeSendAttempt = null; }, shell() {},
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
