const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('Mini loads P2P runtime in dependency order and precaches it',()=>{
  const html=read('index.html'), sw=read('sw.js');
  const core=html.indexOf('./p2p-core.js'), pairing=html.indexOf('./p2p-pairing.js'), aliases=html.indexOf('./p2p-peer-alias-store.js'), ui=html.indexOf('./p2p-roster-ui.js');
  assert.ok(core>0&&core<pairing&&pairing<aliases&&aliases<ui);
  for(const asset of ['./p2p-core.js','./p2p-pairing.js','./p2p-peer-alias-store.js','./p2p-roster-ui.js']) assert.ok(sw.includes(asset),asset+' precached');
});

test('Mini P2P linking UI follows the compact UI_DESIGN contract',()=>{
  const html=read('index.html'), sw=read('sw.js'), ui=read('p2p-roster-ui.js'), css=read('p2p-transfer.css');
  assert.ok(html.includes('./p2p-transfer.css'), 'P2P stylesheet linked');
  assert.ok(sw.includes("'./p2p-transfer.css'"), 'P2P stylesheet precached');
  assert.ok(ui.includes('root.IconSet?.iconSvg?.(name)'), 'critical P2P icons use vector IconSet');
  assert.ok(ui.includes('mini-p2p-capabilities'));
  assert.ok(ui.includes('mini-p2p-peer-row'));
  assert.ok(ui.includes('mini-p2p-device-actions'));
  assert.equal((ui.match(/style=/g) || []).length, 0, 'P2P flow should not reintroduce inline style attributes');
  assert.doesNotMatch(ui, /👥|🕒|💾|📄|⇄|✎|←|✓|❌|⚠️/, 'P2P actions/statuses must not use emoji or unicode symbols as icons');
  assert.match(css, /\.mini-p2p-capabilities\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.mini-p2p-icon-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  assert.match(css, /\.mini-p2p-button\s*\{[^}]*min-height:\s*44px;/);
  assert.match(css, /\.mini-p2p-back\s*\{[^}]*min-height:\s*44px;/);
});


test('Mini peer aliases are local presentation metadata with rename/clear/unlink wiring',()=>{
  const ui=read('p2p-roster-ui.js');
  const aliases=read('p2p-peer-alias-store.js');
  assert.ok(ui.includes('root.SaMiniP2PPeerAliases'));
  assert.ok(ui.includes('data-rename-peer'));
  assert.ok(ui.includes('data-peer-alias'));
  assert.ok(ui.includes('data-save-alias'));
  assert.ok(ui.includes('data-clear-alias'));
  assert.ok(ui.includes('aliasStore.removeAlias(peerId)'));
  assert.ok(ui.includes('peerName(peer)'));
  assert.ok(ui.includes('Nombre original:'));
  assert.ok(ui.includes('se guarda sólo en este Mini'));
  assert.ok(aliases.includes("'mini_p2p_peer_aliases_v1'"));
  assert.ok(aliases.includes('entries'));
  assert.ok(!aliases.includes('linkToken'));
  assert.ok(!aliases.includes('HMAC'));
  assert.ok(!aliases.includes('Firebase'));
});

test('Mini linked peer identity UX shows recent activity, sorts it, and can rename self',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('sortPeersByRecentActivity'));
  assert.ok(ui.includes('peer?.lastSeenAt || peer?.linkedAt'));
  assert.ok(ui.includes('Última conexión:'));
  assert.ok(ui.includes('data-rename-self'));
  assert.ok(ui.includes('Nombre de este Mini'));
  assert.ok(ui.includes('identityStore.renameSelf(nextName)'));
  assert.ok(ui.includes('futuros emparejamientos'));
  assert.ok(!ui.includes('En línea'));
});

test('Mini stages only validated sa-roster/v1 and never auto-imports from P2P',()=>{
  const ui=read('p2p-roster-ui.js');
  const validateAt=ui.indexOf('normalizeSaRoster(parsed)');
  const stageAt=ui.indexOf("core.sendControl(channel,'roster-staged'");
  assert.ok(validateAt>0&&stageAt>validateAt,'ACK must happen only after canonical validation');
  assert.ok(ui.includes("result.kind !== 'roster' || result.schema !== 'sa-roster/v1'"));
  for (const field of ["transferId:result.transferId", "sha256:result.sha256", "kind:'roster'", "schema:'sa-roster/v1'", "validated:true"]) {
    assert.ok(ui.includes(field), `strict staged ACK field missing: ${field}`);
  }
  for (const field of ["transferId:result.transferId", 'reason', "kind:'roster'", "schema:'sa-roster/v1'", "validated:false"]) {
    assert.ok(ui.includes(field), `strict rejected ACK field missing: ${field}`);
  }
  assert.ok(ui.includes('MAX_REJECTION_REASON_BYTES'), 'rejection reason must be bounded');
  assert.ok(ui.includes('boundedUserSafeError'), 'rejection reason must be user-safe');
  assert.ok(ui.includes('function buildRosterReviewModel'), 'validated roster must enter dedicated review model');
  assert.ok(ui.includes('function reviewPendingRoster'), 'validated roster must stay inside the P2P review shell');
  assert.ok(ui.includes('root.applyReviewedSaRoster'), 'P2P delegates the final write through the app-owned apply seam');
  assert.ok(!ui.includes('root.openImportEmployeesModal()'), 'P2P roster must not jump to the generic JSON import modal');
  assert.ok(!ui.includes('employeeRepository.importSaRoster('),'P2P must not mutate employee repository directly');
});

