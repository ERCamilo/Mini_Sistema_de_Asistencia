const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const Core = require('../p2p-core.js');

class MockChannel {
  constructor(name = 'mock-channel') {
    this.name = name;
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.listeners = new Map();
    this.sentFrames = [];
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    if (this.listeners.has(type)) this.listeners.get(type).delete(fn);
  }
  send(data) {
    this.sentFrames.push(data);
  }
  emit(type, event) {
    const set = this.listeners.get(type);
    if (set) {
      for (const fn of [...set]) fn(event);
    }
  }
  close() {
    this.readyState = 'closed';
    this.emit('close', {});
  }
}

function createMockStore({ self = { deviceId: 'mini-dev-1', appType: 'mini', displayName: 'Mini Central' }, peers = [] } = {}) {
  let peerList = [...peers];
  return {
    getSelf: async () => ({ ...self }),
    listPeers: async () => [...peerList],
    getPeer: async (id) => peerList.find(p => p.peerId === id) || null,
    savePeer: async (p) => {
      const idx = peerList.findIndex(x => x.peerId === p.peerId);
      if (idx >= 0) peerList[idx] = { ...peerList[idx], ...p };
      else peerList.push({ ...p });
    },
    removePeer: async (id) => { peerList = peerList.filter(p => p.peerId !== id); },
    _peers: () => peerList
  };
}

