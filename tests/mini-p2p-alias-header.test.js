const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function makeMockStore({ selfName, peers }) {
  let currentName = selfName;
  let peerList = [...peers];
  return {
    getSelf: async () => ({ deviceId: 'mini-device-1', appType: 'mini', displayName: currentName }),
    listPeers: async () => [...peerList],
    getPeer: async (id) => peerList.find(p => p.peerId === id) || null,
    renameSelf: async (name) => { currentName = String(name || '').trim().slice(0, 80) || currentName; },
    removePeer: async (id) => { peerList = peerList.filter(p => p.peerId !== id); },
    _currentName: () => currentName,
    _peers: () => peerList,
  };
}

function makeMockAliases(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getAlias: (id) => map.get(id) || '',
    setAlias: (id, v) => {
      const clean = String(v || '').trim();
      if (clean) map.set(id, clean);
      else map.delete(id);
      return clean;
    },
    removeAlias: (id) => map.delete(id),
    resolveName: (peer) => {
      const a = map.get(peer?.peerId);
      if (a) return a;
      const o = String(peer?.displayName || '').trim();
      if (o) return o;
      if (peer?.peerApp === 'mini') return 'Mini';
      if (peer?.peerApp === 'sa') return 'SA';
      return 'Dispositivo';
    },
    _map: map,
  };
}

function loadUi({ selfName = 'Mini - Dispositivo', peers = [], aliasInitial = {} } = {}) {
  const uiCode = read('p2p-roster-ui.js');
  const store = makeMockStore({ selfName, peers });
  const aliasStore = makeMockAliases(aliasInitial);

  let currentModal = null;
  let bodyHtml = '';
  const handlers = {};
  let inputValue = '';
  let inputFocused = false;
  let statusState = { hidden: true, text: '' };

  const mockInput = {
    get value() { return inputValue; },
    set value(v) { inputValue = String(v); },
    focus() { inputFocused = true; },
    select() {},
    addEventListener() {},
  };
  const mockStatus = {
    get hidden() { return statusState.hidden; },
    set hidden(v) { statusState.hidden = Boolean(v); },
    get textContent() { return statusState.text; },
    set textContent(v) { statusState.text = String(v); },
    set innerHTML(v) { statusState.text = String(v); },
    get innerHTML() { return statusState.text; },
  };
  function mockButton(sel) {
    return {
      addEventListener: (ev, fn) => { handlers[sel] = fn; },
      focus() {},
      disabled: false,
      textContent: '',
      isConnected: true,
      setAttribute() {},
      removeAttribute() {},
      style: {},
    };
  }

  const mockBody = {
    get innerHTML() { return bodyHtml; },
    set innerHTML(v) { bodyHtml = String(v); },
    querySelector(sel) {
      if (sel === '[data-mini-alias]' || sel === '[data-self-name]' || sel === '[data-peer-alias]' || sel === '[data-code]' || sel === '[data-key]') return mockInput;
      if (sel === '[data-alias-status]') return mockStatus;
      if (sel === '[data-qr-video]') {
        return bodyHtml.includes('data-qr-video') ? { pause() {}, srcObject: null } : null;
      }
      if (sel === '[data-qr-status]' || sel === '[data-pair-status]' || sel === '[data-wait-status]' || sel === '[data-receive-state]') {
        return { textContent: '', addEventListener() {}, querySelector() { return null; }, style: {}, hidden: false };
      }
      return mockButton(sel);
    },
    querySelectorAll() { return []; },
    contains() { return true; },
  };

  const headerAttrs = {};
  const labelState = { text: 'Vincular' };
  const headerBtn = {
    querySelector(sel) {
      if (sel === '.header-p2p-link-label') {
        return {
          get textContent() { return labelState.text; },
          set textContent(v) { labelState.text = String(v); },
        };
      }
      return null;
    },
    setAttribute(k, v) { headerAttrs[k] = String(v); },
    getAttribute(k) { return headerAttrs[k] ?? null; },
    onclick: null,
  };

  const ctx = {
    window: {},
    addEventListener: () => {},
    showToast: () => {},
    showConfirm: async () => true,
    document: {
      readyState: 'complete',
      getElementById: (id) => {
        if (id === 'mini-p2p-transfer-modal') return currentModal;
        if (id === 'btn-attendance-link') return headerBtn;
        return null;
      },
      createElement: () => {
        const el = {
          id: '',
          style: {},
          _html: '',
          get innerHTML() { return this._html; },
          set innerHTML(v) { this._html = String(v); },
          querySelector: (sel) => {
            if (sel === '[data-p2p-body]') return mockBody;
            return { addEventListener: () => {}, textContent: '', set textContent(v) {} };
          },
          querySelectorAll: () => [],
          addEventListener: () => {},
          remove: () => { currentModal = null; },
        };
        return el;
      },
      body: { appendChild: (el) => { currentModal = el; } },
      addEventListener: () => {},
    },
    location: { hash: '', pathname: '/', search: '', href: 'https://mini.invalid/' },
    history: { replaceState: () => {} },
    setTimeout, clearTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, TextEncoder, console,
  };
  ctx.window = ctx;
  ctx.SaMiniP2P = {
    makeIdentityStore: () => store,
    deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
    SignalingClient: function () {},
    createRtcSession: async () => ({ close() {} }),
    createTransferReceiver: () => () => {},
    parseControl: () => null,
    parsePairHash: () => null,
    pairDescriptorFromManual: async () => { throw new Error('no manual in this harness'); },
    decodePairDescriptor: async () => { throw new Error('no descriptor'); },
  };
  ctx.SaMiniP2PPairing = { attachTrusted: () => {}, attachPairing: () => {} };
  ctx.SaMiniP2PPeerAliases = { createPeerAliasStore: () => aliasStore };
  ctx.IconSet = { iconSvg: () => '<svg></svg>' };

  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  return {
    ctx, store, aliasStore, handlers,
    body: () => bodyHtml,
    headerBtn, headerAttrs, labelState,
    setInput: (v) => { inputValue = String(v); },
    getInputFocused: () => inputFocused,
    getStatus: () => ({ ...statusState }),
    resetHandlers: () => { for (const k of Object.keys(handlers)) delete handlers[k]; },
  };
}

