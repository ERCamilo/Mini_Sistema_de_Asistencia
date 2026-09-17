const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const Core = require('../p2p-core.js');
const Pairing = require('../p2p-pairing.js');

// ---------------------------------------------------------------------------
// 1. Script order, precaching, and license notice contracts
// ---------------------------------------------------------------------------

test('qrcode.js is vendored with verified SHA-256 pin and THIRD_PARTY_NOTICES entry', () => {
  const qrcodeContent = fs.readFileSync(path.join(root, 'vendor/qrcode.js'));
  const actualHash = crypto.createHash('sha256').update(qrcodeContent).digest('hex');
  const expectedHash = '18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780';
  assert.equal(actualHash, expectedHash, 'vendor/qrcode.js must match pinned SHA-256');

  const notices = read('THIRD_PARTY_NOTICES.md');
  assert.ok(notices.includes('vendor/qrcode.js'), 'notice must cite vendor/qrcode.js');
  assert.ok(notices.includes('Kazuhiko Arase'), 'notice must cite upstream author');
  assert.ok(notices.includes('MIT License'), 'notice must include MIT License');
  assert.ok(notices.includes(expectedHash), 'notice must include exact SHA-256 hash');
});

test('index.html loads vendor/qrcode.js before p2p-roster-ui.js in dependency order', () => {
  const html = read('index.html');
  const qrIndex = html.indexOf('./vendor/qrcode.js');
  const backupIndex = html.indexOf('./p2p-backup-bridge.js');
  const uiIndex = html.indexOf('./p2p-roster-ui.js');

  assert.ok(qrIndex > 0, 'vendor/qrcode.js must be loaded in index.html');
  assert.ok(backupIndex > 0, 'p2p-backup-bridge.js must be loaded');
  assert.ok(uiIndex > 0, 'p2p-roster-ui.js must be loaded');
  assert.ok(qrIndex > backupIndex, 'qrcode.js must load after backup bridge');
  assert.ok(qrIndex < uiIndex, 'qrcode.js must load before p2p-roster-ui.js');
});

test('sw.js precaches vendor/qrcode.js before p2p-roster-ui.js', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes("'./vendor/qrcode.js'"), 'sw.js must precache vendor/qrcode.js');
  const qrPos = sw.indexOf("'./vendor/qrcode.js'");
  const uiPos = sw.indexOf("'./p2p-roster-ui.js'");
  assert.ok(qrPos > 0 && uiPos > 0 && qrPos < uiPos, 'vendor/qrcode.js must appear before p2p-roster-ui.js in precache assets');
});

