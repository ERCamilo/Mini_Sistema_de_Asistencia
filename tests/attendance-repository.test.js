const test = require('node:test');
const assert = require('node:assert/strict');
const AttendanceRepository = require('../attendance-repository.js');

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

test('getRecord and getByDate return attendance records correctly', () => {
  const initialAttendance = {
    '2026-09-01': {
      'u1': { status: 'present', hours: 8 },
      'u2': { status: 'present', hours: 4.5 }
    }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(initialAttendance) });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  const rec1 = repo.getRecord('u1', '2026-09-01');
  assert.ok(rec1);
  assert.equal(rec1.status, 'present');
  assert.equal(rec1.hours, 8);

  const recNonExistent = repo.getRecord('u99', '2026-09-01');
  assert.equal(recNonExistent, null);

  const dayRecords = repo.getByDate('2026-09-01');
  assert.equal(Object.keys(dayRecords).length, 2);
  assert.equal(dayRecords.u2.hours, 4.5);
});

test('getByEmployee and getDateRange filter records accurately', () => {
  const initialAttendance = {
    '2026-08-30': { 'u1': { status: 'present', hours: 8 } },
    '2026-08-31': { 'u1': { status: 'present', hours: 6 }, 'u2': { status: 'present', hours: 8 } },
    '2026-09-01': { 'u1': { status: 'present', hours: 8 } }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(initialAttendance) });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  const u1History = repo.getByEmployee('u1', '2026-08-31', '2026-09-01');
  assert.equal(Object.keys(u1History).length, 2);
  assert.equal(u1History['2026-08-31'].hours, 6);
  assert.equal(u1History['2026-09-01'].hours, 8);

  const range = repo.getDateRange('2026-08-31', '2026-09-01');
  assert.equal(Object.keys(range).length, 2);
  assert.ok(range['2026-08-31'].u2);
});

test('setRecord saves with schemaVersion, localOnly, createdAt and updatedAt', () => {
  const storage = createMemoryStorage();
  const fixedNow = '2026-09-01T10:00:00.000Z';
  const repo = AttendanceRepository.createAttendanceRepository({
    storage,
    now: () => fixedNow
  });

  const res = repo.setRecord('u1', '2026-09-01', 'present', 9.5);
  assert.equal(res.status, 'saved');
  assert.ok(res.record);
  assert.equal(res.record.status, 'present');
  assert.equal(res.record.hours, 9.5);
  assert.equal(res.record.schemaVersion, 1);
  assert.equal(res.record.localOnly, true);
  assert.equal(res.record.createdAt, fixedNow);
  assert.equal(res.record.updatedAt, fixedNow);

  // Read back from storage to confirm persistence
  const savedRaw = JSON.parse(storage.getItem('attendance'));
  assert.equal(savedRaw['2026-09-01'].u1.hours, 9.5);
});

test('setRecord absent and deleteRecord remove entry and create tombstone record', () => {
  const initialAttendance = {
    '2026-09-01': {
      'u1': { status: 'present', hours: 8, createdAt: '2026-09-01T08:00:00.000Z' }
    }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(initialAttendance) });
  const fixedNow = '2026-09-01T12:00:00.000Z';
  const repo = AttendanceRepository.createAttendanceRepository({
    storage,
    now: () => fixedNow
  });

  const deleted = repo.deleteRecord('u1', '2026-09-01');
  assert.equal(deleted, true);

  // Check attendance is deleted
  const rec = repo.getRecord('u1', '2026-09-01');
  assert.equal(rec, null);

  // Check tombstone was recorded
  const tombstones = repo.getTombstones();
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].employeeId, 'u1');
  assert.equal(tombstones[0].date, '2026-09-01');
  assert.equal(tombstones[0].deletedAt, fixedNow);
  assert.equal(tombstones[0].schemaVersion, 1);
});

test('importBatch in merge mode updates existing, inserts new and keeps untouched records', () => {
  const initialAttendance = {
    '2026-09-01': {
      'u1': { status: 'present', hours: 8 }
    }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(initialAttendance) });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  const incoming = {
    '2026-09-01': {
      'u1': { status: 'present', hours: 10 },
      'u2': { status: 'present', hours: 8 }
    },
    '2026-09-02': {
      'u3': { status: 'present', hours: 8 }
    }
  };

  const result = repo.importBatch(incoming, 'merge');
  assert.equal(result.updatedDays, 2);
  assert.equal(result.totalRecords, 3);

  const all = repo.getAll();
  assert.equal(all['2026-09-01'].u1.hours, 10);
  assert.equal(all['2026-09-01'].u2.hours, 8);
  assert.equal(all['2026-09-02'].u3.hours, 8);
});

