const test = require('node:test');
const assert = require('node:assert/strict');
const Domain = require('../field-requests.js');
const Coordinator = require('../field-requests-coordinator.js');

test('coordinator persists immutable response returns in the request list', () => {
  const request = Domain.createRequest({ title: 'Survey', targetType: 'all', fields: [{ id: 'f', label: 'OK', type: 'boolean' }] }, [{ id: 'e', name: 'Ana', number: '1' }]);
  const originalList = [request];
  const updatedList = Coordinator.recordResponse(originalList, request.id, { fieldId: 'f', employeeId: 'e', value: false }, Domain);
  assert.equal(Domain.getResponse(updatedList[0], 'f', 'e').value, false);
  assert.deepEqual(request.responses, {});
});

test('coordinator persists status and share tracking without closing on share', () => {
  const request = Domain.createRequest({ title: 'General' });
  let list = Coordinator.changeStatus([request], request.id, 'completed', Domain);
  list = Coordinator.recordShare(list, request.id, Domain);
  assert.equal(list[0].status, 'completed');
  assert.equal(list[0].shareCount, 1);
});

test('text, number and comments survive the persisted snapshot reload', () => {
  const request = Domain.createRequest({
    title: 'Details', targetType: 'all',
    fields: [
      { id: 'notes', label: 'Notes', type: 'text_long' },
      { id: 'amount', label: 'Amount', type: 'number_unit', unit: 'kg' }
    ]
  }, [{ id: 'e', name: 'Ana', number: '1' }]);
  let list = Coordinator.recordResponse([request], request.id, { fieldId: 'notes', employeeId: 'e', value: 'Long detail', comment: 'Checked' }, Domain);
  list = Coordinator.recordResponse(list, request.id, { fieldId: 'amount', employeeId: 'e', value: 12.5 }, Domain);
  const reloaded = JSON.parse(JSON.stringify(list)).map(Domain.normalizeRequest);
  assert.equal(Domain.getResponse(reloaded[0], 'notes', 'e').value, 'Long detail');
  assert.equal(Domain.getResponse(reloaded[0], 'notes', 'e').comment, 'Checked');
  assert.equal(Domain.getResponse(reloaded[0], 'amount', 'e').value, 12.5);
});
