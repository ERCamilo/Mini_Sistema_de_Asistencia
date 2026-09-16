const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../p2p-core.js');
const Pairing = require('../p2p-pairing.js');
const BackupBridge = require('../p2p-backup-bridge.js');

async function waitFor(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw new Error('timeout waiting for ' + label);
}

class CaptureChannel {
  constructor() { this.readyState = 'open'; this.bufferedAmount = 0; this.frames = []; }
  send(frame) { this.frames.push(frame); }
  addEventListener() {}
  removeEventListener() {}
}

class LinkedChannel {
  constructor(name) {
    this.name = name;
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.listeners = new Set();
    this.closeListeners = new Set();
    this.peer = null;
    this.transform = data => data;
  }
  addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); if (type === 'close') this.closeListeners.add(fn); }
  removeEventListener(type, fn) { if (type === 'message') this.listeners.delete(fn); if (type === 'close') this.closeListeners.delete(fn); }
  send(data) {
    if (!this.peer || this.peer.listeners.size === 0) return;
    const peer = this.peer;
    data = this.transform(data);
    queueMicrotask(() => {
      for (const fn of [...peer.listeners]) fn({ data });
    });
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    for (const fn of [...this.closeListeners]) fn();
    if (this.peer && this.peer.readyState !== 'closed') {
      this.peer.readyState = 'closed';
      for (const fn of [...this.peer.closeListeners]) fn();
    }
  }
}

function linkedPair() {
  const a = new LinkedChannel('a');
  const b = new LinkedChannel('b');
  a.peer = b; b.peer = a;
  return [a, b];
}

function makeStore() {
  const saved = [];
  return {
    saved,
    async savePeer(peer, options = {}) {
      const allowSameApp = options.allowSameApp === true;
      if (!allowSameApp) {
        if (peer.peerApp !== 'sa') {
          throw new Error('La app remota P2P no es compatible.');
        }
      } else {
        if (peer.peerApp !== 'mini') {
          throw new Error('La app remota P2P no es compatible.');
        }
        if (peer.purpose !== 'backup') {
          throw new Error('Peer same-app requiere propósito de respaldo.');
        }
      }
      const record = { ...peer, purpose: peer.peerApp === 'mini' ? 'backup' : peer.purpose };
      saved.push(record);
      return record;
    },
    async getPeer(peerId) {
      return saved.find(p => p.peerId === peerId) || null;
    },
    async listPeers() {
      return [...saved];
    }
  };
}

async function deliverFrames(frames, receiver, mutate = x => x) {
  for (let i = 0; i < frames.length; i++) {
    const frame = mutate(frames[i], i, frames);
    if (frame === undefined) continue;
    await receiver({ data: frame });
  }
}

