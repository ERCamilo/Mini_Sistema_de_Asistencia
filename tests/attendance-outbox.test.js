const test = require('node:test');
const assert = require('node:assert/strict');
const AttendanceRepository = require('../attendance-repository.js');
const AttendanceCoordinator = require('../attendance-coordinator.js');

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

test('recording present attendance saves to repository and enqueues v1 envelope to outbox', () => {
  const storage = createMemoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const fixedUuid = '12345678-1234-4234-8234-123456789abc';
  const fixedNow = '2026-09-01T10:00:00.000Z';

  const coordinator = AttendanceCoordinator.createAttendanceCoordinator({
    repository: repo,
    storage,
    generateUuid: () => fixedUuid,
    now: () => fixedNow
  });

  const emp = { id: 'u1', name: 'Ana García', number: '07' };
  const res = coordinator.recordAttendance(emp, '2026-09-01', 'present', 8);

  assert.equal(res.status, 'saved');
  assert.ok(res.record);
  assert.equal(res.record.hours, 8);

  // Check repository has the record
  const savedInRepo = repo.getRecord('u1', '2026-09-01');
  assert.ok(savedInRepo);
  assert.equal(savedInRepo.hours, 8);

  // Check pending outbox
  const pending = coordinator.getPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].eventId, fixedUuid);
  assert.equal(pending[0].state, 'pending');
  assert.equal(pending[0].envelope.schema, 'mini-attendance/v1');
  assert.equal(pending[0].envelope.rows.length, 1);
  assert.equal(pending[0].envelope.rows[0].sourceEmployeeId, 'u1');
  assert.equal(pending[0].envelope.rows[0].number, '07');
  assert.equal(pending[0].envelope.rows[0].hours, 8);
});

test('recording absent attendance removes record, creates tombstone and skips outbox present event', () => {
  const storage = createMemoryStorage({
    attendance: JSON.stringify({
      '2026-09-01': { 'u1': { status: 'present', hours: 8 } }
    })
  });
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const coordinator = AttendanceCoordinator.createAttendanceCoordinator({
    repository: repo,
    storage
  });

  const emp = { id: 'u1', name: 'Ana García', number: '07' };
  const res = coordinator.recordAttendance(emp, '2026-09-01', 'absent', 0);

  assert.equal(res.status, 'deleted');
  assert.ok(res.tombstone);
  assert.equal(res.tombstone.employeeId, 'u1');

  // Verify deleted from repo
  assert.equal(repo.getRecord('u1', '2026-09-01'), null);

  // No present envelope enqueued
  const pending = coordinator.getPendingOutbox();
  assert.equal(pending.length, 0);
});

test('outbox state transitions: acknowledgeEvent and markEventFailed', () => {
  const storage = createMemoryStorage();
  const repo = AttendanceRepository.createAttendanceRepository({ storage });
  const coordinator = AttendanceCoordinator.createAttendanceCoordinator({
    repository: repo,
    storage,
    generateUuid: () => 'event-1'
  });

  coordinator.recordAttendance({ id: 'u1', name: 'Ana', number: '1' }, '2026-09-01', 'present', 8);
  assert.equal(coordinator.getPendingOutbox().length, 1);

  // Mark event failed -> attempts increment
  coordinator.markEventFailed('event-1', 'Network timeout');
  const allOutbox = coordinator.getAllOutbox();
  assert.equal(allOutbox[0].attempts, 1);
  assert.equal(allOutbox[0].state, 'pending');

  // Fail 4 more times -> becomes 'dead'
  coordinator.markEventFailed('event-1', 'Network timeout');
  coordinator.markEventFailed('event-1', 'Network timeout');
  coordinator.markEventFailed('event-1', 'Network timeout');
  coordinator.markEventFailed('event-1', 'Network timeout');
  assert.equal(coordinator.getAllOutbox()[0].state, 'dead');
  assert.equal(coordinator.getPendingOutbox().length, 0);

  // Acknowledge event
  coordinator.acknowledgeEvent('event-1');
  assert.equal(coordinator.getAllOutbox()[0].state, 'ack');
});
