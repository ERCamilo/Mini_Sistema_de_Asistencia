const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AttendanceExport = require('../attendance-export.js');
const AttendanceRepo = require('../attendance-repository.js');
const EmployeeRepo = require('../employee-repository.js');

const SA_PROJECT = 'PRJ-EJEMPLO-0001';
const OTHER_PROJECT = 'PRJ-OTHER-0002';
const SCOPE = { ownerUid: 'owner-1', siteId: 'obra-1', sourceId: 'mini-principal' };
const DEVICE_ID = 'phone-mini-1';
const ROSTER_VERSION = 'roster-3';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

function makeSetup() {
  const attStorage = new MemoryStorage();
  const empStorage = new MemoryStorage();

  const attRepo = AttendanceRepo.createAttendanceRepository({
    storage: attStorage,
    now: () => '2026-09-07T12:00:00.000Z'
  });

  const empRepo = EmployeeRepo.createEmployeeRepository({
    storage: empStorage,
    now: () => '2026-09-07T12:00:00.000Z'
  });

  // Populate employees via importBatch replace
  empRepo.importBatch([
    {
      id: 'mini-u1',
      name: 'Ana García',
      number: '001',
      saProjectId: SA_PROJECT,
      saEmployeeId: 'EMP-001'
    },
    {
      id: 'mini-u2',
      name: 'Carlos Local',
      number: '002'
    },
    {
      id: 'mini-u3',
      name: 'Diego Other',
      number: '003',
      saProjectId: OTHER_PROJECT,
      saEmployeeId: 'EMP-999'
    },
    {
      id: 'mini-u4',
      name: 'Elena Pérez',
      number: '004',
      saProjectId: SA_PROJECT,
      saEmployeeId: 'EMP-004'
    }
  ], 'replace');

  return { attStorage, empStorage, attRepo, empRepo };
}

class FakeChannel {
  constructor({ authenticated = true, readyState = 'open' } = {}) {
    this.authenticated = authenticated;
    this.readyState = readyState;
    this.sentFrames = [];
    this.listeners = new Set();
  }
  addEventListener(type, fn) {
    if (type === 'message') this.listeners.add(fn);
  }
  removeEventListener(type, fn) {
    if (type === 'message') this.listeners.delete(fn);
  }
  send(frame) {
    this.sentFrames.push(frame);
  }
  receive(data) {
    for (const fn of this.listeners) {
      fn({ data });
    }
  }
}

// 1. One day: generate canonical attendance-submission/v1
test('one day: generates canonical attendance-submission/v1 for a selected workDate', () => {
  const { attRepo, empRepo } = makeSetup();

  // Record attendance for Ana (8 hours) on 2026-09-06
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 8);

  const submission = AttendanceExport.generateAttendanceSubmission({
    workDate: '2026-09-06',
    saProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo,
    scope: SCOPE,
    deviceId: DEVICE_ID,
    rosterVersion: ROSTER_VERSION,
    now: () => '2026-09-07T12:00:00.000Z',
    generateUuid: () => '123e4567-e89b-42d3-a456-426614174000'
  });

  assert.ok(submission);
  assert.equal(submission.schema, 'attendance-submission/v1');
  assert.equal(submission.submissionId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(submission.saProjectId, SA_PROJECT);
  assert.deepEqual(submission.scope, SCOPE);
  assert.equal(submission.deviceId, DEVICE_ID);
  assert.equal(submission.rosterVersion, ROSTER_VERSION);
  assert.equal(submission.capturedAt, '2026-09-07T12:00:00.000Z');
  assert.equal(submission.workDate, '2026-09-06');
  assert.equal(submission.rows.length, 1);

  const row = submission.rows[0];
  assert.equal(row.miniLocalId, 'mini-u1');
  assert.equal(row.number, '001');
  assert.equal(row.name, 'Ana García');
  assert.equal(row.normalHours, 8);
  assert.equal(row.overtimeHours, 0);
  assert.equal(row.status, 'present');
  assert.equal(row.saEmployeeId, 'EMP-001');

  // Verify frozen and immutable
  assert.ok(Object.isFrozen(submission));
  assert.ok(Object.isFrozen(submission.rows[0]));

  // Verify exact envelope allowlist: no extra keys like version, checksum, token, bodyHash
  const allowedKeys = AttendanceExport.ATTENDANCE_SUBMISSION_ENVELOPE_KEYS;
  for (const key of Object.keys(submission)) {
    assert.ok(allowedKeys.includes(key), `unsupported key ${key}`);
  }
  for (const banned of ['version', 'checksum', 'token', 'receivedAt', 'bodyHash', 'key']) {
    assert.equal(Object.prototype.hasOwnProperty.call(submission, banned), false);
  }

  // Self-validates via strict validator
  const validated = AttendanceExport.validateAttendanceSubmission(submission, SA_PROJECT);
  assert.deepEqual(validated, submission);
});

