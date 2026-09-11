const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createActivityStore,
  createStagedRosterStore,
  STAGED_STORE_VERSION
} = require('../p2p-activity-store.js');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    dump: key => map.get(key) || null
  };
}

test('activity store persists bounded human-facing events and pending staged count', () => {
  const storage = memoryStorage();
  const store = createActivityStore({ storage, storageKey: 'a' });
  store.record({ type: 'peer-linked', peerId: 'sa-1', peerName: 'Proyecto Norte', detail: 'Vínculo listo' });
  store.record({ type: 'roster-staged', peerId: 'sa-1', peerName: 'Proyecto Norte', detail: '3 empleados' });
  assert.equal(store.list().length, 2);
  assert.equal(store.getPendingCount(), 1);
  assert.equal(store.markStagedReviewed('sa-1'), true);
  assert.equal(store.getPendingCount(), 0);
  const reloaded = createActivityStore({ storage, storageKey: 'a' });
  assert.equal(reloaded.list().length, 2);
});

test('staged roster store keeps one latest pending roster per SA and migrates v1', () => {
  const storage = memoryStorage();
  const store = createStagedRosterStore({ storage, storageKey: 's' });
  const base = { text: '{"schema":"sa-roster/v1"}', sha256: 'a'.repeat(64), transferId: 't1', employeeCount: 3 };
  store.save({ ...base, peerId: 'sa-1', peerName: 'Proyecto Norte', receivedAt: '2026-09-11T01:00:00.000Z' });
  store.save({ ...base, sha256: 'b'.repeat(64), transferId: 't2', peerId: 'sa-2', peerName: 'Proyecto Sur', receivedAt: '2026-09-11T02:00:00.000Z' });
  assert.equal(store.list().length, 2);
  assert.equal(store.load('sa-1').peerName, 'Proyecto Norte');
  store.save({ ...base, sha256: 'c'.repeat(64), transferId: 't3', peerId: 'sa-1', peerName: 'Proyecto Norte', employeeCount: 4, receivedAt: '2026-09-11T03:00:00.000Z' });
  assert.equal(store.list().length, 2, 'same SA replaces only its previous pending roster');
  assert.equal(store.load('sa-1').employeeCount, 4);
  assert.equal(JSON.parse(storage.dump('s')).version, STAGED_STORE_VERSION);
  assert.equal(store.clear('sa-2'), true);
  assert.equal(store.list().length, 1);

  const legacy = memoryStorage({ legacy: JSON.stringify({ version: 1, staged: { ...base, peerId: 'sa-old', peerName: 'Proyecto Legacy', receivedAt: '2026-09-10T01:00:00.000Z' } }) });
  const migrated = createStagedRosterStore({ storage: legacy, storageKey: 'legacy' });
  assert.equal(migrated.list().length, 1);
  assert.equal(migrated.load('sa-old').peerName, 'Proyecto Legacy');
});