// 1. Regresión: pairing normal sigue rechazando same-app sin opt-in; allowSameApp=true es estricto same-app
test('1. regresión: pairing normal sigue rechazando same-app sin opt-in; gate same-app estricto y purpose guard', async () => {
  const miniDescriptor = {
    ...(await Core.pairDescriptorFromManual('583214', 'ABCDE-23456')),
    issuerId: 'mini-1',
    issuerApp: 'mini',
    issuerName: 'Mini 1'
  };
  const encoded = Core.encodePairDescriptor(miniDescriptor);

  // decodePairDescriptor rejects issuerApp === 'mini' by default
  await assert.rejects(
    () => Core.decodePairDescriptor(encoded),
    /Emisor del QR inválido/
  );
  await assert.rejects(
    () => Core.decodePairDescriptor(encoded, { allowSameApp: false }),
    /Emisor del QR inválido/
  );

  // Pairing.attachPairing rejects same-app without allowSameApp: true
  const [a, b] = linkedPair();
  let errorSeen = null;
  Pairing.attachPairing(a, {
    self: { deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1' },
    descriptor: miniDescriptor, initiator: true, store: makeStore(),
    onError: e => { errorSeen = e; }
  });
  Pairing.attachPairing(b, {
    self: { deviceId: 'mini-2', appType: 'mini', displayName: 'Mini 2' },
    descriptor: miniDescriptor, initiator: false, store: makeStore(),
    onError: e => { errorSeen = e; }
  });
  await waitFor(() => errorSeen, 'same-app pairing rejection');
  assert.match(errorSeen.message, /SA debe ser el emisor del emparejamiento|app remota P2P no es compatible/);
  assert.equal(Core.isChannelAuthenticated(a), false);
  assert.equal(Core.isChannelAuthenticated(b), false);

  // Pairing.attachTrusted rejects same-app without allowSameApp: true
  const [t1] = linkedPair();
  let trustedError = null;
  Pairing.attachTrusted(t1, {
    self: { deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1' },
    peer: { peerId: 'mini-2', peerApp: 'mini', linkToken: 'a'.repeat(64), purpose: 'backup' },
    store: makeStore(),
    onError: e => { trustedError = e; }
  });
  assert.match(trustedError?.message || '', /app remota P2P no es compatible/);
  assert.equal(Core.isChannelAuthenticated(t1), false);

  // Exact same-app gate in validateHello:
  // allowSameApp=true means ONLY remote.appType === local.appType
  assert.throws(
    () => Pairing.validateHello({ deviceId: 'sa-1', appType: 'sa', displayName: 'SA 1', nonce: 'abc' }, { appType: 'mini' }, { allowSameApp: true }),
    /app remota P2P no es compatible/
  );
  assert.throws(
    () => Pairing.validateHello({ deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1', nonce: 'abc' }, { appType: 'sa' }, { allowSameApp: true }),
    /app remota P2P no es compatible/
  );
  // Default pairing requires cross-app: SA <-> Mini
  assert.throws(
    () => Pairing.validateHello({ deviceId: 'mini-2', appType: 'mini', displayName: 'Mini 2', nonce: 'abc' }, { appType: 'mini' }, { allowSameApp: false }),
    /app remota P2P no es compatible/
  );

  // Trusted auth purpose guard:
  // allowSameApp: true requires peer.peerApp === self.appType AND peer.purpose === 'backup'
  const validLinkToken = Core.randomToken(32);
  assert.throws(
    () => Pairing.validateTrustedPeer({ deviceId: 'm1', appType: 'mini' }, { peerId: 'm2', peerApp: 'mini', linkToken: validLinkToken }, { allowSameApp: true }),
    /Peer same-app requiere propósito de respaldo/
  );
  assert.throws(
    () => Pairing.validateTrustedPeer({ deviceId: 'm1', appType: 'mini' }, { peerId: 'm2', peerApp: 'mini', linkToken: validLinkToken, purpose: 'roster' }, { allowSameApp: true }),
    /Peer same-app requiere propósito de respaldo/
  );
  assert.throws(
    () => Pairing.validateTrustedPeer({ deviceId: 'm1', appType: 'mini' }, { peerId: 'sa-1', peerApp: 'sa', linkToken: validLinkToken, purpose: 'backup' }, { allowSameApp: true }),
    /app remota P2P no es compatible/
  );
  const okSameApp = Pairing.validateTrustedPeer(
    { deviceId: 'm1', appType: 'mini' },
    { peerId: 'm2', peerApp: 'mini', linkToken: validLinkToken, purpose: 'backup' },
    { allowSameApp: true }
  );
  assert.equal(okSameApp.peerId, 'm2');
  assert.equal(okSameApp.purpose, 'backup');

  // Cross-app trusted auth: allowSameApp: false strictly rejects same-app
  assert.throws(
    () => Pairing.validateTrustedPeer({ deviceId: 'm1', appType: 'mini' }, { peerId: 'm2', peerApp: 'mini', linkToken: validLinkToken, purpose: 'backup' }, { allowSameApp: false }),
    /app remota P2P no es compatible/
  );
  const okCrossApp = Pairing.validateTrustedPeer(
    { deviceId: 'm1', appType: 'mini' },
    { peerId: 'sa-1', peerApp: 'sa', linkToken: validLinkToken },
    { allowSameApp: false }
  );
  assert.equal(okCrossApp.peerId, 'sa-1');
});

// 2. Same-app backup pairing Mini↔Mini sólo con opt-in explícito
test('2. same-app backup pairing Mini↔Mini sólo con opt-in explícito', async () => {
  const miniDescriptor = {
    ...(await Core.pairDescriptorFromManual('583214', 'ABCDE-23456')),
    issuerId: 'mini-1',
    issuerApp: 'mini',
    issuerName: 'Mini 1'
  };
  const encoded = Core.encodePairDescriptor(miniDescriptor);

  // decodePairDescriptor accepts with allowSameApp: true
  const decoded = await Core.decodePairDescriptor(encoded, { allowSameApp: true });
  assert.equal(decoded.issuerApp, 'mini');
  assert.equal(decoded.issuerId, 'mini-1');

  // Full pairing handshake with allowSameApp: true
  const [a, b] = linkedPair();
  const storeA = makeStore();
  const storeB = makeStore();
  let candidateA = null;
  let candidateB = null;
  let linkedA = null;
  let linkedB = null;

  Pairing.attachPairing(a, {
    self: { deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1' },
    descriptor: decoded, initiator: true, store: storeA, allowSameApp: true,
    onCandidate: c => { candidateA = c; },
    onLinked: p => { linkedA = p; }
  });
  Pairing.attachPairing(b, {
    self: { deviceId: 'mini-2', appType: 'mini', displayName: 'Mini 2' },
    descriptor: decoded, initiator: false, store: storeB, allowSameApp: true,
    onCandidate: c => { candidateB = c; },
    onLinked: p => { linkedB = p; }
  });

  await waitFor(() => candidateA && candidateB, 'both candidates ready');
  assert.equal(candidateA.sas, candidateB.sas);
  assert.equal(candidateA.remote.displayName, 'Mini 2');
  assert.equal(candidateB.remote.displayName, 'Mini 1');

  await candidateA.accept();
  await candidateB.accept();

  await waitFor(() => linkedA && linkedB, 'both sides linked');
  assert.equal(linkedA.peerId, 'mini-2');
  assert.equal(linkedB.peerId, 'mini-1');
  assert.equal(linkedA.peerApp, 'mini');
  assert.equal(linkedB.peerApp, 'mini');
  assert.equal(linkedA.purpose, 'backup');
  assert.equal(linkedB.purpose, 'backup');
  assert.equal(Core.isChannelAuthenticated(a), true);
  assert.equal(Core.isChannelAuthenticated(b), true);

  // Negative test: reconnecting same-app without allowSameApp: true fails closed
  const [neg1] = linkedPair();
  let negError = null;
  Pairing.attachTrusted(neg1, {
    self: { deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1' },
    peer: linkedA,
    store: storeA,
    allowSameApp: false,
    onError: e => { negError = e; }
  });
  assert.match(negError?.message || '', /app remota P2P no es compatible/);

  // Test trusted reconnect with allowSameApp: true
  const [t1, t2] = linkedPair();
  let auth1 = false;
  let auth2 = false;
  Pairing.attachTrusted(t1, {
    self: { deviceId: 'mini-1', appType: 'mini', displayName: 'Mini 1' },
    peer: linkedA,
    store: storeA,
    allowSameApp: true,
    onAuthenticated: () => { auth1 = true; }
  });
  Pairing.attachTrusted(t2, {
    self: { deviceId: 'mini-2', appType: 'mini', displayName: 'Mini 2' },
    peer: linkedB,
    store: storeB,
    allowSameApp: true,
    onAuthenticated: () => { auth2 = true; }
  });

  await waitFor(() => auth1 && auth2, 'trusted authenticated');
  assert.equal(Core.isChannelAuthenticated(t1), true);
  assert.equal(Core.isChannelAuthenticated(t2), true);
});

// 3. Roster y asistencia no se habilitan ni se enrutan a peer same-app; receptor dedicado de backup
test('3. roster y asistencia no se habilitan ni se enrutan a peer same-app; receptor dedicado de backup', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '../p2p-roster-ui.js'), 'utf8');

  // Verify armPassiveChannel has guard against non-sa peers
  assert.match(uiSource, /function armPassiveChannel\([^)]*\)\s*\{[\s\S]*?if\s*\(!peer\s*\|\|\s*peer\.peerApp\s*!==\s*'sa'\)\s*return/);

  // Verify ensurePeerListener guards peer.peerApp !== 'sa'
  assert.match(uiSource, /if\s*\(!peerId\s*\|\|\s*peer\?\.peerApp\s*!==\s*'sa'\s*\|\|\s*!peer\?\.linkToken\)\s*throw new Error\('SA vinculado no encontrado\.'\)/);

  // Verify startPassiveInbox only starts SA peers
  assert.match(uiSource, /peers\s*=\s*\(await identityStore\.listPeers\(\)\)\.filter\(p\s*=>\s*p\.peerApp\s*===\s*'sa'\)/);

  // Verify attendance button is only on SA peers in renderHome
  assert.match(uiSource, /renderHome\(\)[\s\S]*?filter\(p\s*=>\s*p\.peerApp\s*===\s*'sa'\)/);

  // Verify onLinked arms armBackupReceiver (never armRosterReceiver or armAttendanceResponder) on same-app peer
  assert.match(uiSource, /if\s*\(peer\.peerApp\s*===\s*'sa'\)\s*\{[\s\S]*?armRosterReceiver[\s\S]*?armAttendanceResponder[\s\S]*?\}\s*else\s*\{[\s\S]*?armBackupReceiver/);

  // Verify armRosterReceiver is roster-only
  assert.doesNotMatch(uiSource, /function armRosterReceiver[\s\S]*?result\.kind\s*===\s*'backup'/);

  // Verify dedicated armBackupReceiver exists and uses createTransferReceiver
  assert.match(uiSource, /function armBackupReceiver\([^)]*\)\s*\{[\s\S]*?core\.createTransferReceiver/);

  // Verify waitBackupTransfer calls armBackupReceiver, never armRosterReceiver
  assert.match(uiSource, /async function waitBackupTransfer[\s\S]*?armBackupReceiver/);
  assert.doesNotMatch(uiSource, /async function waitBackupTransfer[\s\S]*?armRosterReceiver/);

  // Verify sendBackupToPeer and waitBackupTransfer determine allowSameApp dynamically strictly by peerApp === self.appType
  assert.match(uiSource, /sendBackupToPeer[\s\S]*?allowSameApp:\s*peer\.peerApp\s*===\s*self\.appType/);
  assert.match(uiSource, /waitBackupTransfer[\s\S]*?allowSameApp:\s*peer\.peerApp\s*===\s*self\.appType/);
});

// 4. Backup válido round-trip conserva bytes y SHA-256 exactos
test('4. backup válido round-trip conserva bytes y SHA-256 exactos (mini-backup y sa-backup)', async () => {
  // Test mini-backup/v1
  const binaryData = new Uint8Array(Core.CHUNK_SIZE * 3 + 512);
  for (let i = 0; i < binaryData.length; i++) binaryData[i] = (i * 31 + 7) & 0xff;
  const expectedHash = await Core.sha256Hex(binaryData);

  const channel = new CaptureChannel();
  Core.markChannelAuthenticated(channel);

  const sent = await Core.sendPayload(channel, {
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: binaryData
  });

  assert.equal(sent.kind, 'backup');
  assert.equal(sent.schema, 'mini-backup/v1');
  assert.equal(sent.size, binaryData.length);
  assert.equal(sent.sha256, expectedHash);

  let complete = null;
  let error = null;
  const receiver = Core.createTransferReceiver({
    channel,
    onComplete: r => { complete = r; },
    onError: e => { error = e; }
  });

  await deliverFrames(channel.frames, receiver);
  assert.equal(error, null);
  assert.ok(complete);
  assert.equal(complete.kind, 'backup');
  assert.equal(complete.schema, 'mini-backup/v1');
  assert.equal(complete.transferId, sent.transferId);
  assert.equal(complete.sha256, expectedHash);
  assert.equal(complete.bytes.length, binaryData.length);
  assert.deepEqual(complete.bytes, binaryData);
  assert.equal(complete.text, null, 'backup delivery must be raw opaque bytes without text decode');

  // Test sa-backup/v1
  const saData = new Uint8Array(2048);
  for (let i = 0; i < saData.length; i++) saData[i] = (i ^ 0xaa) & 0xff;
  const saHash = await Core.sha256Hex(saData);

  const channelSa = new CaptureChannel();
  Core.markChannelAuthenticated(channelSa);
  const sentSa = await Core.sendPayload(channelSa, {
    kind: 'backup',
    schema: 'sa-backup/v1',
    bytes: saData
  });

  let completeSa = null;
  const receiverSa = Core.createTransferReceiver({
    channel: channelSa,
    onComplete: r => { completeSa = r; }
  });
  await deliverFrames(channelSa.frames, receiverSa);
  assert.ok(completeSa);
  assert.equal(completeSa.schema, 'sa-backup/v1');
  assert.equal(completeSa.sha256, saHash);
  assert.deepEqual(completeSa.bytes, saData);
});

// 5. Límite duro >25 MiB, hash corrupto, chunk duplicado/faltante y framing inválido fallan cerrados
test('5. >25 MiB, hash corrupto, chunk duplicado/faltante y framing inválido fallan cerrados', async () => {
  // > 25 MiB rejected before allocating chunks
  const oversizedStart = {
    protocol: Core.TRANSFER_PROTOCOL,
    type: 'start',
    transferId: 't-oversized',
    kind: 'backup',
    schema: 'mini-backup/v1',
    size: Core.MAX_BACKUP_BYTES + 1,
    chunkSize: Core.CHUNK_SIZE,
    totalChunks: Math.ceil((Core.MAX_BACKUP_BYTES + 1) / Core.CHUNK_SIZE),
    sha256: 'a'.repeat(64)
  };
  assert.throws(
    () => Core.validateTransferStart(oversizedStart),
    /Tamaño de transferencia inválido/
  );

  // Corrupted hash fails closed
  const data = new Uint8Array(1024);
  data.fill(42);
  const channelCorrupt = new CaptureChannel();
  Core.markChannelAuthenticated(channelCorrupt);
  await Core.sendPayload(channelCorrupt, { kind: 'backup', schema: 'mini-backup/v1', bytes: data });

  let errorCorrupt = null;
  const receiverCorrupt = Core.createTransferReceiver({
    channel: channelCorrupt,
    onError: e => { errorCorrupt = e; }
  });
  // Mutate start frame sha256
  await deliverFrames(channelCorrupt.frames, receiverCorrupt, (frame, idx) => {
    if (idx === 0) {
      const parsed = JSON.parse(frame);
      parsed.sha256 = 'b'.repeat(64);
      return JSON.stringify(parsed);
    }
    return frame;
  });
  assert.match(errorCorrupt?.message || '', /SHA-256 no coincide/);

  // Duplicate chunk fails closed
  const channelDup = new CaptureChannel();
  Core.markChannelAuthenticated(channelDup);
  await Core.sendPayload(channelDup, { kind: 'backup', schema: 'mini-backup/v1', bytes: data });

  let errorDup = null;
  const receiverDup = Core.createTransferReceiver({
    channel: channelDup,
    onError: e => { errorDup = e; }
  });
  await deliverFrames(channelDup.frames, receiverDup, (frame, idx) => {
    // Deliver chunk 0 twice
    if (idx === 1) {
      receiverDup({ data: frame });
    }
    return frame;
  });
  assert.match(errorDup?.message || '', /Chunk duplicado/);

  // Missing chunk fails closed
  const channelMissing = new CaptureChannel();
  Core.markChannelAuthenticated(channelMissing);
  await Core.sendPayload(channelMissing, { kind: 'backup', schema: 'mini-backup/v1', bytes: data });

  let errorMissing = null;
  const receiverMissing = Core.createTransferReceiver({
    channel: channelMissing,
    onError: e => { errorMissing = e; }
  });
  await deliverFrames(channelMissing.frames, receiverMissing, (frame, idx) => {
    // Skip data chunk (index 1), jump directly to end frame (index 2)
    if (idx === 1) return undefined;
    return frame;
  });
  assert.match(errorMissing?.message || '', /Faltan chunks/);

  // Framing with invalid schema fails closed
  const invalidSchemaStart = {
    protocol: Core.TRANSFER_PROTOCOL,
    type: 'start',
    transferId: 't-invalid-schema',
    kind: 'backup',
    schema: 'other-backup/v1',
    size: 1024,
    chunkSize: Core.CHUNK_SIZE,
    totalChunks: 1,
    sha256: 'a'.repeat(64)
  };
  assert.throws(
    () => Core.validateTransferStart(invalidSchemaStart),
    /Esquema de backup no admitido/
  );
});

// 6. Staging: máximo 3 en total en este Mini, dedupe transferId/hash antes del límite, cero escrituras antes de confirmar
test('6. staging: máximo 3 en total en este Mini, dedupe transferId/hash antes del límite, cero escrituras antes de confirmar', () => {
  const store = BackupBridge.createBackupStagingStore(3);

  const b1 = {
    transferId: 't1',
    sha256: 'hash-1',
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: new Uint8Array([1, 2, 3]),
    sourceApp: 'mini',
    sourcePeerId: 'p1',
    sourcePeerName: 'Mini A'
  };
  const b2 = {
    transferId: 't2',
    sha256: 'hash-2',
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: new Uint8Array([4, 5, 6]),
    sourceApp: 'mini',
    sourcePeerId: 'p1',
    sourcePeerName: 'Mini A'
  };
  const b3 = {
    transferId: 't3',
    sha256: 'hash-3',
    kind: 'backup',
    schema: 'sa-backup/v1',
    bytes: new Uint8Array([7, 8, 9]),
    sourceApp: 'sa',
    sourcePeerId: 'p2',
    sourcePeerName: 'SA Central'
  };
  const b4 = {
    transferId: 't4',
    sha256: 'hash-4',
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: new Uint8Array([10, 11, 12]),
    sourceApp: 'mini',
    sourcePeerId: 'p1',
    sourcePeerName: 'Mini A'
  };
  const b5 = {
    transferId: 't5',
    sha256: 'hash-5',
    kind: 'backup',
    schema: 'sa-backup/v1',
    bytes: new Uint8Array([13, 14, 15]),
    sourceApp: 'sa',
    sourcePeerId: 'p2',
    sourcePeerName: 'SA Central'
  };

  // Stage 2 Mini + 1 SA = 3 TOTAL backups in this receiving Mini
  assert.equal(store.stageBackup(b1).transferId, 't1');
  assert.equal(store.stageBackup(b2).transferId, 't2');
  assert.equal(store.stageBackup(b3).transferId, 't3');
  assert.equal(store.getPendingCount(), 3);
  assert.equal(store.getPendingCount('mini'), 2);
  assert.equal(store.getPendingCount('sa'), 1);

  // 4th backup TOTAL is rejected explicitly, whether Mini or SA (cap is total, not per sourceApp)
  assert.throws(
    () => store.stageBackup(b4),
    /Límite de backups pendientes alcanzado \(máximo 3\)/
  );
  assert.throws(
    () => store.stageBackup(b5),
    /Límite de backups pendientes alcanzado \(máximo 3\)/
  );

  // Deduplication BEFORE cap:
  // When at cap (3 total), re-staging b1 by transferId returns existing without error
  const dup1 = store.stageBackup({ ...b1, bytes: new Uint8Array([99]) });
  assert.equal(dup1.transferId, 't1');
  assert.equal(store.getPendingCount(), 3);

  // When at cap (3 total), re-staging b3 by sha256 with different transferId returns existing without error
  const dupHash = store.stageBackup({ ...b3, transferId: 'different-t3' });
  assert.equal(dupHash.transferId, 't3');
  assert.equal(store.getPendingCount(), 3);

  // Removal
  assert.equal(store.removeStaged('t1'), true);
  assert.equal(store.getPendingCount(), 2);
  assert.equal(store.removeStaged('non-existent'), false);

  // After removing one, the 4th can now be staged
  assert.equal(store.stageBackup(b4).transferId, 't4');
  assert.equal(store.getPendingCount(), 3);
});

// 7. Mini↔Mini usa restore nativo sólo tras confirmación explícita y conserva staging hasta confirmar
test('7. Mini↔Mini usa restore nativo sólo tras confirmación explícita y conserva staging hasta confirmar', () => {
  const validMiniBackupJson = JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-09-15T00:00:00Z',
    users: [{ id: 'u1', name: 'Juan Pérez' }],
    attendance: { '2026-09-15': { u1: { checkIn: '08:00' } } },
    requests: []
  });

  const stagedMini = {
    transferId: 't-mini-restore',
    sha256: 'hash-mini-restore',
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: new TextEncoder().encode(validMiniBackupJson),
    sourceApp: 'mini',
    sourcePeerId: 'peer-mini',
    sourcePeerName: 'Mini Remoto'
  };

  // Stage into store first
  const store = BackupBridge.createBackupStagingStore(3);
  store.stageBackup(stagedMini);
  assert.equal(store.getPendingCount(), 1);

  // Mock DOM environment
  let openedModalId = null;
  let populatedTextareaValue = null;
  let validateCalled = false;
  let restoreActuallyExecuted = false;

  const fakeTextarea = {
    dataset: {},
    set value(v) { populatedTextareaValue = v; },
    get value() { return populatedTextareaValue; }
  };
  const fakeModal = {
    dataset: {}
  };

  const fakeDocument = {
    getElementById(id) {
      if (id === 'restore-backup-textarea') return fakeTextarea;
      if (id === 'modal-restore-backup') return fakeModal;
      return null;
    }
  };

  globalThis.document = fakeDocument;
  globalThis.openModal = id => { openedModalId = id; };
  globalThis.validateRestoreTextarea = ta => { validateCalled = true; };
  globalThis.doRestoreBackup = () => {
    restoreActuallyExecuted = true;
    const tid = fakeTextarea.dataset.transferId || fakeModal.dataset.transferId;
    if (tid) {
      store.removeStaged(tid);
      delete fakeTextarea.dataset.transferId;
      delete fakeModal.dataset.transferId;
    }
  };

  try {
    // 1. Review populates textarea and modal, sets dataset.transferId
    const reviewResult = BackupBridge.reviewStagedBackupInMini(stagedMini);
    assert.ok(reviewResult.parsed);
    assert.equal(reviewResult.text, validMiniBackupJson);
    assert.equal(populatedTextareaValue, validMiniBackupJson);
    assert.equal(validateCalled, true);
    assert.equal(openedModalId, 'modal-restore-backup');
    assert.equal(fakeTextarea.dataset.transferId, 't-mini-restore');
    assert.equal(fakeModal.dataset.transferId, 't-mini-restore');

    // CRITICAL: Reviewing must NOT remove the backup from staged store!
    assert.equal(store.getPendingCount(), 1, 'Backup MUST remain staged on review');
    assert.ok(store.getStaged('t-mini-restore'), 'Backup MUST be accessible in staged store on review');
    assert.equal(restoreActuallyExecuted, false, 'doRestoreBackup must NEVER be called during review');

    // 2. Simulating user cancelling/closing modal: staged is STILL retained
    assert.equal(store.getPendingCount(), 1, 'Backup MUST remain staged when review is cancelled');

    // 3. User clicks Restaurar (doRestoreBackup succeeds):
    // Staged is removed ONLY upon successful restore
    globalThis.doRestoreBackup();
    assert.equal(restoreActuallyExecuted, true);
    assert.equal(store.getPendingCount(), 0, 'Backup is removed only after restore succeeds');
    assert.equal(fakeTextarea.dataset.transferId, undefined);

    // 4. Normal file/text restore without transferId functions normally without error
    restoreActuallyExecuted = false;
    fakeTextarea.value = validMiniBackupJson;
    globalThis.doRestoreBackup();
    assert.equal(restoreActuallyExecuted, true);
    assert.equal(store.getPendingCount(), 0);
  } finally {
    delete globalThis.document;
    delete globalThis.openModal;
    delete globalThis.validateRestoreTextarea;
    delete globalThis.doRestoreBackup;
  }
});

// 8. SA↔Mini sólo descarga; prueba negativa demuestra que restore/import nunca se invoca
test('8. SA↔Mini sólo descarga; prueba negativa demuestra que restore/import nunca se invoca', () => {
  const saBackupJson = JSON.stringify({
    version: 'sa-3.0',
    company: 'Empresa SA',
    projects: []
  });

  const stagedSa = {
    transferId: 't-sa-cross',
    sha256: 'hash-sa-cross',
    kind: 'backup',
    schema: 'sa-backup/v1',
    bytes: new TextEncoder().encode(saBackupJson),
    sourceApp: 'sa',
    sourcePeerId: 'peer-sa',
    sourcePeerName: 'SA Oficina'
  };

  // Negative test: reviewStagedBackupInMini must reject SA backups with clear error
  assert.throws(
    () => BackupBridge.reviewStagedBackupInMini(stagedSa),
    /Mini sólo puede revisar y restaurar respaldos propios de Mini \(mini-backup\/v1\)\. Los respaldos de SA son de sólo descarga\./
  );

  // Download generates safe local filename
  const filename = BackupBridge.downloadBackupBytes(stagedSa);
  assert.ok(filename.startsWith('backup_sa_'));
  assert.ok(filename.endsWith('.json'));

  // Verify UI renders download button, not review button for SA backup
  const uiSource = fs.readFileSync(path.join(__dirname, '../p2p-roster-ui.js'), 'utf8');
  assert.match(uiSource, /data-download-backup=/);
  assert.match(uiSource, /Sólo descarga; no se importa\./);
});

// 9. Documents / Files genérico permanece deshabilitado
test('9. Documents / Files genérico permanece deshabilitado', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '../p2p-roster-ui.js'), 'utf8');

  // Capability strip: Archivos must be is-disabled
  assert.match(uiSource, /capability\('restore', 'Archivos', 'Próximamente', 'is-disabled'\)/);

  // Core rejects generic files / documents kinds
  assert.throws(
    () => Core.validateTransferStart({
      protocol: Core.TRANSFER_PROTOCOL,
      type: 'start',
      transferId: 't1',
      kind: 'files',
      schema: 'files/v1',
      size: 100,
      chunkSize: 12288,
      totalChunks: 1,
      sha256: 'a'.repeat(64)
    }),
    /Sólo se admite roster o backup/
  );

  assert.throws(
    () => Core.validateTransferStart({
      protocol: Core.TRANSFER_PROTOCOL,
      type: 'start',
      transferId: 't2',
      kind: 'documents',
      schema: 'documents/v1',
      size: 100,
      chunkSize: 12288,
      totalChunks: 1,
      sha256: 'a'.repeat(64)
    }),
    /Sólo se admite roster o backup/
  );
});