// 1b. Split hours (normal + overtime) up to 24h
test('one day: splits hours above 8 into normalHours and overtimeHours up to 24h', () => {
  const { attRepo, empRepo } = makeSetup();

  // 10 hours: 8 normal + 2 overtime
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 10);

  const submission = AttendanceExport.generateAttendanceSubmission({
    workDate: '2026-09-06',
    saProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo,
    scope: SCOPE,
    deviceId: DEVICE_ID,
    rosterVersion: ROSTER_VERSION,
    expectedHours: 8
  });

  assert.ok(submission);
  const row = submission.rows[0];
  assert.equal(row.normalHours, 8);
  assert.equal(row.overtimeHours, 2);
  assert.equal(row.normalHours + row.overtimeHours, 10);
});

// 2. Range: produce one canonical submission per workDate, keep correlation at control layer
test('range: produces one canonical submission per workDate without mutating frozen submission schema', () => {
  const { attRepo, empRepo } = makeSetup();

  // Record attendance on 2 separate dates within range
  attRepo.setRecord('mini-u1', '2026-09-01', 'present', 8);
  attRepo.setRecord('mini-u1', '2026-09-03', 'present', 8);
  attRepo.setRecord('mini-u4', '2026-09-03', 'present', 9);
  // 2026-09-02 has NO attendance data

  const request = {
    schema: 'attendance-request/v1',
    requestId: 'req-range-456',
    saProjectId: SA_PROJECT,
    fromDate: '2026-09-01',
    toDate: '2026-09-04'
  };

  const fakeChannel = new FakeChannel();
  const peer = { peerId: 'sa-device-1', peerApp: 'sa', displayName: 'SA Central' };

  const response = AttendanceExport.handleAttendanceRequest(request, {
    channel: fakeChannel,
    peer,
    isChannelAuthenticated: () => true,
    expectedSaProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo,
    scope: SCOPE,
    deviceId: DEVICE_ID,
    rosterVersion: ROSTER_VERSION
  });

  // Control layer correlation
  assert.equal(response.schema, 'attendance-response/v1');
  assert.equal(response.requestId, 'req-range-456');
  assert.equal(response.saProjectId, SA_PROJECT);
  assert.equal(response.ok, true);
  assert.equal(response.fromDate, '2026-09-01');
  assert.equal(response.toDate, '2026-09-04');

  // Submissions array contains exactly 2 submissions (dates with data), none for empty 2026-09-02 or 2026-09-04
  assert.equal(response.submissions.length, 2);

  // Each submission is a pure frozen attendance-submission/v1 for that single workDate
  const sub1 = response.submissions[0];
  assert.equal(sub1.schema, 'attendance-submission/v1');
  assert.equal(sub1.workDate, '2026-09-01');
  assert.equal(sub1.rows.length, 1);
  AttendanceExport.validateAttendanceSubmission(sub1, SA_PROJECT);

  const sub2 = response.submissions[1];
  assert.equal(sub2.schema, 'attendance-submission/v1');
  assert.equal(sub2.workDate, '2026-09-03');
  assert.equal(sub2.rows.length, 2);
  AttendanceExport.validateAttendanceSubmission(sub2, SA_PROJECT);
});

