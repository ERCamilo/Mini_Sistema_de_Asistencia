const test = require('node:test');
const assert = require('node:assert/strict');
require('../comida-ledger.js');
const Store = require('../comida-store.js');
const { createComidaRepository, STORAGE_KEY, parseBackup } = require('../comida-repository.js');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

const repoWith = storage => createComidaRepository({ storage, today: () => '2026-11-16', newId: () => 'per1' });

test('loading with nothing saved gives an empty state with an open period', () => {
  const state = repoWith(memoryStorage()).load();
  assert.deepEqual(state.periods, [{ id: 'per1', start: '2026-11-16', end: null }]);
  assert.equal(state.orders.length, 0);
});

test('save then load keeps the same data under its own key', () => {
  const storage = memoryStorage();
  const repo = repoWith(storage);
  let state = Store.saveDish(repo.load(), { id: 'd1', name: 'Pollo', emoji: '🍗', price: 250, cost: 100 });
  assert.deepEqual(repo.save(state), { ok: true });
  assert.ok(STORAGE_KEY in storage.data);
  assert.deepEqual(repoWith(storage).load(), state);
});

test('a corrupted saved value starts fresh instead of breaking the app', () => {
  const state = repoWith(memoryStorage({ [STORAGE_KEY]: '{not json' })).load();
  assert.equal(state.dishes.length, 0);
});

test('a failed save reports the error and does not throw', () => {
  const storage = memoryStorage();
  storage.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  const result = repoWith(storage).save(Store.emptyState('2026-11-16', 'p'));
  assert.equal(result.ok, false);
  assert.equal(result.quota, true);
});

test('Comida never touches attendance or employee keys', () => {
  const storage = memoryStorage({ users: '[1]', attendance: '{"a":1}' });
  const repo = repoWith(storage);
  repo.save(repo.load());
  assert.deepEqual(Object.keys(storage.data).sort(), ['attendance', STORAGE_KEY, 'users'].sort());
  assert.equal(storage.data.users, '[1]');
});

test('backup section is the saved state, and restoring it is validated', () => {
  const state = Store.saveDish(Store.emptyState('2026-11-01', 'p1'), { id: 'd1', name: 'Pollo', emoji: '🍗', price: 250, cost: 100 });
  const restored = parseBackup(JSON.parse(JSON.stringify(state)), '2026-11-16', 'p9');
  assert.deepEqual(restored, state);
  assert.throws(() => parseBackup('texto', '2026-11-16', 'p9'), /Comida/);
  assert.throws(() => parseBackup([], '2026-11-16', 'p9'), /Comida/);
  assert.throws(() => parseBackup({ schemaVersion: 2 }, '2026-11-16', 'p9'), /versión/);
});

test('transactions from two readers preserve both changes', async () => {
  const storage = memoryStorage();
  const first = repoWith(storage);
  const second = repoWith(storage);
  first.load();
  second.load();
  await Promise.all([
    first.update(s => Store.addClient(s, { id: 'c1', name: 'Ana', ref: '' })),
    second.update(s => Store.addClient(s, { id: 'c2', name: 'Beto', ref: '' }))
  ]);
  assert.deepEqual(first.load().clients.map(c => [c.id, c.num]), [['c1', 'C01'], ['c2', 'C02']]);
});

test('a failed replacement write preserves the previous Comida state', async () => {
  const storage = memoryStorage();
  const repo = repoWith(storage);
  const before = repo.load();
  repo.save(before);
  const next = Store.setNavSlot(before, 'comida');
  const set = storage.setItem;
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  await assert.rejects(() => repo.update(() => next), /espacio/i);
  assert.deepEqual(repo.load(), before);
  storage.setItem = set;
  await repo.update(() => next);
  assert.deepEqual(repo.load(), next);
});