test('SA roster review follows Mini design system with executive summary, expandable detail and vector-only actions',()=>{
  const ui=read('p2p-roster-ui.js'), css=read('p2p-transfer.css'), html=read('index.html');
  for (const text of ['Revisa qué cambiará en Mini','Ver detalle de cambios','Resolver vínculos','Aplicar roster en Mini','se conservará en Mini']) assert.ok(ui.includes(text), text);
  for (const cls of ['mini-roster-metrics','mini-roster-conflict-card','mini-roster-choice','mini-roster-footer']) assert.ok(css.includes('.'+cls), cls);
  assert.ok(html.includes('window.applyReviewedSaRoster'), 'app-owned apply seam is required');
  assert.ok(ui.includes("vectorIcon('check'"), 'review/result states use vector icons');
  assert.doesNotMatch(ui,/[✅⚠️🔗📤📥👥]/u,'new P2P roster UI must not use emoji icons');
});

test('Mini revokes invalid rosters through core without directly closing the channel',()=>{
  const ui=read('p2p-roster-ui.js');
  const stageStart=ui.indexOf('async function stageReceivedRoster');
  const failureStart=ui.indexOf('}catch(error){',stageStart);
  const failureEnd=ui.indexOf('\n  }\n\n  function reviewPendingRoster',failureStart);
  assert.ok(stageStart >= 0 && failureStart > stageStart && failureEnd > failureStart);
  const failurePath=ui.slice(failureStart,failureEnd);
  assert.equal((failurePath.match(/core\.revokeChannel\(channel\);/g) || []).length,1);
  assert.doesNotMatch(failurePath,/channel\.close/,'validation failure must not close the channel outside core');
});

test('Mini uses discrete expiry only for first-pair signaling and keeps the receiver channel-bound',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.match(ui, /room: descriptor\.room[\s\S]*peerId: self\.deviceId[\s\S]*proof: descriptor\.proof[\s\S]*expiresAt: descriptor\.expiresAt/);
  assert.match(ui, /room:route\.room,peerId:self\.deviceId,proof:route\.proof/);
  assert.doesNotMatch(ui, /room:route\.room,peerId:self\.deviceId,proof:route\.proof,expiresAt/);
  assert.match(ui, /createTransferReceiver\(\{\s*channel,/);
});

test('transfer types: active and future capabilities share one compact capability strip',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('mini-p2p-capabilities'));
  for (const label of ['Personal','Asistencia','Backup','Archivos']) assert.ok(ui.includes(label), label + ' visible');
  assert.match(ui, /capability\('users', 'Personal',[\s\S]*'is-ready'\)/);
  assert.match(ui, /capability\('attendance', 'Asistencia',[\s\S]*'is-ready'\)/);
  assert.match(ui, /capability\('backup', 'Backup',[\s\S]*'is-disabled'\)/);
  assert.match(ui, /capability\('restore', 'Archivos',[\s\S]*'is-disabled'\)/);
});

test('Mini Transferencias UI provides explicit wait attendance button for each linked SA while preserving roster button',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('data-wait-attendance'), 'per-peer wait attendance button must exist');
  assert.ok(ui.includes('data-wait-peer'), 'per-peer wait roster button must be preserved');
  assert.ok(ui.includes('aria-label=\"Esperar roster de'));
  assert.ok(ui.includes('aria-label=\"Esperar asistencia de'));
  assert.ok(ui.includes("waitTrustedTransfer(btn.dataset.waitAttendance, 'attendance')"));
  assert.ok(ui.includes("waitTrustedTransfer(btn.dataset.waitPeer, 'roster')"));
});

test('waitTrustedTransfer refactor supports attendance and roster modes with clear copy/status and backward compatibility',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('async function waitTrustedTransfer'));
  assert.ok(ui.includes('async function waitTrustedRoster'));
  assert.ok(ui.includes("waitTrustedTransfer(peerId, 'roster')"));
  assert.ok(ui.includes('Esperar asistencia de'));
  assert.ok(ui.includes('Esperar roster de'));
  assert.ok(ui.includes('Ahora en SA selecciona este Mini y solicita la asistencia.'));
  assert.ok(ui.includes('Ahora en SA selecciona este Mini y pulsa “Enviar roster”.'));
  assert.ok(ui.includes('Listo para recibir la solicitud de asistencia…'));
  assert.ok(ui.includes('Esperando roster…'));
});

