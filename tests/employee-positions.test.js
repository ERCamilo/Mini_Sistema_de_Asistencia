const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../employee-positions.js');

const single = { id: 'u1', name: 'Pauliny Buchamps', number: '002', position: 'Ayudante' };
const multi = {
  id: 'u2', name: 'Franklin Henrriquez', number: '001',
  position: 'Albañil', positionSaId: 'POS-1',
  extraPositions: [{ name: 'Plomero', saPositionId: 'POS-7' }, { name: 'Pintor' }]
};

test('positions: principal from `position`, up to 2 extras; empty, duplicates and a 4th are dropped', () => {
  assert.equal(P.MAX_POSITIONS, 3);
  assert.deepEqual(P.positionsOf(single), [{ name: 'Ayudante' }]);
  assert.deepEqual(P.positionsOf(multi), [
    { name: 'Albañil', saPositionId: 'POS-1' }, { name: 'Plomero', saPositionId: 'POS-7' }, { name: 'Pintor' }
  ]);
  assert.deepEqual(P.positionsOf({ position: '' }), []);
  const messy = { position: ' Albañil ', extraPositions: [{ name: 'albañil' }, { name: '' }, { name: 'Plomero' }, { name: 'Pintor' }, { name: 'Chofer' }] };
  assert.deepEqual(P.positionsOf(messy).map(p => p.name), ['Albañil', 'Plomero', 'Pintor']);
  assert.equal(P.hasMultiple(single), false);
  assert.equal(P.hasMultiple(multi), true);
});

test('day position: the principal unless another of the employee positions was chosen', () => {
  assert.equal(P.dayPosition(single, { hours: 8 }), null, 'one position: nothing to choose');
  assert.deepEqual(P.dayPosition(multi, { hours: 8 }), { name: 'Albañil', saPositionId: 'POS-1' });
  assert.deepEqual(P.dayPosition(multi, { hours: 8, position: 'plomero' }), { name: 'Plomero', saPositionId: 'POS-7' });
  assert.deepEqual(P.dayPosition(multi, { hours: 8, position: 'Chofer' }), { name: 'Albañil', saPositionId: 'POS-1' }, 'a removed position falls back to the principal');
});

test('WhatsApp: employees with more than one position always carry _Position_ (also the principal)', () => {
  assert.equal(P.whatsappSuffix(single, { hours: 8 }), '');
  assert.equal(P.whatsappSuffix(multi, { hours: 8 }), ' _Albañil_');
  assert.equal(P.whatsappSuffix(multi, { hours: 8, position: 'Plomero' }), ' _Plomero_');
  const weird = { position: 'Op_*grúa*', extraPositions: [{ name: 'Ayudante\nnoche' }] };
  assert.equal(P.whatsappSuffix(weird, {}), ' _Op grúa_', 'markup characters never break the WhatsApp format');
  assert.equal(P.whatsappSuffix(weird, { position: 'Ayudante\nnoche' }), ' _Ayudante noche_');
});

test('SA submission: position fields only for employees with more than one position', () => {
  assert.deepEqual(P.submissionFields(single, { hours: 8 }), {});
  assert.deepEqual(P.submissionFields(multi, { hours: 8, position: 'Plomero' }), { positionName: 'Plomero', saPositionId: 'POS-7' });
  assert.deepEqual(P.submissionFields(multi, { hours: 8, position: 'Pintor' }), { positionName: 'Pintor' });
});

test('form: names in, SA ids kept for unchanged names', () => {
  assert.deepEqual(P.fromNames(['Albañil', 'Plomero', ''], multi), {
    position: 'Albañil', positionSaId: 'POS-1', extraPositions: [{ name: 'Plomero', saPositionId: 'POS-7' }]
  });
  assert.deepEqual(P.fromNames(['Chofer', 'Albañil', 'Albañil'], multi), {
    position: 'Chofer', extraPositions: [{ name: 'Albañil', saPositionId: 'POS-1' }]
  });
  assert.deepEqual(P.fromNames(['', '', ''], multi), { position: '', extraPositions: [] });
});

test('SA roster positions: validated, max 3, first is the principal', () => {
  assert.deepEqual(P.fromSaPositions([{ id: 'POS-1', name: 'Albañil' }, { id: 'POS-7', name: 'Plomero' }]), {
    position: 'Albañil', positionSaId: 'POS-1', extraPositions: [{ name: 'Plomero', saPositionId: 'POS-7' }]
  });
  assert.throws(() => P.fromSaPositions('Albañil'), /array/);
  assert.throws(() => P.fromSaPositions([{ id: 'X' }]), /name/);
  assert.throws(() => P.fromSaPositions([1, 2, 3, 4].map(n => ({ name: 'P' + n }))), /3/);
  assert.deepEqual(P.fromSaPositions([]), { position: '', extraPositions: [] });
});

test('label for lists: all positions joined', () => {
  assert.equal(P.label(multi), 'Albañil · Plomero · Pintor');
  assert.equal(P.label(single), 'Ayudante');
  assert.equal(P.label({}), '');
});
