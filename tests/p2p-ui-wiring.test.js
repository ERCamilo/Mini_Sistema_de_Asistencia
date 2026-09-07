const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('Mini loads P2P runtime in dependency order and precaches it',()=>{
  const html=read('index.html'), sw=read('sw.js');
  const core=html.indexOf('./p2p-core.js'), pairing=html.indexOf('./p2p-pairing.js'), ui=html.indexOf('./p2p-roster-ui.js');
  assert.ok(core>0&&core<pairing&&pairing<ui);
  for(const asset of ['./p2p-core.js','./p2p-pairing.js','./p2p-roster-ui.js']) assert.ok(sw.includes(asset),asset+' precached');
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

test('future transfer types remain disabled in Mini UI',()=>{
  const ui=read('p2p-roster-ui.js');
  assert.ok(ui.includes("disabledCard('🕒 Asistencia'"));
  assert.ok(ui.includes("disabledCard('💾 Backup'"));
  assert.ok(ui.includes("disabledCard('📄 Documentos / Archivos'"));
});
