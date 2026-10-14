const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev';
const marker = { enabled: true, label: 'beta 1.9', revision: 'abcdef1' };
function fixture(location, optIn) {
  const calls = [], root = { location: { origin: location }, MiniPublicTurnPreview: optIn,
    PrivateTurnBootstrap: { install(options) { calls.push(options); return {active:true,dispose(){}}; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../private-turn-public-preview.js'),'utf8'), root);
  return {root,calls};
}
test('public entry is inert without marker and refuses opted-in foreign hosts', () => {
  assert.equal(fixture(origin).calls.length,0);
  for(const host of ['https://mini.example.test','https://a2.tail2a0a8e.ts.net:8443',origin+'.attacker.test']) {
    const f=fixture(host,marker); assert.equal(f.calls.length,0); assert.equal(f.root.PrivateTurnPublicPreview.status(),'configuration-invalid');
  }
});
test('explicit valid marker installs only fixed public Mini profile', () => {
  const f=fixture(origin,marker); assert.equal(f.calls.length,1);
  const options=JSON.parse(JSON.stringify(f.calls[0]));
  assert.equal(options.profile,'mini-pages-turn-test');assert.equal(options.appIdentity,'mini');
  assert.equal(options.forceRelay,true);assert.equal(options.diagnostics,true);
  assert.deepEqual(options.contract,{ttlUnit:'seconds',expiresAtFormat:'unix-seconds',clockSource:'issuer'});
  assert.equal(f.root.PrivateTurnPublicPreview.status(),'active');
});
test('invalid marker and missing bootstrap expose bounded configuration state', () => {
  for(const change of [{label:'production'},{revision:'not-hash'},{enabled:false}]) {
    const f=fixture(origin,{...marker,...change});assert.equal(f.calls.length,0);assert.equal(f.root.PrivateTurnPublicPreview.status(),'configuration-invalid');
  }
});