test('trusted wait isolates attendance and roster handlers by selected mode',()=>{
  const ui=read('p2p-roster-ui.js');
  const waitFn=ui.slice(ui.indexOf('async function waitTrustedTransfer'), ui.indexOf('function sendAttendanceReady'));
  assert.match(waitFn, /if \(isAttendance\)[\s\S]*armAttendanceResponder\(channel,\s*peer,\s*self,\s*\{[\s\S]*onResponseSent[\s\S]*else[\s\S]*armRosterReceiver\(channel,\s*peer\)/);
  assert.match(ui, /function armAttendanceResponder\(channel,\s*peer,\s*self,\s*callbacks\s*=\s*\{\}\)/);
  assert.ok(ui.includes('deviceId = self?.deviceId'));
  assert.ok(ui.includes('root.AttendanceExport.attachAttendanceResponder'));
  assert.ok(ui.includes("attendance-ready/v1"));
});

test('self.deviceId is threaded safely into armAttendanceResponder without async listener race',()=>{
  const ui=read('p2p-roster-ui.js');
  const waitFn = ui.slice(ui.indexOf('async function waitTrustedTransfer'), ui.indexOf('function armAttendanceResponder'));
  assert.match(waitFn, /const\s+self\s*=\s*await\s+identityStore\.getSelf\(\);/);
  assert.doesNotMatch(waitFn, /onAuthenticated:\s*async/);
  assert.doesNotMatch(waitFn, /armAttendanceResponder\(.*await/);

  const pairFn = ui.slice(ui.indexOf('async function startPairing'), ui.indexOf('function renderPairConfirmation'));
  assert.match(pairFn, /const\s+self\s*=\s*await\s+identityStore\.getSelf\(\);/);
  assert.doesNotMatch(pairFn, /onLinked:\s*async/);
  assert.match(pairFn, /armAttendanceResponder\(channel,\s*peer,\s*self\)/);
});

test('trusted wait dynamic behavioral test: attendance sends ready only after responder is armed and roster stays isolated', async () => {
  const vm = require('node:vm');
  const uiCode = read('p2p-roster-ui.js');

  let capturedResponderContext = null;
  let rosterReceiverAttached = false;
  const channelMessageHandlers = [];

  const mockChannel = {
    readyState: 'open',
    sent: [],
    addEventListener(event, fn) {
      if (event === 'message') channelMessageHandlers.push(fn);
    },
    send(data) { this.sent.push(data); }
  };

  const mockPeer = { peerId: 'sa-device-test', peerApp: 'sa', linkToken: 'tok-abc', displayName: 'SA Oficina' };
  const mockSelf = { deviceId: 'mini-device-uuid-99', displayName: 'Mini Central' };

  let currentModal = null;
  let statusText = '';
  let statusHtml = '';
  const mockWaitStatusEl = {
    set textContent(v) { statusText = v; },
    get textContent() { return statusText; },
    set innerHTML(v) { statusHtml = v; },
    get innerHTML() { return statusHtml; }
  };

  const mockBodyDiv = {
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel === '[data-wait-status]' || sel === '[data-receive-state]') return mockWaitStatusEl;
      return { addEventListener() {} };
    },
    querySelectorAll() { return []; }
  };

  const ctx = {
    window: {},
    addEventListener: () => {},
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => {
        const el = {
          id: '',
          style: {},
          _html: '',
          set innerHTML(v) { this._html = v; },
          get innerHTML() { return this._html; },
          querySelector: (sel) => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
          querySelectorAll: () => [],
          addEventListener: () => {}
        };
        return el;
      },
      body: {
        appendChild(el) { currentModal = el; }
      },
      addEventListener: () => {}
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    setTimeout,
    Date,
    JSON,
    String,
    Array,
    Math,
    Number,
    Error,
    TypeError,
    console
  };
  ctx.window = ctx;

  ctx.SaMiniP2P = {
    makeIdentityStore: () => ({
      getSelf: async () => mockSelf,
      listPeers: async () => [mockPeer],
      getPeer: async (id) => (id === mockPeer.peerId ? mockPeer : null),
      removePeer: async () => {}
    }),
    deriveTrustedRoute: async () => ({ room: 'room-1', proof: 'proof-1' }),
    SignalingClient: function() {},
    createRtcSession: async ({ onChannel }) => {
      onChannel(mockChannel);
      return { close() {} };
    },
    isChannelAuthenticated: () => true,
    createTransferReceiver: () => {
      rosterReceiverAttached = true;
      return () => {};
    },
    parseControl: () => null
  };

  ctx.SaMiniP2PPairing = {
    attachTrusted: (channel, { onAuthenticated }) => {
      onAuthenticated();
    }
  };

  ctx.SaMiniP2PPeerAliases = {
    createPeerAliasStore: () => ({
      resolveName: (p) => p.displayName || 'SA',
      getAlias: () => null,
      setAlias: () => {},
      removeAlias: () => {}
    })
  };

  ctx.AttendanceExport = {
    attachAttendanceResponder: (channel, peer, opt) => {
      capturedResponderContext = opt;
      return () => {};
    }
  };

  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  // 1. Test waitTrustedTransfer in attendance mode
  await ctx.waitTrustedTransfer('sa-device-test', 'attendance');
  assert.equal(capturedResponderContext?.deviceId, 'mini-device-uuid-99', 'must pass self.deviceId');
  assert.equal(rosterReceiverAttached, false, 'attendance mode must not arm the roster receiver');
  assert.deepEqual(JSON.parse(mockChannel.sent.at(-1)), { schema: 'attendance-ready/v1' }, 'Mini must announce readiness after responder is armed');
  assert.ok(mockBodyDiv.innerHTML.includes('Esperar asistencia de SA Oficina'), 'must show attendance header');
  assert.ok((statusText + statusHtml).includes('Listo para recibir la solicitud de asistencia'), 'status must reflect attendance readiness');

  // 2. Simulate incoming attendance-request/v1
  for (const handler of channelMessageHandlers) {
    handler({
      data: JSON.stringify({
        schema: 'attendance-request/v1',
        requestId: 'req-1',
        saProjectId: 'PRJ-1',
        fromDate: '2026-09-01',
        toDate: '2026-09-07'
      })
    });
  }
  assert.ok(!(statusText + statusHtml).includes('Respuesta de asistencia enviada'), 'UI must not claim attendance delivery success before a response is actually sent');
  assert.ok((statusText + statusHtml).includes('Listo para recibir la solicitud de asistencia'), 'wait status remains honest while waiting for the request');

  // 3. Test backward-compatible waitTrustedRoster
  await ctx.waitTrustedRoster('sa-device-test');
  assert.ok(mockBodyDiv.innerHTML.includes('Esperar roster de SA Oficina'), 'waitTrustedRoster must show roster header');
  assert.ok((statusText + statusHtml).includes('Esperando roster'), 'status must reflect roster wait');
  assert.equal(rosterReceiverAttached, true, 'roster mode must arm the roster receiver');
});


test('Mini offers camera QR pairing with manual fallback and guaranteed camera cleanup',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('data-scan-pair'), 'home must expose QR scan action');
  assert.ok(ui.includes('Escanear QR de SA'));
  assert.ok(ui.includes('navigator?.mediaDevices') || ui.includes('root.navigator?.mediaDevices'));
  assert.ok(ui.includes('BarcodeDetector'));
  assert.ok(ui.includes("facingMode: { ideal: 'environment' }"));
  assert.ok(ui.includes('core.parsePairHash'));
  assert.ok(ui.includes('core.decodePairDescriptor'));
  assert.ok(ui.includes('activeQrStream.getTracks().forEach(track => track.stop())'), 'camera tracks must be stopped');
  assert.ok(ui.includes('data-manual-fallback'), 'manual code/key fallback must remain available');
});

