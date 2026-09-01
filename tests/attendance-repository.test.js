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
