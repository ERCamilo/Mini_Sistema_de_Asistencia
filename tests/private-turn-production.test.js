const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://miniasist.erlin.do';
const source = fs.readFileSync(require.resolve('../private-turn-production.js'), 'utf8');
function fixture(location, marker, extra = {}) {
  const calls = [], events = [];
  const root = { location: { origin: location }, MiniProductionTurn: marker,
    document: { dispatchEvent(event) { events.push(event); return true; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    PrivateTurnBootstrap: { install(options) { calls.push(options); return { active: true, dispose() {} }; } }, ...extra };
  vm.runInNewContext(source, root);
  return { root, calls, events, status: () => root.PrivateTurnProduction.status() };
}
test('production entry is off without a marker or with the flag off, and never installs', () => {
  for (const marker of [undefined, { enabled: false }]) {
    const f = fixture(origin, marker); assert.equal(f.calls.length, 0); assert.equal(f.status(), 'off');
  }
});
test('an enabled marker only works on the exact Mini production origin', () => {
  for (const host of ['https://ercamilo.github.io', 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev', 'http://miniasist.erlin.do', origin + '.attacker.test', 'https://asistencia.erlin.do', 'https://127.0.0.1:9443']) {
    const f = fixture(host, { enabled: true }); assert.equal(f.calls.length, 0, host); assert.equal(f.status(), 'configuration-invalid', host);
  }
});
test('malformed markers and a missing bootstrap are bounded configuration errors', () => {
  for (const marker of [{ enabled: 'yes' }, { enabled: true, extra: 1 }, null, [], 'on']) {
    const f = fixture(origin, marker); assert.equal(f.calls.length, 0); assert.equal(f.status(), 'configuration-invalid');
  }
  const noBootstrap = fixture(origin, { enabled: true }, { PrivateTurnBootstrap: undefined }); assert.equal(noBootstrap.status(), 'configuration-invalid');
  const throwing = fixture(origin, { enabled: true }, { PrivateTurnBootstrap: { install() { throw new Error('TURN_BOOTSTRAP_CONFIGURATION_INVALID'); } } });
  assert.equal(throwing.status(), 'configuration-invalid');
});
test('a valid marker installs only the fixed production profile: ordinary policy, no diagnostics', () => {
  const f = fixture(origin, { enabled: true }); assert.equal(f.calls.length, 1); assert.equal(f.status(), 'active');
  const options = f.calls[0];
  assert.equal(options.enabled, true); assert.equal(options.profile, 'mini-production'); assert.equal(options.appIdentity, 'mini');
  assert.deepEqual(JSON.parse(JSON.stringify(options.contract)), { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' });
  for (const key of ['forceRelay', 'diagnostics', 'allowedOrigins', 'previewRelease']) assert.equal(options[key], undefined, key);
});
test('relay status reaches the UI as a document event, and a failing document cannot break the connection', () => {
  const f = fixture(origin, { enabled: true }); f.calls[0].onRelayStatus('unavailable');
  assert.equal(f.events.length, 1); assert.equal(f.events[0].type, 'mini-turn-status'); assert.deepEqual(JSON.parse(JSON.stringify(f.events[0].detail)), { relay: 'unavailable' });
  const broken = fixture(origin, { enabled: true }, { document: { dispatchEvent() { throw new Error('boom'); } } });
  assert.doesNotThrow(() => broken.calls[0].onRelayStatus('available'));
});
