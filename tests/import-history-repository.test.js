const test = require('node:test');
const assert = require('node:assert/strict');
const ImportHistoryRepository = require('../import-history-repository.js');
const EmployeeRepository = require('../employee-repository.js');
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

test('recordImport saves entry with snapshotBefore and metadata', () => {
  const storage = createMemoryStorage();
  const historyRepo = ImportHistoryRepository.createImportHistoryRepository({ storage });

  const previousUsers = [{ id: 'u1', name: 'Ana', number: '1' }];
  const previousAttendance = { '2026-09-01': { 'u1': { status: 'present', hours: 8 } } };

  const entry = historyRepo.recordImport({
    source: 'json',
    mode: 'merge',
    summary: { totalIncoming: 2, createdCount: 1, updatedCount: 1 },
    snapshotBefore: { users: previousUsers, attendance: previousAttendance }
  });

  assert.ok(entry.id);
  assert.equal(entry.source, 'json');
  assert.equal(entry.mode, 'merge');
  assert.equal(entry.status, 'applied');
  assert.equal(entry.schemaVersion, 1);
  assert.equal(entry.summary.createdCount, 1);
  assert.equal(entry.snapshotBefore.users.length, 1);
  assert.equal(entry.snapshotBefore.users[0].name, 'Ana');

  const all = historyRepo.getAll();
  assert.equal(all.length, 1);

  const latest = historyRepo.getLatest();
  assert.ok(latest);
  assert.equal(latest.id, entry.id);
});

test('rollback restores employee repository and attendance repository to previous snapshot', () => {
  const storage = createMemoryStorage();
  const empRepo = EmployeeRepository.createEmployeeRepository({ storage });
  const attRepo = AttendanceRepository.createAttendanceRepository({ storage });
  const historyRepo = ImportHistoryRepository.createImportHistoryRepository({ storage });

  // Initial state before import
  const initialUsers = [
    { id: 'u1', name: 'Ana', number: '1', position: 'Developer' }
  ];
  const initialAttendance = {
    '2026-09-01': { 'u1': { status: 'present', hours: 8 } }
  };
  empRepo.importBatch(initialUsers, 'replace');
  attRepo.importBatch(initialAttendance, 'replace');

  // Record import of a new employee
  const snapshotBefore = {
    users: empRepo.getAll(),
    attendance: attRepo.getAll()
  };

  // Perform import (adds Carlos)
  empRepo.importBatch([
    { id: 'u1', name: 'Ana', number: '1', position: 'Lead Developer' },
    { id: 'u2', name: 'Carlos', number: '2', position: 'Designer' }
  ], 'merge');

  const historyEntry = historyRepo.recordImport({
    source: 'json',
    mode: 'merge',
    summary: { totalIncoming: 2, createdCount: 1, updatedCount: 1 },
    snapshotBefore
  });

  assert.equal(empRepo.getAll().length, 2);
  assert.equal(empRepo.getById('u1').position, 'Lead Developer');

  // Now execute rollback
  const rollbackRes = historyRepo.rollback(historyEntry.id, {
    employeeRepository: empRepo,
    attendanceRepository: attRepo
  });

  assert.equal(rollbackRes.success, true);
  assert.equal(rollbackRes.entry.status, 'rolled_back');

  // Verify employee state was reverted
  const restoredUsers = empRepo.getAll();
  assert.equal(restoredUsers.length, 1);
  assert.equal(restoredUsers[0].name, 'Ana');
  assert.equal(restoredUsers[0].position, 'Developer');
  assert.equal(empRepo.getById('u2'), null);

  // Attempting rollback on already rolled back entry should fail cleanly
  const doubleRollback = historyRepo.rollback(historyEntry.id, {
    employeeRepository: empRepo
  });
  assert.equal(doubleRollback.success, false);
});

test('rollbackLatest rolls back the most recent applied entry', () => {
  const storage = createMemoryStorage();
  const empRepo = EmployeeRepository.createEmployeeRepository({ storage });
  const historyRepo = ImportHistoryRepository.createImportHistoryRepository({ storage });

  empRepo.importBatch([{ id: 'u1', name: 'Ana', number: '1' }], 'replace');

  historyRepo.recordImport({
    source: 'json',
    mode: 'merge',
    summary: { totalIncoming: 1, createdCount: 1, updatedCount: 0 },
    snapshotBefore: { users: [] }
  });

  const res = historyRepo.rollbackLatest({ employeeRepository: empRepo });
  assert.equal(res.success, true);
  assert.equal(empRepo.getAll().length, 0);

  // Calling rollbackLatest again when no applied entry exists returns error
  const second = historyRepo.rollbackLatest({ employeeRepository: empRepo });
  assert.equal(second.success, false);
});

test('history respects maxEntries limit', () => {
  const storage = createMemoryStorage();
  const historyRepo = ImportHistoryRepository.createImportHistoryRepository({
    storage,
    maxEntries: 3
  });

  for (let i = 1; i <= 5; i++) {
    historyRepo.recordImport({
      source: 'json',
      mode: 'merge',
      summary: { totalIncoming: i, createdCount: i, updatedCount: 0 },
      snapshotBefore: { users: [] }
    });
  }

  const all = historyRepo.getAll();
  assert.equal(all.length, 3);
  assert.equal(all[0].summary.totalIncoming, 3);
  assert.equal(all[2].summary.totalIncoming, 5);
});
