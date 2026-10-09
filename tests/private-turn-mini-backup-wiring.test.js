const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../p2p-core.js');
const Pairing = require('../p2p-pairing.js');
const Bridge = require('../p2p-backup-bridge.js');
const root = path.resolve(__dirname, '..');
test('Mini same-app trust is backup-only and requires explicit opt-in', () => {
  const self = { deviceId: 'mini-one', appType: 'mini' };
  const peer = { peerId: 'mini-two', peerApp: 'mini', purpose: 'backup', linkToken: Buffer.alloc(32, 1).toString('base64url') };
  assert.throws(() => Pairing.validateTrustedPeer(self, peer));
  assert.equal(Pairing.validateTrustedPeer(self, peer, { allowSameApp: true }).purpose, 'backup');
  for (const purpose of ['roster', 'attendance']) assert.throws(() => Pairing.validateTrustedPeer(self, { ...peer, purpose }, { allowSameApp: true }));
});
test('Existing Mini UI routes same-app pairing to consented backups, not roster/attendance', () => {
  const ui = fs.readFileSync(path.join(root, 'p2p-roster-ui.js'), 'utf8');
  assert.match(ui, /peer\.peerApp === 'sa'[\s\S]*?armBackupReceiver/);
  assert.match(ui, /peer\.peerApp === 'mini' && peer\.purpose === 'backup'/);
  assert.match(ui, /requestConsent\(channel, core/);
  assert.match(ui, /decision !== 'accepted'/);
  assert.ok(ui.includes('renderBackupHub')); 
});
test('Production backup bridge stages for review without modifying the backup source', async () => {
  globalThis.SaMiniP2P = Core;
  const data = { schemaVersion: 1, users: [{ id: 'synthetic', name: 'Synthetic employee' }], attendance: {}, requests: [] };
  const before = JSON.stringify(data), payload = await Bridge.createMiniBackupPayload(data);
  const store = Bridge.createBackupStagingStore();
  const staged = store.stageBackup({ transferId: 'synthetic-transfer', kind: 'backup', schema: 'mini-backup/v1', sha256: payload.sha256, bytes: payload.bytes, sourceApp: 'mini' });
  assert.deepEqual(Bridge.parseStagedMiniBackup(staged).parsed, data);
  assert.equal(JSON.stringify(data), before); assert.equal(store.getPendingCount(), 1);
  delete globalThis.SaMiniP2P;
});
test('Browser coverage uses actual Mini modules, consent, transport and review with honest host-only scope', () => {
  const runner = fs.readFileSync(path.join(root, 'tests/integration/private-turn-mini-backup.browser.cjs'), 'utf8');
  for (const call of ['attachPairing', 'requestConsent', 'createTransferReceiver', 'sendBackupOnChannel', 'sendBackupStagedAck', 'reviewStagedBackupInMini', 'verifySelectedRelay']) assert.ok(runner.includes(call));
  assert.match(runner, /iceServers: \[\]/); assert.match(runner, /liveTurnProof: false/);
  assert.doesNotMatch(runner, /ignoreHTTPSErrors|storageState|\.tracing\.|\.screenshot\(/);
});
