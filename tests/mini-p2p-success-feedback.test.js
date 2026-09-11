const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function loadFeedbackEnv({
  permission = 'default',
  hidden = false,
  reducedMotion = false,
  withVibrate = true,
  vibrateThrows = false,
  withAudio = true,
  audioThrowsOnConstruct = false,
  withNotification = true,
  notificationThrows = false,
} = {}) {
  const uiCode = read('p2p-roster-ui.js');
  const vibrateCalls = [];
  const audioLog = { constructed: 0, gains: 0, oscs: 0, freqs: [], starts: [], stops: [], gainCalls: [], resumed: 0, closed: 0 };
  const notifLog = { calls: [], requested: false };

  const shellClasses = new Set();
  const shellEl = {
    offsetWidth: 100,
    classList: {
      add: c => shellClasses.add(c),
      remove: c => shellClasses.delete(c),
      contains: c => shellClasses.has(c),
    },
  };
  let currentModal = {
    querySelector: sel => (sel === '.mini-p2p-shell' ? shellEl : null),
    remove: () => { currentModal = null; },
  };

  const MockAudio = withAudio ? class {
    constructor() {
      audioLog.constructed += 1;
      if (audioThrowsOnConstruct) throw new Error('Audio blocked');
      this.destination = {};
      this.currentTime = 0;
    }
    createGain() {
      audioLog.gains += 1;
      return {
        gain: {
          setValueAtTime: (v, t) => audioLog.gainCalls.push(['set', v, t]),
          exponentialRampToValueAtTime: (v, t) => audioLog.gainCalls.push(['ramp', v, t]),
          value: 0,
        },
        connect: () => {},
      };
    }
    createOscillator() {
      audioLog.oscs += 1;
      return {
        type: '',
        frequency: { setValueAtTime: f => audioLog.freqs.push(f) },
        connect: () => {},
        start: t => audioLog.starts.push(t),
        stop: t => audioLog.stops.push(t),
      };
    }
    resume() { audioLog.resumed += 1; return { catch: () => {} }; }
    close() { audioLog.closed += 1; }
  } : undefined;

  const MockNotification = withNotification ? (() => {
    const C = function (title, opts) {
      if (notificationThrows) throw new Error('not allowed');
      notifLog.calls.push({ title, opts });
    };
    C.permission = permission;
    C.requestPermission = () => { notifLog.requested = true; return Promise.resolve(permission); };
    return C;
  })() : undefined;

  const ctx = {
    window: {},
    addEventListener: () => {},
    showToast: () => {},
    document: {
      readyState: 'complete',
      hidden,
      getElementById: id => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => ({
        id: '', style: {}, _html: '',
        set innerHTML(v) { this._html = String(v); },
        get innerHTML() { return this._html; },
        querySelector: () => ({ addEventListener: () => {} }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        remove: () => {},
      }),
      body: { appendChild: () => {} },
      addEventListener: () => {},
    },
    location: { hash: '', pathname: '/', search: '', href: 'https://mini.invalid/' },
    history: { replaceState: () => {} },
    matchMedia: query => ({ matches: Boolean(reducedMotion) && String(query).includes('prefers-reduced-motion') }),
    setTimeout, clearTimeout,
    Date, JSON, String, Array, Math, Number, Error, TypeError, TextEncoder, console,
  };
  ctx.window = ctx;
  if (withVibrate) {
    ctx.navigator = {
      vibrate: pattern => {
        if (vibrateThrows) throw new Error('vibrate blocked');
        vibrateCalls.push(pattern);
        return true;
      },
    };
  }
  if (MockAudio) ctx.AudioContext = MockAudio;
  if (MockNotification) ctx.Notification = MockNotification;
  ctx.SaMiniP2P = {
    makeIdentityStore: () => ({
      getSelf: async () => ({ deviceId: 'mini-1', displayName: 'Mini Norte' }),
      listPeers: async () => [],
      getPeer: async () => null,
    }),
    deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
    SignalingClient: function () {},
    createRtcSession: async () => ({ close() {} }),
    createTransferReceiver: () => () => {},
    parseControl: () => null,
  };
  ctx.SaMiniP2PPairing = { attachTrusted: () => {}, attachPairing: () => {} };
  ctx.SaMiniP2PPeerAliases = {
    createPeerAliasStore: () => ({
      resolveName: p => p.displayName || 'SA',
      getAlias: () => '',
      setAlias: () => {},
      removeAlias: () => {},
    }),
  };
  ctx.IconSet = { iconSvg: () => '<svg></svg>' };

  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);
  return { ctx, vibrateCalls, audioLog, notifLog, shellClasses, shellEl };
}