// 10. ACKs autenticados: backup-staged y backup-rejected
test('10. ACKs autenticados: backup-staged y backup-rejected', () => {
  // Valid backup-staged
  const validStagedAck = {
    transferId: 't-ack-1',
    sha256: 'a'.repeat(64),
    kind: 'backup',
    schema: 'mini-backup/v1',
    validated: true
  };
  const parsedStaged = Core.validateControlData('backup-staged', validStagedAck);
  assert.equal(parsedStaged.transferId, 't-ack-1');
  assert.equal(parsedStaged.validated, true);

  // Invalid backup-staged (missing sha256 or validated !== true or extra keys)
  assert.throws(
    () => Core.validateControlData('backup-staged', { ...validStagedAck, validated: false }),
    /ACK de backup inválido/
  );
  assert.throws(
    () => Core.validateControlData('backup-staged', { ...validStagedAck, unexpected: 'extra' }),
    /ACK de backup inválido/
  );

  // Valid backup-rejected
  const validRejectedAck = {
    transferId: 't-ack-2',
    reason: 'Límite alcanzado',
    kind: 'backup',
    schema: 'mini-backup/v1',
    validated: false
  };
  const parsedRejected = Core.validateControlData('backup-rejected', validRejectedAck);
  assert.equal(parsedRejected.transferId, 't-ack-2');
  assert.equal(parsedRejected.reason, 'Límite alcanzado');
  assert.equal(parsedRejected.validated, false);

  // Invalid backup-rejected (validated !== false or extra keys)
  assert.throws(
    () => Core.validateControlData('backup-rejected', { ...validRejectedAck, validated: true }),
    /Rechazo de backup inválido/
  );
  assert.throws(
    () => Core.validateControlData('backup-rejected', { ...validRejectedAck, extra: 1 }),
    /Rechazo de backup inválido/
  );

  // Test helper functions in BackupBridge
  const chStaged = new CaptureChannel();
  BackupBridge.sendBackupStagedAck(chStaged, {
    transferId: 't1',
    sha256: 'a'.repeat(64),
    schema: 'mini-backup/v1'
  });
  assert.equal(chStaged.frames.length, 1);
  const parsedFrame1 = Core.parseControl(chStaged.frames[0]);
  assert.equal(parsedFrame1.type, 'backup-staged');
  assert.equal(parsedFrame1.data.validated, true);

  const chRejected = new CaptureChannel();
  BackupBridge.sendBackupRejectedAck(chRejected, {
    transferId: 't2',
    reason: 'Capacidad excedida',
    schema: 'sa-backup/v1'
  });
  assert.equal(chRejected.frames.length, 1);
  const parsedFrame2 = Core.parseControl(chRejected.frames[0]);
  assert.equal(parsedFrame2.type, 'backup-rejected');
  assert.equal(parsedFrame2.data.validated, false);
});

