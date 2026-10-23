const test = require('node:test');
const assert = require('node:assert/strict');
const base = require('../app-version.js');
const { createReleaseManager } = require('../app-update-manager.js');
const releases = [
  { version: '1.10.0', date: '2026-10-20', title: 'Nueva', items: ['Mejora nueva'] },
  { version: '1.9.0', date: '2026-10-19', title: 'Anterior', items: ['Mejora anterior'] }
];
function fixture(seen) {
  const storage = new Map(), shown = [], statuses = [];
  if (seen) storage.set('test:lastSeenVersion', seen);
  let now = 1000, canShow = true, reloads = 0, fetches = 0, saveFails = false;
  const manager = createReleaseManager({
    prefix: 'test', policy: { ...base, APP_VERSION: '1.9.0', CHANGELOG: releases.slice(1) },
    read: k => storage.get(k) || null, write: (k, v) => storage.set(k, v), now: () => now, online: () => true,
    fetchRelease: async () => { fetches++; return { version: '1.10.0', changelog: releases }; },
    canShow: () => canShow, show: (kind, entries, version, close, apply) => { shown.push({ kind, entries, version, close, apply }); return true; },
    beforeReload: async () => { if (saveFails) throw new Error('disk'); }, reload: () => reloads++, status: s => statuses.push(s)
  });
  return { manager, storage, shown, statuses, setBusy: v => { canShow = !v; }, setSaveFails: () => { saveFails = true; }, advance: () => { now += 1800000; }, stats: () => ({ reloads, fetches }) };
}
test('primer arranque y primera instalación no abren avisos ni recargan', async () => {
  const f = fixture(); f.manager.boot(); f.manager.boot();
  await f.manager.controllerChanged(false);
  assert.equal(f.storage.get('test:lastSeenVersion'), '1.9.0');
  assert.equal(f.shown.length, 0); assert.deepEqual(f.stats(), { reloads: 0, fetches: 0 });
});
test('espera a que cierre la edición; marca novedades vistas solamente al cerrar', () => {
  const f = fixture('1.8.0'); f.setBusy(true); f.manager.boot();
  assert.equal(f.shown.length, 0); f.setBusy(false); f.manager.flush();
  assert.equal(f.shown[0].kind, 'news'); assert.equal(f.storage.get('test:lastSeenVersion'), '1.8.0');
  f.shown[0].close(); assert.equal(f.storage.get('test:lastSeenVersion'), '1.9.0');
});
test('una pestaña antigua no retrocede la última versión vista', () => {
  const f = fixture('1.10.0'); f.manager.boot(); f.manager.showNews(true); f.shown[0].close();
  assert.equal(f.storage.get('test:lastSeenVersion'), '1.10.0');
});
test('Más tarde mantiene la página y la referencia; búsqueda manual recupera el aviso', async () => {
  const f = fixture('1.9.0'); f.manager.boot(); await f.manager.check(true); f.shown[0].close();
  f.manager.flush(); await f.manager.controllerChanged(true);
  assert.equal(f.shown.length, 1); assert.equal(f.stats().reloads, 0);
  assert.equal(f.storage.get('test:lastSeenVersion'), '1.9.0');
  await f.manager.check(true); assert.equal(f.shown.length, 2);
});
test('solo recarga por acción explícita después de guardar; el error conserva la página', async () => {
  const f = fixture('1.9.0'); f.manager.boot(); await f.manager.check(true);
  assert.equal(f.stats().reloads, 0); f.setSaveFails(); await f.shown[0].apply();
  assert.equal(f.stats().reloads, 0); assert.match(f.statuses.at(-1), /No se pudo actualizar/);
  const ok = fixture('1.9.0'); await ok.manager.check(true); await ok.shown[0].apply(); assert.equal(ok.stats().reloads, 1);
});
test('respeta intervalo y comparte consultas simultáneas', async () => {
  const f = fixture('1.9.0'); await Promise.all([f.manager.check(), f.manager.check()]);
  await f.manager.check(); assert.equal(f.stats().fetches, 1);
  f.advance(); await f.manager.check(); assert.equal(f.stats().fetches, 2);
});
test('cerrar mientras guarda cancela la recarga pendiente', async () => {
  let done, close, update, reloads = 0;
  const manager = createReleaseManager({
    prefix: 'cancel', policy: { ...base, APP_VERSION: '1.9.0' }, read: () => null, write() {}, now: () => 1000, online: () => true,
    fetchRelease: async () => ({ version: '1.10.0', changelog: releases }), canShow: () => true,
    show: (_, entries, version, onClose, apply) => { close = onClose; update = apply; return true; },
    beforeReload: () => new Promise(resolve => { done = resolve; }), reload: () => reloads++, status() {}
  });
  await manager.check(true); const saving = update(); close(); done(); await saving;
  assert.equal(reloads, 0);
});
test('una búsqueda manual que coincide con la automática conserva su respuesta visible', async () => {
  let finish, fetches = 0; const messages = [];
  const manager = createReleaseManager({
    policy: base, prefix: 'shared', read: () => null, write() {}, now: () => 1000, online: () => true,
    fetchRelease: () => { fetches++; return new Promise(resolve => { finish = resolve; }); },
    canShow: () => true, show: () => true, beforeReload: async () => {}, reload() {}, status: s => messages.push(s)
  });
  const automatic = manager.check(); const manual = manager.check(true);
  finish({}); await Promise.all([automatic, manual]);
  assert.equal(fetches, 1); assert.match(messages.at(-1) || '', /No se pudo consultar/);
});