test('success-feedback helper is small, reusable and progressively enhanced', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('function signalTerminalSuccess('), 'must define one reusable helper');
  assert.ok(ui.includes('root.MiniP2PSuccessFeedback'), 'must expose the helper for tests/consumers');
  assert.ok(ui.includes('firedTerminalSuccessKeys'), 'must dedupe terminal keys');
  assert.ok(ui.includes('modal()?.querySelector?.'), 'visual part must reuse the existing shell');
  assert.ok(ui.includes('mini-p2p-success-pulse'), 'visual part must pulse via stylesheet class');
  assert.ok(ui.includes('mini-p2p-success-done'), 'visual part must keep a static success state');
  assert.ok(ui.includes('isReducedMotion()'), 'must respect reduced motion');
  assert.ok(ui.includes('root.navigator'), 'vibrate must go through root for testability');
  assert.ok(ui.includes('.vibrate(15)'), 'vibrate must be brief');
  assert.ok(ui.includes('root.AudioContext || root.webkitAudioContext'), 'chime must feature-detect AudioContext');
  assert.ok(ui.includes('exponentialRampToValueAtTime(0.05'), 'chime must stay low-volume');
  assert.ok(ui.includes('Notifi') && ui.includes("permission === 'granted'"), 'notification must require granted permission');
  assert.ok(ui.includes('doc.hidden === true') || ui.includes('.hidden === true'), 'notification must require hidden document');
  assert.ok(!ui.includes('requestPermission'), 'must never request notification permission automatically');
  assert.doesNotMatch(ui, /\balert\s*\(/, 'no native alert');
  assert.doesNotMatch(ui, /\bconfirm\s*\(/, 'no native confirm');
  assert.equal((ui.match(/style=/g) || []).length, 0, 'no inline styles');
  assert.doesNotMatch(ui, /👥|🕒|💾|📄|⇄|✎|←|✓|❌|⚠️/, 'no emoji/unicode icons');
});

test('success feedback fires exactly once on the four terminal events, never on intermediate states', () => {
  const ui = read('p2p-roster-ui.js');
  const linkedAt = ui.indexOf('function renderLinkedWaiting');
  assert.ok(linkedAt > 0 && ui.slice(linkedAt, linkedAt + 1200).includes("pair-linked:'"), 'pairing linked must signal once');
  const stageAt = ui.indexOf('async function stageReceivedRoster');
  assert.ok(stageAt > 0 && ui.slice(stageAt, stageAt + 1600).includes("roster-received:'"), 'validated roster must signal once');
  const applyAt = ui.indexOf('async function applyReviewedRoster');
  assert.ok(applyAt > 0 && ui.slice(applyAt, applyAt + 2600).includes("roster-applied:'"), 'applied roster must signal once');
  const armAt = ui.indexOf('function armAttendanceResponder');
  assert.ok(armAt > 0 && ui.slice(armAt, armAt + 1400).includes("attendance-sent:'"), 'attendance responder seam must signal once per response');
  assert.ok(ui.includes('onResponseSent: wrappedSent'), 'responder must forward through a single wrapped callback');
  const progressAt = ui.indexOf('onProgress:progress=>');
  assert.ok(progressAt > 0 && !ui.slice(progressAt, progressAt + 300).includes('signalTerminalSuccess'), 'progress must not signal');
  const readyFn = ui.indexOf('function sendAttendanceReady');
  assert.ok(readyFn > 0 && !ui.slice(readyFn, readyFn + 600).includes('signalTerminalSuccess'), 'ready announcement must not signal');
  const sasFn = ui.indexOf('function renderPairConfirmation');
  assert.ok(sasFn > 0 && !ui.slice(sasFn, sasFn + 900).includes('signalTerminalSuccess'), 'SAS confirmation step must not signal');
});