test('Mini alias gating is mandatory for QR/manual/pairing and reuses renameSelf/displayName', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('function isValidChosenMiniAlias'), 'must define alias validity helper');
  assert.ok(ui.includes('function renderMiniAliasSetup'), 'must define in-shell alias setup');
  assert.ok(ui.includes('function ensureMiniAliasChosen'), 'must gate through ensure helper');
  assert.ok(ui.includes('Mini - Dispositivo'), 'must reference default alias as invalid');
  assert.ok(ui.includes("canonicalMiniAlias"), 'must canonicalize generic Mini variants');
  assert.ok(ui.includes('data-mini-alias'), 'alias setup must have testable input');
  assert.ok(ui.includes('data-save-mini-alias'), 'alias setup must have save control');
  assert.ok(ui.includes('identityStore.renameSelf(nextName)'), 'must reuse existing renameSelf seam');
  assert.ok(ui.includes("await ensureMiniAliasChosen('scan')"), 'QR path must be gated');
  assert.ok(ui.includes("await ensureMiniAliasChosen('manual')"), 'manual path must be gated');
  assert.ok(ui.includes('renderMiniAliasSetup({ type: \'pair\''), 'startPairing must gate with pending descriptor');
  assert.ok(ui.includes('async function renderManualPair'), 'manual entry must stay async for gating');
  assert.doesNotMatch(ui, /openP2PTransferModal\(\)[\s\S]{0,40}renameSelf/, 'transfer home itself must not force alias');
});

test('QR scan entry is gated when Mini alias is generic', async () => {
  const env = loadUi({ selfName: 'Mini - Dispositivo', peers: [] });
  await env.ctx.openP2PPairingScanner();
  const html = env.body();
  assert.ok(html.includes('Elige el nombre de este Mini'), 'must show alias setup, got: ' + html.slice(0, 200));
  assert.ok(html.includes('data-mini-alias'), 'setup must contain alias input');
  assert.ok(html.includes('Guardar y continuar'), 'setup must contain continue action');
  assert.ok(!html.includes('data-qr-video'), 'must NOT show scanner video while gated');
});