test('importBatch in replace mode wipes existing records and creates tombstones', () => {
  const initialAttendance = {
    '2026-09-01': {
      'u1': { status: 'present', hours: 8 }
    }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(initialAttendance) });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  const incoming = {
    '2026-09-02': {
      'u2': { status: 'present', hours: 8 }
    }
  };

  const result = repo.importBatch(incoming, 'replace');
  assert.equal(result.totalRecords, 1);

  const all = repo.getAll();
  assert.equal(all['2026-09-01'], undefined);
  assert.ok(all['2026-09-02'].u2);

  const tombstones = repo.getTombstones();
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].employeeId, 'u1');
  assert.equal(tombstones[0].date, '2026-09-01');
});

test('exportSnapshot returns schemaVersion 1 with attendance and tombstones', () => {
  const initialAttendance = {
    '2026-09-01': { 'u1': { status: 'present', hours: 8 } }
  };
  const initialTombstones = [
    { date: '2026-08-30', employeeId: 'u2', type: 'attendance', deletedAt: '2026-08-30T10:00:00.000Z', schemaVersion: 1 }
  ];
  const storage = createMemoryStorage({
    attendance: JSON.stringify(initialAttendance),
    attendance_tombstones: JSON.stringify(initialTombstones)
  });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  const snapshot = repo.exportSnapshot();
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(snapshot.exportedAt);
  assert.equal(snapshot.attendance['2026-09-01'].u1.hours, 8);
  assert.equal(snapshot.tombstones.length, 1);
  assert.equal(snapshot.tombstones[0].employeeId, 'u2');
});

test('replace with the same data (startup hydration) creates no tombstones', () => {
  const attendance = {
    '2026-09-01': { u1: { status: 'present', hours: 8 }, u2: { status: 'present', hours: 4 } }
  };
  const storage = createMemoryStorage({ attendance: JSON.stringify(attendance) });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  repo.importBatch(attendance, 'replace');
  repo.importBatch(attendance, 'replace');
  repo.importBatch(attendance, 'replace');

  assert.equal(repo.getTombstones().length, 0);
  assert.equal(repo.getRecord('u2', '2026-09-01').hours, 4);
});

test('replace tombstones only removed records, once per day+employee', () => {
  const storage = createMemoryStorage({
    attendance: JSON.stringify({ '2026-09-01': { u1: { status: 'present', hours: 8 }, u2: { status: 'present', hours: 8 } } })
  });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const keepU1 = { '2026-09-01': { u1: { status: 'present', hours: 8 } } };

  repo.importBatch(keepU1, 'replace');
  repo.importBatch(keepU1, 'replace');

  const tombstones = repo.getTombstones();
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].employeeId, 'u2');
});

test('replace prunes duplicated and stale tombstones left by older versions', () => {
  const stale = { date: '2026-09-01', employeeId: 'u1', type: 'attendance', deletedAt: '2026-09-02T00:00:00.000Z', schemaVersion: 1 };
  const removed = { date: '2026-08-31', employeeId: 'u9', type: 'attendance', deletedAt: '2026-09-02T00:00:00.000Z', schemaVersion: 1 };
  const attendance = { '2026-09-01': { u1: { status: 'present', hours: 8 } } };
  const storage = createMemoryStorage({
    attendance: JSON.stringify(attendance),
    attendance_tombstones: JSON.stringify([stale, stale, stale, removed, { ...removed, deletedAt: '2026-09-03T00:00:00.000Z' }])
  });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });

  repo.importBatch(attendance, 'replace');

  const tombstones = repo.getTombstones();
  assert.deepEqual(tombstones.map(t => `${t.date}:${t.employeeId}`), ['2026-08-31:u9']);
  assert.equal(tombstones[0].deletedAt, '2026-09-03T00:00:00.000Z');
});

// --- Read cache: the history is parsed once, not once per read ---
function countingParse(fn) {
  const original = JSON.parse;
  let calls = 0;
  JSON.parse = function (...args) { calls += 1; return original.apply(this, args); };
  try { fn(); } finally { JSON.parse = original; }
  return calls;
}