test('canonical count badge is solid, compact, accessible and avoids (N)', () => {
  const ui = read('p2p-roster-ui.js');
  const css = read('p2p-transfer.css');
  const design = read('UI_DESIGN.md');
  assert.ok(ui.includes('function countBadge('), 'must define a reusable badge helper');
  assert.ok(ui.includes('mini-count-badge'), 'badge markup must exist');
  assert.ok(ui.includes('role="status"'), 'badge must expose status role');
  assert.ok(ui.includes('aria-label="${esc(rounded)}'), 'badge must expose aria count');
  assert.ok(!ui.includes('Ver detalle de cambios (${'), 'detail summary must not use (N)');
  assert.ok(ui.includes('Ver detalle de cambios'), 'detail copy must be preserved');
  assert.ok(ui.includes("countBadge(model.updates.length"), 'detail count must use the badge');
  assert.match(css, /\.mini-count-badge\s*\{[^}]*border-radius:\s*999px;/, 'badge must be circle/pill');
  assert.match(css, /\.mini-count-badge\s*\{[^}]*background:\s*var\(--accent-color\)/, 'badge must use existing tokens');
  assert.match(css, /\.mini-count-badge\s*\{[^}]*color:\s*var\(--bg-color\)/, 'badge number must use token color');
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(css.match(/\.mini-count-badge\s*\{[^}]*\}/)?.[0] || ''), 'badge must not hardcode colors');
  assert.ok(design.includes('Insignia numérica canónica'), 'design doc must define the badge rule');
  assert.ok(design.includes('.mini-count-badge'), 'design doc must name the class');
  assert.ok(design.includes("sin paréntesis tipo `(N)`") || design.includes('(N)'), 'design doc must forbid (N)');
  assert.ok(design.includes('aria-label'), 'design doc must require aria count');
  assert.ok(design.includes('Retroalimentación de éxito terminal'), 'design doc must define success feedback');
  assert.ok(design.includes('nunca pedir permiso'), 'design doc must forbid automatic permission prompts');
});

test('signal() gives visual + vibrate + chime + hidden-only notification, exactly once', () => {
  const env = loadFeedbackEnv({ permission: 'granted', hidden: true });
  const api = env.ctx.MiniP2PSuccessFeedback;
  assert.equal(typeof api.signal, 'function');
  const first = api.signal('pair-linked:sa-1', { title: 'SA vinculado', detail: 'SA Norte quedó vinculado.' });
  assert.equal(first, true);
  assert.ok(env.shellClasses.has('mini-p2p-success-done'), 'visual static state must always apply');
  assert.ok(env.shellClasses.has('mini-p2p-success-pulse'), 'pulse must apply when motion is allowed');
  assert.deepEqual(env.vibrateCalls, [15], 'vibrate must be brief and best-effort');
  assert.equal(env.audioLog.constructed, 1, 'chime must attempt AudioContext once');
  assert.ok(env.audioLog.oscs >= 1, 'chime must create oscillators');
  assert.equal(env.notifLog.calls.length, 1, 'granted+hidden must notify');
  assert.equal(env.notifLog.calls[0].title, 'SA vinculado');
  assert.equal(env.notifLog.requested, false, 'must never request permission');

  const dup = api.signal('pair-linked:sa-1', { title: 'SA vinculado' });
  assert.equal(dup, false, 'duplicates must not re-emit');
  assert.deepEqual(env.vibrateCalls, [15], 'duplicate must not vibrate again');
  assert.equal(env.audioLog.constructed, 1, 'duplicate must not replay sound');
  assert.equal(env.notifLog.calls.length, 1, 'duplicate must not notify again');

  const second = api.signal('roster-received:abc', { title: 'Roster recibido' });
  assert.equal(second, true, 'a new terminal key must emit again');
  assert.equal(env.notifLog.calls.length, 2);
});

