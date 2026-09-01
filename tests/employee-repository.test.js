const test = require('node:test');
const assert = require('node:assert/strict');
const EmployeeNumberRules = require('../employee-number-rules.js');
const EmployeeRepository = require('../employee-repository.js');

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

test('getAll returns list of employees and respects includePaused filter', () => {
  const initialUsers = [
    { id: 'u1', name: 'Ana', number: '1', position: 'Dev' },
    { id: 'u2', name: 'Carlos', number: '2', position: 'Designer', paused: true }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initialUsers) });
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules
  });

  const all = repo.getAll();
  assert.equal(all.length, 2);

  const activeOnly = repo.getAll({ includePaused: false });
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].id, 'u1');
});

test('getById and getByNumber find employee correctly', () => {
  const initialUsers = [
    { id: 'u10', name: 'Beatriz', number: '07', position: 'PM' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initialUsers) });
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules
  });

  const byId = repo.getById('u10');
  assert.ok(byId);
  assert.equal(byId.name, 'Beatriz');

  const byNum = repo.getByNumber('7'); // Normalizes 7 vs 07
  assert.ok(byNum);
  assert.equal(byNum.id, 'u10');

  assert.equal(repo.getById('non-existent'), null);
  assert.equal(repo.getByNumber('99'), null);
});

test('save creates new employee with schemaVersion, localOnly, createdAt and updatedAt', () => {
  const storage = createMemoryStorage();
  let fakeTime = '2026-09-01T10:00:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => fakeTime
  });

  const draft = { name: 'Diego Lopez', number: '5', position: 'Albañil', sueldo: '2000' };
  const res = repo.save(draft, 'u_custom_1');

  assert.equal(res.status, 'saved');
  assert.ok(res.employee);
  assert.equal(res.employee.id, 'u_custom_1');
  assert.equal(res.employee.schemaVersion, 1);
  assert.equal(res.employee.localOnly, true);
  assert.equal(res.employee.createdAt, fakeTime);
  assert.equal(res.employee.updatedAt, fakeTime);

  // Persistence check
  const savedList = JSON.parse(storage.getItem('users'));
  assert.equal(savedList.length, 1);
  assert.equal(savedList[0].id, 'u_custom_1');
});

test('save updates existing employee, updating updatedAt while preserving createdAt', () => {
  const initial = [
    { id: 'u1', name: 'Elena', number: '1', position: 'Oficial', createdAt: '2026-08-01T00:00:00.000Z', schemaVersion: 1 }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  let updateTime = '2026-09-01T12:30:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => updateTime
  });

  const res = repo.save({ id: 'u1', name: 'Elena Gomez', number: '1', position: 'Maestra Mayor', sueldo: '3000' });
  assert.equal(res.status, 'saved');
  assert.equal(res.employee.name, 'Elena Gomez');
  assert.equal(res.employee.position, 'Maestra Mayor');
  assert.equal(res.employee.createdAt, '2026-08-01T00:00:00.000Z');
  assert.equal(res.employee.updatedAt, updateTime);
});

test('save detects duplicate number conflict using EmployeeNumberRules', () => {
  const initial = [
    { id: 'u1', name: 'Fernando', number: '3', position: 'Ayudante' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules
  });

  const conflictRes = repo.save({ name: 'Gabriel', number: '3', position: 'Oficial' });
  assert.equal(conflictRes.status, 'conflict');
  assert.ok(conflictRes.conflict);
  assert.equal(conflictRes.conflict.conflictingEmployeeId, 'u1');
});

test('setPaused toggles status and updatedAt', () => {
  const initial = [
    { id: 'u1', name: 'Hugo', number: '4', position: 'Chofer' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  let nowTime = '2026-09-01T14:00:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => nowTime
  });

  const pausedEmp = repo.setPaused('u1', true);
  assert.ok(pausedEmp);
  assert.equal(pausedEmp.paused, true);
  assert.equal(pausedEmp.updatedAt, nowTime);

  nowTime = '2026-09-01T15:00:00.000Z';
  const unpausedEmp = repo.setPaused('u1', false);
  assert.ok(unpausedEmp);
  assert.equal(unpausedEmp.paused, undefined);
  assert.equal(unpausedEmp.updatedAt, nowTime);
});