function loadPresenceEnv({
  peers = [],
  online = true,
  stagedEntries = []
} = {}) {
  const uiCode = read('p2p-roster-ui.js');
  const store = createMockStore({ peers });

  let navOnline = online;
  const docListeners = new Map();
  const winListeners = new Map();

  const activeIntervals = new Set();
  const activeTimeouts = new Set();
  const unrefSetInterval = (fn, ms) => {
    const t = setInterval(fn, ms);
    activeIntervals.add(t);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };
  const unrefClearInterval = (t) => {
    activeIntervals.delete(t);
    clearInterval(t);
  };
  const unrefSetTimeout = (fn, ms) => {
    const t = setTimeout(fn, ms);
    activeTimeouts.add(t);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };
  const unrefClearTimeout = (t) => {
    activeTimeouts.delete(t);
    clearTimeout(t);
  };

  const mockHeaderBtn = {
    attributes: new Map(),
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) ?? null; },
    removeAttribute(k) { this.attributes.delete(k); },
    _children: {
      label: { textContent: '' },
      ring: {
        appendChild(child) { mockHeaderBtn._children.onlineBadge = child; }
      },
      pendingBadge: {
        hidden: true,
        textContent: '',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        removeAttribute(k) { this.attributes.delete(k); }
      },
      onlineBadge: {
        hidden: true,
        textContent: '',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        removeAttribute(k) { this.attributes.delete(k); }
      }
    },
    querySelector(sel) {
      if (sel === '.header-p2p-link-label') return this._children.label;
      if (sel === '.header-p2p-ring') return this._children.ring;
      if (sel === '[data-p2p-header-pending]') return this._children.pendingBadge;
      if (sel === '[data-p2p-header-online]') return this._children.onlineBadge;
      return null;
    }
  };

  const stagedStore = {
    list: () => [...stagedEntries],
    getAll: () => [...stagedEntries],
    load: (id) => (id ? stagedEntries.find(e => e.peerId === id) : stagedEntries[0]) || null,
    get: (id) => stagedEntries.find(e => e.peerId === id) || null,
    save: () => {},
    clear: () => {}
  };

  const ctx = {
    window: {},
    navigator: {
      get onLine() { return navOnline; },
      set onLine(v) { navOnline = Boolean(v); }
    },
    document: {
      readyState: 'complete',
      visibilityState: 'visible',
      getElementById: (id) => (id === 'btn-attendance-link' ? mockHeaderBtn : null),
      createElement: (tag) => ({
        tagName: tag,
        className: '',
        attributes: new Map(),
        hidden: false,
        textContent: '',
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) ?? null; },
        removeAttribute(k) { this.attributes.delete(k); }
      }),
      addEventListener: (type, fn) => {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type).add(fn);
      }
    },
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    setTimeout: unrefSetTimeout,
    clearTimeout: unrefClearTimeout,
    setInterval: unrefSetInterval,
    clearInterval: unrefClearInterval,
    Date, JSON, String, Array, Math, Number, Error, TypeError, console,
    SaMiniP2P: { ...Core, makeIdentityStore: () => store },
    SaMiniP2PPairing: {
      attachTrusted: (ch, { onAuthenticated }) => {
        Core.markChannelAuthenticated(ch);
        onAuthenticated?.();
      }
    },
    SaMiniP2PPeerAliases: {
      createPeerAliasStore: () => ({
        resolveName: p => p?.alias || p?.displayName || 'SA',
        getAlias: () => null
      })
    },
    SaMiniP2PActivity: {
      createStagedRosterStore: () => stagedStore,
      createActivityStore: () => ({
        list: () => [],
        record: () => {},
        markStagedReviewed: () => {}
      })
    },
    MiniP2PActivityStore: {
      createStagedStore: () => stagedStore,
      createStagedRosterStore: () => stagedStore,
      createActivityStore: () => ({
        list: () => [],
        record: () => {},
        markStagedReviewed: () => {}
      })
    },
    IconSet: { iconSvg: () => '<svg></svg>' }
  };
  ctx.window = ctx;

  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  return {
    ctx,
    store,
    stagedStore,
    headerBtn: mockHeaderBtn,
    cleanup: () => {
      for (const t of activeIntervals) clearInterval(t);
      for (const t of activeTimeouts) clearTimeout(t);
      activeIntervals.clear();
      activeTimeouts.clear();
      for (const p of peers) {
        try { ctx.MiniP2PPresence?.detach(p.peerId); } catch (_) {}
      }
    },
    setNetworkOnline: (v) => {
      navOnline = Boolean(v);
      if (v) {
        ctx.MiniP2PPresence.handleOnline();
        const set = winListeners.get('online');
        if (set) for (const fn of set) fn();
      } else {
        ctx.MiniP2PPresence.handleOffline();
        const set = winListeners.get('offline');
        if (set) for (const fn of set) fn();
      }
    },
    triggerVisibility: (state = 'visible') => {
      ctx.document.visibilityState = state;
      const dSet = docListeners.get('visibilitychange');
      if (dSet) for (const fn of dSet) fn();
      const wSet = winListeners.get('visibilitychange');
      if (wSet) for (const fn of wSet) fn();
    },
    triggerFocus: () => {
      const set = winListeners.get('focus');
      if (set) for (const fn of set) fn();
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Core Schema and Factory Contract (p2p-core.js)
// ---------------------------------------------------------------------------

test('F3.4 presence constants match exact contract specification', () => {
  assert.equal(Core.PRESENCE_PING_TYPE, 'presence-ping/v1');
  assert.equal(Core.PRESENCE_PONG_TYPE, 'presence-pong/v1');
  assert.equal(Core.PRESENCE_HEARTBEAT_MS, 25000);
  assert.equal(Core.PRESENCE_TTL_MS, 60000);
});

test('validatePresenceProbeId enforces bounded non-empty string <= 128 chars', () => {
  assert.equal(Core.validatePresenceProbeId('probe-123'), 'probe-123');
  assert.equal(Core.validatePresenceProbeId('bounded-id'), 'bounded-id');
  const max128 = 'a'.repeat(128);
  assert.equal(Core.validatePresenceProbeId(max128), max128);

  assert.throws(() => Core.validatePresenceProbeId(''), /inválido/);
  assert.throws(() => Core.validatePresenceProbeId(null), /inválido/);
  assert.throws(() => Core.validatePresenceProbeId(undefined), /inválido/);
  assert.throws(() => Core.validatePresenceProbeId(12345), /inválido/);
  assert.throws(() => Core.validatePresenceProbeId('b'.repeat(129)), /inválido/);
});

test('validatePresenceFrame enforces exact bounded schema and rejects extra keys', () => {
  const ping = { type: 'presence-ping/v1', probeId: 'p-1', sentAt: 1700000000000 };
  const validatedPing = Core.validatePresenceFrame(ping);
  assert.deepEqual(validatedPing, ping);

  const pong = { type: 'presence-pong/v1', probeId: 'p-1', sentAt: 1700000000000 };
  const validatedPong = Core.validatePresenceFrame(pong);
  assert.deepEqual(validatedPong, pong);

  // Extra unknown keys are rejected fail-closed
  assert.throws(() => Core.validatePresenceFrame({ ...ping, extra: 'forbidden' }), /inválido/);
  assert.throws(() => Core.validatePresenceFrame({ ...pong, payload: {} }), /inválido/);

  // Missing required keys
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1' }), /inválido/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', sentAt: 1700000000000 }), /inválido/);

  // Invalid type
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v2', probeId: 'p-1', sentAt: 100 }), /inválido/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'ping', probeId: 'p-1', sentAt: 100 }), /inválido/);

  // Invalid sentAt
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1', sentAt: -1 }), /sentAt/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1', sentAt: 0 }), /sentAt/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1', sentAt: '1700000' }), /sentAt/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1', sentAt: Infinity }), /sentAt/);
  assert.throws(() => Core.validatePresenceFrame({ type: 'presence-ping/v1', probeId: 'p-1', sentAt: NaN }), /sentAt/);
});

