const test = require('node:test');
const assert = require('node:assert/strict');
const Repository = require('../field-requests-repository.js');

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, value), map };
}

test('repository owns legacy load/save for requests and templates', () => {
  const backing = storage({ requests: '[{"id":"r"}]', requestTemplates: '[{"id":"t"}]' });
  const snapshots = [];
  const repository = Repository.createFieldRequestsRepository({ storage: backing, onSnapshotChanged: state => snapshots.push(state) });
  assert.deepEqual(repository.load(), { requests: [{ id: 'r' }], templates: [{ id: 't' }] });
  repository.save([{ id: 'r2' }], [{ id: 't2' }]);
  assert.equal(backing.getItem('requests'), '[{"id":"r2"}]');
  assert.equal(backing.getItem('requestTemplates'), '[{"id":"t2"}]');
  assert.deepEqual(snapshots[0], { requests: [{ id: 'r2' }], templates: [{ id: 't2' }] });
});

test('repository validates imported request/template collections before replacing state', () => {
  const repository = Repository.createFieldRequestsRepository({ storage: storage() });
  assert.throws(() => repository.validateCollections('bad', []), /array/);
  assert.deepEqual(repository.validateCollections([{ id: 'r' }], [{ id: 't' }]), { requests: [{ id: 'r' }], templates: [{ id: 't' }] });
  assert.deepEqual(repository.exportCollections([{ id: 'r' }], []), { requests: [{ id: 'r' }], templates: [] });
  assert.deepEqual(repository.importCollections([], [{ id: 't' }]), { requests: [], templates: [{ id: 't' }] });
});

test('repository load degrades corrupt or invalid collections to empty arrays', () => {
  const repository = Repository.createFieldRequestsRepository({ storage: storage({ requests: '{bad', requestTemplates: '{}' }) });
  assert.deepEqual(repository.load(), { requests: [], templates: [] });
});

test('atomic restore rolls live state and persistence back after a later failure', () => {
  const repository = Repository.createFieldRequestsRepository({ storage: storage() });
  const previous = { requests: [{ id: 'old' }], templates: [] };
  let live = previous; let attempts = 0;
  assert.throws(() => repository.runAtomicRestore(previous, { requests: [{ id: 'new' }], templates: [] }, state => { live = state; }, () => { if (attempts++ === 0) throw new Error('late failure'); }));
  assert.deepEqual(live, previous);
  assert.equal(attempts, 2);
});