test('guarda, renueva el shell y solo entonces recarga; un fallo permite reintentar', async () => {
  const calls = []; let fail = true;
  const manager = createReleaseManager({
    policy: { ...base, APP_VERSION: '1.9.0' }, prefix: 'refresh', read: () => null, write() {},
    now: () => 1000, online: () => true, fetchRelease: async () => ({ version: '1.10.0', changelog: releases }),
    canShow: () => true, show: () => true, status() {},
    beforeReload: async () => { calls.push('save'); },
    prepareUpdate: async () => { calls.push('refresh'); if (fail) throw new Error('network'); },
    reload: () => calls.push('reload')
  });
  await manager.check(true); await manager.apply();
  assert.deepEqual(calls, ['save', 'refresh']);
  fail = false; await manager.apply();
  assert.deepEqual(calls, ['save', 'refresh', 'save', 'refresh', 'reload']);
});
test('cancelar durante el guardado tampoco modifica el caché', async () => {
  let finish, close, refreshes = 0, reloads = 0;
  const manager = createReleaseManager({
    policy: { ...base, APP_VERSION: '1.9.0' }, prefix: 'cancel-refresh', read: () => null, write() {},
    now: () => 1000, online: () => true, fetchRelease: async () => ({ version: '1.10.0', changelog: releases }),
    canShow: () => true, show: (_, entries, version, onClose) => { close = onClose; return true; }, status() {},
    beforeReload: () => new Promise(resolve => { finish = resolve; }),
    prepareUpdate: async () => { refreshes++; }, reload: () => reloads++
  });
  await manager.check(true); const pending = manager.apply(); close(); finish(); await pending;
  assert.equal(refreshes, 0); assert.equal(reloads, 0);
});