test('makePresencePing and makePresencePong construct conforming frames', () => {
  const ping = Core.makePresencePing('test-probe', 1700000050000);
  assert.equal(ping.type, 'presence-ping/v1');
  assert.equal(ping.probeId, 'test-probe');
  assert.equal(ping.sentAt, 1700000050000);
  assert.doesNotThrow(() => Core.validatePresenceFrame(ping));

  const pong = Core.makePresencePong(ping.probeId, ping.sentAt);
  assert.equal(pong.type, 'presence-pong/v1');
  assert.equal(pong.probeId, 'test-probe');
  assert.equal(pong.sentAt, 1700000050000);
  assert.doesNotThrow(() => Core.validatePresenceFrame(pong));

  // Auto-generated probeId when omitted
  const autoPing = Core.makePresencePing();
  assert.ok(autoPing.probeId.length >= 16);
  assert.ok(autoPing.sentAt > 0);
  assert.doesNotThrow(() => Core.validatePresenceFrame(autoPing));
});

// ---------------------------------------------------------------------------
// 2. Pre-Auth / Untrusted Frame Safety Gate
// ---------------------------------------------------------------------------

test('pre-auth or unauthenticated channel frames NEVER mark peer online', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer] });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelUnauthenticated(channel);
    assert.equal(Core.isChannelAuthenticated(channel), false);

    presence.attach(channel, peer);

    // Peer starts offline
    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // Frame arrives on unauthenticated channel
    const fakePing = Core.makePresencePing('probe-untrusted', 1700000010000);
    channel.emit('message', { data: JSON.stringify(fakePing) });

    // Must NOT mark peer online
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    // Must NOT send pong
    assert.equal(channel.sentFrames.length, 0);

    // Unsolicited pong on unauthenticated channel must also be rejected
    const fakePong = Core.makePresencePong('probe-untrusted', 1700000010000);
    channel.emit('message', { data: JSON.stringify(fakePong) });
    assert.equal(presence.isPeerOnline(peer.peerId), false);
  } finally {
    env.cleanup();
  }
});

test('authenticated channel ping responds with valid pong but does NOT mark online or renew TTL', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer] });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    assert.equal(Core.isChannelAuthenticated(channel), true);

    presence.attach(channel, peer);

    // Channel sent initial outgoing probe on attach
    assert.equal(channel.sentFrames.length, 1);
    const outgoingPing = JSON.parse(channel.sentFrames[0]);
    assert.equal(outgoingPing.type, 'presence-ping/v1');

    // Peer receives ping from authenticated SA
    const incomingPing = Core.makePresencePing('sa-probe-42', Date.now());
    channel.emit('message', { data: JSON.stringify(incomingPing) });

    // Mini responded with pong echoing probeId and sentAt
    assert.equal(channel.sentFrames.length, 2);
    const sentPong = JSON.parse(channel.sentFrames[1]);
    assert.equal(sentPong.type, 'presence-pong/v1');
    assert.equal(sentPong.probeId, 'sa-probe-42');
    assert.equal(sentPong.sentAt, incomingPing.sentAt);

    // Ping alone MUST NOT mark online, MUST NOT refresh lastPongAt
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    assert.equal(presence.getPeerState(peer.peerId), 'offline');
    const tracker = presence.getPresence(peer.peerId);
    assert.equal(tracker.lastPongAt, 0);
  } finally {
    env.cleanup();
  }
});