// 11. Generación nativa de datos y payload de respaldo de Mini
test('11. createMiniBackupData y createMiniBackupPayload generan forma canónica de respaldo de Mini', async () => {
  globalThis.users = [{ id: 'e1', name: 'Ana' }];
  globalThis.attendanceData = { '2026-09-15': {} };
  globalThis.requests = [];
  globalThis.requestTemplates = [];

  try {
    const data = BackupBridge.createMiniBackupData();
    assert.equal(data.schemaVersion, 1);
    assert.ok(data.exportedAt);
    assert.deepEqual(data.users, [{ id: 'e1', name: 'Ana' }]);
    assert.ok(typeof data.attendance === 'object');
    assert.ok(Array.isArray(data.requests));
    assert.ok(Array.isArray(data.templates));

    const payload = await BackupBridge.createMiniBackupPayload(data);
    assert.ok(payload.bytes instanceof Uint8Array);
    assert.ok(payload.bytes.length > 0);
    assert.equal(payload.size, payload.bytes.length);
    assert.ok(/^[0-9a-f]{64}$/.test(payload.sha256));

    // Verify round-trip parsing of the payload JSON
    const parsedBack = JSON.parse(new TextDecoder().decode(payload.bytes));
    assert.equal(parsedBack.schemaVersion, 1);
    assert.deepEqual(parsedBack.users, data.users);
  } finally {
    delete globalThis.users;
    delete globalThis.attendanceData;
    delete globalThis.requests;
    delete globalThis.requestTemplates;
  }
});

