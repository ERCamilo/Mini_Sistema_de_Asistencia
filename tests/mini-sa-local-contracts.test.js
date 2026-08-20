const test = require('node:test');
const assert = require('node:assert/strict');
const Envelope = require('../mini-sa-envelope.js');
const Roster = require('../roster-package.js');

const scope = { ownerUid: 'owner-1', siteId: 'obra-1', sourceId: 'mini-principal' };
const eventId = '123e4567-e89b-42d3-a456-426614174000';
function envelope(overrides = {}) {
  return Envelope.createEnvelope({
    scope,
    deviceId: 'phone-1',
    clientSequence: 7,
    rosterVersion: 'roster-3',
    capturedAt: '2026-07-29T12:00:00.000Z',
    rows: [{
      sourceEmployeeId: 'mini-u1',
      number: '001',
      name: 'Ana',
      status: 'present',
      hours: 8
    }],
    ...overrides
  }, () => eventId);
}
function durableStore() {
  let records = [];
  return {
    load: async () => structuredClone(records),
    save: async value => { records = structuredClone(value); }
  };
}

test('creates an immutable, scoped v1 envelope and strips unrelated credentials', () => {
  const value = envelope({ token: 'must-not-leak' });
  assert.equal(value.schema, 'mini-attendance/v1');
  assert.equal(value.eventId, eventId);
  assert.equal(value.token, undefined);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.rows[0]), true);
  assert.throws(() => envelope({ rows: [{ ...envelope().rows[0], hours: 25 }] }), /at most 24/);
});

test('offline save -> reload -> retry reuses eventId and matching ACK is idempotent', async () => {
  const store = durableStore();
  let time = 1000;
  const first = Envelope.createOutbox(store, { now: () => time, baseDelayMs: 10 });
  await first.enqueue(envelope());
  assert.equal(await first.processNext(), null);
  const failed = await first.processNext(async sent => {
    assert.equal(sent.eventId, eventId);
    throw new Error('offline');
  });
  assert.equal(failed.state, 'pending');
  assert.equal(failed.attempts, 1);

  time = 1010;
  const reloaded = Envelope.createOutbox(store, { now: () => time, baseDelayMs: 10 });
  const delivered = await reloaded.processNext(async sent => ({
    eventId: sent.eventId,
    acknowledged: true
  }));
  assert.equal(delivered.eventId, eventId);
  assert.equal(delivered.state, 'ack');
  assert.equal(await reloaded.processNext(async () => { throw new Error('must not run'); }), null);
  assert.equal((await reloaded.list()).length, 1);
});

test('wrong ACK and repeated failures stay durable and eventually become dead', async () => {
  const store = durableStore();
  let time = 0;
  const outbox = Envelope.createOutbox(store, { now: () => time, maxAttempts: 2, baseDelayMs: 1 });
  await outbox.enqueue(envelope());
  assert.equal((await outbox.processNext(async () => ({
    eventId: '223e4567-e89b-42d3-a456-426614174000',
    acknowledged: true
  }))).state, 'pending');
  time = 1;
  assert.equal((await outbox.processNext(async () => { throw new Error('offline'); })).state, 'dead');
});

test('roster package round-trips stable ids and never contains credentials', () => {
  const roster = Roster.createRosterPackage({
    scope,
    rosterVersion: 'roster-3',
    generatedAt: '2026-07-29T12:00:00.000Z',
    employees: [{ id: 'sa-u1', number: '001', name: 'Ana', position: 'Ayudante', password: 'x' }],
    token: 'x'
  });
  assert.equal(roster.employees[0].id, 'sa-u1');
  assert.equal(roster.token, undefined);
  assert.equal(roster.employees[0].password, undefined);
  assert.deepEqual(Roster.parseRosterPackage(JSON.stringify(roster), scope), roster);
  assert.match(Roster.CHECKSUM_NOTICE, /not an authenticity signature/);
});

test('corrupt or wrong-scope roster is rejected without mutating current roster', () => {
  const current = [{ id: 'old' }];
  const roster = Roster.createRosterPackage({
    scope,
    rosterVersion: 'roster-3',
    generatedAt: '2026-07-29T12:00:00.000Z',
    employees: [{ id: 'sa-u1', number: '001', name: 'Ana' }]
  });
  assert.throws(() => Roster.validateRosterPackage({
    ...roster,
    employees: [{ ...roster.employees[0], name: 'Corrupted' }]
  }, scope), /checksum mismatch/);
  assert.throws(() => Roster.validateRosterPackage(roster, {
    ...scope,
    siteId: 'otra-obra'
  }), /scope mismatch/);
  assert.throws(() => Roster.validateRosterPackage(roster, scope, 'roster-4'), /version mismatch/);
  assert.deepEqual(current, [{ id: 'old' }]);
});
