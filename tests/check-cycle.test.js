const test = require('node:test');
const assert = require('node:assert/strict');
const CheckCycle = require('../check-cycle.js');

const present = (h) => ({ present: true, hours: h });
const absent = null;

test('exposes the three modes and a modal default', () => {
  assert.deepEqual(CheckCycle.CHECK_MODES, ['modal', 'cycle', 'toggle']);
  assert.equal(CheckCycle.DEFAULT_CHECK_MODE, 'modal');
});

test('normalizeCheckMode keeps valid modes and defaults the rest', () => {
  assert.equal(CheckCycle.normalizeCheckMode('cycle'), 'cycle');
  assert.equal(CheckCycle.normalizeCheckMode('toggle'), 'toggle');
  assert.equal(CheckCycle.normalizeCheckMode('modal'), 'modal');
  assert.equal(CheckCycle.normalizeCheckMode('nonsense'), 'modal');
  assert.equal(CheckCycle.normalizeCheckMode(undefined), 'modal');
});

test('modal mode: absent -> present(full); present -> open the modal', () => {
  assert.deepEqual(CheckCycle.nextAttendanceState(absent, 'modal', 8), { action: 'set', present: true, hours: 8 });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(8), 'modal', 8), { action: 'open-modal' });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(3), 'modal', 8), { action: 'open-modal' });
});

test('toggle mode: absent <-> present(full), never opens a modal', () => {
  assert.deepEqual(CheckCycle.nextAttendanceState(absent, 'toggle', 8), { action: 'set', present: true, hours: 8 });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(8), 'toggle', 8), { action: 'set', present: false, hours: 0 });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(10), 'toggle', 8), { action: 'set', present: false, hours: 0 });
});

test('cycle mode: off -> full -> half -> off', () => {
  const off = CheckCycle.nextAttendanceState(absent, 'cycle', 8);
  assert.deepEqual(off, { action: 'set', present: true, hours: 8 });
  const full = CheckCycle.nextAttendanceState(present(8), 'cycle', 8);
  assert.deepEqual(full, { action: 'set', present: true, hours: 4 });
  const half = CheckCycle.nextAttendanceState(present(4), 'cycle', 8);
  assert.deepEqual(half, { action: 'set', present: false, hours: 0 });
});

test('cycle half day follows the configurable full-day value', () => {
  assert.deepEqual(CheckCycle.nextAttendanceState(present(10), 'cycle', 10), { action: 'set', present: true, hours: 5 });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(9), 'cycle', 9), { action: 'set', present: true, hours: 4.5 });
});

test('cycle: a present record with custom (non-full) hours goes to absent', () => {
  assert.deepEqual(CheckCycle.nextAttendanceState(present(12), 'cycle', 8), { action: 'set', present: false, hours: 0 });
  assert.deepEqual(CheckCycle.nextAttendanceState(present(2), 'cycle', 8), { action: 'set', present: false, hours: 0 });
});

test('invalid fullHours falls back to 8', () => {
  assert.deepEqual(CheckCycle.nextAttendanceState(absent, 'toggle', 0), { action: 'set', present: true, hours: 8 });
  assert.deepEqual(CheckCycle.nextAttendanceState(absent, 'toggle', 'x'), { action: 'set', present: true, hours: 8 });
});