// 3. Project mismatch: fails closed when requested saProjectId does not match Mini project identity
test('project mismatch: fails closed when requested saProjectId differs from expected project', () => {
  const { attRepo, empRepo } = makeSetup();
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 8);

  const request = {
    schema: 'attendance-request/v1',
    requestId: 'req-mismatch-1',
    saProjectId: 'PRJ-WRONG-9999',
    fromDate: '2026-09-06',
    toDate: '2026-09-06'
  };

  const fakeChannel = new FakeChannel();
  const peer = { peerId: 'sa-device-1', peerApp: 'sa' };

  assert.throws(
    () => AttendanceExport.handleAttendanceRequest(request, {
      channel: fakeChannel,
      peer,
      isChannelAuthenticated: () => true,
      expectedSaProjectId: SA_PROJECT,
      repository: attRepo,
      employeeRepository: empRepo
    }),
    /saProjectId mismatch/
  );
});

// 4. Unauthenticated / wrong peer: fails closed
test('unauthenticated / wrong peer: rejects unauthenticated channel or non-SA peer', () => {
  const { attRepo, empRepo } = makeSetup();
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 8);

  const request = {
    schema: 'attendance-request/v1',
    requestId: 'req-auth-1',
    saProjectId: SA_PROJECT,
    fromDate: '2026-09-06',
    toDate: '2026-09-06'
  };

  // 4a. Unauthenticated channel
  const unauthChannel = new FakeChannel({ authenticated: false });
  const saPeer = { peerId: 'sa-device-1', peerApp: 'sa' };

  assert.throws(
    () => AttendanceExport.handleAttendanceRequest(request, {
      channel: unauthChannel,
      peer: saPeer,
      isChannelAuthenticated: () => false,
      expectedSaProjectId: SA_PROJECT,
      repository: attRepo,
      employeeRepository: empRepo
    }),
    /no autenticado/
  );

  // 4b. Wrong peer (peerApp: 'mini')
  const authChannel = new FakeChannel({ authenticated: true });
  const miniPeer = { peerId: 'mini-device-2', peerApp: 'mini' };

  assert.throws(
    () => AttendanceExport.handleAttendanceRequest(request, {
      channel: authChannel,
      peer: miniPeer,
      isChannelAuthenticated: () => true,
      expectedSaProjectId: SA_PROJECT,
      repository: attRepo,
      employeeRepository: empRepo
    }),
    /no es SA compatible/
  );
});

// 5. Invalid dates and range bounds: fails closed
test('invalid dates / range: malformed dates, inverted order, and >31 days fail closed', () => {
  const base = {
    schema: 'attendance-request/v1',
    requestId: 'req-dates-1',
    saProjectId: SA_PROJECT,
    fromDate: '2026-09-01',
    toDate: '2026-09-05'
  };

  // Malformed date strings
  for (const bad of ['not-a-date', '2026-02-30', '01-09-2026', '2026-13-01', '', null, 12345]) {
    assert.throws(
      () => AttendanceExport.validateAttendanceRequest({ ...base, fromDate: bad }),
      /fromDate/
    );
    assert.throws(
      () => AttendanceExport.validateAttendanceRequest({ ...base, toDate: bad }),
      /toDate/
    );
  }

  // Inverted range (fromDate > toDate)
  assert.throws(
    () => AttendanceExport.validateAttendanceRequest({
      ...base,
      fromDate: '2026-09-10',
      toDate: '2026-09-05'
    }),
    /less than or equal/
  );

  // Range exceeding 31 days (e.g. 32 days)
  assert.throws(
    () => AttendanceExport.validateAttendanceRequest({
      ...base,
      fromDate: '2026-09-01',
      toDate: '2026-10-02' // 32 days
    }),
    /exceeds maximum allowed range of 31 days/
  );

  // Exactly 31 days succeeds
  const exactly31 = AttendanceExport.validateAttendanceRequest({
    ...base,
    fromDate: '2026-09-01',
    toDate: '2026-10-01' // 31 days inclusive
  });
  assert.equal(exactly31.fromDate, '2026-09-01');
  assert.equal(exactly31.toDate, '2026-10-01');

  // Single day range succeeds
  const singleDay = AttendanceExport.validateAttendanceRequest({
    ...base,
    fromDate: '2026-09-06',
    toDate: '2026-09-06'
  });
  assert.equal(singleDay.fromDate, '2026-09-06');
  assert.equal(singleDay.toDate, '2026-09-06');
});