test('generic Mini and blank aliases are also gated; custom alias passes to scanner', async () => {
  for (const generic of ['Mini', '  mini  ', '', '   ', 'dispositivo', 'M']) {
    const env = loadUi({ selfName: generic, peers: [] });
    await env.ctx.openP2PPairingScanner();
    assert.ok(env.body().includes('Elige el nombre de este Mini'), `generic ${JSON.stringify(generic)} must gate`);
  }
  const okEnv = loadUi({ selfName: 'Mini almacen norte', peers: [] });
  await okEnv.ctx.openP2PPairingScanner();
  const html = okEnv.body();
  assert.ok(html.includes('Escanear QR de SA'), 'valid alias must reach scanner');
  assert.ok(html.includes('data-qr-video'), 'valid alias must show scanner video');
});

test('manual pairing entry is gated and saving custom alias continues naturally', async () => {
  const env = loadUi({ selfName: 'Mini - Dispositivo', peers: [] });
  await env.ctx.openP2PTransferModal();
  const manualHandler = env.handlers['[data-manual-pair]'];
  assert.ok(manualHandler, 'home must wire manual button');
  await manualHandler();
  assert.ok(env.body().includes('Elige el nombre de este Mini'), 'manual must gate to alias setup');

  env.setInput('Mini almacen norte');
  const saveHandler = env.handlers['[data-save-mini-alias]'];
  assert.ok(saveHandler, 'alias setup must wire save');
  await saveHandler();
  assert.equal(env.store._currentName(), 'Mini almacen norte', 'must persist via renameSelf');
  const after = env.body();
  assert.ok(after.includes('Vincular con SA'), 'after save must continue to manual pairing, got: ' + after.slice(0, 200));
  assert.ok(after.includes('data-code'), 'manual form must be shown after alias save');
});

test('saving custom alias from QR intent continues to scanner', async () => {
  const env = loadUi({ selfName: 'Mini - Dispositivo', peers: [] });
  await env.ctx.openP2PPairingScanner();
  assert.ok(env.body().includes('Elige el nombre de este Mini'));
  env.setInput('Mini obra sur');
  await env.handlers['[data-save-mini-alias]']();
  assert.equal(env.store._currentName(), 'Mini obra sur');
  const html = env.body();
  assert.ok(html.includes('Escanear QR de SA'), 'QR intent must resume scanner after save');
  assert.ok(html.includes('data-qr-video'));
});

