const test = require('node:test');
const assert = require('node:assert/strict');
const MiniData = require('../mini-data.js');
const AttendanceRepository = require('../attendance-repository.js');

const day = (hours = 8) => ({ u1: { status: 'present', hours }, u2: { status: 'present', hours: 8 } });
const v1 = { '2026-09-01': day(8), '2026-09-02': day(10), '2026-09-03': day(4) };

function localStore(values = {}) {
  const data = { ...values };
  return {
    data,
    getItem: k => (Object.hasOwn(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// Memory backend with hooks to simulate a killed app or a bad read-back.
function spyBackend(options = {}) {
  const backend = MiniData.createMemoryBackend();
  const writes = [];
  return {
    writes,
    inner: backend,
    async readAll() {
      const all = await backend.readAll();
      if (options.corruptRead) { const first = Object.keys(all.days)[0]; if (first) all.days[first] = { u1: { status: 'present', hours: 1 } }; }
      return all;
    },
    async write(batch) {
      if (options.failWrites && options.failWrites > 0) { options.failWrites -= 1; throw new Error('simulated write failure'); }
      writes.push(structuredClone(batch));
      return backend.write(batch);
    }
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('diffDays: only changed days are written, removed days are deleted', () => {
  const persisted = new Map([['2026-09-01', JSON.stringify(day(8))], ['2026-09-02', JSON.stringify(day(10))]]);
  const next = { '2026-09-01': day(8), '2026-09-03': day(6) };
  assert.deepEqual(MiniData.diffDays(persisted, next), {
    puts: [{ date: '2026-09-03', records: day(6) }],
    deletes: ['2026-09-02']
  });
});

test('day storage: attendance keys live in memory + IndexedDB, other keys stay in localStorage', async () => {
  const backend = spyBackend();
  const fallback = localStore({ users: '[]' });
  const storage = MiniData.createDayStorage({ backend, fallback });
  await storage.hydrate();
  storage.setItem('attendance', JSON.stringify(v1));
  storage.setItem('users', '[{"id":"u1"}]');
  assert.equal(storage.getItem('attendance'), JSON.stringify(v1), 'reads are synchronous');
  assert.equal(fallback.getItem('attendance'), null, 'attendance never touches localStorage');
  assert.equal(fallback.getItem('users'), '[{"id":"u1"}]');
  await storage.flush();
  assert.equal(backend.writes.length, 1);
  assert.equal(backend.writes[0].puts.length, 3);

  const changed = { ...v1, '2026-09-02': day(12) };
  storage.setItem('attendance', JSON.stringify(changed));
  await storage.flush();
  assert.deepEqual(backend.writes[1].puts.map(p => p.date), ['2026-09-02'], 'a tap writes one day, not the whole history');
  assert.deepEqual(backend.writes[1].deletes, []);
});

test('hydrate rebuilds the same attendance and tombstones on the next launch', async () => {
  const backend = spyBackend();
  const first = MiniData.createDayStorage({ backend, fallback: localStore() });
  await first.hydrate();
  first.setItem('attendance', JSON.stringify(v1));
  first.setItem('attendance_tombstones', JSON.stringify([{ date: '2026-09-01', employeeId: 'u9' }]));
  await first.flush();
  const second = MiniData.createDayStorage({ backend, fallback: localStore() });
  await second.hydrate();
  assert.deepEqual(JSON.parse(second.getItem('attendance')), v1);
  assert.deepEqual(JSON.parse(second.getItem('attendance_tombstones')), [{ date: '2026-09-01', employeeId: 'u9' }]);
});

test('a failed IndexedDB write is reported and retried with the next change', async () => {
  const backend = spyBackend({ failWrites: 1 });
  const errors = [];
  const storage = MiniData.createDayStorage({ backend, fallback: localStore(), onError: e => errors.push(e.message) });
  await storage.hydrate();
  storage.setItem('attendance', JSON.stringify({ '2026-09-01': day(8) }));
  await storage.flush();
  assert.deepEqual(errors, ['simulated write failure']);
  storage.setItem('attendance', JSON.stringify({ '2026-09-01': day(8), '2026-09-02': day(9) }));
  await storage.flush();
  assert.deepEqual(backend.writes[0].puts.map(p => p.date), ['2026-09-01', '2026-09-02'], 'the failed day is written again');
  const all = await backend.inner.readAll();
  assert.deepEqual(Object.keys(all.days).sort(), ['2026-09-01', '2026-09-02']);
});

test('removeItem("attendance") clears every stored day', async () => {
  const backend = spyBackend();
  const storage = MiniData.createDayStorage({ backend, fallback: localStore() });
  await storage.hydrate();
  storage.setItem('attendance', JSON.stringify(v1));
  storage.removeItem('attendance');
  await storage.flush();
  assert.equal(storage.getItem('attendance'), null);
  assert.deepEqual((await backend.inner.readAll()).days, {});
});

test('migration: writes every day, verifies it and keeps a raw v1 copy', async () => {
  const backend = spyBackend();
  const source = { attendanceRaw: JSON.stringify(v1), tombstonesRaw: '[{"date":"2026-08-01","employeeId":"u3"}]' };
  const result = await MiniData.migrateFromV1({ backend, readSource: async () => source, now: () => '2026-09-28T12:00:00.000Z' });
  assert.deepEqual(result, { status: 'migrated', days: 3, records: 6 });
  const all = await backend.inner.readAll();
  assert.deepEqual(all.days, v1);
  assert.equal(all.meta.migration.state, 'verified');
  assert.deepEqual(all.meta.v1Backup, { attendance: source.attendanceRaw, tombstones: source.tombstonesRaw, at: '2026-09-28T12:00:00.000Z' });
  assert.equal(all.meta.attendanceTombstones, source.tombstonesRaw);

  let read = false;
  const again = await MiniData.migrateFromV1({ backend, readSource: async () => { read = true; return source; } });
  assert.deepEqual(again, { status: 'already-migrated' });
  assert.equal(read, false, 'a verified device never re-reads v1');
});

test('migration killed half-way stays on v1 and the next launch finishes it (leftover days removed)', async () => {
  const backend = spyBackend({ failWrites: 1 });
  await backend.inner.write({ puts: [{ date: '2020-01-01', records: day(1) }], deletes: [], meta: { migration: { state: 'written' } } });
  const readSource = async () => ({ attendanceRaw: JSON.stringify(v1), tombstonesRaw: null });
  const failed = await MiniData.migrateFromV1({ backend, readSource });
  assert.equal(failed.status, 'failed');
  assert.notEqual((await backend.inner.readAll()).meta.migration.state, 'verified');
  const done = await MiniData.migrateFromV1({ backend, readSource });
  assert.equal(done.status, 'migrated');
  assert.deepEqual((await backend.inner.readAll()).days, v1, 'the stale 2020 day from the broken attempt is gone');
});

test('migration is not marked verified when the read-back differs', async () => {
  const backend = spyBackend({ corruptRead: true });
  const result = await MiniData.migrateFromV1({ backend, readSource: async () => ({ attendanceRaw: JSON.stringify(v1), tombstonesRaw: null }) });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /2026-09-01/);
  assert.notEqual((await backend.inner.readAll()).meta.migration?.state, 'verified');
});

test('corrupted v1 JSON keeps the device on v1', async () => {
  const backend = spyBackend();
  const result = await MiniData.migrateFromV1({ backend, readSource: async () => ({ attendanceRaw: '{broken', tombstonesRaw: null }) });
  assert.equal(result.status, 'failed');
  assert.equal(backend.writes.length, 0);
});

test('a new device (no v1 data) migrates to an empty, verified v2', async () => {
  const backend = spyBackend();
  const result = await MiniData.migrateFromV1({ backend, readSource: async () => ({ attendanceRaw: null, tombstonesRaw: null }) });
  assert.deepEqual(result, { status: 'migrated', days: 0, records: 0 });
});

test('switchable storage: the repository keeps one storage object while the target changes', () => {
  const a = localStore({ attendance: '{"x":1}' });
  const b = localStore({ attendance: '{"y":2}' });
  const proxy = MiniData.createSwitchableStorage(a);
  assert.equal(proxy.getItem('attendance'), '{"x":1}');
  proxy.use(b);
  proxy.setItem('attendance', '{"z":3}');
  assert.equal(b.getItem('attendance'), '{"z":3}');
  assert.equal(a.getItem('attendance'), '{"x":1}');
  assert.equal(proxy.current(), b);
});

test('v2 can be turned off per device with a flag', () => {
  assert.equal(MiniData.FLAG_KEY, 'miniDataV2');
  assert.equal(MiniData.isEnabled(localStore()), true);
  assert.equal(MiniData.isEnabled(localStore({ miniDataV2: 'off' })), false);
});

test('releasing v1 frees the localStorage attendance keys (and only those)', () => {
  const ls = localStore({ attendance: '{}', weeklyAttendance: '{}', attendance_tombstones: '[]', users: '[]' });
  MiniData.releaseV1(ls);
  assert.deepEqual(Object.keys(ls.data), ['users']);
});

test('AttendanceRepository works unchanged on top of the day storage', async () => {
  const backend = spyBackend();
  const storage = MiniData.createDayStorage({ backend, fallback: localStore() });
  await storage.hydrate();
  const repo = AttendanceRepository.createAttendanceRepository({ storage, now: () => '2026-09-28T12:00:00.000Z' });
  repo.importBatch(v1, 'replace');
  repo.setRecord('u3', '2026-09-03', 'present', 9);
  await storage.flush();
  const reopened = MiniData.createDayStorage({ backend, fallback: localStore() });
  await reopened.hydrate();
  const repo2 = AttendanceRepository.createAttendanceRepository({ storage: reopened });
  assert.equal(repo2.getRecord('u3', '2026-09-03').hours, 9);
  assert.equal(repo2.getRecord('u1', '2026-09-02').hours, 10);
  await settle();
});

test('rollback: v2 days can be exported, and after a rollback the next enable migrates again', async () => {
  const backend = spyBackend();
  const readSource = async () => ({ attendanceRaw: JSON.stringify(v1), tombstonesRaw: '[]' });
  await MiniData.migrateFromV1({ backend, readSource });
  const storage = MiniData.createDayStorage({ backend, fallback: localStore() });
  await storage.hydrate();
  storage.setItem('attendance', JSON.stringify({ ...v1, '2026-09-04': day(6) }));
  await storage.flush();

  const exported = await MiniData.exportAttendance(backend);
  assert.deepEqual(Object.keys(exported.attendance), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  assert.equal(exported.tombstonesRaw, '[]');

  await MiniData.markRolledBack(backend, '2026-09-29T00:00:00.000Z');
  assert.equal((await backend.inner.readAll()).meta.migration.state, 'rolled-back');
  const again = await MiniData.migrateFromV1({ backend, readSource: async () => ({ attendanceRaw: JSON.stringify(exported.attendance), tombstonesRaw: '[]' }) });
  assert.equal(again.status, 'migrated', 'turning v2 back on copies v1 (which may have new marks) again');
});

test('isVerified tells whether a device has v2 data', async () => {
  const backend = spyBackend();
  assert.equal(await MiniData.isVerified(backend), false);
  await MiniData.migrateFromV1({ backend, readSource: async () => ({ attendanceRaw: null, tombstonesRaw: null }) });
  assert.equal(await MiniData.isVerified(backend), true);
});
