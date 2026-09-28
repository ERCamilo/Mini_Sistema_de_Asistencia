const test = require('node:test');
const assert = require('node:assert/strict');
const Review = require('../mini-backup-review.js');

const backup = {
  exportedAt: '2026-09-28T15:00:00.000Z',
  users: [
    { id: 'x1', name: 'Ana Pérez', number: '007', position: 'Maestro' },
    { id: 'x2', name: 'Luis Gómez', number: '8' },
    { id: 'x3', name: 'Nuevo Uno', number: '30' }
  ],
  attendance: {
    '2026-09-01': { x1: { status: 'present', hours: 8 } },
    '2026-09-03': { x1: { status: 'present', hours: 8 }, x2: { status: 'present', hours: 4 } },
    '2026-09-02': {}
  },
  requests: [{ id: 'r1' }],
  workContexts: [{ id: 'c1' }]
};
const current = {
  users: [
    { id: 'a1', name: 'Ana Perez', number: '7' },
    { id: 'x2', name: 'Luis G.', number: '99' },
    { id: 'a3', name: 'Se Va', number: '50' }
  ],
  attendance: { '2026-08-20': { a1: { status: 'present', hours: 8 } } }
};

test('summarizes what the backup brings, with the attendance date range', () => {
  const model = Review.buildBackupReviewModel(backup, current);
  assert.deepEqual(model.backup, {
    employees: 3, attendanceDays: 2, attendanceRecords: 3, requests: 1, workContexts: 1,
    firstDay: '2026-09-01', lastDay: '2026-09-03', exportedAt: '2026-09-28T15:00:00.000Z'
  });
  assert.deepEqual(model.current, { employees: 3, attendanceDays: 1, attendanceRecords: 1, firstDay: '2026-08-20', lastDay: '2026-08-20' });
});

test('compares employees by id, then employee number (007 == 7), then name', () => {
  const model = Review.buildBackupReviewModel(backup, current);
  assert.equal(model.employees.matched, 2);
  assert.deepEqual(model.employees.added.map(e => e.name), ['Nuevo Uno']);
  assert.deepEqual(model.employees.removed.map(e => e.name), ['Se Va']);
  assert.equal(model.replacesExistingData, true);
});

test('an empty device has nothing to replace', () => {
  const model = Review.buildBackupReviewModel(backup, { users: [], attendance: {} });
  assert.equal(model.replacesExistingData, false);
  assert.equal(model.employees.added.length, 3);
  assert.equal(model.current.firstDay, null);
});

test('employee list is sorted by number for the detail view', () => {
  const model = Review.buildBackupReviewModel(backup, current);
  assert.deepEqual(model.backupEmployees.map(e => e.number), ['007', '8', '30']);
});
