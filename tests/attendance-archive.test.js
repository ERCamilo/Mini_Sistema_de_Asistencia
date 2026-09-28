const test = require('node:test');
const assert = require('node:assert/strict');
const Archive = require('../attendance-archive.js');
const AttendanceRepository = require('../attendance-repository.js');

const day = (d, ids) => [d, Object.fromEntries(ids.map(id => [id, { status: 'present', hours: 8 }]))];
const attendance = Object.fromEntries([
  day('2026-05-10', ['u1', 'u2']),
  day('2026-05-11', ['u1']),
  day('2026-06-02', ['u2']),
  day('2026-07-15', ['u1']),
  day('2026-08-01', ['u1']),
  day('2026-09-28', ['u1', 'u2'])
]);
const users = [{ id: 'u1', name: 'Ana', number: '1' }, { id: 'u2', name: 'Luis', number: '2' }, { id: 'u3', name: 'Sin días', number: '3' }];

test('keeps the current month plus N-1 previous months and archives the rest', () => {
  const plan = Archive.planArchive(attendance, { keepMonths: 3, today: '2026-09-28' });
  assert.equal(plan.cutoff, '2026-07-01');
  assert.deepEqual(plan.dates, ['2026-05-10', '2026-05-11', '2026-06-02']);
  assert.deepEqual(plan.months.map(m => [m.month, m.days, m.records]), [['2026-05', 2, 3], ['2026-06', 1, 1]]);
  assert.equal(plan.records, 4);
  assert.equal(plan.from, '2026-05-10');
  assert.equal(plan.to, '2026-06-02');
});

test('never archives the current month, even with keepMonths 1', () => {
  const plan = Archive.planArchive(attendance, { keepMonths: 1, today: '2026-09-28' });
  assert.ok(!plan.dates.includes('2026-09-28'));
  assert.equal(plan.cutoff, '2026-09-01');
});

test('nothing to archive yields an empty plan', () => {
  const plan = Archive.planArchive(attendance, { keepMonths: 12, today: '2026-09-28' });
  assert.equal(plan.dates.length, 0);
  assert.equal(plan.records, 0);
});

test('archive file holds only archived days and the employees that appear in them', () => {
  const plan = Archive.planArchive(attendance, { keepMonths: 3, today: '2026-09-28' });
  const file = Archive.buildArchiveFile(plan, attendance, users, { sourceName: 'Obra Norte', exportedAt: '2026-09-28T20:00:00.000Z' });
  assert.equal(file.kind, 'mini-archive');
  assert.equal(file.schemaVersion, 1);
  assert.deepEqual(Object.keys(file.attendance), plan.dates);
  assert.deepEqual(file.users.map(u => u.id), ['u1', 'u2']);
  assert.deepEqual(file.range, { from: '2026-05-10', to: '2026-06-02' });
  assert.equal(Archive.isArchiveFile(file), true);
  assert.equal(Archive.isArchiveFile({ schemaVersion: 1, users: [], attendance: {} }), false);
});

test('estimates the space freed from the serialized archived days', () => {
  const plan = Archive.planArchive(attendance, { keepMonths: 3, today: '2026-09-28' });
  const chars = Archive.estimateFreedChars(plan, attendance);
  const expected = plan.dates.reduce((sum, d) => sum + JSON.stringify(d).length + 1 + JSON.stringify(attendance[d]).length + 1, 0);
  assert.equal(chars, expected);
});

test('repository removeDays drops whole days without creating tombstones', () => {
  const map = new Map([['attendance', JSON.stringify(attendance)]]);
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const removed = repo.removeDays(['2026-05-10', '2026-05-11', '2099-01-01']);
  assert.equal(removed, 2);
  assert.equal(repo.getByDate('2026-05-10').u1, undefined);
  assert.ok(repo.getRecord('u1', '2026-09-28'));
  assert.deepEqual(repo.getTombstones(), []);
});
