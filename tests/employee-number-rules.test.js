const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findEmployeeNumberConflict,
  getNextEmployeeNumber,
  normalizeEmployeeNumber,
  swapEmployeeNumbers
} = require('../employee-number-rules.js');

const employees = [
  { id: 'ana', name: 'Ana', number: '7', position: 'Administración' },
  { id: 'bruno', name: 'Bruno', number: '20', position: 'Operaciones' }
];

test('normalizes numerically equivalent employee numbers', () => {
  assert.equal(normalizeEmployeeNumber('007'), 7);
  assert.equal(normalizeEmployeeNumber(7), 7);
});

test('rejects values that cannot identify an employee number', () => {
  assert.equal(normalizeEmployeeNumber(''), null);
  assert.equal(normalizeEmployeeNumber('not-a-number'), null);
  assert.equal(normalizeEmployeeNumber(Infinity), null);
});

test('finds a conflict using normalized numeric values', () => {
  assert.equal(findEmployeeNumberConflict(employees, '0007'), employees[0]);
  assert.equal(findEmployeeNumberConflict(employees, '21'), null);
});

test('excludes the currently edited employee from conflict lookup', () => {
  assert.equal(findEmployeeNumberConflict(employees, '007', 'ana'), null);
  assert.equal(findEmployeeNumberConflict(employees, '20', 'ana'), employees[1]);
});

test('suggests one more than the highest normalized number', () => {
  assert.equal(getNextEmployeeNumber(employees), 21);
  assert.equal(getNextEmployeeNumber([{ id: 'one', number: '0009' }]), 10);
});

test('suggests one when there are no valid existing numbers', () => {
  assert.equal(getNextEmployeeNumber([]), 1);
  assert.equal(getNextEmployeeNumber([{ id: 'bad', number: '' }]), 1);
});

test('swaps only the numbers of two employees without mutating the source', () => {
  const originalSnapshot = structuredClone(employees);
  const swapped = swapEmployeeNumbers(employees, 'ana', 'bruno');

  assert.deepEqual(employees, originalSnapshot);
  assert.notEqual(swapped, employees);
  assert.equal(swapped.find(employee => employee.id === 'ana').number, '20');
  assert.equal(swapped.find(employee => employee.id === 'bruno').number, '7');
});

test('preserves employee IDs and unrelated employee data during a swap', () => {
  const thirdEmployee = { id: 'carla', name: 'Carla', number: '30', custom: { active: true } };
  const source = [...employees, thirdEmployee];
  const swapped = swapEmployeeNumbers(source, 'ana', 'bruno');

  assert.deepEqual(swapped.map(employee => employee.id), ['ana', 'bruno', 'carla']);
  assert.equal(swapped[0].name, 'Ana');
  assert.equal(swapped[1].position, 'Operaciones');
  assert.equal(swapped[2], thirdEmployee);
});

test('returns an unchanged copy when either swap employee is missing', () => {
  const result = swapEmployeeNumbers(employees, 'ana', 'missing');

  assert.deepEqual(result, employees);
  assert.notEqual(result, employees);
});