test('signal() notifies only when already granted AND hidden', () => {
  for (const [permission, hidden, expected] of [
    ['granted', true, 1],
    ['granted', false, 0],
    ['denied', true, 0],
    ['default', true, 0],
    ['denied', false, 0],
  ]) {
    const env = loadFeedbackEnv({ permission, hidden });
    env.ctx.MiniP2PSuccessFeedback.signal(`k-${permission}-${hidden}`, { title: 'T', detail: 'D' });
    assert.equal(env.notifLog.calls.length, expected, `permission=${permission} hidden=${hidden}`);
    assert.equal(env.notifLog.requested, false, 'must never call requestPermission');
  }
  const noNotif = loadFeedbackEnv({ withNotification: false, hidden: true });
  assert.equal(noNotif.ctx.MiniP2PSuccessFeedback.signal('k-no-notif', { title: 'T' }), true);
  const throwing = loadFeedbackEnv({ permission: 'granted', hidden: true, notificationThrows: true });
  assert.equal(throwing.ctx.MiniP2PSuccessFeedback.signal('k-throw', { title: 'T' }), true, 'notification errors must be caught');
});

test('signal() is best-effort when vibrate/audio are missing or blocked', () => {
  const noVib = loadFeedbackEnv({ permission: 'granted', hidden: true, withVibrate: false });
  assert.equal(noVib.ctx.MiniP2PSuccessFeedback.signal('k1', { title: 'T' }), true);
  assert.ok(noVib.shellClasses.has('mini-p2p-success-done'), 'visual must still apply without vibrate');

  const blockedVib = loadFeedbackEnv({ withVibrate: true, vibrateThrows: true });
  assert.equal(blockedVib.ctx.MiniP2PSuccessFeedback.signal('k1', { title: 'T' }), true);

  const noAudio = loadFeedbackEnv({ withAudio: false });
  assert.equal(noAudio.ctx.MiniP2PSuccessFeedback.signal('k1', { title: 'T' }), true);

  const blockedAudio = loadFeedbackEnv({ audioThrowsOnConstruct: true });
  assert.equal(blockedAudio.ctx.MiniP2PSuccessFeedback.signal('k1', { title: 'T' }), true, 'autoplay/construct errors must be caught');
});

test('signal() respects prefers-reduced-motion for animation', () => {
  const reduced = loadFeedbackEnv({ reducedMotion: true });
  reduced.ctx.MiniP2PSuccessFeedback.signal('k-reduced', { title: 'T' });
  assert.ok(reduced.shellClasses.has('mini-p2p-success-done'), 'static success must remain');
  assert.ok(!reduced.shellClasses.has('mini-p2p-success-pulse'), 'pulse must be skipped under reduced motion');
});

test('chime stays very short and low-volume', () => {
  const env = loadFeedbackEnv({});
  env.ctx.MiniP2PSuccessFeedback.signal('k-chime', { title: 'T' });
  assert.ok(env.audioLog.freqs.length >= 2, 'chime must play at least two notes');
  const maxGain = Math.max(...env.audioLog.gainCalls.map(([, v]) => Number(v)).filter(Number.isFinite));
  assert.ok(maxGain <= 0.1, `chime must stay low-volume, got ${maxGain}`);
  const maxStop = Math.max(...env.audioLog.stops.map(Number).filter(Number.isFinite));
  assert.ok(maxStop <= 0.35, `chime must stay very short, got ${maxStop}`);
});

test('countBadge() hides zero/invalid and stays accessible', () => {
  const env = loadFeedbackEnv({});
  const badge = env.ctx.MiniP2PSuccessFeedback.badge;
  assert.match(badge(3, 'cambios'), /mini-count-badge/);
  assert.match(badge(3, 'cambios'), /aria-label="3 cambios"/);
  assert.match(badge(3, 'cambios'), /role="status"/);
  assert.ok(badge(3, 'cambios').includes('>3<'), 'number must be centered content, not (N)');
  assert.doesNotMatch(badge(3, 'cambios'), /\(3\)/, 'must not render (N)');
  assert.equal(badge(0, 'cambios'), '', 'zero must hide unless meaningful');
  assert.equal(badge(-1, 'cambios'), '', 'negative must hide');
  assert.equal(badge(Number.NaN, 'cambios'), '', 'invalid must hide');
});

