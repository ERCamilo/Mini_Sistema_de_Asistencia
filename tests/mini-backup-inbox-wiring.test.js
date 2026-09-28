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
  assert.match(between('function closeTransferModal', '\n  }\n'), /startMiniBackupInbox\(\)/);
  assert.match(ui, /addEventListener\('visibilitychange'[\s\S]{0,200}refreshMiniBackupInbox/);
  const refresh = between('function refreshMiniBackupInbox', 'async function startMiniBackupInbox');
  assert.match(refresh, /MINI_BACKUP_MAX_AGE_MS/);
  assert.match(refresh, /readyState/);
  assert.match(refresh, /activeTransferPeerId/);
});
