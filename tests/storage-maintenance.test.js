const test = require('node:test');
const assert = require('node:assert/strict');
const Maintenance = require('../storage-maintenance.js');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    dump: () => Object.fromEntries(map)
  };
}
const attendance = { '2026-09-01': { u1: { status: 'present', hours: 8 } }, '2026-09-02': { u2: { status: 'present', hours: 4 } } };
const tomb = (date, employeeId, deletedAt) => ({ date, employeeId, type: 'attendance', deletedAt, schemaVersion: 1 });
const outboxItem = (i, state = 'pending') => ({ eventId: 'e' + i, state, envelope: { rows: [] } });

test('repair removes the duplicated weeklyAttendance copy without touching attendance', () => {
  const s = memoryStorage({ attendance: JSON.stringify(attendance), weeklyAttendance: JSON.stringify(attendance) });
  const report = Maintenance.repairStorage(s);
  assert.equal(s.getItem('weeklyAttendance'), null);
  assert.deepEqual(JSON.parse(s.getItem('attendance')), attendance);
  assert.ok(report.freedChars > 0);
});

test('repair keeps weeklyAttendance as attendance when it is the only copy', () => {
  const s = memoryStorage({ weeklyAttendance: JSON.stringify(attendance) });
  Maintenance.repairStorage(s);
  assert.deepEqual(JSON.parse(s.getItem('attendance')), attendance);
  assert.equal(s.getItem('weeklyAttendance'), null);
});

test('repair never deletes weeklyAttendance when attendance is unreadable', () => {
  const s = memoryStorage({ attendance: '{broken', weeklyAttendance: JSON.stringify(attendance) });
  Maintenance.repairStorage(s);
  assert.deepEqual(JSON.parse(s.getItem('weeklyAttendance')), attendance);
});

test('repair dedupes tombstones and drops the ones whose record exists', () => {
  const s = memoryStorage({
    attendance: JSON.stringify(attendance),
    attendance_tombstones: JSON.stringify([
      tomb('2026-09-01', 'u1', '2026-09-03T00:00:00Z'),
      tomb('2026-08-30', 'u9', '2026-09-03T00:00:00Z'),
      tomb('2026-08-30', 'u9', '2026-09-05T00:00:00Z'),
      tomb('2026-08-30', 'u9', '2026-09-04T00:00:00Z')
    ])
  });
  const report = Maintenance.repairStorage(s);
  const kept = JSON.parse(s.getItem('attendance_tombstones'));
  assert.deepEqual(kept.map(t => `${t.date}:${t.employeeId}:${t.deletedAt}`), ['2026-08-30:u9:2026-09-05T00:00:00Z']);
  assert.equal(report.tombstonesRemoved, 3);
});

test('repair trims the outbox: drops acknowledged/dead and keeps the newest pending items', () => {
  const items = [outboxItem('a', 'ack'), outboxItem('d', 'dead')];
  for (let i = 0; i < 500; i += 1) items.push(outboxItem(i));
  const s = memoryStorage({ 'mini-sa-outbox-v1': JSON.stringify(items) });
  const report = Maintenance.repairStorage(s);
  const kept = JSON.parse(s.getItem('mini-sa-outbox-v1'));
  assert.equal(kept.length, Maintenance.MAX_OUTBOX_ITEMS);
  assert.equal(kept[kept.length - 1].eventId, 'e499');
  assert.ok(kept.every(item => item.state === 'pending'));
  assert.equal(report.outboxRemoved, 302);
});

test('repair on a clean device changes nothing', () => {
  const clean = { attendance: JSON.stringify(attendance), users: '[]' };
  const s = memoryStorage(clean);
  const report = Maintenance.repairStorage(s);
  assert.deepEqual(s.dump(), clean);
  assert.equal(report.freedChars, 0);
});

test('measureStorage reports usage by key, largest first', () => {
  const s = memoryStorage({ a: 'x'.repeat(10), bb: 'y'.repeat(100) });
  const usage = Maintenance.measureStorage(s);
  assert.equal(usage.items[0].key, 'bb');
  assert.equal(usage.totalChars, 10 + 1 + 100 + 2);
});