test('manual pairing is single-flight and exposes useful connection progress',()=>{
  const ui=read('p2p-roster-ui.js');
  const handler=ui.slice(ui.indexOf("const connectButton = body().querySelector('[data-connect]')"), ui.indexOf('async function startPairing'));
  assert.ok(handler.includes('if (connectButton.disabled) return;'));
  assert.ok(handler.indexOf('connectButton.disabled = true') < handler.indexOf('pairDescriptorFromManual'));
  assert.ok(handler.includes("connectButton.setAttribute('aria-busy', 'true')"));
  assert.ok(handler.includes("connectButton.textContent = 'Conectando…'"));
  assert.ok(ui.includes("status === 'connected'"));
  assert.ok(ui.includes('Canal conectado. Verificando identidad…'));
  assert.ok(ui.includes('Negociando conexión…'));
});

test('shared core preserves a real failure reason instead of collapsing every teardown to done',()=>{
  const core=read('p2p-core.js');
  assert.ok(core.includes('MAX_CLOSE_REASON_BYTES = 123'));
  assert.ok(core.includes('boundedCloseReason(reason)'));
  assert.ok(core.includes('status.closeSession(reason)'));
  assert.ok(core.includes("close(reason = 'done')"));
  assert.ok(core.includes('signaling.close(boundedCloseReason(reason))'));
});

