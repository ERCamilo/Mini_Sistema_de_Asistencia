const test = require('node:test');
const assert = require('node:assert/strict');
const bulkOps = require('../bulk-actions.js');

test('bulkSetPaused pauses and unpauses only target employees that need changes', () => {
  const employees = [
    { id: '1', name: 'Ana', number: '1', paused: false },
    { id: '2', name: 'Bob', number: '2', paused: true },
    { id: '3', name: 'Carlos', number: '3', paused: false }
  ];

  // Pause Ana (1) and Carlos (3)
  const res1 = bulkOps.bulkSetPaused(employees, ['1', '2', '3'], true, '2026-09-01T00:00:00Z');
  assert.equal(res1.affectedCount, 2); // Only Ana and Carlos changed
  assert.deepEqual(res1.affectedIds, ['1', '3']);
  assert.equal(res1.updatedEmployees[0].paused, true);
  assert.equal(res1.updatedEmployees[0].updatedAt, '2026-09-01T00:00:00Z');
  assert.equal(res1.updatedEmployees[1].paused, true);
  assert.equal(res1.updatedEmployees[2].paused, true);

  // Unpause Bob (2) and Carlos (3)
  const res2 = bulkOps.bulkSetPaused(res1.updatedEmployees, ['2', '3'], false, '2026-09-01T01:00:00Z');
  assert.equal(res2.affectedCount, 2);
  assert.deepEqual(res2.affectedIds, ['2', '3']);
  assert.equal(res2.updatedEmployees[0].paused, true); // Ana still paused
  assert.equal(res2.updatedEmployees[1].paused, false);
  assert.equal(res2.updatedEmployees[2].paused, false);
});

test('bulkAssignContext assigns, changes, and removes workContextId from target employees', () => {
  const employees = [
    { id: '1', name: 'Ana', number: '1' },
    { id: '2', name: 'Bob', number: '2', workContextId: 'ctx-1' },
    { id: '3', name: 'Carlos', number: '3', workContextId: 'ctx-2' }
  ];

  // Assign ctx-1 to Ana and Bob
  const res1 = bulkOps.bulkAssignContext(employees, ['1', '2'], 'ctx-1', '2026-09-01T00:00:00Z');
  assert.equal(res1.affectedCount, 1); // Only Ana changed, Bob already had ctx-1
  assert.deepEqual(res1.affectedIds, ['1']);
  assert.equal(res1.updatedEmployees[0].workContextId, 'ctx-1');
  assert.equal(res1.updatedEmployees[1].workContextId, 'ctx-1');

  // Remove context from Ana and Carlos
  const res2 = bulkOps.bulkAssignContext(res1.updatedEmployees, ['1', '3'], null, '2026-09-01T01:00:00Z');
  assert.equal(res2.affectedCount, 2);
  assert.deepEqual(res2.affectedIds, ['1', '3']);
  assert.equal(res2.updatedEmployees[0].workContextId, undefined);
  assert.equal(res2.updatedEmployees[1].workContextId, 'ctx-1');
  assert.equal(res2.updatedEmployees[2].workContextId, undefined);
});

test('bulkAssignPosition updates position on selected employees', () => {
  const employees = [
    { id: '1', name: 'Ana', number: '1', position: 'Peón' },
    { id: '2', name: 'Bob', number: '2', position: 'Albañil' }
  ];

  const res = bulkOps.bulkAssignPosition(employees, ['1', '2'], 'Albañil', '2026-09-01T00:00:00Z');
  assert.equal(res.affectedCount, 1); // Only Ana changed
  assert.deepEqual(res.affectedIds, ['1']);
  assert.equal(res.updatedEmployees[0].position, 'Albañil');
  assert.equal(res.updatedEmployees[1].position, 'Albañil');
});

test('bulkDelete removes target employees and returns remaining list', () => {
  const employees = [
    { id: '1', name: 'Ana', number: '1' },
    { id: '2', name: 'Bob', number: '2' },
    { id: '3', name: 'Carlos', number: '3' }
  ];

  const res = bulkOps.bulkDelete(employees, ['1', '3']);
  assert.equal(res.deletedCount, 2);
  assert.deepEqual(res.deletedIds, ['1', '3']);
  assert.equal(res.remainingEmployees.length, 1);
  assert.equal(res.remainingEmployees[0].id, '2');
});

test('BulkSelectionManager manages selection toggles, sets, and select-all cleanly', () => {
  const sm = bulkOps.createBulkSelectionManager(['1']);
  assert.equal(sm.isSelected('1'), true);
  assert.equal(sm.isSelected('2'), false);
  assert.equal(sm.getSelectedCount(), 1);

  // Toggle 2 on
  assert.equal(sm.toggle('2'), true);
  assert.equal(sm.isSelected('2'), true);
  assert.equal(sm.getSelectedCount(), 2);

  // Toggle 1 off
  assert.equal(sm.toggle('1'), false);
  assert.equal(sm.isSelected('1'), false);

  // selectAll
  sm.selectAll(['1', '2', '3']);
  assert.equal(sm.getSelectedCount(), 3);
  assert.equal(sm.isAllSelected(['1', '2', '3']), true);
  assert.equal(sm.isAllSelected(['1', '2', '3', '4']), false);

  // deselectAll
  sm.deselectAll();
  assert.equal(sm.getSelectedCount(), 0);
  assert.equal(sm.isAllSelected(['1']), false);
});