test('linked header shows SA project name and routes to Transferencias; unlinked shows Vincular', async () => {
  const peer = { peerId: 'sa-1', peerApp: 'sa', displayName: 'Proyecto Obra Norte', linkToken: 'tok', linkedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
  const linked = loadUi({ selfName: 'Mini almacen', peers: [peer] });
  const state = await linked.ctx.refreshMiniP2PHeader();
  assert.equal(state, 'linked');
  assert.equal(linked.labelState.text, 'Proyecto Obra Norte', 'header must show project name');
  assert.ok(linked.headerAttrs['aria-label'].includes('Proyecto Obra Norte'), 'aria must carry project name');
  assert.ok(linked.headerAttrs['aria-label'].includes('Abrir Transferencias'), 'aria must describe Transferencias routing');
  assert.equal(linked.headerBtn.onclick, linked.ctx.openP2PTransferModal, 'linked tap must open Transferencias, not scanner');

  const unlinked = loadUi({ selfName: 'Mini almacen', peers: [] });
  const state2 = await unlinked.ctx.refreshMiniP2PHeader();
  assert.equal(state2, 'unlinked');
  assert.equal(unlinked.labelState.text, 'Vincular');
  assert.equal(unlinked.headerAttrs['aria-label'], 'Vincular Mini con SA');
  assert.equal(unlinked.headerBtn.onclick, unlinked.ctx.openP2PPairingScanner, 'unlinked tap must open scanner');

  const longPeer = { peerId: 'sa-2', peerApp: 'sa', displayName: 'Proyecto Obra Norte Muy Largo Excede', linkToken: 'tok', linkedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
  const constrained = loadUi({ selfName: 'Mini almacen', peers: [longPeer] });
  await constrained.ctx.refreshMiniP2PHeader();
  assert.equal(constrained.labelState.text, 'SA vinculado', 'long names collapse to concise label');
  assert.ok(constrained.headerAttrs['aria-label'].includes('Proyecto Obra Norte Muy Largo Excede'), 'full project must stay in aria for audit');
});

test('SA identity primarily shows project displayName, preserves alias with original auditable, never surfaces peerId', async () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('peerOriginalName(peer)'), 'must keep original/project helper');
  assert.ok(ui.includes('Original:'), 'alias rows must keep original visible');
  assert.doesNotMatch(ui, />\$\{esc\(peer\.peerId\)\}</, 'peerId must never be rendered as visible text');
  assert.doesNotMatch(ui, /self\.deviceId\}\s*<\/strong>/, 'deviceId value must never be rendered as visible text');

  const peer = { peerId: 'sa-xyz-123', peerApp: 'sa', displayName: 'Proyecto Obra Este', linkToken: 'tok', linkedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
  const env = loadUi({ selfName: 'Mini almacen', peers: [peer], aliasInitial: { 'sa-xyz-123': 'SA oficina' } });
  await env.ctx.openP2PTransferModal();
  const html = env.body();
  assert.ok(html.includes('SA oficina'), 'alias must be shown when present');
  assert.ok(html.includes('Proyecto Obra Este'), 'original project must remain visible/auditable');
  assert.ok(html.includes('Original:'), 'original line must be explicit');
  assert.ok(!html.includes('>sa-xyz-123<'), 'peerId value must not appear as text');

  const env2 = loadUi({ selfName: 'Mini almacen', peers: [peer] });
  await env2.ctx.openP2PTransferModal();
  const html2 = env2.body();
  assert.ok(html2.includes('Proyecto Obra Este'), 'without alias the project displayName must be primary');
});

test('alias setup and header meet accessibility and mobile contract', () => {
  const ui = read('p2p-roster-ui.js');
  const css = read('p2p-transfer.css');
  const html = read('index.html');
  assert.ok(ui.includes('<label for="mini-p2p-mini-alias">'), 'alias input must have associated label');
  assert.ok(ui.includes('data-alias-status'), 'alias setup must expose status region');
  assert.ok(ui.includes('aria-live="polite"'), 'status must be announced');
  assert.ok(ui.includes('morphShell(() => { body().innerHTML'), 'alias setup must morph in the same shell');
  assert.ok(ui.includes("vectorIcon('check'"), 'alias actions must use vector icons');
  assert.doesNotMatch(ui, /👥|🕒|💾|📄|⇄|✎|←|✓|❌|⚠️/, 'alias/header UI must not use emoji or unicode symbols as icons');
  assert.equal((ui.match(/style=/g) || []).length, 0, 'no inline styles in P2P UI');
  assert.match(css, /\.mini-p2p-button\s*\{[^}]*min-height:\s*44px;/, 'buttons must meet 44px touch target');
  assert.match(css, /\.mini-p2p-field input\s*\{[^}]*min-height:\s*44px;/, 'inputs must meet 44px touch target');
  assert.match(css, /\.mini-p2p-icon-btn\s*\{[^}]*width:\s*44px;/, 'icon buttons must meet 44px');
  assert.ok(css.includes('.header-p2p-link-label'), 'header label must have truncation rules');
  assert.ok(css.includes('text-overflow: ellipsis'), 'long project names must ellipsize');
  assert.match(css, /@media\s*\(max-width:\s*640px\)/, 'transfer shell must adapt to mobile');
  assert.match(html, /id="btn-attendance-link"[\s\S]*aria-label="Vincular Mini con SA"[\s\S]*data-icon="link"[\s\S]*data-icon-vector/, 'header must keep vector icon with accessible name');
  assert.match(html, /\.header-p2p-link\s*\{[^}]*min-height:\s*44px;/, 'header control must meet 44px');
});