function updateReceiptFixture({ version = '1.9.0', storage = new Map(), failWrite = false, prepare = async () => {}, save = async () => {} } = {}) {
  const shown = [], calls = [];
  const manager = createReleaseManager({
    policy: { ...base, APP_VERSION: version, CHANGELOG: releases.filter(r => base.compareVersions(r.version, version) <= 0) },
    prefix: 'receipt', read: key => storage.get(key) || null,
    write: (key, value) => { if (failWrite) throw new Error('storage'); storage.set(key, value); },
    now: () => 1000, online: () => true, canShow: () => true,
    fetchRelease: async () => ({ version: '1.10.0', changelog: releases }),
    show: (kind, entries, version, close) => { shown.push({ kind, close }); return true; },
    showSuccess: close => { shown.push({ kind: 'success', close }); return true; },
    beforeReload: async () => { calls.push('save'); await save(); },
    prepareUpdate: async () => { calls.push('prepare'); await prepare(); },
    reload: () => calls.push('reload'), status() {}
  });
  return { manager, storage, shown, calls };
}
test('explicit update confirms the new boot once, without another news confirmation', async () => {
  const old = updateReceiptFixture(); old.storage.set('receipt:lastSeenVersion', '1.9.0');
  old.manager.boot(); await old.manager.check(true); await old.manager.apply();
  assert.deepEqual(old.calls, ['save', 'prepare', 'reload']);
  assert.deepEqual(JSON.parse(old.storage.get('receipt:updateReceipt')), { from: '1.9.0', target: '1.10.0' });
  const fresh = updateReceiptFixture({ version: '1.10.0', storage: old.storage });
  fresh.manager.boot(); assert.deepEqual(fresh.shown.map(s => s.kind), ['success']);
  fresh.shown[0].close(); fresh.manager.flush(); assert.equal(fresh.shown.length, 1);
  assert.equal(fresh.storage.get('receipt:lastSeenVersion'), '1.10.0');
  const reload = updateReceiptFixture({ version: '1.10.0', storage: old.storage });
  reload.manager.boot(); assert.equal(reload.shown.length, 0);
  reload.manager.showNews(true); assert.equal(reload.shown[0].kind, 'news');
});
test('failed save, failed preparation and receipt storage never report a completed update', async () => {
  for (const options of [{ save: async () => { throw new Error('disk'); } }, { prepare: async () => { throw new Error('network'); } }, { failWrite: true }]) {
    const f = updateReceiptFixture(options); await f.manager.check(true); await f.manager.apply();
    assert.equal(f.storage.has('receipt:updateReceipt'), false);
    assert.equal(f.shown.some(s => s.kind === 'success'), false);
    assert.equal(f.calls.includes('reload'), !options.save && !options.prepare);
  }
});
test('unmatched, invalid and already consumed update receipts do not announce success', () => {
  for (const receipt of [{ from: '1.8.0', target: '1.10.0' }, { from: '1.9.0', target: '1.9.0' }, { from: 'invalid', target: '1.9.0' }, {}]) {
    const f = updateReceiptFixture(); f.storage.set('receipt:lastSeenVersion', '1.9.0');
    f.storage.set('receipt:updateReceipt', JSON.stringify(receipt)); f.manager.boot();
    assert.equal(f.shown.length, 0); assert.equal(f.storage.get('receipt:updateReceipt'), '');
  }
});
test('fresh success never moves a newer seen reference backwards', () => {
  const f = updateReceiptFixture({ version: '1.10.0' });
  f.storage.set('receipt:lastSeenVersion', '1.11.0');
  f.storage.set('receipt:updateReceipt', JSON.stringify({ from: '1.9.0', target: '1.10.0' }));
  f.manager.boot(); assert.equal(f.storage.get('receipt:lastSeenVersion'), '1.11.0');
});
test('closing during preparation cannot leave a successful receipt', async () => {
  let finish;
  const f = updateReceiptFixture({ prepare: () => new Promise(resolve => { finish = resolve; }) });
  await f.manager.check(true); const pending = f.manager.apply();
  await new Promise(resolve => setImmediate(resolve)); f.shown[0].close(); finish(); await pending;
  assert.equal(f.storage.has('receipt:updateReceipt'), false); assert.equal(f.calls.includes('reload'), false);
});
test('success waits until another editing screen closes', () => {
  let busy = true, close; const shown = [];
  const storage = new Map([['busy:lastSeenVersion', '1.9.0'], ['busy:updateReceipt', JSON.stringify({ from: '1.9.0', target: '1.10.0' })]]);
  const manager = createReleaseManager({
    policy: { ...base, APP_VERSION: '1.10.0', CHANGELOG: releases }, prefix: 'busy',
    read: key => storage.get(key), write: (key, value) => storage.set(key, value),
    now: () => 1000, online: () => true, fetchRelease: async () => ({}), canShow: () => !busy,
    show: () => { shown.push('news'); return true; }, showSuccess: done => { shown.push('success'); close = done; return true; },
    beforeReload: async () => {}, reload() {}, status() {}
  });
  manager.boot(); assert.deepEqual(shown, []); busy = false; manager.flush();
  assert.deepEqual(shown, ['success']); close(); manager.flush(); assert.deepEqual(shown, ['success']);
});
test('unavailable receipt storage cannot repeatedly announce success', () => {
  const storage = new Map([['receipt:lastSeenVersion', '1.9.0'], ['receipt:updateReceipt', JSON.stringify({ from: '1.9.0', target: '1.10.0' })]]);
  const f = updateReceiptFixture({ version: '1.10.0', storage, failWrite: true }); f.manager.boot();
  assert.equal(f.shown.some(s => s.kind === 'success'), false);
});
