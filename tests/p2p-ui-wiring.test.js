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
  assert.ok(ui.includes('root.openImportEmployeesModal()'));
  assert.ok(ui.includes('root.validateImportTextarea(ta)'));
  assert.ok(!ui.includes('employeeRepository.importSaRoster('),'P2P must not mutate employee repository directly');
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

test('transfer types: attendance is visibly available while backup and documents remain disabled in Mini UI',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(!ui.includes("disabledCard('🕒 Asistencia'"), 'Asistencia must not be disabled');
  assert.ok(ui.includes('🕒 Asistencia'), 'Asistencia must be visibly present');
  assert.ok(ui.includes("disabledCard('💾 Backup'"), 'Backup must remain disabled');
  assert.ok(ui.includes("disabledCard('📄 Documentos / Archivos'"), 'Documents must remain disabled');
});

test('Mini Transferencias UI provides explicit wait attendance button for each linked SA while preserving roster button',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes('data-wait-attendance'), 'per-peer wait attendance button must exist');
  assert.ok(ui.includes('data-wait-peer'), 'per-peer wait roster button must be preserved');
  assert.ok(ui.includes('Esperar roster'));
  assert.ok(ui.includes('Esperar asistencia'));
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
  assert.ok(ui.includes('Esperando solicitud de asistencia…'));
  assert.ok(ui.includes('Esperando roster…'));
});

test('trusted wait arms attendance responder with self.deviceId and keeps armRosterReceiver coexisting',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.match(ui, /armRosterReceiver\(channel,\s*peer\);[\s\S]*armAttendanceResponder\(channel,\s*peer,\s*self\);/);
  assert.match(ui, /function armAttendanceResponder\(channel,\s*peer,\s*self\)/);
  assert.ok(ui.includes('deviceId = self?.deviceId'));
  assert.ok(ui.includes('root.AttendanceExport.attachAttendanceResponder'));
  assert.ok(ui.includes('deviceId'));
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

test('trusted wait dynamic behavioral test: arms responder with distinct self.deviceId, keeps honest wait status, and preserves roster receiver', async () => {
  const vm = require('node:vm');
  const uiCode = read('p2p-roster-ui.js');

  let capturedResponderContext = null;
  let rosterReceiverAttached = false;
  const channelMessageHandlers = [];

  const mockChannel = {
    readyState: 'open',
    addEventListener(event, fn) {
      if (event === 'message') channelMessageHandlers.push(fn);
    },
    send() {}
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
  assert.equal(rosterReceiverAttached, true, 'armRosterReceiver must coexist with attendance responder');
  assert.ok(mockBodyDiv.innerHTML.includes('Esperar asistencia de SA Oficina'), 'must show attendance header');
  assert.ok(statusText.includes('Esperando solicitud de asistencia'), 'status text must reflect attendance');

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
  assert.equal(statusHtml, '', 'UI must not claim attendance delivery success before SA validates the response');
  assert.ok(statusText.includes('Esperando solicitud de asistencia'), 'wait status remains honest until SA confirms reception');

  // 3. Test backward-compatible waitTrustedRoster
  await ctx.waitTrustedRoster('sa-device-test');
  assert.ok(mockBodyDiv.innerHTML.includes('Esperar roster de SA Oficina'), 'waitTrustedRoster must show roster header');
  assert.ok(statusText.includes('Esperando roster'), 'status text must reflect roster wait');
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
