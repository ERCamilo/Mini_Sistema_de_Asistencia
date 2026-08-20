const test = require('node:test');
const assert = require('node:assert/strict');
const LocalDb = require('../local-db.js');
function storage(values = {}) {
  return { getItem: key => Object.hasOwn(values, key) ? values[key] : null };
}

function atomicAdapter({ interrupt = false, corrupt = false } = {}) {
  let snapshot = null;
  let marker = null;
  return {
    async readMarker() { return marker; },
    async readSnapshot() { return snapshot; },
    async writeSnapshot(nextSnapshot) {
      snapshot = structuredClone(nextSnapshot);
      return structuredClone(snapshot);
    },
    async migrateSnapshot(nextSnapshot, nextMarker) {
      if (interrupt) throw new Error('simulated interruption');
      const candidate = structuredClone(nextSnapshot);
      if (corrupt) candidate.users = [];
      if (JSON.stringify(candidate) !== JSON.stringify(nextSnapshot)) {
        throw new Error('readback mismatch');
      }
      snapshot = candidate;
      marker = structuredClone(nextMarker);
      return structuredClone(snapshot);
    },
    inspect() { return { snapshot, marker }; }
  };
}
const legacy = {
  users: JSON.stringify([{ id: 'u1', number: '001', name: 'Ana' }]),
  weeklyAttendance: JSON.stringify({
    '2026-07-29': {
      u1: { status: 'present', hours: 12 },
      u2: 'present'
    }
  }),
  lastUpdateTimestamp: '2:30 a. m.',
  appTheme: 'dark',
  iconStyle: 'lucide',
  checkMode: 'cycle',
  reminderConfig: '{"enabled":true,"time":"09:00"}',
  expectedHoursPerDay: '8'
};
test('reads the actual legacy keys and normalizes old string attendance records', () => {
  assert.deepEqual(LocalDb.readLegacySnapshot(storage(legacy)), {
    schemaVersion: 1,
    users: [{ id: 'u1', number: '001', name: 'Ana' }],
    attendance: {
      '2026-07-29': {
        u1: { status: 'present', hours: 12 },
        u2: { status: 'present', hours: 8 }
      }
    },
    settings: {
      appTheme: 'dark',
      iconStyle: 'lucide',
      checkMode: 'cycle',
      reminderConfig: '{"enabled":true,"time":"09:00"}',
      expectedHoursPerDay: '8'
    },
    lastUpdateTimestamp: '2:30 a. m.'
  });
});

test('seed -> migrate -> reload returns the verified IndexedDB snapshot', async () => {
  const adapter = atomicAdapter();
  const first = LocalDb.createLocalDb({
    storage: storage(legacy),
    adapter,
    navigator: { storage: { persist: async () => true } },
    now: () => new Date('2026-07-29T12:00:00.000Z')
  });
  const migrated = await first.migrateLegacyData();
  assert.equal(migrated.status, 'migrated');
  assert.equal(migrated.persisted, true);

  const reloaded = LocalDb.createLocalDb({ storage: storage(legacy), adapter });
  assert.deepEqual(await reloaded.readState(), migrated.snapshot);
  assert.equal((await reloaded.migrateLegacyData()).status, 'already-migrated');
});

test('an interrupted migration writes neither snapshot nor marker and safely retries', async () => {
  const failedAdapter = atomicAdapter({ interrupt: true });
  const failed = await LocalDb.createLocalDb({
    storage: storage(legacy),
    adapter: failedAdapter
  }).migrateLegacyData();
  assert.equal(failed.status, 'legacy-authoritative');
  assert.deepEqual(failedAdapter.inspect(), { snapshot: null, marker: null });
  const retry = await LocalDb.createLocalDb({
    storage: storage(legacy),
    adapter: atomicAdapter()
  }).migrateLegacyData();
  assert.equal(retry.status, 'migrated');
});

test('invalid legacy JSON remains authoritative and never starts a transaction', async () => {
  let migrationCalls = 0;
  const adapter = atomicAdapter();
  const original = adapter.migrateSnapshot;
  adapter.migrateSnapshot = (...args) => {
    migrationCalls += 1;
    return original(...args);
  };
  const result = await LocalDb.createLocalDb({
    storage: storage({ users: '{broken' }),
    adapter
  }).migrateLegacyData();
  assert.equal(result.status, 'legacy-authoritative');
  assert.match(result.reason, /Invalid JSON/);
  assert.equal(migrationCalls, 0);
  assert.deepEqual(adapter.inspect(), { snapshot: null, marker: null });
});

test('readback mismatch cannot create a migration marker', async () => {
  const adapter = atomicAdapter({ corrupt: true });
  const result = await LocalDb.createLocalDb({
    storage: storage(legacy),
    adapter
  }).migrateLegacyData();
  assert.equal(result.status, 'legacy-authoritative');
  assert.deepEqual(adapter.inspect(), { snapshot: null, marker: null });
});

test('feature flag defaults on and can keep localStorage authoritative', async () => {
  assert.equal(LocalDb.isEnabled(storage()), true);
  const adapter = atomicAdapter();
  const result = await LocalDb.createLocalDb({
    storage: storage({ ...legacy, miniLocalDbEnabled: 'false' }),
    adapter
  }).migrateLegacyData();
  assert.deepEqual(result, { status: 'disabled' });
  assert.deepEqual(adapter.inspect(), { snapshot: null, marker: null });
});

test('persistent storage is best effort and never fails migration', async () => {
  const result = await LocalDb.createLocalDb({
    storage: storage(legacy),
    adapter: atomicAdapter(),
    navigator: { storage: { persist: async () => { throw new Error('denied'); } } }
  }).migrateLegacyData();
  assert.equal(result.status, 'migrated');
  assert.equal(result.persisted, false);
});

test('atomic snapshots survive reload and the feature flag restores legacy reads', async () => {
  const values = { ...legacy };
  const adapter = atomicAdapter();
  const db = LocalDb.createLocalDb({ storage: storage(values), adapter });
  await db.migrateLegacyData();
  const next = { ...(await db.readState()), lastUpdateTimestamp: '3:45 p. m.' };
  await db.writeState(next);
  assert.deepEqual(await LocalDb.createLocalDb({ storage: storage(values), adapter }).readState(), next);
  values.miniLocalDbEnabled = 'false';
  assert.equal(await db.readState(), null);
  await assert.rejects(() => db.writeState(next), /disabled/);
});