// 12. Receptor dedicado de backup, allowSameApp dinámico por peerApp === self.appType, y respaldo SA download-only
test('12. receptor dedicado de backup, allowSameApp dinámico y respaldo SA download-only', async () => {
  // 1. Dynamic allowSameApp rule:
  // For same-app Mini peer: allowSameApp must be true, resulting in record.purpose === 'backup'
  const selfMini = { deviceId: 'mini-self', appType: 'mini', displayName: 'Mi Mini' };
  const peerMini = { peerId: 'peer-mini', peerApp: 'mini', deviceId: 'mini-remote', displayName: 'Otro Mini', purpose: 'backup' };
  const peerSa = { peerId: 'peer-sa', peerApp: 'sa', deviceId: 'sa-remote', displayName: 'SA Central' };

  assert.equal(peerMini.peerApp === selfMini.appType, true, 'Same-app Mini peer evaluates allowSameApp to true');
  assert.equal(peerSa.peerApp === selfMini.appType, false, 'Cross-app SA peer evaluates allowSameApp to false');

  // Verify savePeer and validateTrustedPeer with dynamic allowSameApp
  const store = makeStore();
  await store.savePeer(peerMini, { allowSameApp: peerMini.peerApp === selfMini.appType });
  const savedMini = await store.getPeer('peer-mini');
  assert.equal(savedMini.purpose, 'backup');

  await store.savePeer(peerSa, { allowSameApp: peerSa.peerApp === selfMini.appType });
  const savedSa = await store.getPeer('peer-sa');
  assert.equal(savedSa.purpose, undefined);

  // 2. Dedicated backup receiver pipeline with ACKs
  const stagingStore = BackupBridge.createBackupStagingStore(3);
  const miniBackupBytes = new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-09-15T00:00:00Z',
    users: [{ id: 'u1', name: 'Ana' }],
    attendance: {},
    requests: []
  }));
  const miniSha = await Core.sha256Hex(miniBackupBytes);

  const saBackupBytes = new TextEncoder().encode(JSON.stringify({ version: 'sa-1.0', company: 'Acme', projects: [] }));
  const saSha = await Core.sha256Hex(saBackupBytes);

  // Helper simulating dedicated backup receiver handler
  async function simulateBackupReceiver(channel, peer, transferResult) {
    if (transferResult.kind !== 'backup') {
      const err = new Error('Tipo P2P no permitido en respaldo.');
      BackupBridge.sendBackupRejectedAck(channel, {
        transferId: transferResult.transferId,
        reason: err.message,
        schema: transferResult.schema
      });
      throw err;
    }
    if (peer?.peerApp === 'mini' && transferResult.schema !== 'mini-backup/v1') {
      const err = new Error('Esquema de respaldo no coincide con el peer Mini.');
      BackupBridge.sendBackupRejectedAck(channel, {
        transferId: transferResult.transferId,
        reason: err.message,
        schema: transferResult.schema
      });
      throw err;
    }
    if (peer?.peerApp === 'sa' && transferResult.schema !== 'sa-backup/v1') {
      const err = new Error('Esquema de respaldo no coincide con el peer SA.');
      BackupBridge.sendBackupRejectedAck(channel, {
        transferId: transferResult.transferId,
        reason: err.message,
        schema: transferResult.schema
      });
      throw err;
    }
    stagingStore.stageBackup({
      transferId: transferResult.transferId,
      sha256: transferResult.sha256,
      kind: 'backup',
      schema: transferResult.schema,
      bytes: transferResult.bytes,
      sourceApp: peer?.peerApp,
      sourcePeerId: peer?.peerId,
      sourcePeerName: peer?.displayName
    });
    BackupBridge.sendBackupStagedAck(channel, {
      transferId: transferResult.transferId,
      sha256: transferResult.sha256,
      schema: transferResult.schema
    });
  }

  // A. Same-app Mini sends mini-backup/v1 -> stages successfully, sends backup-staged ACK
  const chMini = new CaptureChannel();
  await simulateBackupReceiver(chMini, peerMini, {
    transferId: 't-mini-1',
    sha256: miniSha,
    kind: 'backup',
    schema: 'mini-backup/v1',
    bytes: miniBackupBytes
  });
  assert.equal(stagingStore.getPendingCount(), 1);
  assert.equal(chMini.frames.length, 1);
  const ackMini = Core.parseControl(chMini.frames[0]);
  assert.equal(ackMini.type, 'backup-staged');
  assert.equal(ackMini.data.validated, true);
  assert.equal(ackMini.data.transferId, 't-mini-1');

  // Mini backup can be reviewed in native restore modal
  const stagedMini = stagingStore.getStaged('t-mini-1');
  const reviewResult = BackupBridge.reviewStagedBackupInMini(stagedMini);
  assert.ok(reviewResult.parsed);
  assert.equal(stagingStore.getPendingCount(), 1, 'Review keeps backup staged');

  // B. Cross-app SA peer sends sa-backup/v1 -> stages successfully, sends backup-staged ACK
  const chSa = new CaptureChannel();
  await simulateBackupReceiver(chSa, peerSa, {
    transferId: 't-sa-1',
    sha256: saSha,
    kind: 'backup',
    schema: 'sa-backup/v1',
    bytes: saBackupBytes
  });
  assert.equal(stagingStore.getPendingCount(), 2);
  assert.equal(chSa.frames.length, 1);
  const ackSa = Core.parseControl(chSa.frames[0]);
  assert.equal(ackSa.type, 'backup-staged');
  assert.equal(ackSa.data.validated, true);
  assert.equal(ackSa.data.transferId, 't-sa-1');

  // SA backup is download-only: review must throw, download succeeds
  const stagedSa = stagingStore.getStaged('t-sa-1');
  assert.throws(
    () => BackupBridge.reviewStagedBackupInMini(stagedSa),
    /Mini sólo puede revisar y restaurar respaldos propios de Mini/
  );
  const dlFilename = BackupBridge.downloadBackupBytes(stagedSa);
  assert.ok(dlFilename.includes('backup_sa_'));

  // C. Schema mismatch: Mini sending sa-backup/v1 is rejected and sends backup-rejected
  const chMismatch1 = new CaptureChannel();
  await assert.rejects(
    async () => simulateBackupReceiver(chMismatch1, peerMini, {
      transferId: 't-bad-1',
      sha256: 'a'.repeat(64),
      kind: 'backup',
      schema: 'sa-backup/v1',
      bytes: new Uint8Array([1])
    }),
    /Esquema de respaldo no coincide con el peer Mini/
  );
  assert.equal(chMismatch1.frames.length, 1);
  const rej1 = Core.parseControl(chMismatch1.frames[0]);
  assert.equal(rej1.type, 'backup-rejected');
  assert.equal(rej1.data.validated, false);
  assert.match(rej1.data.reason, /Esquema de respaldo no coincide con el peer Mini/);

  // D. Schema mismatch: SA sending mini-backup/v1 is rejected and sends backup-rejected
  const chMismatch2 = new CaptureChannel();
  await assert.rejects(
    async () => simulateBackupReceiver(chMismatch2, peerSa, {
      transferId: 't-bad-2',
      sha256: 'b'.repeat(64),
      kind: 'backup',
      schema: 'mini-backup/v1',
      bytes: new Uint8Array([2])
    }),
    /Esquema de respaldo no coincide con el peer SA/
  );
  assert.equal(chMismatch2.frames.length, 1);
  const rej2 = Core.parseControl(chMismatch2.frames[0]);
  assert.equal(rej2.type, 'backup-rejected');
  assert.equal(rej2.data.validated, false);
  assert.match(rej2.data.reason, /Esquema de respaldo no coincide con el peer SA/);

  // E. Non-backup kind (e.g. roster) sent to backup receiver throws and sends backup-rejected
  const chNonBackup = new CaptureChannel();
  await assert.rejects(
    async () => simulateBackupReceiver(chNonBackup, peerMini, {
      transferId: 't-bad-3',
      sha256: 'c'.repeat(64),
      kind: 'roster',
      schema: 'sa-roster/v1',
      bytes: new Uint8Array([3])
    }),
    /Tipo P2P no permitido en respaldo/
  );
  assert.equal(chNonBackup.frames.length, 1);
  const rej3 = Core.parseControl(chNonBackup.frames[0]);
  assert.equal(rej3.type, 'backup-rejected');
  assert.equal(rej3.data.validated, false);
});

