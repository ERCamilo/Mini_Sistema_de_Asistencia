const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../p2p-core.js');
const Pairing = require('../p2p-pairing.js');

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

class CloseCountingChannel extends CaptureChannel {
  constructor() { super(); this.closeCalls = 0; }
  close() {
    this.closeCalls += 1;
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
  }
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
    // Intentionally drop a message when the remote listener is not attached yet.
    // This reproduces the DataChannel open/listener race that the hello echo closes.
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

class CountingWebSocket {
  static OPEN = 1;
  static last = null;
  constructor() {
    this.readyState = 0;
    this.closeCalls = 0;
    CountingWebSocket.last = this;
    queueMicrotask(() => { this.readyState = CountingWebSocket.OPEN; this.onopen?.(); });
  }
  send() {}
  close(code = 1000, reason = 'done') {
    this.closeCalls += 1;
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

class CountingDataChannel {
  constructor() {
    this.readyState = 'connecting';
    this.bufferedAmount = 0;
    this.closeCalls = 0;
  }
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {
    this.closeCalls += 1;
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
  }
}

class CountingRtcPeerConnection {
  static last = null;
  constructor() {
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.channel = null;
    this.closeCalls = 0;
    CountingRtcPeerConnection.last = this;
  }
  createDataChannel() {
    this.channel = new CountingDataChannel();
    return this.channel;
  }
  close() {
    this.closeCalls += 1;
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
  }
}

async function withFakeRtcEnvironment(callback) {
  const previousWebSocket = globalThis.WebSocket;
  const previousRtc = globalThis.RTCPeerConnection;
  try {
    globalThis.WebSocket = CountingWebSocket;
    globalThis.RTCPeerConnection = CountingRtcPeerConnection;
    return await callback();
  } finally {
    if (previousWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previousWebSocket;
    if (previousRtc === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = previousRtc;
  }
}

async function openFakeSession(onState) {
  const signaling = new Core.SignalingClient({ room: 'room', peerId: 'mini', proof: 'a'.repeat(64) });
  const session = await Core.createRtcSession({ signaling, initiator: true, onState });
  const channel = session.channel;
  channel.readyState = 'open';
  return { session, channel, pc: CountingRtcPeerConnection.last, ws: CountingWebSocket.last };
}

function makeStore() {
  const saved = [];
  return {
    saved,
    async savePeer(peer) { saved.push({ ...peer }); return { ...peer }; }
  };
}

async function makePairDescriptor(issuerId = 'sa-device') {
  return {
    ...(await Core.pairDescriptorFromManual('583214', 'ABCDE-23456')),
    issuerId,
    issuerApp: 'sa',
    issuerName: 'SA'
  };
}

async function deliverFrames(frames, receiver, mutate = x => x) {
  for (let i = 0; i < frames.length; i++) {
    const frame = mutate(frames[i], i, frames);
    if (frame === undefined) continue;
    await receiver({ data: frame });
  }
}

function markAuthenticated(channel) {
  Core.markChannelAuthenticated(channel);
}

async function sendTestPayload(text, options = {}) {
  const channel = new CaptureChannel();
  markAuthenticated(channel);
  const sent = await Core.sendPayload(channel, { kind: 'roster', schema: 'sa-roster/v1', text, ...options });
  return { channel, sent };
}

test('P2P transfer round-trips multiple chunks and verifies exact SHA-256', async () => {
  const text = JSON.stringify({ schema: 'sa-roster/v1', employees: [{ name: 'A'.repeat(Core.CHUNK_SIZE * 2) }] });
  const { channel, sent } = await sendTestPayload(text);
  assert.ok(channel.frames.length >= 4, 'start + multiple chunks + end');
  let complete = null;
  let error = null;
  const receiver = Core.createTransferReceiver({ channel, onComplete: r => { complete = r; }, onError: e => { error = e; } });
  await deliverFrames(channel.frames, receiver);
  assert.equal(error, null);
  assert.ok(complete);
  assert.equal(complete.transferId, sent.transferId);
  assert.equal(complete.sha256, sent.sha256);
  assert.equal(complete.text, text);
});

test('P2P transfer rejects a corrupted SHA-256 before staging payload', async () => {
  const { channel } = await sendTestPayload('{"schema":"sa-roster/v1"}');
  let complete = false;
  let error = null;
  const receiver = Core.createTransferReceiver({ channel, onComplete: () => { complete = true; }, onError: e => { error = e; } });
  await deliverFrames(channel.frames, receiver, (frame, index) => {
    if (index !== 0) return frame;
    const start = JSON.parse(frame);
    start.sha256 = '0'.repeat(64);
    return JSON.stringify(start);
  });
  assert.equal(complete, false);
  assert.match(error?.message || '', /SHA-256 no coincide/);
});

test('P2P transfer fails closed on duplicate and missing chunks', async () => {
  const { channel } = await sendTestPayload('x'.repeat(Core.CHUNK_SIZE + 50));
  const start = channel.frames[0];
  const chunks = channel.frames.slice(1, -1);
  const end = channel.frames.at(-1);

  let duplicateError = null;
  const duplicateChannel = new CaptureChannel();
  markAuthenticated(duplicateChannel);
  const duplicateReceiver = Core.createTransferReceiver({ channel: duplicateChannel, onError: e => { duplicateError = e; } });
  await duplicateReceiver({ data: start });
  await duplicateReceiver({ data: chunks[0] });
  await duplicateReceiver({ data: chunks[0] });
  assert.match(duplicateError?.message || '', /Chunk duplicado/);

  let missingComplete = false;
  let missingError = null;
  const missingChannel = new CaptureChannel();
  markAuthenticated(missingChannel);
  const missingReceiver = Core.createTransferReceiver({ channel: missingChannel, onComplete: () => { missingComplete = true; }, onError: e => { missingError = e; } });
  await missingReceiver({ data: start });
  await missingReceiver({ data: chunks[0] });
  await missingReceiver({ data: end });
  assert.equal(missingComplete, false);
  assert.match(missingError?.message || '', /Faltan chunks/);
});

test('P2P transfer requires authenticated state and ignores limit overrides', async () => {
  const unauthenticated = new CaptureChannel();
  await assert.rejects(
    () => Core.sendPayload(unauthenticated, { kind: 'roster', schema: 'sa-roster/v1', text: '{}' }),
    /no autenticado/
  );

  const { sent } = await sendTestPayload('{}', { maxBytes: 1 });
  assert.equal(sent.size, 2, 'caller limits must not replace the hard protocol limit');

  const channel = new CaptureChannel();
  markAuthenticated(channel);
  await assert.rejects(
    () => Core.sendPayload(channel, { kind: 'roster', schema: 'sa-roster/v1', text: 'x'.repeat(Core.MAX_ROSTER_BYTES + 1), maxBytes: Core.MAX_ROSTER_BYTES * 2 }),
    /límite permitido/
  );
  await assert.rejects(
    () => Core.sendPayload(channel, { kind: 'attendance', schema: 'attendance/v1', text: '{}' }),
    /Sólo se admite roster/
  );
});

test('P2P transfer rejects non-canonical chunk metadata and exact-length violations', async () => {
  const { channel } = await sendTestPayload('x'.repeat(Core.CHUNK_SIZE + 50));
  const errorFor = async mutate => {
    let error = null;
    const receiverChannel = new CaptureChannel();
    markAuthenticated(receiverChannel);
    const receiver = Core.createTransferReceiver({ channel: receiverChannel, onError: e => { error = e; } });
    await deliverFrames(channel.frames, receiver, mutate);
    return error;
  };

  const wrongChunkSize = await errorFor((frame, index) => {
    if (index !== 0) return frame;
    const start = JSON.parse(frame);
    start.chunkSize += 1;
    return JSON.stringify(start);
  });
  assert.match(wrongChunkSize?.message || '', /Tamaño de chunk/);

  const wrongCount = await errorFor((frame, index) => {
    if (index !== 0) return frame;
    const start = JSON.parse(frame);
    start.totalChunks += 1;
    return JSON.stringify(start);
  });
  assert.match(wrongCount?.message || '', /Cantidad de chunks/);

  const oversizedChunk = await errorFor((frame, index) => {
    if (index !== 1) return frame;
    const raw = new Uint8Array(frame);
    const oversized = new Uint8Array(raw.byteLength + 1);
    oversized.set(raw);
    return oversized.buffer;
  });
  assert.match(oversizedChunk?.message || '', /Longitud de chunk|Límite agregado/);
});

test('P2P transfer rejects malformed framing and aggregate overflow', async () => {
  const { channel } = await sendTestPayload('x'.repeat(Core.CHUNK_SIZE));
  let error = null;
  const receiver = Core.createTransferReceiver({ channel, onError: e => { error = e; } });
  await receiver({ data: JSON.stringify({ protocol: Core.TRANSFER_PROTOCOL, type: 'start', transferId: 'bad', kind: 'roster', schema: 'sa-roster/v1', size: 1, chunkSize: Core.CHUNK_SIZE, totalChunks: 1, sha256: '0'.repeat(64), extra: true }) });
  assert.match(error?.message || '', /Inicio de transferencia inválido/);

  const start = channel.frames[0];
  const raw = new Uint8Array(channel.frames[1]);
  const aggregate = new Uint8Array(raw.byteLength + 1);
  aggregate.set(raw);
  let overflowError = null;
  const overflowChannel = new CaptureChannel();
  markAuthenticated(overflowChannel);
  const overflowReceiver = Core.createTransferReceiver({ channel: overflowChannel, onError: e => { overflowError = e; } });
  await overflowReceiver({ data: start });
  await overflowReceiver({ data: aggregate.buffer });
  assert.match(overflowError?.message || '', /Longitud de chunk|Límite agregado/);
});

test('P2P transfer receiver fails closed without an authenticated bound channel', async () => {
  const { channel: source } = await sendTestPayload('{}');
  const start = source.frames[0];
  const cases = [
    { label: 'omitted channel', options: {} },
    { label: 'null channel', options: { channel: null } },
    { label: 'unauthenticated channel', options: { channel: new CaptureChannel() } }
  ];

  for (const { label, options } of cases) {
    let complete = false;
    let error = null;
    const receiver = Core.createTransferReceiver({
      ...options,
      onComplete: () => { complete = true; },
      onError: e => { error = e; }
    });

    await receiver({ data: start });
    assert.equal(complete, false, `${label} must fail before onComplete`);
    assert.match(error?.message || '', /no autenticado/);
  }
});

test('roster rejection ACK uses the canonical exact fields and transfer binding', () => {
  const channel = new CaptureChannel();
  markAuthenticated(channel);
  const rejection = {
    transferId: 'transfer-1',
    reason: 'El roster no pasó la validación.',
    kind: 'roster',
    schema: 'sa-roster/v1',
    validated: false
  };
  Core.sendControl(channel, 'roster-rejected', rejection);
  assert.deepEqual(JSON.parse(channel.frames[0]).data, rejection);
  assert.deepEqual(Core.validateRosterRejected(rejection, { transferId: rejection.transferId }), rejection);
  assert.throws(
    () => Core.sendControl(channel, 'roster-rejected', { ...rejection, reason: undefined }),
    /Rechazo de roster inválido/
  );
  assert.throws(
    () => Core.validateRosterRejected(rejection, { transferId: 'other-transfer' }),
    /no coincide/
  );
});

test('first pairing survives a lost initial hello and initiator persists only after receiver ACK', async () => {
  const [saChannel, miniChannel] = linkedPair();
  const saStore = makeStore();
  let releaseMiniSave;
  const miniSaved = [];
  const miniStore = {
    saved: miniSaved,
    savePeer(peer) {
      return new Promise(resolve => {
        releaseMiniSave = () => { miniSaved.push({ ...peer }); resolve({ ...peer }); };
      });
    }
  };
  const descriptor = await makePairDescriptor('sa-device');
  const saSelf = { deviceId: 'sa-device', appType: 'sa', displayName: 'SA' };
  const miniSelf = { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' };
  let saCandidate, miniCandidate, saLinked = false, miniLinked = false;

  // SA attaches first: its initial hello is deliberately dropped by LinkedChannel.
  Pairing.attachPairing(saChannel, {
    self: saSelf, descriptor, initiator: true, store: saStore,
    onCandidate: c => { saCandidate = c; }, onLinked: () => { saLinked = true; }, onError: e => { throw e; }
  });
  Pairing.attachPairing(miniChannel, {
    self: miniSelf, descriptor, initiator: false, store: miniStore,
    onCandidate: c => { miniCandidate = c; }, onLinked: () => { miniLinked = true; }, onError: e => { throw e; }
  });

  await waitFor(() => saCandidate && miniCandidate, 'both SAS candidates');
  assert.equal(saCandidate.sas, miniCandidate.sas);
  await saCandidate.accept();
  await miniCandidate.accept();
  await waitFor(() => typeof releaseMiniSave === 'function', 'receiver token persistence');
  assert.equal(saStore.saved.length, 0, 'initiator must not persist before receiver confirms storage');
  assert.equal(saLinked, false);

  releaseMiniSave();
  await waitFor(() => saLinked && miniLinked, 'pair-linked bilateral completion');
  assert.equal(miniSaved.length, 1);
  assert.equal(saStore.saved.length, 1);
  assert.equal(saStore.saved[0].linkToken, miniSaved[0].linkToken);
  assert.equal(saStore.saved[0].linkToken.length, 43);
  assert.equal(Core.isChannelAuthenticated(saChannel), true);
  assert.equal(Core.isChannelAuthenticated(miniChannel), true);
});

test('pairing enforces the opposite app role, exact link-token shape, and five-minute manual sessions', async () => {
  assert.throws(() => Core.validateLinkToken('a'.repeat(32)), /Token persistente/);
  assert.throws(() => Core.validateLinkToken('='.repeat(43)), /Token persistente/);
  const miniStore = Core.makeIdentityStore('mini');
  assert.throws(() => miniStore.savePeer({ peerId: 'sa-device', peerApp: 'sa', linkToken: 'bad' }), /Token persistente/);
  assert.throws(() => miniStore.savePeer({ peerId: 'mini-device', peerApp: 'mini', linkToken: Core.randomToken(32) }), /app remota P2P no es compatible/);
  const expiryWindowStart = Date.now();
  const manual = await Core.pairDescriptorFromManual('583214', 'ABCDE-23456');
  assert.ok(manual.expiresAt > expiryWindowStart);
  assert.equal(manual.expiresAt, Core.pairSessionExpiry(expiryWindowStart));
  await assert.rejects(
    () => Core.pairDescriptorFromManual('583214', 'ABCDE-23456', Date.now() - 1),
    /expiró/
  );

  const [a, b] = linkedPair();
  let errorSeen = null;
  const descriptor = await makePairDescriptor('mini-a');
  Pairing.attachPairing(a, {
    self: { deviceId: 'mini-a', appType: 'mini', displayName: 'Mini A' },
    descriptor, initiator: true, store: makeStore(), onError: e => { errorSeen = e; }
  });
  Pairing.attachPairing(b, {
    self: { deviceId: 'mini-b', appType: 'mini', displayName: 'Mini B' },
    descriptor, initiator: false, store: makeStore(), onError: e => { errorSeen = e; }
  });
  await waitFor(() => errorSeen, 'opposite app role rejection');
  assert.match(errorSeen.message, /app remota P2P no es compatible/);
  assert.equal(Core.isChannelAuthenticated(a), false);
  assert.equal(Core.isChannelAuthenticated(b), false);

  let trustedError = null;
  const trusted = new LinkedChannel('trusted');
  Pairing.attachTrusted(trusted, {
    self: { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' },
    peer: { peerId: 'sa-device', peerApp: 'sa', linkToken: 'not-a-token' },
    store: makeStore(), onError: e => { trustedError = e; }
  });
  assert.match(trustedError?.message || '', /Token persistente/);
  assert.equal(Core.isChannelAuthenticated(trusted), false);
});

test('first-pair signaling requires discrete expiry while trusted routes stay non-expiring', async () => {
  const descriptor = await makePairDescriptor('sa-device');
  const firstPair = new Core.SignalingClient({
    room: descriptor.room,
    peerId: 'mini-device',
    proof: descriptor.proof,
    expiresAt: descriptor.expiresAt
  });
  assert.equal(firstPair.expiresAt, descriptor.expiresAt);
  assert.throws(
    () => new Core.SignalingClient({ room: descriptor.room, peerId: 'mini-device', proof: descriptor.proof }),
    /requiere expiración/
  );

  const route = await Core.deriveTrustedRoute(Core.randomToken(32));
  const trusted = new Core.SignalingClient({ room: route.room, peerId: 'mini-device', proof: route.proof });
  assert.equal(trusted.expiresAt, null);
});

test('canonical pairing controls use sessionId and trusted controls use peerId', () => {
  const sessionId = 'a'.repeat(64);
  const nonce = Core.randomToken(16);
  const mac = 'b'.repeat(64);
  const pairAccept = Core.validateControlFrame({
    protocol: Core.CONTROL_PROTOCOL,
    type: 'pair-accept',
    data: { deviceId: 'mini-device', sessionId }
  });
  assert.deepEqual(pairAccept.data, { deviceId: 'mini-device', sessionId });
  assert.throws(
    () => Core.validateControlFrame({
      protocol: Core.CONTROL_PROTOCOL,
      type: 'pair-accept',
      data: { deviceId: 'mini-device', peerId: 'sa-device' }
    }),
    /Confirmación P2P inválida/
  );

  const trustedHello = Core.validateControlFrame({
    protocol: Core.CONTROL_PROTOCOL,
    type: 'trusted-hello',
    data: { deviceId: 'mini-device', peerId: 'sa-device', nonce, mac }
  });
  assert.deepEqual(trustedHello.data, { deviceId: 'mini-device', peerId: 'sa-device', nonce, mac });
  assert.throws(
    () => Core.validateControlFrame({
      protocol: Core.CONTROL_PROTOCOL,
      type: 'trusted-hello',
      data: { deviceId: 'mini-device', sessionId, nonce, mac }
    }),
    /Prueba de confianza P2P inválida/
  );
});

test('pair-linked ACK is bound to the exact session, token, and both device IDs', async () => {
  const [saChannel, miniChannel] = linkedPair();
  const descriptor = await makePairDescriptor('sa-device');
  let saCandidate = null;
  let miniCandidate = null;
  let saError = null;
  Pairing.attachPairing(saChannel, {
    self: { deviceId: 'sa-device', appType: 'sa', displayName: 'SA' }, descriptor, initiator: true,
    store: makeStore(), onCandidate: c => { saCandidate = c; }, onError: e => { saError = e; }
  });
  Pairing.attachPairing(miniChannel, {
    self: { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' }, descriptor, initiator: false,
    store: makeStore(), onCandidate: c => { miniCandidate = c; }, onError: () => {}
  });
  await waitFor(() => saCandidate && miniCandidate, 'pairing candidates for ACK binding');
  miniChannel.transform = frame => {
    if (typeof frame !== 'string') return frame;
    const message = JSON.parse(frame);
    if (message.type === 'pair-linked') message.data.sessionId = '0'.repeat(64);
    return JSON.stringify(message);
  };
  await saCandidate.accept();
  await miniCandidate.accept();
  await waitFor(() => saError, 'bound pair-linked ACK rejection');
  assert.match(saError.message, /no pertenece|inválida/);
  assert.equal(Core.isChannelAuthenticated(saChannel), false);
  assert.equal(Core.isChannelAuthenticated(miniChannel), false);
});

test('trusted reconnect survives a lost initial challenge and authenticates both directions', async () => {
  const [saChannel, miniChannel] = linkedPair();
  const linkToken = Core.randomToken(32);
  const saSelf = { deviceId: 'sa-device', appType: 'sa', displayName: 'SA' };
  const miniSelf = { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' };
  const saPeer = { peerId: 'mini-device', peerApp: 'mini', displayName: 'Mini', linkToken };
  const miniPeer = { peerId: 'sa-device', peerApp: 'sa', displayName: 'SA', linkToken };
  let saOk = false, miniOk = false;
  let completedAuthentications = 0;
  let prematureError = null;
  const onError = error => { if (completedAuthentications < 2) prematureError = error; };

  // First SA challenge is dropped because Mini has no listener yet.
  Pairing.attachTrusted(saChannel, { self: saSelf, peer: saPeer, store: makeStore(), onAuthenticated: () => { saOk = true; completedAuthentications += 1; }, onError });
  Pairing.attachTrusted(miniChannel, { self: miniSelf, peer: miniPeer, store: makeStore(), onAuthenticated: () => { miniOk = true; completedAuthentications += 1; }, onError });
  await waitFor(() => saOk && miniOk, 'mutual trusted authentication');
  assert.equal(completedAuthentications, 2);
  assert.equal(prematureError, null);
});

test('trusted reconnect ignores a valid late handshake after authentication', async () => {
  const [saChannel, miniChannel] = linkedPair();
  const token = Core.randomToken(Core.LINK_TOKEN_BYTES);
  const errors = [];
  let saOk = false;
  let miniOk = false;
  Pairing.attachTrusted(saChannel, {
    self: { deviceId: 'sa-device', appType: 'sa', displayName: 'SA' },
    peer: { peerId: 'mini-device', peerApp: 'mini', displayName: 'Mini', linkToken: token },
    store: makeStore(), onAuthenticated: () => { saOk = true; }, onError: error => errors.push(error)
  });
  Pairing.attachTrusted(miniChannel, {
    self: { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' },
    peer: { peerId: 'sa-device', peerApp: 'sa', displayName: 'SA', linkToken: token },
    store: makeStore(), onAuthenticated: () => { miniOk = true; }, onError: error => errors.push(error)
  });
  await waitFor(() => saOk && miniOk, 'trusted peers authenticated');

  const nonce = Core.randomToken(16);
  const mac = await Core.hmacHex(token, `trusted-hello:v1:sa-device:mini-device:${nonce}`);
  const late = JSON.stringify(Core.validateControlFrame({
    protocol: Core.CONTROL_PROTOCOL,
    type: 'trusted-hello',
    data: { deviceId: 'sa-device', peerId: 'mini-device', nonce, mac }
  }));
  for (const handler of [...miniChannel.listeners]) await handler({ data: late });

  assert.equal(errors.length, 0);
  assert.equal(Core.isChannelAuthenticated(saChannel), true);
  assert.equal(Core.isChannelAuthenticated(miniChannel), true);
});

test('trusted reconnect rejects peers that do not share the persisted link token', async () => {
  const [saChannel, miniChannel] = linkedPair();
  const saSelf = { deviceId: 'sa-device', appType: 'sa', displayName: 'SA' };
  const miniSelf = { deviceId: 'mini-device', appType: 'mini', displayName: 'Mini' };
  let errorSeen = null;
  let authenticated = false;
  Pairing.attachTrusted(saChannel, {
    self: saSelf,
    peer: { peerId: 'mini-device', peerApp: 'mini', displayName: 'Mini', linkToken: Core.randomToken(32) },
    store: makeStore(), onAuthenticated: () => { authenticated = true; }, onError: e => { errorSeen = e; }
  });
  Pairing.attachTrusted(miniChannel, {
    self: miniSelf,
    peer: { peerId: 'sa-device', peerApp: 'sa', displayName: 'SA', linkToken: Core.randomToken(32) },
    store: makeStore(), onAuthenticated: () => { authenticated = true; }, onError: e => { errorSeen = e; }
  });
  await waitFor(() => errorSeen, 'HMAC mismatch');
  assert.equal(authenticated, false);
  assert.match(errorSeen.message, /Autenticación|confianza/);
  assert.equal(Core.isChannelAuthenticated(saChannel), false);
  assert.equal(Core.isChannelAuthenticated(miniChannel), false);
  await assert.rejects(
    () => Core.sendPayload(saChannel, { kind: 'roster', schema: 'sa-roster/v1', text: '{}' }),
    /no autenticado|no conectado/
  );
});

test('socket close and ICE failure revoke any authenticated channel', async () => {
  const previousWebSocket = globalThis.WebSocket;
  const previousRtc = globalThis.RTCPeerConnection;
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }
    send() {}
    close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: 'done' }); }
  }
  class FakeChannel {
    constructor() { this.readyState = 'connecting'; this.bufferedAmount = 0; }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() { this.readyState = 'closed'; this.onclose?.(); }
  }
  class FakeRtc {
    constructor() { this.connectionState = 'new'; this.iceConnectionState = 'new'; this.channel = null; FakeRtc.last = this; }
    createDataChannel() { this.channel = new FakeChannel(); return this.channel; }
    close() { this.connectionState = 'closed'; this.iceConnectionState = 'closed'; }
  }
  try {
    globalThis.WebSocket = FakeWebSocket;
    globalThis.RTCPeerConnection = FakeRtc;
    const signaling = new Core.SignalingClient({ room: 'room', peerId: 'mini', proof: 'a'.repeat(64) });
    const session = await Core.createRtcSession({ signaling, initiator: true });
    const channel = session.channel;
    channel.readyState = 'open';
    Core.markChannelAuthenticated(channel);
    signaling.ws.onclose({ code: 1006, reason: 'network' });
    assert.equal(Core.isChannelAuthenticated(channel), false);

    const secondSignaling = new Core.SignalingClient({ room: 'room', peerId: 'mini', proof: 'a'.repeat(64) });
    const secondSession = await Core.createRtcSession({ signaling: secondSignaling, initiator: true });
    const secondChannel = secondSession.channel;
    secondChannel.readyState = 'open';
    Core.markChannelAuthenticated(secondChannel);
    const pc = FakeRtc.last;
    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange();
    assert.equal(Core.isChannelAuthenticated(secondChannel), false);
  } finally {
    if (previousWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previousWebSocket;
    if (previousRtc === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = previousRtc;
  }
});

test('peer-left tears down RTC and signaling exactly once', async () => {
  await withFakeRtcEnvironment(async () => {
    const states = [];
    const { session, channel, pc, ws } = await openFakeSession((status, error) => states.push({ status, error }));
    Core.markChannelAuthenticated(channel);

    const peerLeft = JSON.stringify({ v: 1, type: 'peer-left', peer: 'sa-device', code: 1000, reason: 'gone' });
    ws.onmessage({ data: peerLeft });
    await waitFor(() => session.isClosed(), 'peer-left teardown');

    assert.equal(Core.isChannelAuthenticated(channel), false);
    assert.equal(channel.closeCalls, 1, 'peer-left closes the DataChannel once');
    assert.equal(pc.closeCalls, 1, 'peer-left closes RTC once');
    assert.equal(ws.closeCalls, 1, 'peer-left closes signaling once');
    assert.equal(states.filter(({ status }) => status === 'error').length, 1, 'peer-left reports one error');

    ws.onmessage?.({ data: peerLeft });
    assert.equal(channel.closeCalls, 1, 'late peer-left does not double-close DataChannel');
    assert.equal(pc.closeCalls, 1, 'late peer-left does not double-close RTC');
    assert.equal(ws.closeCalls, 1, 'late peer-left does not double-close signaling');
  });
});

test('authenticated transfer protocol and integrity failures revoke and close once', async () => {
  const cases = [
    {
      label: 'malformed JSON',
      frames: async () => ['{"protocol":'],
      expected: /Unexpected token|JSON/
    },
    {
      label: 'corrupted chunk hash',
      frames: async () => {
        const { channel } = await sendTestPayload('x'.repeat(Core.CHUNK_SIZE));
        const frames = [...channel.frames];
        const chunk = new Uint8Array(frames[1]);
        chunk[4] ^= 0xff;
        frames[1] = chunk.buffer;
        return frames;
      },
      expected: /SHA-256 no coincide/
    },
    {
      label: 'invalid chunk framing',
      frames: async () => {
        const { channel } = await sendTestPayload('x');
        const frames = [...channel.frames];
        const chunk = new Uint8Array(frames[1]);
        const oversized = new Uint8Array(chunk.byteLength + 1);
        oversized.set(chunk);
        frames[1] = oversized.buffer;
        return frames;
      },
      expected: /Longitud de chunk inválida/
    }
  ];

  for (const scenario of cases) {
    const channel = new CloseCountingChannel();
    markAuthenticated(channel);
    const errors = [];
    const receiver = Core.createTransferReceiver({ channel, onError: error => errors.push(error) });
    const frames = await scenario.frames();
    await deliverFrames(frames, receiver);
    await receiver({ data: frames[0] });

    assert.equal(errors.length, 1, `${scenario.label} reports one error`);
    assert.match(errors[0].message, scenario.expected);
    assert.equal(Core.isChannelAuthenticated(channel), false, `${scenario.label} revokes authentication`);
    assert.equal(channel.closeCalls, 1, `${scenario.label} closes the DataChannel once`);
  }
});

test('unexpected DataChannel close or error tears down once while clean close is idempotent', async () => {
  await withFakeRtcEnvironment(async () => {
    for (const event of ['close', 'error']) {
      const states = [];
      const { session, channel, pc, ws } = await openFakeSession((status, error) => states.push({ status, error }));
      Core.markChannelAuthenticated(channel);
      if (event === 'close') {
        channel.onclose();
        channel.onclose();
      } else {
        channel.onerror();
        channel.onerror();
      }

      assert.equal(session.isClosed(), true, `${event} closes the RTC session`);
      assert.equal(Core.isChannelAuthenticated(channel), false, `${event} revokes authentication`);
      assert.equal(channel.closeCalls, 1, `${event} closes the DataChannel once`);
      assert.equal(pc.closeCalls, 1, `${event} closes RTC once`);
      assert.equal(ws.closeCalls, 1, `${event} closes signaling once`);
      assert.equal(states.filter(({ status }) => status === 'error').length, 1, `${event} reports one error`);
    }

    const cleanStates = [];
    const clean = await openFakeSession((status, error) => cleanStates.push({ status, error }));
    Core.markChannelAuthenticated(clean.channel);
    clean.session.close();
    clean.session.close();

    assert.equal(clean.session.isClosed(), true);
    assert.equal(Core.isChannelAuthenticated(clean.channel), false);
    assert.equal(clean.channel.closeCalls, 1, 'clean close closes the DataChannel once');
    assert.equal(clean.pc.closeCalls, 1, 'clean close closes RTC once');
    assert.equal(clean.ws.closeCalls, 1, 'clean close closes signaling once');
    assert.equal(cleanStates.filter(({ status }) => status === 'error').length, 0, 'clean close reports no error');
  });
});