function bigHistoryStorage() {
  const attendance = {};
  for (let d = 1; d <= 28; d++) {
    const date = `2026-02-${String(d).padStart(2, '0')}`;
    attendance[date] = {};
    for (let i = 0; i < 60; i++) attendance[date]['u' + i] = { status: 'present', hours: 8 };
  }
  const data = { attendance: JSON.stringify(attendance) };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('reads reuse one parse of the history until it changes (60 getRecord = 1 parse)', () => {
  const repo = AttendanceRepository.createAttendanceRepository({ storage: bigHistoryStorage() });
  const parses = countingParse(() => {
    for (let i = 0; i < 60; i++) repo.getRecord('u' + i, '2026-02-10');
    repo.getByDate('2026-02-10');
    repo.getAll();
  });
  assert.equal(parses, 1);
});

test('the read cache never leaks: callers get copies, and writes are seen right away', () => {
  const storage = bigHistoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage, now: () => '2026-03-01T00:00:00.000Z' });
  const rec = repo.getRecord('u1', '2026-02-10');
  rec.hours = 99;
  repo.getAll()['2026-02-10'].u1.hours = 77;
  repo.getByDate('2026-02-10').u1.hours = 55;
  assert.equal(repo.getRecord('u1', '2026-02-10').hours, 8, 'mutating results does not touch the store');

  repo.setRecord('u1', '2026-02-10', 'present', 10);
  assert.equal(repo.getRecord('u1', '2026-02-10').hours, 10);
  repo.setRecord('u1', '2026-02-10', 'absent');
  assert.equal(repo.getRecord('u1', '2026-02-10'), null);
  assert.equal(repo.getTombstones().length, 1);
});

test('the read cache follows changes written to storage by someone else', () => {
  const storage = bigHistoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  assert.equal(repo.getRecord('u1', '2026-02-10').hours, 8);
  storage.setItem('attendance', JSON.stringify({ '2026-02-10': { u1: { status: 'present', hours: 4 } } }));
  assert.equal(repo.getRecord('u1', '2026-02-10').hours, 4);
});

test('a tap (setRecord) does not re-parse the history, before or after writing', () => {
  const storage = bigHistoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage, now: () => '2026-03-01T00:00:00.000Z' });
  repo.getAll(); // warm cache, as the app does at boot
  const original = JSON.parse;
  let bigParses = 0;
  JSON.parse = function (text, ...rest) { if (typeof text === 'string' && text.length > 10000) bigParses += 1; return original.call(this, text, ...rest); };
  try {
    repo.setRecord('u1', '2026-02-10', 'present', 10);
    repo.setRecord('u2', '2026-02-10', 'absent');
    repo.setRecord('new', '2026-03-01', 'present', 8);
    for (let i = 0; i < 60; i++) repo.getRecord('u' + i, '2026-02-10');
  } finally {
    JSON.parse = original;
  }
  assert.equal(bigParses, 0);
  // And the stored JSON is exactly what a fresh repository reads back.
  const fresh = AttendanceRepository.createAttendanceRepository({ storage });
  assert.equal(fresh.getRecord('u1', '2026-02-10').hours, 10);
  assert.equal(fresh.getRecord('u2', '2026-02-10'), null);
  assert.equal(fresh.getRecord('new', '2026-03-01').hours, 8);
  assert.deepEqual(fresh.getAll(), repo.getAll());
});

test('copy-on-write: a previously returned snapshot is not changed by later taps', () => {
  const storage = bigHistoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const before = repo.getAll();
  const snapshotEvents = [];
  const repo2 = AttendanceRepository.createAttendanceRepository({ storage, onSnapshotChanged: a => snapshotEvents.push(a) });
  repo2.setRecord('u1', '2026-02-10', 'present', 12);
  repo2.setRecord('u1', '2026-02-11', 'absent');
  assert.equal(before['2026-02-10'].u1.hours, 8);
  assert.ok(before['2026-02-11'].u1);
  assert.equal(snapshotEvents[0]['2026-02-10'].u1.hours, 12);
  assert.ok(snapshotEvents[0]['2026-02-11'].u1, 'the first event still shows the day-11 mark');
});

test('setDayPosition: stores the day position on an existing mark; null clears it; no mark = no-op', () => {
  const storage = createMemoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage, now: () => '2026-09-30T12:00:00.000Z' });
  repo.setRecord('u1', '2026-09-30', 'present', 8);
  assert.equal(repo.setDayPosition('u1', '2026-09-30', 'Plomero'), true);
  assert.equal(repo.getRecord('u1', '2026-09-30').position, 'Plomero');
  repo.setRecord('u1', '2026-09-30', 'present', 10);
  assert.equal(repo.getRecord('u1', '2026-09-30').position, 'Plomero', 'changing hours keeps the position');
  repo.setDayPosition('u1', '2026-09-30', null);
  assert.equal('position' in repo.getRecord('u1', '2026-09-30'), false);
  assert.equal(repo.setDayPosition('u9', '2026-09-30', 'Plomero'), false, 'no mark that day');
  const fresh = AttendanceRepository.createAttendanceRepository({ storage });
  assert.equal(fresh.getRecord('u1', '2026-09-30').hours, 10);
});