test('remove deletes employee and creates a tombstone record', () => {
  const initial = [
    { id: 'u1', name: 'Ivan', number: '1', position: 'Soldador' },
    { id: 'u2', name: 'Julia', number: '2', position: 'Electricista' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  let deleteTime = '2026-09-01T16:00:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => deleteTime
  });

  const removed = repo.remove('u1');
  assert.equal(removed, true);
  assert.equal(repo.getAll().length, 1);
  assert.equal(repo.getById('u1'), null);

  const tombstones = repo.getTombstones();
  assert.equal(tombstones.length, 1);
  assert.deepEqual(tombstones[0], {
    id: 'u1',
    type: 'employee',
    deletedAt: deleteTime,
    schemaVersion: 1
  });
});

test('importBatch in merge mode updates existing, adds new and sets metadata', () => {
  const initial = [
    { id: 'u1', name: 'Karla', number: '1', position: 'Dev', sueldo: '1000' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  let importTime = '2026-09-01T17:00:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => importTime
  });

  const incoming = [
    { number: '1', name: 'Karla R.', position: 'Lead Dev', sueldo: '2500' },
    { number: '2', name: 'Lucas', position: 'QA', paused: true }
  ];

  const result = repo.importBatch(incoming, 'merge');
  assert.equal(result.updatedCount, 1);
  assert.equal(result.createdCount, 1);
  assert.equal(result.totalValid, 2);

  const all = repo.getAll();
  assert.equal(all.length, 2);

  const karla = repo.getByNumber('1');
  assert.equal(karla.id, 'u1'); // Preserved stable ID
  assert.equal(karla.name, 'Karla R.');
  assert.equal(karla.position, 'Lead Dev');
  assert.equal(karla.sueldo, '2500');

  const lucas = repo.getByNumber('2');
  assert.equal(lucas.paused, true);
  assert.equal(lucas.schemaVersion, 1);
  assert.equal(lucas.localOnly, true);
});

test('importBatch in replace mode generates tombstones for wiped employees', () => {
  const initial = [
    { id: 'u1', name: 'Manuel', number: '1' },
    { id: 'u2', name: 'Nadia', number: '2' }
  ];
  const storage = createMemoryStorage({ users: JSON.stringify(initial) });
  let importTime = '2026-09-01T18:00:00.000Z';
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => importTime
  });

  const incoming = [
    { number: '10', name: 'Oscar', position: 'Pintor' }
  ];

  const result = repo.importBatch(incoming, 'replace');
  assert.equal(result.createdCount, 1);
  assert.equal(repo.getAll().length, 1);
  assert.equal(repo.getByNumber('10').name, 'Oscar');

  const tombstones = repo.getTombstones();
  assert.equal(tombstones.length, 2);
  assert.equal(tombstones.some(t => t.id === 'u1'), true);
  assert.equal(tombstones.some(t => t.id === 'u2'), true);
});

test('exportSnapshot returns schemaVersion 1 with employees and tombstones', () => {
  const initial = [
    { id: 'u1', name: 'Pablo', number: '1', position: 'Jefe' }
  ];
  const storage = createMemoryStorage({
    users: JSON.stringify(initial),
    employee_tombstones: JSON.stringify([
      { id: 'u_old', type: 'employee', deletedAt: '2026-08-30T00:00:00.000Z', schemaVersion: 1 }
    ])
  });
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    now: () => '2026-09-01T19:00:00.000Z'
  });

  const snapshot = repo.exportSnapshot();
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.exportedAt, '2026-09-01T19:00:00.000Z');
  assert.equal(snapshot.employees.length, 1);
  assert.equal(snapshot.employees[0].name, 'Pablo');
  assert.equal(snapshot.tombstones.length, 1);
  assert.equal(snapshot.tombstones[0].id, 'u_old');
});

test('clearAll removes all employees and tombstones and notifies listeners', () => {
  let notifiedUsers = null;
  let notifiedTombstones = null;
  const initial = [
    { id: 'u1', name: 'Pablo', number: '1', position: 'Jefe' }
  ];
  const storage = createMemoryStorage({
    users: JSON.stringify(initial),
    employee_tombstones: JSON.stringify([
      { id: 'u_old', type: 'employee', deletedAt: '2026-08-30T00:00:00.000Z', schemaVersion: 1 }
    ])
  });
  const repo = EmployeeRepository.createEmployeeRepository({
    storage,
    rules: EmployeeNumberRules,
    onSnapshotChanged: (u, t) => {
      notifiedUsers = u;
      notifiedTombstones = t;
    }
  });

  repo.clearAll();
  assert.equal(repo.getAll().length, 0);
  assert.equal(repo.getTombstones().length, 0);
  assert.deepEqual(notifiedUsers, []);
  assert.deepEqual(notifiedTombstones, []);
});