test('attendance responder seam forwards the UI callback and signals exactly once per response', async () => {
  const uiCode = read('p2p-roster-ui.js');
  const vibrateCalls = [];
  const mockPeer = { peerId: 'sa-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Norte' };
  const mockSelf = { deviceId: 'mini-1', displayName: 'Mini Norte' };
  let capturedResponderContext = null;
  let waitStatusHtml = '';
  const mockWaitStatusEl = {
    set textContent(v) { waitStatusHtml = String(v); },
    get textContent() { return waitStatusHtml; },
    set innerHTML(v) { waitStatusHtml = String(v); },
    get innerHTML() { return waitStatusHtml; },
    classList: { add: () => {}, remove: () => {} },
  };
  const mockBodyDiv = {
    _html: '',
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel === '[data-wait-status]') return mockWaitStatusEl;
      return { addEventListener() {} };
    },
    querySelectorAll() { return []; },
  };
  let currentModal = null;
  const ctx = {
    window: {},
    addEventListener: () => {},
    showToast: () => {},
    document: {
      readyState: 'complete',
      hidden: false,
      getElementById: id => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => ({
        id: '', style: {}, _html: '',
        set innerHTML(v) { this._html = String(v); },
        get innerHTML() { return this._html; },
        querySelector: sel => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        remove: () => { currentModal = null; },
      }),
      body: { appendChild: el => { currentModal = el; } },
      addEventListener: () => {},
    },
    location: { hash: '', pathname: '/', search: '', href: 'https://mini.invalid/' },
    history: { replaceState: () => {} },
    matchMedia: () => ({ matches: false }),
    navigator: { vibrate: p => { vibrateCalls.push(p); return true; } },
    setTimeout, clearTimeout,
    Date, JSON, String, Array, Math, Number, Error, TypeError, TextEncoder, console,
  };
  ctx.window = ctx;
  ctx.SaMiniP2P = {
    makeIdentityStore: () => ({
      getSelf: async () => mockSelf,
      listPeers: async () => [mockPeer],
      getPeer: async id => (id === mockPeer.peerId ? mockPeer : null),
    }),
    deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
    SignalingClient: function () {},
    createRtcSession: async ({ onChannel }) => {
      onChannel({ readyState: 'open', addEventListener() {}, send() {} });
      return { close() {} };
    },
    isChannelAuthenticated: () => true,
    createTransferReceiver: () => () => {},
    parseControl: () => null,
  };
  ctx.SaMiniP2PPairing = { attachTrusted: (ch, { onAuthenticated }) => { onAuthenticated(); } };
  ctx.SaMiniP2PPeerAliases = {
    createPeerAliasStore: () => ({
      resolveName: p => p.displayName || 'SA',
      getAlias: () => '',
      setAlias: () => {},
      removeAlias: () => {},
    }),
  };
  ctx.AttendanceExport = {
    attachAttendanceResponder: (ch, peer, context) => {
      capturedResponderContext = context;
      return () => {};
    },
  };
  ctx.IconSet = { iconSvg: () => '<svg></svg>' };
  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  await ctx.waitTrustedTransfer('sa-1', 'attendance');
  assert.ok(capturedResponderContext, 'responder must be armed');
  assert.equal(typeof capturedResponderContext.onResponseSent, 'function', 'responder must expose a single wrapped callback');
  assert.ok(ctx.MiniP2PSuccessFeedback.has('attendance-sent:req-9') === false, 'no premature signal before a response');

  capturedResponderContext.onResponseSent({ requestId: 'req-9', saProjectId: 'PRJ-1', ok: true });
  assert.ok(waitStatusHtml.includes('Respuesta de asistencia enviada'), 'UI callback must still update the wait status');
  assert.ok(ctx.MiniP2PSuccessFeedback.has('attendance-sent:req-9'), 'wrapped seam must signal once per response');
  assert.deepEqual(vibrateCalls, [15], 'attendance success must vibrate once');

  capturedResponderContext.onResponseSent({ requestId: 'req-9', saProjectId: 'PRJ-1', ok: true });
  assert.deepEqual(vibrateCalls, [15], 'duplicate response must not re-emit');
});