// 6. Missing identity rows and excluded semantics
test('missing identity rows / excluded semantics: preserves omission without fabricating IDs and tracks excluded', () => {
  const { attRepo, empRepo } = makeSetup();

  // Record attendance on 2026-09-06 for:
  // 1. Ana (linked to SA_PROJECT, has saEmployeeId: 'EMP-001')
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 8);

  // 2. Carlos (local, has NO saProjectId and NO saEmployeeId)
  attRepo.setRecord('mini-u2', '2026-09-06', 'present', 8);

  // 3. Diego (linked to OTHER_PROJECT, saProjectId !== SA_PROJECT)
  attRepo.setRecord('mini-u3', '2026-09-06', 'present', 8);

  // 4. Elena (linked to SA_PROJECT, but has corrupt hours: 25h > 24h limit)
  attRepo.setRecord('mini-u4', '2026-09-06', 'present', 25);

  const submission = AttendanceExport.generateAttendanceSubmission({
    workDate: '2026-09-06',
    saProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo,
    scope: SCOPE,
    deviceId: DEVICE_ID,
    rosterVersion: ROSTER_VERSION
  });

  assert.ok(submission);

  // Rows should contain Ana and Carlos (2 present rows)
  // Diego was excluded due to PROJECT_MISMATCH
  // Elena was excluded due to INVALID_HOURS (> 24)
  assert.equal(submission.rows.length, 2);

  // Check Ana's row: has saEmployeeId
  const anaRow = submission.rows.find(r => r.miniLocalId === 'mini-u1');
  assert.ok(anaRow);
  assert.equal(anaRow.saEmployeeId, 'EMP-001');

  // Check Carlos's row: local employee with NO SA identity
  const carlosRow = submission.rows.find(r => r.miniLocalId === 'mini-u2');
  assert.ok(carlosRow);
  assert.equal(carlosRow.number, '002');
  assert.equal(carlosRow.name, 'Carlos Local');
  // 'saEmployeeId' must be absent, NOT null, NOT empty string, NOT employee number!
  assert.equal('saEmployeeId' in carlosRow, false, 'saEmployeeId key must be omitted for unlinked local employees');
  assert.equal(carlosRow.number, '002', 'number is display snapshot only, not saEmployeeId');

  // Excluded semantics: excludedCount must be 2 (Diego + Elena)
  assert.equal(submission.excludedCount, 2);
  assert.ok(submission.errorSummary);
  assert.equal(submission.errorSummary.unparsedFragments, 2);
  assert.deepEqual([...submission.errorSummary.codes].sort(), ['INVALID_HOURS', 'PROJECT_MISMATCH'].sort());

  // Entire submission validates under frozen F3.4 rules
  const validated = AttendanceExport.validateAttendanceSubmission(submission, SA_PROJECT);
  assert.equal(validated.excludedCount, 2);
});

