const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  initializeEmployeeNumberState,
  resolveEmployeeNumberConflict,
  saveEmployeeDraft
} = require('../employee-number-rules.js');
const employees = [
  { id: 'ana', name: 'Ana', number: '7', position: 'Admin' },
  { id: 'bruno', name: 'Bruno', number: '20', position: 'Ops' }
];
test('saves an unchanged-number edit without a conflict', () => {
  const result = saveEmployeeDraft(employees, { ...employees[0], name: 'Ana María' });
  assert.equal(result.status, 'saved');
  assert.equal(result.users[0].name, 'Ana María');
  assert.equal(result.users[0].number, '7');
});
test('returns executable conflict details and contextual actions', () => {
  const create = saveEmployeeDraft(employees, { name: 'Carla', number: '007', position: '' }, 'carla');
  const edit = saveEmployeeDraft(employees, { ...employees[0], number: '20' });
  assert.equal(create.status, 'conflict');
  assert.equal(create.conflict.message, 'Ana ya usa el número 7.');
  assert.deepEqual(create.conflict.actions, ['suggest', 'edit-existing', 'return']);
  assert.deepEqual(edit.conflict.actions, ['swap', 'return']);
});
test('suggestion fills max plus one without saving', () => {
  const conflict = saveEmployeeDraft(employees, { name: 'Carla', number: '7', position: '' }, 'carla').conflict;
  const result = resolveEmployeeNumberConflict(employees, conflict, 'suggest');
  assert.equal(result.draft.number, '21');
  assert.equal(result.committed, false);
  assert.equal(result.users, employees);
  assert.equal(result.pendingConflict, null);
});
test('return cancels a conflict without mutation and clears pending state', () => {
  const conflict = saveEmployeeDraft(employees, { ...employees[0], number: '20' }).conflict;
  const result = resolveEmployeeNumberConflict(employees, conflict, 'return');
  assert.equal(result.users, employees);
  assert.equal(result.committed, false);
  assert.equal(result.pendingConflict, null);
});
test('confirmed swap uses stable IDs and applies the edited draft', () => {
  const conflict = saveEmployeeDraft(employees, { ...employees[0], name: 'Ana María', number: '20' }).conflict;
  const result = resolveEmployeeNumberConflict(employees, conflict, 'swap');
  assert.equal(result.committed, true);
  assert.deepEqual(result.users.map(({ id, number }) => ({ id, number })), [
    { id: 'ana', number: '20' }, { id: 'bruno', number: '7' }
  ]);
  assert.equal(result.users[0].name, 'Ana María');
});
test('confirmed swap preserves attendance ownership for every stable employee ID', () => {
  const attendance = {
    '2026-06-18': { ana: { hours: 8 }, bruno: { hours: 6 }, carla: { hours: 4 } },
    '2026-06-19': { ana: { hours: 7 }, bruno: { hours: 9 } }
  };
  const snapshot = structuredClone(attendance);
  const conflict = saveEmployeeDraft(employees, { ...employees[0], number: '20' }).conflict;
  const result = resolveEmployeeNumberConflict(employees, conflict, 'swap');
  assert.deepEqual(attendance, snapshot);
  assert.deepEqual(attendance['2026-06-18'][result.users[0].id], { hours: 8 });
  assert.deepEqual(attendance['2026-06-18'][result.users[1].id], { hours: 6 });
  assert.deepEqual(attendance['2026-06-18'].carla, { hours: 4 });
});
test('initialization leaves historical normalized duplicates untouched', () => {
  const duplicates = [{ id: 'a', number: '7' }, { id: 'b', number: '007' }];
  const state = initializeEmployeeNumberState(duplicates);
  assert.equal(state.users, duplicates);
  assert.deepEqual(state.users, duplicates);
  assert.equal(state.pendingConflict, null);
});
test('service worker precaches the production coordinator', () => {
  const serviceWorker = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.match(serviceWorker, /asistencia-v2\.4\.0/);
  assert.match(serviceWorker, /'\.\/employee-number-rules\.js'/);
  assert.match(serviceWorker, /'\.\/employee-number-modal\.js'/);
  assert.match(serviceWorker, /'\.\/draft-import\.js'/);
  assert.match(serviceWorker, /'\.\/attendance-report\.js'/);
  assert.match(serviceWorker, /'\.\/icon-set\.js'/);
});