test('token compliance and absence of invented tokens or raw color literals in changed connection UI', () => {
  const ui = read('p2p-roster-ui.js');
  const css = read('p2p-transfer.css');
  const surface = ui + '\n' + css;
  assert.ok(!surface.includes('--whatsapp-color'), 'Unrelated token must not be used by P2P UI');
  const uiHexMatches = ui.match(/#[0-9a-fA-F]{3,8}/g) || [];
  const nonEntityHex = uiHexMatches.filter(h => h !== '#39');
  assert.equal(nonEntityHex.length, 0, `No direct hex colors allowed in p2p-roster-ui.js: ${nonEntityHex.join(', ')}`);
  for (const token of ['--card-bg','--input-bg','--border-color','--text-color','--text-muted','--accent-color','--success-color','--danger-color']) {
    assert.ok(css.includes(`var(${token})`), `Must use ${token}`);
  }
  assert.ok(ui.includes('mini-p2p-button-${kind}'), 'button helper applies semantic P2P classes');
  assert.ok(css.includes('.mini-p2p-button-primary'));
  assert.ok(css.includes('.mini-p2p-button-secondary'));
  assert.equal((ui.match(/style=/g) || []).length, 0, 'P2P markup must use the design stylesheet instead of inline styles');
});

test('unlink flow uses root.showConfirm and forbids native confirm with safe non-destructive fallback', async () => {
  const vm = require('node:vm');
  const uiCode = read('p2p-roster-ui.js');

  // Static check: confirm() must not be called
  assert.doesNotMatch(uiCode, /\bconfirm\s*\(/, 'Native confirm() must not be used in p2p-roster-ui.js');
  assert.ok(uiCode.includes('root.showConfirm'), 'Must check root.showConfirm');

  let removedPeerId = null;
  let removedAliasPeerId = null;
  let toastMsg = null;
  let nativeConfirmCalled = false;
  let showConfirmCalled = false;
  let confirmResult = true;

  const mockPeer = { peerId: 'peer-sa-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Norte' };

  function createEnv(withShowConfirm = true) {
    let currentModal = null;
    let clickHandlers = {};
    const bodyEl = {
      _html: '',
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html; },
      querySelector(sel) {
        return {
          addEventListener: (ev, fn) => { clickHandlers[sel] = fn; }
        };
      },
      querySelectorAll(sel) {
        if (sel === '[data-unlink]') {
          return [{
            dataset: { unlink: 'peer-sa-1' },
            addEventListener: (ev, fn) => { clickHandlers['[data-unlink]'] = fn; }
          }];
        }
        return [];
      }
    };
    const ctx = {
      window: {},
      addEventListener: () => {},
      confirm: () => { nativeConfirmCalled = true; return true; },
      showToast: (msg) => { toastMsg = msg; },
      document: {
        readyState: 'complete',
        getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
        createElement: () => {
          const el = {
            id: '',
            style: {},
            _html: '',
            set innerHTML(v) { this._html = v; },
            get innerHTML() { return this._html; },
            querySelector: (sel) => (sel === '[data-p2p-body]' ? bodyEl : { addEventListener() {} }),
            querySelectorAll: () => [],
            addEventListener: () => {},
            remove: () => { currentModal = null; }
          };
          return el;
        },
        body: {
          appendChild: (el) => { currentModal = el; }
        },
        addEventListener: () => {}
      },
      location: { hash: '', pathname: '/', search: '' },
      history: { replaceState: () => {} },
      setTimeout,
      Date,
      JSON,
      String,
      Array,
      Math,
      Number,
      Error,
      TypeError,
      console
    };
    ctx.window = ctx;
    if (withShowConfirm) {
      ctx.showConfirm = async () => {
        showConfirmCalled = true;
        return confirmResult;
      };
    }
    ctx.SaMiniP2P = {
      makeIdentityStore: () => ({
        getSelf: async () => ({ deviceId: 'mini-1', displayName: 'Mini 1' }),
        listPeers: async () => [mockPeer],
        getPeer: async (id) => (id === mockPeer.peerId ? mockPeer : null),
        removePeer: async (id) => { removedPeerId = id; }
      }),
      deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
      SignalingClient: function() {},
      createRtcSession: async () => ({ close() {} }),
      createTransferReceiver: () => () => {},
      parseControl: () => null
    };
    ctx.SaMiniP2PPairing = { attachTrusted: () => {} };
    ctx.SaMiniP2PPeerAliases = {
      createPeerAliasStore: () => ({
        resolveName: (p) => p.displayName,
        getAlias: () => null,
        setAlias: () => {},
        removeAlias: (id) => { removedAliasPeerId = id; }
      })
    };
    vm.createContext(ctx);
    vm.runInContext(uiCode, ctx);
    return { ctx, clickHandlers };
  }

  // Case 1: showConfirm resolves true -> peer unlinked
  const env1 = createEnv(true);
  confirmResult = true;
  await env1.ctx.openP2PTransferModal();
  await env1.clickHandlers['[data-unlink]']();
  assert.equal(showConfirmCalled, true);
  assert.equal(removedPeerId, 'peer-sa-1');
  assert.equal(removedAliasPeerId, 'peer-sa-1');

  // Case 2: showConfirm resolves false -> peer NOT unlinked
  removedPeerId = null;
  removedAliasPeerId = null;
  showConfirmCalled = false;
  const env2 = createEnv(true);
  confirmResult = false;
  await env2.ctx.openP2PTransferModal();
  await env2.clickHandlers['[data-unlink]']();
  assert.equal(showConfirmCalled, true);
  assert.equal(removedPeerId, null, 'peer must not be removed on reject');
  assert.equal(removedAliasPeerId, null, 'alias must not be removed on reject');

  // Case 3: showConfirm is unavailable -> safe no-op + toast, NO native confirm()
  removedPeerId = null;
  removedAliasPeerId = null;
  toastMsg = null;
  nativeConfirmCalled = false;
  const env3 = createEnv(false);
  await env3.ctx.openP2PTransferModal();
  await env3.clickHandlers['[data-unlink]']();
  assert.equal(nativeConfirmCalled, false, 'native confirm must NEVER be called');
  assert.equal(removedPeerId, null, 'peer must not be removed without confirm');
  assert.ok(toastMsg, 'toast must be shown when showConfirm is unavailable');
});

test('no false-success attendance listener in armAttendanceResponder', async () => {
  const ui = read('p2p-roster-ui.js');
  assert.doesNotMatch(ui, /Respuesta enviada/, 'UI must not contain premature "Respuesta enviada" copy');
  assert.doesNotMatch(ui, /atendida en segundo plano/, 'UI must not claim background serviced attendance without callback');

  const vm = require('node:vm');
  let channelListeners = [];
  const mockChannel = {
    readyState: 'open',
    addEventListener: (type, fn) => { channelListeners.push({ type, fn }); },
    send: () => {}
  };
  let responderContext = null;
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
      getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => {
        const el = {
          id: '',
          style: {},
          _html: '',
          set innerHTML(v) { this._html = v; },
          get innerHTML() { return this._html; },
          querySelector: (sel) => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
          querySelectorAll: () => [],
          addEventListener: () => {},
          remove: () => { currentModal = null; }
        };
        return el;
      },
      body: { appendChild: (el) => { currentModal = el; } },
      addEventListener: () => {}
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    setTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, console,
    SaMiniP2P: {
      makeIdentityStore: () => ({
        getSelf: async () => ({ deviceId: 'm-test-dev' }),
        listPeers: async () => [{ peerId: 'peer-test', peerApp: 'sa', linkToken: 'tok', displayName: 'SA' }],
        getPeer: async () => ({ peerId: 'peer-test', peerApp: 'sa', linkToken: 'tok', displayName: 'SA' })
      }),
      deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
      SignalingClient: function() {},
      createRtcSession: async ({ onChannel }) => {
        onChannel(mockChannel);
        return { close() {} };
      },
      createTransferReceiver: () => () => {},
      parseControl: () => null
    },
    SaMiniP2PPairing: {
      attachTrusted: (ch, { onAuthenticated }) => { onAuthenticated(); }
    },
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) },
    AttendanceExport: {
      attachAttendanceResponder: (ch, peer, opt) => { responderContext = opt; return () => {}; }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ui, ctx);

  await ctx.waitTrustedTransfer('peer-test', 'attendance');
  assert.equal(responderContext?.deviceId, 'm-test-dev');
  const messageListeners = channelListeners.filter(l => l.type === 'message');
  assert.equal(messageListeners.length, 0, 'attendance mode must not attach the roster receiver listener');
  for (const l of messageListeners) {
    l.fn({ data: JSON.stringify({ schema: 'attendance-request/v1', requestId: 'r1' }) });
  }
  assert.doesNotMatch(mockBodyDiv.innerHTML, /Respuesta enviada/);
});