// 7. No mutation of local attendance
test('no mutation of local attendance: repository data and tombstones remain strictly unchanged', () => {
  const { attRepo, empRepo } = makeSetup();

  attRepo.setRecord('mini-u1', '2026-09-01', 'present', 8);
  attRepo.setRecord('mini-u2', '2026-09-01', 'present', 6);
  attRepo.setRecord('mini-u1', '2026-09-02', 'present', 8);

  const snapshotBefore = attRepo.exportSnapshot();
  const tombstonesBefore = attRepo.getTombstones();
  const employeesBefore = empRepo.getAll();

  // Run single-day generation
  AttendanceExport.generateAttendanceSubmission({
    workDate: '2026-09-01',
    saProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo
  });

  // Run range generation
  AttendanceExport.generateAttendanceSubmissionsForRange({
    fromDate: '2026-09-01',
    toDate: '2026-09-03',
    saProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo
  });

  // Run request handler
  const fakeChannel = new FakeChannel();
  const peer = { peerId: 'sa-device-1', peerApp: 'sa' };
  AttendanceExport.handleAttendanceRequest({
    schema: 'attendance-request/v1',
    requestId: 'req-no-mutate-1',
    saProjectId: SA_PROJECT,
    fromDate: '2026-09-01',
    toDate: '2026-09-03'
  }, {
    channel: fakeChannel,
    peer,
    isChannelAuthenticated: () => true,
    expectedSaProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo
  });

  const snapshotAfter = attRepo.exportSnapshot();
  const tombstonesAfter = attRepo.getTombstones();
  const employeesAfter = empRepo.getAll();

  assert.deepEqual(snapshotAfter.attendance, snapshotBefore.attendance);
  assert.deepEqual(tombstonesAfter, tombstonesBefore);
  assert.deepEqual(employeesAfter, employeesBefore);
});

// 8. Preservation of WhatsApp formatting
test('WhatsApp human formatting preserved: shareToWhatsApp in index.html is intact', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify shareToWhatsApp exists and preserves Spanish WhatsApp human message formatting
  assert.ok(html.includes('function shareToWhatsApp()'));
  assert.ok(html.includes('*Asistencia de hoy'));
  assert.ok(html.includes('https://wa.me/?text='));
  assert.ok(html.includes('showToast(\'No hay asistencia registrada para hoy.\')'));
});

// 9. P2P channel responder wiring
test('P2P channel responder: responds to attendance-request/v1 and ignores non-attendance frames', async () => {
  const { attRepo, empRepo } = makeSetup();
  attRepo.setRecord('mini-u1', '2026-09-06', 'present', 8);

  const fakeChannel = new FakeChannel({ authenticated: true });
  const saPeer = { peerId: 'sa-device-1', peerApp: 'sa' };

  const detach = AttendanceExport.attachAttendanceResponder(fakeChannel, saPeer, {
    isChannelAuthenticated: () => true,
    expectedSaProjectId: SA_PROJECT,
    repository: attRepo,
    employeeRepository: empRepo,
    scope: SCOPE,
    deviceId: DEVICE_ID,
    rosterVersion: ROSTER_VERSION
  });

  // 1. Send unrelated message (e.g. roster or other control)
  fakeChannel.receive(JSON.stringify({ protocol: 'sa-mini-p2p-transfer/v1', type: 'start' }));
  assert.equal(fakeChannel.sentFrames.length, 0, 'must ignore non-attendance message');

  // 2. Send valid attendance-request/v1
  const validRequest = {
    schema: 'attendance-request/v1',
    requestId: 'req-wire-123',
    saProjectId: SA_PROJECT,
    fromDate: '2026-09-06',
    toDate: '2026-09-06'
  };
  fakeChannel.receive(JSON.stringify(validRequest));

  assert.equal(fakeChannel.sentFrames.length, 1);
  const sent = JSON.parse(fakeChannel.sentFrames[0]);
  assert.equal(sent.schema, 'attendance-response/v1');
  assert.equal(sent.requestId, 'req-wire-123');
  assert.equal(sent.saProjectId, SA_PROJECT);
  assert.equal(sent.ok, true);
  assert.equal(sent.submissions.length, 1);
  assert.equal(sent.submissions[0].workDate, '2026-09-06');

  // Detach listener
  detach();
  fakeChannel.receive(JSON.stringify(validRequest));
  assert.equal(fakeChannel.sentFrames.length, 1, 'must not respond after detach');
});
