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
  assert.match(send, /stopMiniBackupListener\(peerId\)/);
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
  assert.match(refresh, /MINI_BACKUP_MAX_AGE_MS/);
  assert.match(refresh, /readyState/);
  assert.match(refresh, /activeTransferPeerId/);
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
