const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('../p2p-core.js');
const Pairing = require('../p2p-pairing.js');
const BackupBridge = require('../p2p-backup-bridge.js');

function readProjectFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

class FakeChannel {
  constructor() {
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    this.listeners = new Map();
    this.sent = [];
    this.closed = false;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    if (this.listeners.has(type)) this.listeners.get(type).delete(fn);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 'closed';
    const closeFns = this.listeners.get('close');
    if (closeFns) {
      for (const fn of [...closeFns]) fn();
    }
  }
  dispatch(type, event) {
    const fns = this.listeners.get(type);
    if (fns) {
      for (const fn of [...fns]) fn(event);
    }
  }
}

function createAuthenticatedChannel() {
  const ch = new FakeChannel();
  Core.markChannelAuthenticated(ch);
  return ch;
}

test('1. P2P home capabilities: exactly 4 surfaces (Personal, Asistencia, Backup, Archivos)', () => {
  const uiSource = readProjectFile('p2p-roster-ui.js');
  const cssSource = readProjectFile('p2p-transfer.css');

  // Verify capability section exists
  assert.ok(uiSource.includes('mini-p2p-capabilities'), 'mini-p2p-capabilities container must exist');

  // Exactly 4 capability declarations in the home view
  const capabilityMatches = [
    uiSource.match(/capability\('users',\s*'Personal',\s*'Recibir de SA',\s*'is-ready'\)/),
    uiSource.match(/capability\('attendance',\s*'Asistencia',\s*'Responder a SA',\s*'is-ready'\)/),
    uiSource.match(/capability\('backup',\s*'Backup',\s*'Respaldos P2P',\s*'is-ready',\s*'data-open-backup-hub'\)/),
    uiSource.match(/capability\('restore',\s*'Archivos',\s*'Próximamente',\s*'is-disabled'\)/)
  ];

  for (let i = 0; i < capabilityMatches.length; i++) {
    assert.ok(capabilityMatches[i], `Capability #${i + 1} must match exact contract`);
  }

  // Verify CSS defines 4-column capability strip
  assert.match(cssSource, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  // And min-height is >= 44px
  assert.match(cssSource, /min-height:\s*62px/);
});

test('2. Disabled Files (Archivos / Documents) has NO action, NO handler, and NO picker', () => {
  const uiSource = readProjectFile('p2p-roster-ui.js');
  const cssSource = readProjectFile('p2p-transfer.css');
  const htmlSource = readProjectFile('index.html');

  // Archivos is declared with is-disabled and NO extra attribute or data handler
  assert.match(uiSource, /capability\('restore',\s*'Archivos',\s*'Próximamente',\s*'is-disabled'\)/);
  assert.doesNotMatch(uiSource, /capability\('restore',\s*'Archivos'[^)]*data-open/);
  assert.doesNotMatch(uiSource, /capability\('restore',\s*'Archivos'[^)]*click/i);

  // In capability helper, is-disabled adds aria-disabled="true"
  assert.match(uiSource, /stateClass\.includes\('is-disabled'\)\s*\?\s*'\s*aria-disabled="true"'/);

  // CSS for .mini-p2p-capability.is-disabled enforces pointer-events: none and cursor: not-allowed
  assert.match(cssSource, /\.mini-p2p-capability\.is-disabled\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(cssSource, /\.mini-p2p-capability\.is-disabled\s*\{[\s\S]*?cursor:\s*not-allowed/);
  assert.match(cssSource, /\.mini-p2p-capability\.is-disabled\s*\{[\s\S]*?opacity:\s*\.?55/);

  // No generic file input for P2P in index.html or p2p-roster-ui.js
  assert.doesNotMatch(uiSource, /type=["']file["']/);
  assert.doesNotMatch(uiSource, /showOpenFilePicker/);
  assert.doesNotMatch(uiSource, /FileReader/);

  // Only the native Mini manual file inputs exist in index.html (OCR photo, manual backup restore, novedades)
  const fileInputs = htmlSource.match(/<input[^>]*type=["']file["'][^>]*>/g) || [];
  assert.equal(fileInputs.length, 4, 'Only 4 standard native inputs exist in index.html');
  const ids = fileInputs.map(tag => (tag.match(/id=["']([^"']+)["']/) || [])[1]);
  assert.deepEqual(ids.sort(), ['cam-input', 'gal-input', 'ocr-photo-input', 'restore-file-input']);
});

test('3. Generic transfer surface hardening: arbitrary transfer kinds rejected fail-closed', async () => {
  const ch = createAuthenticatedChannel();

  // Test arbitrary kinds in validateTransferStart
  const forbiddenKinds = ['files', 'documents', 'photo', 'pdf', 'bin', 'generic', 'unknown', 'arbitrary'];
  for (const kind of forbiddenKinds) {
    assert.throws(
      () => Core.validateTransferStart({
        protocol: Core.TRANSFER_PROTOCOL,
        type: 'start',
        transferId: 'test-id-1234567890123456',
        kind,
        schema: 'test-schema/v1',
        size: 1024,
        chunkSize: Core.CHUNK_SIZE,
        totalChunks: 1,
        sha256: 'a'.repeat(64)
      }),
      /Sólo se admite roster o backup/,
      `Kind "${kind}" must be rejected fail-closed`
    );
  }

  // Test arbitrary kind in sendPayload
  for (const kind of forbiddenKinds) {
    await assert.rejects(
      async () => Core.sendPayload(ch, {
        kind,
        schema: 'some-schema/v1',
        text: 'hello'
      }),
      /Sólo se admite roster o backup/,
      `sendPayload with kind "${kind}" must reject fail-closed`
    );
  }

  // Test createTransferReceiver revoking channel on arbitrary kind start frame
  let receiverError = null;
  const receivingChannel = createAuthenticatedChannel();
  const receiver = Core.createTransferReceiver({
    channel: receivingChannel,
    onError: err => { receiverError = err; }
  });

  const arbitraryStartFrame = JSON.stringify({
    protocol: Core.TRANSFER_PROTOCOL,
    type: 'start',
    transferId: 'arbitrary-transfer-id-12345678',
    kind: 'photo',
    schema: 'photo/v1',
    size: 2048,
    chunkSize: Core.CHUNK_SIZE,
    totalChunks: 1,
    sha256: 'b'.repeat(64)
  });

  await receiver({ data: arbitraryStartFrame });
  assert.ok(receiverError, 'Receiver must report an error on arbitrary transfer kind');
  assert.match(receiverError.message, /Sólo se admite roster o backup/);
  assert.equal(receivingChannel.readyState, 'closed', 'Channel must be revoked immediately on forbidden kind');

  // Test unsupported backup schema
  assert.throws(
    () => Core.validateTransferStart({
      protocol: Core.TRANSFER_PROTOCOL,
      type: 'start',
      transferId: 'test-id-1234567890123456',
      kind: 'backup',
      schema: 'generic-backup/v1',
      size: 1024,
      chunkSize: Core.CHUNK_SIZE,
      totalChunks: 1,
      sha256: 'c'.repeat(64)
    }),
    /Esquema de backup no admitido/,
    'Non-native backup schema must be rejected fail-closed'
  );

  // Test unsupported roster schema
  assert.throws(
    () => Core.validateTransferStart({
      protocol: Core.TRANSFER_PROTOCOL,
      type: 'start',
      transferId: 'test-id-1234567890123456',
      kind: 'roster',
      schema: 'mini-roster/v1',
      size: 1024,
      chunkSize: Core.CHUNK_SIZE,
      totalChunks: 1,
      sha256: 'd'.repeat(64)
    }),
    /Sólo se admite roster sa-roster\/v1/,
    'Non sa-roster/v1 schema must be rejected fail-closed'
  );

  // Test unknown control frames
  assert.throws(
    () => Core.validateControlFrame({
      protocol: Core.CONTROL_PROTOCOL,
      type: 'arbitrary-control',
      data: {}
    }),
    /Tipo de control P2P desconocido/,
    'Arbitrary control frame types must be rejected fail-closed'
  );
});

test('4. Same-app backup peers NEVER enter roster or attendance routes', async () => {
  const uiSource = readProjectFile('p2p-roster-ui.js');

  // Verify home peer lists and header explicitly filter only peerApp === 'sa'
  assert.ok(uiSource.includes("(peers || []).filter(p => p.peerApp === 'sa')"), 'Header must filter peerApp === sa');
  assert.ok(uiSource.includes(".filter(p => p.peerApp === 'sa')"), 'Peer lists must filter peerApp === sa');

  // Verify waitTrustedTransfer rejects non-sa peers
  assert.match(uiSource, /if\s*\(!peer\s*\|\|\s*peer\.peerApp\s*!==\s*'sa'\)\s*throw new Error\('SA vinculado no encontrado\.'\)/);

  // Verify attachBackgroundListeners ignores non-sa peers
  assert.match(uiSource, /if\s*\(!peer\s*\|\|\s*peer\.peerApp\s*!==\s*'sa'\)\s*return\s*\(\)\s*=>\s*\{\}/);

  // Verify onLinked arms ONLY armBackupReceiver for same-app peers
  assert.match(uiSource, /if\s*\(peer\.peerApp\s*===\s*'sa'\)\s*\{[\s\S]*?armRosterReceiver[\s\S]*?armAttendanceResponder[\s\S]*?\}\s*else\s*\{[\s\S]*?armBackupReceiver/);

  // Identity store same-app behavior: regular pairing rejects same-app without allowSameApp opt-in
  const miniStore = Core.makeIdentityStore('mini');
  assert.throws(
    () => miniStore.savePeer({ peerId: 'mini-peer-test-id-1234', peerApp: 'mini', linkToken: Core.randomToken(32) }),
    /app remota P2P no es compatible/,
    'Regular identityStore.savePeer must reject same-app peer without opt-in'
  );

  // In-memory peer filtering simulation
  const peerList = [
    { peerId: 'sa-1', peerApp: 'sa', displayName: 'SA Obra' },
    { peerId: 'mini-2', peerApp: 'mini', displayName: 'Another Mini' }
  ];
  const homeSaPeers = peerList.filter(p => p.peerApp === 'sa');
  assert.equal(homeSaPeers.length, 1);
  assert.equal(homeSaPeers[0].peerId, 'sa-1', 'Only SA peers enter home list');
});

test('5. Manual fallbacks remain reachable, intact, and unchanged', () => {
  const htmlSource = readProjectFile('index.html');
  const empRepoSource = readProjectFile('employee-repository.js');
  const attExportSource = readProjectFile('attendance-export.js');

  // 1. Roster manual JSON import fallback
  assert.ok(htmlSource.includes('id="modal-import-employees"'), 'modal-import-employees must exist');
  assert.ok(htmlSource.includes('id="import-employees-textarea"'), 'import-employees-textarea must exist');
  assert.ok(htmlSource.includes('window.confirmSaIdentityLink'), 'confirmSaIdentityLink must exist for manual reconciliation');
  assert.ok(empRepoSource.includes('function importSaRoster('), 'employeeRepository.importSaRoster must exist');

  // 2. Attendance manual fallback (export/WhatsApp)
  assert.ok(htmlSource.includes('window.exportCanonicalAttendanceSubmission'), 'exportCanonicalAttendanceSubmission must exist');
  assert.ok(attExportSource.includes('function generateAttendanceSubmission('), 'generateAttendanceSubmission must exist');
  assert.ok(htmlSource.includes('shareToWhatsApp'), 'shareToWhatsApp fallback must exist');
  assert.ok(htmlSource.includes('shareActiveRequestWhatsApp'), 'shareActiveRequestWhatsApp fallback must exist');

  // 3. Native Mini backup manual export/restore
  assert.ok(htmlSource.includes('id="modal-restore-backup"'), 'modal-restore-backup must exist');
  assert.ok(htmlSource.includes('id="restore-backup-textarea"'), 'restore-backup-textarea must exist');
  assert.ok(htmlSource.includes('id="restore-file-input"'), 'restore-file-input must exist');
  assert.ok(htmlSource.includes('window.openImportBackupModal'), 'openImportBackupModal must exist');
  assert.ok(htmlSource.includes('window.doRestoreBackup'), 'doRestoreBackup must exist');
  assert.ok(htmlSource.includes('window.validateRestoreTextarea'), 'validateRestoreTextarea must exist');
});

test('6. Cleaned sendBackupOnChannel fallback regression test: safe error and no ReferenceError', () => {
  const uiSource = readProjectFile('p2p-roster-ui.js');

  // Verify the dead/broken fallback has been cleaned
  assert.doesNotMatch(
    uiSource,
    /root\.SaMiniP2PBackup\?\.sendBackupOnChannel\s*\|\|\s*bridge\?\.sendBackupOnChannel/,
    'Dead fallback || bridge?.sendBackupOnChannel must be cleaned'
  );

  // Verify safe scoping and explicit error check
  assert.match(
    uiSource,
    /const bridge = root\.SaMiniP2PBackup;\s*if \(!bridge \|\| typeof bridge\.sendBackupOnChannel !== 'function'\) \{\s*throw new Error\('Módulo de respaldos P2P no disponible\.'\);/,
    'Must cleanly resolve bridge and throw friendly error if unavailable'
  );
});

test('7. Mini touch-first and design system compliance', () => {
  const cssSource = readProjectFile('p2p-transfer.css');
  const uiSource = readProjectFile('p2p-roster-ui.js');

  // All capability items meet touch-first >=44px
  assert.match(cssSource, /min-height:\s*62px/, 'Capabilities min-height must be >= 44px');

  // Buttons use .btn-primary, .btn-secondary, or .mini-p2p-icon-btn with >= 44px targets
  assert.match(cssSource, /\.mini-p2p-icon-btn\s*\{[\s\S]*?width:\s*44px;\s*height:\s*44px/);

  // Vector icons only: vectorIcon() helper used, no hardcoded emoji in interface actions
  assert.match(uiSource, /function vectorIcon\(name,\s*size/);
  assert.doesNotMatch(uiSource, /<button[^>]*>[📁📄📷💾🔗]/);

  // Solid semantic fills and theme variables used
  assert.match(cssSource, /var\(--input-bg\)/);
  assert.match(cssSource, /var\(--card-bg\)/);
  assert.match(cssSource, /var\(--accent-color\)/);
  assert.match(cssSource, /var\(--border-color\)/);

  // No passive logs on home: pendingSection only appears if totalStagedCount > 0
  assert.match(uiSource, /const pendingSection = totalStagedCount > 0 \?/);
});