test('cancel and back navigation cleans up session and resets view', async () => {
  const vm = require('node:vm');
  const uiCode = read('p2p-roster-ui.js');

  let sessionClosed = false;
  const clickHandlers = {};

  const mockPeer = { peerId: 'sa-1', peerApp: 'sa', linkToken: 'tok-1', displayName: 'SA Test' };
  let currentModal = null;
  const mockBodyDiv = {
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      return {
        style: {},
        addEventListener: (ev, fn) => { clickHandlers[sel] = fn; }
      };
    },
    querySelectorAll: () => []
  };

  const ctx = {
    window: {},
    addEventListener: () => {},
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => {
        const el = {
          id: '',
          style: {},
          _html: '',
          set innerHTML(v) { this._html = v; },
          get innerHTML() { return this._html; },
          querySelector: (sel) => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
          querySelectorAll: () => [],
          addEventListener: () => {},
          remove: () => { currentModal = null; }
        };
        return el;
      },
      body: { appendChild: (el) => { currentModal = el; } },
      addEventListener: () => {}
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    setTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, console,
    SaMiniP2P: {
      makeIdentityStore: () => ({
        getSelf: async () => ({ deviceId: 'm1', displayName: 'Mini 1' }),
        listPeers: async () => [mockPeer],
        getPeer: async () => mockPeer,
        removePeer: async () => {}
      }),
      deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
      SignalingClient: function() {},
      createRtcSession: async () => ({
        close() { sessionClosed = true; }
      }),
      createTransferReceiver: () => () => {},
      parseControl: () => null
    },
    SaMiniP2PPairing: { attachTrusted: () => {} },
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  // 1. Wait transfer and click back
  await ctx.waitTrustedTransfer('sa-1', 'roster');
  assert.equal(sessionClosed, false);
  assert.ok(clickHandlers['[data-back]'], 'back button handler must exist');
  assert.ok(clickHandlers['[data-cancel]'], 'cancel button handler must exist');

  // Trigger back
  sessionClosed = false;
  clickHandlers['[data-back]']();
  assert.equal(sessionClosed, true, 'clicking back must cleanup active session');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(mockBodyDiv.innerHTML.includes('SA vinculados'), 'clicking back must render home');

  // 2. Wait transfer and click cancel
  await ctx.waitTrustedTransfer('sa-1', 'attendance');
  sessionClosed = false;
  clickHandlers['[data-cancel]']();
  assert.equal(sessionClosed, true, 'clicking cancel must cleanup active session');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(mockBodyDiv.innerHTML.includes('SA vinculados'), 'clicking cancel must render home');
});