test('authenticated ping alone does NOT renew TTL or refresh lastPongAt for online peer', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer] });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    presence.attach(channel, peer);

    // Mini sent initial probe
    const probePing = JSON.parse(channel.sentFrames[0]);

    // Correlated pong arrives -> peer becomes online
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probePing.probeId, probePing.sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);
    const tracker = presence.getPresence(peer.peerId);
    const initialPongAt = tracker.lastPongAt;
    assert.ok(initialPongAt > 0);

    // Advance tracker lastPongAt towards expiration
    tracker.lastPongAt = Date.now() - 50000;
    const agedPongAt = tracker.lastPongAt;

    // SA sends incoming ping to Mini
    const incomingPing = Core.makePresencePing('sa-probe-renew', Date.now());
    channel.emit('message', { data: JSON.stringify(incomingPing) });

    // Mini responded with pong echoing probeId
    const lastFrame = JSON.parse(channel.sentFrames[channel.sentFrames.length - 1]);
    assert.equal(lastFrame.type, 'presence-pong/v1');
    assert.equal(lastFrame.probeId, 'sa-probe-renew');

    // Ping alone must NOT refresh lastPongAt
    assert.equal(tracker.lastPongAt, agedPongAt);

    // Age further past TTL (65s > 60s TTL)
    tracker.lastPongAt = Date.now() - 65000;
    presence.expireStale();
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    assert.equal(presence.getPeerState(peer.peerId), 'offline');
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 3. Probe Correlation and Tampering Resistance
// ---------------------------------------------------------------------------

test('pong requires exact probeId and sentAt correlation; mismatched pongs are dropped', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer] });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    presence.attach(channel, peer);

    // Extract the probeId and sentAt from Mini's initial probe
    const probePing = JSON.parse(channel.sentFrames[0]);
    const probeId = probePing.probeId;
    const sentAt = probePing.sentAt;

    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // 1. Pong with unknown probeId is ignored
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong('unknown-probe-xyz', sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // 2. Pong with correct probeId but mismatched sentAt is ignored
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probeId, sentAt + 999))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // 3. Correlated pong with exact probeId and sentAt succeeds
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probeId, sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);

    // 4. When peer is online, uncorrelated pong does NOT renew TTL
    const tracker = presence.getPresence(peer.peerId);
    tracker.lastPongAt = Date.now() - 50000;
    const agedPongAt = tracker.lastPongAt;

    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong('bogus-probe-2', Date.now()))
    });
    assert.equal(tracker.lastPongAt, agedPongAt);

    // 5. Subsequent correlated probe and pong DOES renew TTL
    tracker.sendProbe();
    const probe2 = JSON.parse(channel.sentFrames[channel.sentFrames.length - 1]);
    const nowBeforePong = Date.now();
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probe2.probeId, probe2.sentAt))
    });
    assert.ok(tracker.lastPongAt >= nowBeforePong);
    assert.equal(presence.isPeerOnline(peer.peerId), true);
  } finally {
    env.cleanup();
  }
});

test('heartbeat success does NOT persist peer identity repeatedly to storage', async () => {
  const peer = { peerId: 'sa-hb-peer', peerApp: 'sa', linkToken: 'tok-hb', displayName: 'SA Heartbeat' };
  const env = loadPresenceEnv({ peers: [peer] });
  let savePeerCalls = 0;
  const originalSavePeer = env.store.savePeer;
  env.store.savePeer = async (p) => {
    savePeerCalls += 1;
    return originalSavePeer(p);
  };

  try {
    const presence = env.ctx.MiniP2PPresence;
    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);

    presence.attach(channel, peer);
    assert.equal(savePeerCalls, 0);

    // 1st heartbeat: Mini initial probe ponged
    const probe1 = JSON.parse(channel.sentFrames[0]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probe1.probeId, probe1.sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);
    // Successful heartbeat must NOT write to identityStore
    assert.equal(savePeerCalls, 0);

    // 2nd heartbeat: subsequent probe and correlated pong
    const tracker = presence.getPresence(peer.peerId);
    tracker.sendProbe();
    const probe2 = JSON.parse(channel.sentFrames[channel.sentFrames.length - 1]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probe2.probeId, probe2.sentAt))
    });
    assert.equal(savePeerCalls, 0);

    // 3rd heartbeat: another probe and pong
    tracker.sendProbe();
    const probe3 = JSON.parse(channel.sentFrames[channel.sentFrames.length - 1]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(probe3.probeId, probe3.sentAt))
    });
    assert.equal(savePeerCalls, 0);

    // Incoming pings also do not write to storage
    const incomingPing = Core.makePresencePing('sa-probe-hb', Date.now());
    channel.emit('message', { data: JSON.stringify(incomingPing) });
    assert.equal(savePeerCalls, 0);

    // Bounded lifecycle edge: on disconnect/detach, at most 1 bounded write occurs
    presence.detach(peer.peerId);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(savePeerCalls <= 1);

    const callsAfterDetach = savePeerCalls;
    // Repeated detach does not cause repeated writes
    presence.detach(peer.peerId);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(savePeerCalls, callsAfterDetach);
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4. Network Gate (navigator.onLine === false)
// ---------------------------------------------------------------------------