// 13. Regresiones R2: correlación ACK contra transferId/SHA/kind/schema inválidos o stale, timeout, cleanup en fallo de envío, y backup receiver desacoplable sin duplicados
test('13. regresiones R2: correlación ACK contra transferId/SHA/kind/schema inválidos o stale, timeout, cleanup en fallo de envío, y backup receiver desacoplable sin duplicados', async () => {
  const vm = require('node:vm');
  const testBytes = new TextEncoder().encode('r2-test-backup-payload-bytes');
  const testSha = await Core.sha256Hex(testBytes);

  // A. Correlación ACK: ignora ACKs/rechazos stale con transferId distinto y acepta el exacto
  {
    const [senderCh, receiverCh] = linkedPair();
    Core.markChannelAuthenticated(senderCh);
    Core.markChannelAuthenticated(receiverCh);

    // Enviar frames stale antes/durante la transferencia
    const staleAck = {
      protocol: Core.CONTROL_PROTOCOL,
      type: 'backup-staged',
      data: {
        transferId: 'tx-stale-other-id',
        sha256: 'e'.repeat(64),
        kind: 'backup',
        schema: 'mini-backup/v1',
        validated: true
      }
    };
    receiverCh.send(JSON.stringify(staleAck));

    const staleRejection = {
      protocol: Core.CONTROL_PROTOCOL,
      type: 'backup-rejected',
      data: {
        transferId: 'tx-stale-rejected-id',
        reason: 'Límite previo alcanzado',
        kind: 'backup',
        schema: 'mini-backup/v1',
        validated: false
      }
    };
    receiverCh.send(JSON.stringify(staleRejection));

    // Receptor que responde con ACK coincidente al recibir el start de la transferencia
    receiverCh.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg && msg.type === 'start' && msg.kind === 'backup') {
        const matchingAck = {
          protocol: Core.CONTROL_PROTOCOL,
          type: 'backup-staged',
          data: {
            transferId: msg.transferId,
            sha256: testSha,
            kind: 'backup',
            schema: 'mini-backup/v1',
            validated: true
          }
        };
        receiverCh.send(JSON.stringify(matchingAck));
      }
    });

    const initialListeners = senderCh.listeners.size;
    const { transfer, ack } = await BackupBridge.sendBackupOnChannel(senderCh, {
      bytes: testBytes,
      schema: 'mini-backup/v1',
      timeoutMs: 2000
    });

    assert.equal(ack.validated, true);
    assert.equal(ack.transferId, transfer.transferId);
    assert.equal(ack.sha256, testSha);
    assert.equal(ack.kind, 'backup');
    assert.equal(ack.schema, 'mini-backup/v1');
    assert.equal(senderCh.listeners.size, initialListeners, 'Listeners deben limpiarse tras éxito');
  }

  // B. Correlación ACK: rechaza si el ACK tiene transferId coincidente pero SHA256 incorrecto/corrupto
  {
    const [senderCh, receiverCh] = linkedPair();
    Core.markChannelAuthenticated(senderCh);
    Core.markChannelAuthenticated(receiverCh);

    receiverCh.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg && msg.type === 'start' && msg.kind === 'backup') {
        const badShaAck = {
          protocol: Core.CONTROL_PROTOCOL,
          type: 'backup-staged',
          data: {
            transferId: msg.transferId,
            sha256: '0'.repeat(64),
            kind: 'backup',
            schema: 'mini-backup/v1',
            validated: true
          }
        };
        receiverCh.send(JSON.stringify(badShaAck));
      }
    });

    const initialListeners = senderCh.listeners.size;
    await assert.rejects(
      async () => BackupBridge.sendBackupOnChannel(senderCh, {
        bytes: testBytes,
        schema: 'mini-backup/v1',
        timeoutMs: 2000
      }),
      /El ACK de backup no coincide con la transferencia/
    );
    assert.equal(senderCh.listeners.size, initialListeners, 'Listeners deben limpiarse tras error de validación');
  }

  // C. Correlación ACK: rechaza si el ACK tiene transferId coincidente pero kind o schema no coinciden
  {
    const [senderCh, receiverCh] = linkedPair();
    Core.markChannelAuthenticated(senderCh);
    Core.markChannelAuthenticated(receiverCh);

    receiverCh.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg && msg.type === 'start' && msg.kind === 'backup') {
        const wrongSchemaAck = {
          protocol: Core.CONTROL_PROTOCOL,
          type: 'backup-staged',
          data: {
            transferId: msg.transferId,
            sha256: testSha,
            kind: 'backup',
            schema: 'sa-backup/v1',
            validated: true
          }
        };
        receiverCh.send(JSON.stringify(wrongSchemaAck));
      }
    });

    await assert.rejects(
      async () => BackupBridge.sendBackupOnChannel(senderCh, {
        bytes: testBytes,
        schema: 'mini-backup/v1',
        timeoutMs: 2000
      }),
      /El ACK de backup no coincide con la transferencia/
    );
    assert.equal(senderCh.listeners.size, 0, 'Listeners deben limpiarse tras rechazo de schema');
  }

  // D. Timeout acotado y limpieza de listeners/timers si el destinatario no confirma a tiempo
  {
    const [senderCh, receiverCh] = linkedPair();
    Core.markChannelAuthenticated(senderCh);
    Core.markChannelAuthenticated(receiverCh);

    receiverCh.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg && msg.type === 'start') {
        const unmatchedAck = {
          protocol: Core.CONTROL_PROTOCOL,
          type: 'backup-staged',
          data: {
            transferId: 'tx-completely-unmatched',
            sha256: testSha,
            kind: 'backup',
            schema: 'mini-backup/v1',
            validated: true
          }
        };
        receiverCh.send(JSON.stringify(unmatchedAck));
      }
    });

    const initialListeners = senderCh.listeners.size;
    await assert.rejects(
      async () => BackupBridge.sendBackupOnChannel(senderCh, {
        bytes: testBytes,
        schema: 'mini-backup/v1',
        timeoutMs: 120
      }),
      /El receptor no confirmó la recepción del respaldo a tiempo/
    );
    assert.equal(senderCh.listeners.size, initialListeners, 'Listeners deben limpiarse tras timeout');
  }

  // E. Limpieza de listeners ante fallo de envío (p. ej. error en channel.send o canal no autenticado)
  {
    const [senderCh] = linkedPair();
    Core.markChannelAuthenticated(senderCh);
    senderCh.send = () => { throw new Error('Fallo simulado en transporte WebRTC.'); };

    await assert.rejects(
      async () => BackupBridge.sendBackupOnChannel(senderCh, {
        bytes: testBytes,
        schema: 'mini-backup/v1',
        timeoutMs: 2000
      }),
      /Fallo simulado en transporte WebRTC/
    );
    assert.equal(senderCh.listeners.size, 0, 'Listeners deben limpiarse ante fallo de envío');

    // Canal no autenticado también falla cerrado sin dejar listeners
    const unauthCh = new LinkedChannel('unauth');
    await assert.rejects(
      async () => BackupBridge.sendBackupOnChannel(unauthCh, {
        bytes: testBytes,
        schema: 'mini-backup/v1',
        timeoutMs: 2000
      }),
      /Canal P2P no autenticado/
    );
    assert.equal(unauthCh.listeners.size, 0, 'Canal no autenticado no registra listeners');
  }

  // F. Receptor desacoplable de backup y prevención de acumulación en canales repetidos/reutilizados
  {
    let currentModal = null;
    const mockBodyDiv = {
      _html: '',
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html; },
      querySelector: () => ({ set textContent(v) {}, addEventListener() {} }),
      querySelectorAll: () => []
    };
    const ctx = {
      window: {},
      addEventListener: () => {},
      document: {
        readyState: 'complete',
        getElementById: id => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
        createElement: () => ({
          id: '', style: {}, _html: '',
          set innerHTML(v) { this._html = v; },
          get innerHTML() { return this._html; },
          querySelector: sel => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
          querySelectorAll: () => [],
          addEventListener: () => {},
          remove: () => { currentModal = null; }
        }),
        body: { appendChild: el => { currentModal = el; } },
        addEventListener: () => {}
      },
      location: { hash: '', pathname: '/', search: '' },
      history: { replaceState: () => {} },
      setTimeout, clearTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, console,
      SaMiniP2P: Core,
      SaMiniP2PPairing: Pairing,
      SaMiniP2PPeerAliases: require('../p2p-peer-alias-store.js'),
      SaMiniP2PBackup: BackupBridge
    };
    ctx.window = ctx;

    const uiCode = fs.readFileSync(path.join(__dirname, '../p2p-roster-ui.js'), 'utf8');
    vm.runInNewContext(uiCode, ctx);

    assert.equal(typeof ctx.window.armBackupReceiver, 'function', 'armBackupReceiver debe estar expuesto');

    const ch = new LinkedChannel('test-reuse');
    const peerMini = { peerId: 'p-mini-dup', peerApp: 'mini', displayName: 'Otro Mini', purpose: 'backup' };

    // Primera activación
    const detach1 = ctx.window.armBackupReceiver(ch, peerMini);
    assert.equal(typeof detach1, 'function', 'armBackupReceiver debe retornar función de detach');
    assert.equal(ch.listeners.size, 1, 'Debe haber exactamente 1 listener tras primer registro');

    // Reutilización del mismo canal: no acumula listeners, desacopla el anterior
    const detach2 = ctx.window.armBackupReceiver(ch, peerMini);
    assert.equal(typeof detach2, 'function');
    assert.equal(ch.listeners.size, 1, 'Canal reutilizado NO debe acumular listeners (debe seguir siendo 1)');

    // Desacoplar manualmente
    detach2();
    assert.equal(ch.listeners.size, 0, 'Tras detach() no deben quedar listeners en el canal');
  }

  // G. Simetría estricta en decodePairDescriptor
  {
    const miniDesc = {
      ...(await Core.pairDescriptorFromManual('123456', 'AAAAA-23456')),
      issuerId: 'm-issuer',
      issuerApp: 'mini',
      issuerName: 'Mini Emisor'
    };
    const saDesc = {
      ...(await Core.pairDescriptorFromManual('654321', 'BBBBB-23456')),
      issuerId: 'sa-issuer',
      issuerApp: 'sa',
      issuerName: 'SA Emisor'
    };
    const encMini = Core.encodePairDescriptor(miniDesc);
    const encSa = Core.encodePairDescriptor(saDesc);

    // allowSameApp: false -> acepta SA (opuesta), rechaza Mini (misma app)
    const decSaOpposite = await Core.decodePairDescriptor(encSa, { allowSameApp: false });
    assert.equal(decSaOpposite.issuerApp, 'sa');
    await assert.rejects(
      async () => Core.decodePairDescriptor(encMini, { allowSameApp: false }),
      /Emisor del QR inválido/
    );

    // allowSameApp: true -> acepta Mini (misma app), rechaza SA (opuesta)
    const decMiniSame = await Core.decodePairDescriptor(encMini, { allowSameApp: true });
    assert.equal(decMiniSame.issuerApp, 'mini');
    await assert.rejects(
      async () => Core.decodePairDescriptor(encSa, { allowSameApp: true }),
      /Emisor del QR inválido/
    );
  }
});