test('retry wiring in waitTrustedTransfer handles connection errors and restarts transfer', async () => {
  const vm = require('node:vm');
  const uiCode = read('p2p-roster-ui.js');

  let sessionClosedCount = 0;
  let sessionsCreated = 0;
  let onStateCallback = null;
  let onErrorCallback = null;
  let waitStatusHtml = '';
  let statusText = '';
  let retryHandler = null;
  let cancelWaitHandler = null;
  let bottomCancelHidden = false;

  const mockPeer = { peerId: 'sa-err', peerApp: 'sa', linkToken: 'tok-err', displayName: 'SA Error Test' };
  let currentModal = null;
  const mockWaitStatusEl = {
    set textContent(v) { statusText = v; },
    get textContent() { return statusText; },
    set innerHTML(v) { waitStatusHtml = v; },
    get innerHTML() { return waitStatusHtml; },
    querySelector(sel) {
      if (sel === '[data-retry-wait]') return { addEventListener: (ev, fn) => { retryHandler = fn; } };
      if (sel === '[data-cancel-wait]') return { addEventListener: (ev, fn) => { cancelWaitHandler = fn; } };
      return null;
    }
  };

  const mockBodyDiv = {
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel === '[data-wait-status]') return mockWaitStatusEl;
      if (sel === '[data-cancel]') return {
        style: { set display(v) { if (v === 'none') bottomCancelHidden = true; } },
        addEventListener() {}
      };
      return { addEventListener() {} };
    },
    querySelectorAll: () => []
  };

  const ctx = {
    window: {},
    addEventListener: () => {},
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'mini-p2p-transfer-modal' ? currentModal : null),
      createElement: () => {
        const el = {
          id: '',
          style: {},
          _html: '',
          set innerHTML(v) { this._html = v; },
          get innerHTML() { return this._html; },
          querySelector: (sel) => (sel === '[data-p2p-body]' ? mockBodyDiv : { addEventListener() {} }),
          querySelectorAll: () => [],
          addEventListener: () => {},
          remove: () => { currentModal = null; }
        };
        return el;
      },
      body: { appendChild: (el) => { currentModal = el; } },
      addEventListener: () => {}
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    setTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, TextEncoder, console,
    SaMiniP2P: {
      makeIdentityStore: () => ({
        getSelf: async () => ({ deviceId: 'm1', displayName: 'Mini 1' }),
        listPeers: async () => [mockPeer],
        getPeer: async () => mockPeer,
        removePeer: async () => {}
      }),
      deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
      SignalingClient: function() {},
      createRtcSession: async ({ onState, onChannel }) => {
        sessionsCreated++;
        onStateCallback = onState;
        if (onChannel) onChannel({ addEventListener() {} });
        return { close() { sessionClosedCount++; } };
      },
      createTransferReceiver: () => () => {},
      parseControl: () => null
    },
    SaMiniP2PPairing: {
      attachTrusted: (ch, { onError }) => { onErrorCallback = onError; }
    },
    SaMiniP2PPeerAliases: { createPeerAliasStore: () => ({ resolveName: p => p.displayName, getAlias: () => null }) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);

  // Start waiting
  await ctx.waitTrustedTransfer('sa-err', 'attendance');
  assert.equal(sessionsCreated, 1);

  // 1. Simulate transport disconnect
  onStateCallback('disconnected', null);
  assert.ok(waitStatusHtml.includes('Error de conexión'), 'must show connection error');
  assert.ok(waitStatusHtml.includes('La conexión P2P se interrumpió'), 'must show interruption message');
  assert.equal(bottomCancelHidden, true, 'bottom cancel button must be hidden when error box appears');
  assert.ok(retryHandler, 'retry handler must be wired');
  assert.ok(cancelWaitHandler, 'cancel wait handler must be wired');

  // 2. Click retry
  const prevClosed = sessionClosedCount;
  retryHandler();
  assert.ok(sessionClosedCount > prevClosed, 'retry must clean up previous session');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(sessionsCreated, 2, 'retry must start a new session');

  // 3. Simulate auth error from pairing
  onErrorCallback(new Error('Clave de autenticación no válida'));
  assert.ok(waitStatusHtml.includes('Clave de autenticación no válida'), 'must show auth error');

  // 4. Click cancel-wait
  cancelWaitHandler();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(mockBodyDiv.innerHTML.includes('SA vinculados'), 'cancel wait must return to home');
});