test('navigator.onLine === false is the absolute gate: halts probes and expires online state', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer], online: true });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    presence.attach(channel, peer);

    const initialProbe = JSON.parse(channel.sentFrames[0]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(initialProbe.probeId, initialProbe.sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);

    // Simulate network offline
    env.setNetworkOnline(false);
    assert.equal(presence.isNetworkOnline(), false);

    // Immediately, peer is reported offline
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    assert.equal(presence.getPeerState(peer.peerId), 'offline');

    // Even if a ping or pong arrives while offline, it cannot establish online state
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePing('offline-probe', Date.now()))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong('offline-probe', Date.now()))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // Back online restores network gate
    env.setNetworkOnline(true);
    assert.equal(presence.isNetworkOnline(), true);
  } finally {
    env.cleanup();
  }
});

test('navigator.onLine === true alone does NOT prove peer availability', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer], online: true });
  try {
    const presence = env.ctx.MiniP2PPresence;

    // Device is online in browser, but no authenticated channel or pong exists
    assert.equal(presence.isNetworkOnline(), true);
    assert.equal(presence.isPeerOnline(peer.peerId), false);
    assert.equal(presence.getPeerState(peer.peerId), 'offline');
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 5. Heartbeat, TTL and Honest Suspension Expiration
// ---------------------------------------------------------------------------

test('peer online state expires honestly after 60s TTL; expireStale() handles resume', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer], online: true });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    presence.attach(channel, peer);

    const initialProbe = JSON.parse(channel.sentFrames[0]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(initialProbe.probeId, initialProbe.sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);

    const tracker = presence.getPresence(peer.peerId);
    assert.ok(tracker.lastPongAt > 0);

    // Simulate browser suspension: advance time by 65s into the past
    tracker.lastPongAt = Date.now() - 65000;

    // TTL expiration check
    assert.equal(presence.isPeerOnline(peer.peerId), false);

    // expireStale() refreshes tracker state and header
    presence.expireStale();
    assert.equal(tracker.isOnline, false);
    assert.equal(presence.getPeerState(peer.peerId), 'offline');
  } finally {
    env.cleanup();
  }
});

test('visibilitychange and focus trigger stale expiration and network check', () => {
  const peer = { peerId: 'sa-peer-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Central' };
  const env = loadPresenceEnv({ peers: [peer], online: true });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);
    presence.attach(channel, peer);

    const initialProbe = JSON.parse(channel.sentFrames[0]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(initialProbe.probeId, initialProbe.sentAt))
    });
    assert.equal(presence.isPeerOnline(peer.peerId), true);

    // Simulate stale state
    const tracker = presence.getPresence(peer.peerId);
    tracker.lastPongAt = Date.now() - 70000;

    // Trigger tab visibility change
    env.triggerVisibility('visible');
    assert.equal(tracker.isOnline, false);

    // Re-establish online
    tracker.lastPongAt = Date.now();
    tracker.isOnline = true;
    assert.equal(presence.isPeerOnline(peer.peerId), true);

    // Stale again and trigger focus
    tracker.lastPongAt = Date.now() - 75000;
    env.triggerFocus();
    assert.equal(tracker.isOnline, false);
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 6. Passive Reconnection Backoff Schedule
// ---------------------------------------------------------------------------