test('Disabled generic files capability (Archivos) remains unchanged and protected', () => {
  const ui = read('p2p-roster-ui.js');
  const css = read('p2p-transfer.css');
  const html = read('index.html');

  assert.match(ui, /capability\('restore',\s*'Archivos',\s*'Próximamente',\s*'is-disabled'\)/);
  assert.doesNotMatch(ui, /capability\('restore',\s*'Archivos'[^)]*data-open/);
  assert.match(css, /\.mini-p2p-capability\.is-disabled\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.doesNotMatch(ui, /type=["']file["']/);
  assert.doesNotMatch(ui, /showOpenFilePicker/);

  const fileInputs = html.match(/<input[^>]*type=["']file["'][^>]*>/g) || [];
  assert.equal(fileInputs.length, 4, 'Only 4 standard native inputs exist in index.html');
});

test('CSS rules: accessible responsive QR styling with token compliance and no raw hex colors', () => {
  const css = read('p2p-transfer.css');
  const ui = read('p2p-roster-ui.js');

  assert.match(css, /\.mini-p2p-qr-block\s*\{/);
  assert.match(css, /\.mini-p2p-qr-card\s*\{/);
  assert.match(css, /\.mini-p2p-code-panel\s*\{/);

  // Responsive SVG / image sizing
  assert.match(css, /\.mini-p2p-qr-card svg/);
  assert.match(css, /max-width:\s*220px/);

  // Hex color check in p2p-roster-ui.js
  const uiHexMatches = (ui.match(/#[0-9a-fA-F]{3,8}/g) || []).filter(h => h !== '#39');
  assert.equal(uiHexMatches.length, 0, `No direct hex colors allowed in p2p-roster-ui.js: ${uiHexMatches.join(', ')}`);

  // Style attribute check
  assert.equal((ui.match(/style=/g) || []).length, 0, 'No inline style attributes in p2p-roster-ui.js');

  // No emoji icons
  assert.doesNotMatch(ui, /👥|🕒|💾|📄|⇄|✎|←|✓|❌|⚠️|🔗|📷/, 'No emojis as icons in p2p-roster-ui.js');
});


test('confirmation modal stacks above the P2P connection overlay', () => {
  const html = read('index.html');
  const css = read('p2p-transfer.css');
  assert.match(html, /#modal-confirm\s*\{[\s\S]*?z-index:\s*11000/);
  assert.match(css, /\.mini-p2p-overlay\s*\{[\s\S]*?z-index:\s*10050/);
  assert.ok(html.includes('if (confirmEl.classList.contains(\'active\')) return confirmEl;'), 'keyboard/focus priority must keep confirm modal on top');
});

// ---------------------------------------------------------------------------
// 2. QR payload and scanner compatibility
// ---------------------------------------------------------------------------

test('QR payload from buildPairUrl is fully compatible with descriptorFromScannedQr for same-app backup', async () => {
  const self = { deviceId: 'mini-dev-alpha', appType: 'mini', displayName: 'Mini Alpha' };
  const descriptor = await Core.makePairDescriptor(self);

  const baseUrl = 'https://miniasist.example.com/';
  const pairUrl = Core.buildPairUrl(descriptor, baseUrl);

  assert.ok(pairUrl.startsWith(baseUrl + '#p2p='), 'URL must contain hash with p2p param');

  // Simulate scanning the URL via descriptorFromScannedQr logic
  const parsedUrl = new URL(pairUrl);
  const encoded = Core.parsePairHash(parsedUrl.hash);
  assert.ok(encoded, 'Encoded payload must be extracted from hash');

  const decoded = await Core.decodePairDescriptor(encoded, { allowSameApp: true });
  assert.equal(decoded.code, descriptor.code);
  assert.equal(decoded.key, descriptor.key);
  assert.equal(decoded.proof, descriptor.proof.toLowerCase());
  assert.equal(decoded.issuerId, self.deviceId);
  assert.equal(decoded.issuerApp, 'mini');
  assert.equal(decoded.issuerName, self.displayName);
});

test('renderQr generates accessible SVG locally without network dependency', () => {
  const qrcode = require('../vendor/qrcode.js');
  const url = 'https://mini.invalid/#p2p=test';

  const uiSource = read('p2p-roster-ui.js');
  const sandbox = {
    window: {},
    qrcode,
    addEventListener: () => {},
    document: {
      createElement: () => ({ id: '', className: '', innerHTML: '', appendChild() {} }),
      addEventListener: () => {},
      getElementById: () => null,
      readyState: 'complete'
    },
    setTimeout, clearTimeout,
    location: { href: 'https://mini.invalid/', hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    SaMiniP2P: Core,
    SaMiniP2PPairing: Pairing,
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) },
    IconSet: { iconSvg: () => '<svg></svg>' },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(uiSource, sandbox);

  assert.equal(typeof sandbox.renderQr, 'function');
  const markup = sandbox.renderQr(url);

  assert.ok(markup.includes('data-qr-card'), 'must wrap in data-qr-card');
  assert.ok(markup.includes('<svg'), 'must render SVG');
  assert.ok(markup.includes('role="img"'), 'must include role=img for accessibility');
  assert.ok(markup.includes('aria-labelledby'), 'must include aria-labelledby');
  assert.ok(markup.includes('viewBox='), 'must be scalable/responsive with viewBox');
  assert.ok(!markup.includes('http://') && !markup.includes('https://') || markup.includes('http://www.w3.org/2000/svg'), 'no external assets in markup');
});

test('renderQr handles missing generator gracefully without throwing', () => {
  const uiSource = read('p2p-roster-ui.js');
  const sandbox = {
    window: {},
    qrcode: null,
    addEventListener: () => {},
    document: {
      createElement: () => ({ id: '', className: '', innerHTML: '', appendChild() {} }),
      addEventListener: () => {},
      getElementById: () => null,
      readyState: 'complete'
    },
    setTimeout, clearTimeout,
    location: { href: 'https://mini.invalid/', hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    SaMiniP2P: Core,
    SaMiniP2PPairing: Pairing,
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) },
    IconSet: { iconSvg: () => '<svg></svg>' },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(uiSource, sandbox);

  const fallback = sandbox.renderQr('https://mini.invalid/#p2p=test');
  assert.ok(fallback.includes('mini-p2p-qr-warning'), 'must render warning element');
  assert.ok(fallback.includes('QR no disponible'), 'must inform user to use code+key');
});

// ---------------------------------------------------------------------------
// 3. Dynamic regression tests: Sticky/idempotent pairing confirmation
// ---------------------------------------------------------------------------

test('Static contract: startPairing and renderBackupPairShare protect confirmation state', () => {
  const uiSource = read('p2p-roster-ui.js');

  const startPairFn = uiSource.slice(uiSource.indexOf('async function startPairing'), uiSource.indexOf('function renderPairConfirmation'));
  assert.ok(startPairFn.includes("activePairConfirmation || box.getAttribute('data-pair-state') || box.querySelector('[data-accept]')"), 'startPairing must guard against clobbering confirmation');

  const shareFn = uiSource.slice(uiSource.indexOf('async function renderBackupPairShare'), uiSource.indexOf('async function sendBackupToPeer'));
  assert.ok(shareFn.includes("activePairConfirmation || box.getAttribute('data-pair-state') || box.querySelector('[data-accept]')"), 'renderBackupPairShare must guard against clobbering confirmation');

  const renderSasFn = uiSource.slice(uiSource.indexOf('function renderPairConfirmation'), uiSource.indexOf('function renderLinkedWaiting'));
  assert.ok(renderSasFn.includes("box.setAttribute('data-pair-state', 'confirming')"), 'renderPairConfirmation must mark confirming state');
  assert.ok(renderSasFn.includes("box.setAttribute('data-pair-state', 'accepted')"), 'renderPairConfirmation must mark accepted state on accept click');
});

function createMockHarness({ rtcHook, candidateHook } = {}) {
  const qrcode = require('../vendor/qrcode.js');
  const uiSource = read('p2p-roster-ui.js');

  let currentModal = null;
  const attributesMap = new Map();
  const listenersMap = new Map();

  function makeEl(tag = 'div') {
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      style: {},
      hidden: false,
      _html: '',
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html; },
      set textContent(v) { this._html = String(v ?? ''); },
      get textContent() { return this._html; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      classList: {
        _c: new Set(),
        add(c) { this._c.add(c); },
        remove(c) { this._c.delete(c); },
        contains(c) { return this._c.has(c); }
      },
      addEventListener(e, fn) {
        if (!listeners.has(e)) listeners.set(e, []);
        listeners.get(e).push(fn);
      },
      removeEventListener() {},
      click() {
        for (const fn of (listeners.get('click') || [])) fn({ target: el });
      },
      remove() { currentModal = null; },
      appendChild(child) { return child; },
      querySelector(sel) {
        if (sel === '.mini-p2p-body' || sel === '[data-p2p-body]') return bodyEl;
        if (sel === '[data-pair-status]') return statusEl;
        if (sel === '[data-accept]') return acceptBtn;
        if (sel === '[data-reject]') return rejectBtn;
        if (sel === '[data-back]' || sel === '[data-cancel-share]' || sel === '[data-cancel]') {
          return makeEl('button');
        }
        return makeEl('div');
      },
      querySelectorAll() { return []; }
    };
    return el;
  }

  const bodyEl = makeEl('div');
  bodyEl.className = 'mini-p2p-body';
  const statusEl = makeEl('div');
  statusEl.setAttribute('data-pair-status', '');
  const acceptBtn = makeEl('button');
  acceptBtn.setAttribute('data-accept', '');
  const rejectBtn = makeEl('button');
  rejectBtn.setAttribute('data-reject', '');

  currentModal = makeEl('div');
  currentModal.id = 'mini-p2p-transfer-modal';

  const sandbox = {
    window: {},
    qrcode,
    addEventListener: () => {},
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      body: {
        appendChild: (el) => {
          currentModal = el;
          return el;
        }
      },
      createElement: (tag) => {
        const el = makeEl(tag);
        if (el.id === 'mini-p2p-transfer-modal') currentModal = el;
        return el;
      },
      addEventListener: () => {}
    },
    setTimeout, clearTimeout,
    location: { href: 'https://mini.invalid/', hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    SaMiniP2P: {
      ...Core,
      makeIdentityStore: () => ({
        getSelf: async () => ({ deviceId: 'dev-local', appType: 'mini', displayName: 'Mini Local' }),
        listPeers: async () => [],
        getPeer: async () => null,
        removePeer: async () => {}
      }),
      createRtcSession: async ({ onState, onChannel, initiator }) => {
        if (rtcHook) rtcHook({ onState, onChannel, initiator });
        if (onChannel) onChannel({ addEventListener() {}, removeEventListener() {}, send() {} });
        return { close() {} };
      }
    },
    SaMiniP2PPairing: {
      attachPairing(ch, opts) {
        if (candidateHook) candidateHook(opts);
      }
    },
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) },
    IconSet: { iconSvg: () => '<svg></svg>' },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(uiSource, sandbox);

  return { sandbox, bodyEl, statusEl, acceptBtn, rejectBtn, getModal: () => currentModal };
}

test('Behavioral test: simulated late RTC onState(connected/connecting) does not overwrite confirmation UI on receiver (A)', async () => {
  let capturedOnCandidate = null;
  let rtcStateCb = null;

  const harness = createMockHarness({
    rtcHook: ({ onState }) => { rtcStateCb = onState; },
    candidateHook: (opts) => { capturedOnCandidate = opts.onCandidate; }
  });

  const selfB = { deviceId: 'dev-b', appType: 'mini', displayName: 'Mini B' };
  const descriptor = await Core.makePairDescriptor(selfB);

  // Receiver starts pairing
  await harness.sandbox.startPairing(descriptor, { allowSameApp: true });
  assert.ok(typeof capturedOnCandidate === 'function', 'startPairing must wire onCandidate');

  // Candidate is presented to receiver
  let acceptCalled = false;
  capturedOnCandidate({
    remote: { deviceId: 'dev-b', appType: 'mini', displayName: 'Mini B' },
    sas: '849 203',
    accept: async () => { acceptCalled = true; },
    reject: () => {}
  });

  // Verify SAS confirmation is rendered
  assert.equal(harness.statusEl.hidden, false, 'status box must be visible');
  assert.equal(harness.statusEl.getAttribute('data-pair-state'), 'confirming', 'state must be confirming');
  assert.ok(harness.statusEl.innerHTML.includes('849 203'), 'must contain SAS code');
  assert.ok(harness.statusEl.innerHTML.includes('Mini B'), 'must contain remote name');
  assert.ok(harness.statusEl.innerHTML.includes('Confirmar vínculo'), 'must contain accept button');

  // 1. Simulate late RTC connection state callbacks: connecting, connected
  rtcStateCb('connecting', null);
  assert.ok(harness.statusEl.innerHTML.includes('849 203'), 'connecting status must NOT clobber confirmation SAS');
  assert.ok(harness.statusEl.innerHTML.includes('Confirmar vínculo'), 'connecting status must NOT clobber accept button');

  rtcStateCb('connected', null);
  assert.ok(harness.statusEl.innerHTML.includes('849 203'), 'connected status must NOT clobber confirmation SAS');
  assert.ok(harness.statusEl.innerHTML.includes('Confirmar vínculo'), 'connected status must NOT clobber accept button');

  // Verify neither side auto-accepted
  assert.equal(acceptCalled, false, 'accept must NOT be auto-accepted');

  // 2. User clicks Confirmar vínculo
  harness.acceptBtn.click();
  await new Promise(r => setTimeout(r, 10));

  assert.equal(acceptCalled, true, 'accept must be called after explicit user click');
  assert.equal(harness.statusEl.getAttribute('data-pair-state'), 'accepted', 'state must transition to accepted');
  assert.equal(harness.statusEl.textContent, 'Esperando confirmación…');

  // 3. Late RTC state callbacks after user accept must not clobber "Esperando confirmación…"
  rtcStateCb('connected', null);
  assert.equal(harness.statusEl.textContent, 'Esperando confirmación…', 'late connected callback must not clobber post-accept wait text');

  // 4. Real RTC error MUST still surface
  rtcStateCb('error', new Error('WebRTC transport failed'));
  assert.equal(harness.statusEl.getAttribute('data-pair-state'), null, 'error must clear confirmation state');
  assert.ok(harness.statusEl.textContent.includes('Error: WebRTC transport failed'), 'error must surface to user');
});

test('Initiator (B) confirmation UI is protected against late onState callbacks in renderBackupPairShare', async () => {
  let capturedOnCandidate = null;
  let rtcStateCb = null;

  const harness = createMockHarness({
    rtcHook: ({ onState, initiator }) => {
      assert.equal(initiator, true, 'share must be initiator');
      rtcStateCb = onState;
    },
    candidateHook: (opts) => { capturedOnCandidate = opts.onCandidate; }
  });

  // Initiator opens backup share view
  await harness.sandbox.renderBackupPairShare();
  assert.ok(typeof capturedOnCandidate === 'function', 'renderBackupPairShare must set up attachPairing');

  // Present candidate to initiator
  capturedOnCandidate({
    remote: { deviceId: 'dev-a', appType: 'mini', displayName: 'Mini A' },
    sas: '512 890',
    accept: async () => {},
    reject: () => {}
  });

  assert.equal(harness.statusEl.getAttribute('data-pair-state'), 'confirming');
  assert.ok(harness.statusEl.innerHTML.includes('512 890'));

  // Late onState from initiator side must not clobber
  rtcStateCb('connected', null);
  assert.ok(harness.statusEl.innerHTML.includes('512 890'), 'initiator confirmation must not be clobbered by late onState(connected)');

  rtcStateCb('connecting', null);
  assert.ok(harness.statusEl.innerHTML.includes('512 890'), 'initiator confirmation must not be clobbered by late onState(connecting)');
});

test('renderPairConfirmation is idempotent when invoked repeatedly with same candidate', () => {
  const harness = createMockHarness();

  // Create modal and body
  harness.sandbox.shell?.();

  let renderCount = 0;
  const origSet = Object.getOwnPropertyDescriptor(harness.statusEl, 'innerHTML').set;
  Object.defineProperty(harness.statusEl, 'innerHTML', {
    set(v) {
      renderCount++;
      origSet.call(harness.statusEl, v);
    },
    get() {
      return this._html;
    }
  });

  const remote = { deviceId: 'dev-x', appType: 'mini', displayName: 'Mini X' };
  harness.sandbox.renderPairConfirmation(remote, '111 222', () => {}, () => {});
  assert.equal(renderCount, 1);
  assert.equal(harness.statusEl.getAttribute('data-pair-state'), 'confirming');

  // Call again with same candidate
  harness.sandbox.renderPairConfirmation(remote, '111 222', () => {}, () => {});
  assert.equal(renderCount, 1, 'idempotent call must not re-render or wipe out DOM state');
});

test('renderBackupPairShare renders both responsive QR markup and manual code + key fallback', async () => {
  const uiSource = read('p2p-roster-ui.js');
  const shareCode = uiSource.slice(uiSource.indexOf('async function renderBackupPairShare'), uiSource.indexOf('async function sendBackupToPeer'));

  // Checks for QR block and card
  assert.ok(shareCode.includes('mini-p2p-pair-grid'), 'must use responsive pair grid');
  assert.ok(shareCode.includes('mini-p2p-qr-block'), 'must include QR block');
  assert.ok(shareCode.includes('QR de vinculación'), 'must include QR label');
  assert.ok(shareCode.includes('renderQr(pairUrl)'), 'must render QR from pairUrl');

  // Checks for manual code + key fallback
  assert.ok(shareCode.includes('mini-p2p-code-panel'), 'must include code panel for manual fallback');
  assert.ok(shareCode.includes('esc(descriptor.code)'), 'must keep code visible');
  assert.ok(shareCode.includes('esc(descriptor.key)'), 'must keep key visible');
});