test('roster and attendance coexistence in UI actions, mode badges, and responder/receiver binding', async () => {
  const ui = read('p2p-roster-ui.js');
  // Check explicit mode representations
  assert.ok(ui.includes("isAttendance ? 'Asistencia' : 'Personal / Roster'"));
  assert.ok(ui.includes('mini-p2p-mode-chip'));
  assert.ok(ui.includes('data-wait-peer'));
  assert.ok(ui.includes('data-wait-attendance'));
  assert.ok(ui.includes('root.waitTrustedTransfer'));
  assert.ok(ui.includes('root.waitTrustedRoster'));
  assert.ok(ui.includes('root.waitTrustedAttendance'));

  // Both armRosterReceiver and armAttendanceResponder are attached in onAuthenticated
  const onAuthStart = ui.indexOf('onAuthenticated:()=>{');
  const onAuthEnd = ui.indexOf('onError:error=>renderWaitError');
  assert.ok(onAuthStart > 0 && onAuthEnd > onAuthStart);
  const onAuthSlice = ui.slice(onAuthStart, onAuthEnd);
  assert.ok(onAuthSlice.includes('armRosterReceiver(channel,peer)'));
  assert.ok(onAuthSlice.includes('armAttendanceResponder(channel,peer,self,{'));
  assert.ok(onAuthSlice.includes('onResponseSent'));
});

test('P2P view changes use same-shell morphing with reduced-motion fallback', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('function morphShell(renderViewFn)'), 'must define a local shell morph helper');
  assert.ok(ui.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'must honor reduced motion');
  assert.ok(ui.includes('getBoundingClientRect()'), 'must measure before/after geometry');
  assert.ok(ui.includes('MORPH_DURATION_MS = 260'), 'must use the documented morph duration range');
  assert.ok(ui.includes('cubic-bezier(.2,.8,.2,1)'), 'must use the design-system easing');
  const wrappedBodyViews = ui.match(/morphShell\(\(\) => \{ body\(\)\.innerHTML/g) || [];
  assert.ok(wrappedBodyViews.length >= 7, `expected structural body views to morph; got ${wrappedBodyViews.length}`);
  const morphStart = ui.indexOf('function morphShell(renderViewFn)');
  const morphEnd = ui.indexOf('function primary(', morphStart);
  const morphBody = ui.slice(morphStart, morphEnd);
  assert.doesNotMatch(morphBody, /\.remove\(\)/, 'morph helper must not remove/recreate the overlay');
  assert.ok(morphBody.includes("dialog.style.width = `${startW}px`"));
  assert.ok(morphBody.includes("dialog.style.height = `${startH}px`"));
});


test('attendance response completion makes later RTC close truthful instead of reporting interruption', () => {
  const ui = read('p2p-roster-ui.js');
  assert.match(ui, /onResponseSent/);
  assert.match(ui, /attendanceResponseSent/);
  assert.match(ui, /Respuesta de asistencia enviada/);
  assert.match(ui, /conexi[oó]n finalizada/i);
});


test('attendance header exposes direct vector-only pairing access and data management uses the same icon language',()=>{
  const html=read('index.html'), ui=read('p2p-roster-ui.js'), design=read('UI_DESIGN.md');
  assert.match(html, /id="btn-attendance-link"[\s\S]*onclick="openP2PPairingScanner\(\)"[\s\S]*data-icon="link"[\s\S]*data-icon-vector/);
  assert.match(html, /GESTIÓN DE DATOS[\s\S]*openP2PTransferModal\(\)[\s\S]*data-icon="link"[\s\S]*data-icon-vector/);
  assert.doesNotMatch(html, /openP2PTransferModal\(\)[\s\S]{0,160}<span[^>]*>⇄<\/span>/);
  assert.match(html, /el\.hasAttribute\('data-icon-vector'\)[\s\S]*IconSet\.iconSvg/);
  assert.match(html, /attendanceLink\.classList\.toggle\('hidden', view !== 'attendance'\)/);
  assert.match(ui, /root\.openP2PPairingScanner=openP2PPairingScanner/);
  assert.match(ui, /async function openP2PPairingScanner\(\)\{await renderQrScanner\(\);\}/);
  assert.ok(design.includes('Sin emoticones como iconografía de interfaz'));
  assert.ok(design.includes('data-icon-vector'));
});