test('passive backoff delay follows 5s -> 15s -> 30s -> 60s max and resets on pong', () => {
  const env = loadPresenceEnv();
  try {
    const inbox = env.ctx.MiniP2PPassiveInbox;
    const presence = env.ctx.MiniP2PPresence;

    assert.deepEqual([...presence.BACKOFF_SCHEDULE_MS], [5000, 15000, 30000, 60000]);
    assert.equal(inbox.backoffDelayMs(0), 5000);
    assert.equal(inbox.backoffDelayMs(1), 15000);
    assert.equal(inbox.backoffDelayMs(2), 30000);
    assert.equal(inbox.backoffDelayMs(3), 60000);
    assert.equal(inbox.backoffDelayMs(4), 60000);
    assert.equal(inbox.backoffDelayMs(10), 60000);

    // Live entry reset on pong
    const peer = { peerId: 'sa-backoff-peer', peerApp: 'sa', linkToken: 'tok-bo', displayName: 'SA Backoff' };
    const liveEntry = { retryCount: 3 };
    const channel = new MockChannel();
    Core.markChannelAuthenticated(channel);

    presence.attach(channel, peer, liveEntry);
    assert.equal(liveEntry.retryCount, 3);

    const initialProbe = JSON.parse(channel.sentFrames[0]);
    channel.emit('message', {
      data: JSON.stringify(Core.makePresencePong(initialProbe.probeId, initialProbe.sentAt))
    });

    // Successful pong resets retryCount to 0!
    assert.equal(liveEntry.retryCount, 0);
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 7. Listener and Timer Deduplication
// ---------------------------------------------------------------------------

test('multiple attach() calls deduplicate timers and listeners without leaks', () => {
  const peer = { peerId: 'sa-dedup', peerApp: 'sa', linkToken: 'tok-d', displayName: 'SA Dedup' };
  const env = loadPresenceEnv({ peers: [peer] });
  try {
    const presence = env.ctx.MiniP2PPresence;

    const channel1 = new MockChannel('ch1');
    const channel2 = new MockChannel('ch2');
    Core.markChannelAuthenticated(channel1);
    Core.markChannelAuthenticated(channel2);

    presence.attach(channel1, peer);
    assert.equal(channel1.listeners.get('message')?.size, 1);

    // Second attach replaces first and cleans up previous listeners
    presence.attach(channel2, peer);
    assert.equal(channel1.listeners.get('message')?.size, 0);
    assert.equal(channel2.listeners.get('message')?.size, 1);

    // Detach cleans up completely
    presence.detach(peer.peerId);
    assert.equal(channel2.listeners.get('message')?.size, 0);
    assert.equal(presence.getPresence(peer.peerId), null);
    assert.equal(presence.isPeerOnline(peer.peerId), false);
  } finally {
    env.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 8. Header UX, Ring States and Independent Badges
// ---------------------------------------------------------------------------

test('Mini header UX displays correct state rings and independent badges', async () => {
  const p1 = { peerId: 'sa-1', peerApp: 'sa', linkToken: 't1', displayName: 'SA 1' };
  const p2 = { peerId: 'sa-2', peerApp: 'sa', linkToken: 't2', displayName: 'SA 2' };

  // Scenario 1: No peers linked -> 'unlinked'
  const envUnlinked = loadPresenceEnv({ peers: [] });
  try {
    await envUnlinked.ctx.refreshMiniP2PHeader();
    assert.equal(envUnlinked.headerBtn.getAttribute('data-p2p-state'), 'unlinked');
    assert.equal(envUnlinked.headerBtn._children.onlineBadge.hidden, true);
    assert.equal(envUnlinked.headerBtn._children.pendingBadge.hidden, true);
  } finally {
    envUnlinked.cleanup();
  }

  // Scenario 2: 1 peer linked, offline -> 'disconnected'
  const envOffline = loadPresenceEnv({ peers: [p1] });
  try {
    await envOffline.ctx.refreshMiniP2PHeader();
    assert.equal(envOffline.headerBtn.getAttribute('data-p2p-state'), 'disconnected');
    assert.equal(envOffline.headerBtn._children.onlineBadge.hidden, true);
    assert.equal(envOffline.headerBtn._children.pendingBadge.hidden, true);
  } finally {
    envOffline.cleanup();
  }

  // Scenario 3: 1 peer online -> 'connected', ring green, online badge hidden (count == 1)
  const env1Online = loadPresenceEnv({ peers: [p1] });
  try {
    const ch1 = new MockChannel();
    Core.markChannelAuthenticated(ch1);
    env1Online.ctx.MiniP2PPresence.attach(ch1, p1);
    const p1Probe = JSON.parse(ch1.sentFrames[0]);
    ch1.emit('message', { data: JSON.stringify(Core.makePresencePong(p1Probe.probeId, p1Probe.sentAt)) });

    await env1Online.ctx.refreshMiniP2PHeader();
    assert.equal(env1Online.headerBtn.getAttribute('data-p2p-state'), 'connected');
    assert.equal(env1Online.headerBtn._children.onlineBadge.hidden, true);
  } finally {
    env1Online.cleanup();
  }

  // Scenario 4: 2 peers online -> online badge visible with count '2'
  const env2Online = loadPresenceEnv({ peers: [p1, p2] });
  try {
    const chA = new MockChannel();
    const chB = new MockChannel();
    Core.markChannelAuthenticated(chA);
    Core.markChannelAuthenticated(chB);
    env2Online.ctx.MiniP2PPresence.attach(chA, p1);
    env2Online.ctx.MiniP2PPresence.attach(chB, p2);
    const pAProbe = JSON.parse(chA.sentFrames[0]);
    const pBProbe = JSON.parse(chB.sentFrames[0]);
    chA.emit('message', { data: JSON.stringify(Core.makePresencePong(pAProbe.probeId, pAProbe.sentAt)) });
    chB.emit('message', { data: JSON.stringify(Core.makePresencePong(pBProbe.probeId, pBProbe.sentAt)) });

    await env2Online.ctx.refreshMiniP2PHeader();
    assert.equal(env2Online.headerBtn.getAttribute('data-p2p-state'), 'connected');
    assert.equal(env2Online.headerBtn._children.onlineBadge.hidden, false);
    assert.equal(env2Online.headerBtn._children.onlineBadge.textContent, '2');
  } finally {
    env2Online.cleanup();
  }

  // Scenario 5: Dual independent badges - 1 peer online, 1 pending review
  const envDual = loadPresenceEnv({
    peers: [p1],
    stagedEntries: [{ peerId: 'sa-1', roster: { employees: [] } }]
  });
  try {
    const chDual = new MockChannel();
    Core.markChannelAuthenticated(chDual);
    envDual.ctx.MiniP2PPresence.attach(chDual, p1);
    const dProbe = JSON.parse(chDual.sentFrames[0]);
    chDual.emit('message', { data: JSON.stringify(Core.makePresencePong(dProbe.probeId, dProbe.sentAt)) });

    await envDual.ctx.refreshMiniP2PHeader();
    assert.equal(envDual.headerBtn.getAttribute('data-p2p-state'), 'connected');
    assert.equal(envDual.headerBtn._children.onlineBadge.hidden, true); // only 1 online
    assert.equal(envDual.headerBtn._children.pendingBadge.hidden, false); // pending staged review exists!
    assert.equal(envDual.headerBtn._children.pendingBadge.textContent, '1');
  } finally {
    envDual.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 9. Invariants and Safety
// ---------------------------------------------------------------------------

test('Notification.requestPermission is NEVER invoked automatically', () => {
  const ui = read('p2p-roster-ui.js');
  assert.doesNotMatch(ui, /Notification\.requestPermission\s*\(/);
});

test('presence frames never write directly to repository or auto-apply rosters', () => {
  const ui = read('p2p-roster-ui.js');
  assert.doesNotMatch(ui, /presence-ping[\s\S]{0,100}employeeRepository/);
  assert.doesNotMatch(ui, /presence-pong[\s\S]{0,100}employeeRepository/);
  assert.doesNotMatch(ui, /presence-ping[\s\S]{0,100}applyReviewedSaRoster/);
});

test('transfer receiver ignores presence frames and does not abort transfers', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes("parsed.type === 'presence-ping/v1' || parsed.type === 'presence-pong/v1'"));
});

test('CSS adheres to design standards: transferring pulse, reduced-motion, and no hex colors', () => {
  const css = read('p2p-transfer.css');
  assert.ok(css.includes('.header-p2p-online-badge'));
  assert.ok(css.includes('mini-p2p-transfer-pulse'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('.mini-p2p-peer-pill'));

  // Ensure no hex colors are introduced in the presence styles
  const onlineBadgeBlock = css.match(/\.header-p2p-online-badge\s*\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(onlineBadgeBlock, /#[0-9a-fA-F]{3,8}/);

  const transferBlock = css.match(/\.header-p2p-link\[data-p2p-state="transferring"\]\s*\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(transferBlock, /#[0-9a-fA-F]{3,8}/);
});
