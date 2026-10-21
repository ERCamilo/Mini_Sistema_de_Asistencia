const test = require('node:test');
require('../employee-positions.js'); // sets globalThis.EmployeePositions, as index.html does
const assert = require('node:assert/strict');

const AttendanceExport = require('../attendance-export.js');

const SA_PROJECT = 'PRJ-EJEMPLO-0001';
const SCOPE = { ownerUid: 'owner-1', siteId: 'obra-1', sourceId: 'mini-principal' };
const DAY = '2026-09-07';

function employees() {
  return [
    { id: 'u1', name: 'Ana García', number: '1', position: 'Albañil', positionSaId: 'POS-1', sueldo: '1500' },
    { id: 'u2', name: 'Luis Gómez', number: '2', position: 'Albañil', positionSaId: 'POS-1', extraPositions: [{ name: 'Plomero', saPositionId: 'POS-7' }], sueldo: '1800.50' },
    { id: 'u3', name: 'Sin Datos', number: '3' },
    { id: 'u4', name: 'Sueldo Raro', number: '4', position: 'Peón', sueldo: 'abc' },
    { id: 'u5', name: 'Vinculado', number: '5', position: 'Chofer', sueldo: '2000', saEmployeeId: 'EMP-5' }
  ];
}
const attendanceData = {
  [DAY]: {
    u1: { status: 'present', hours: 8 },
    u2: { status: 'present', hours: 10, position: 'Plomero' },
    u3: { status: 'present', hours: 8 },
    u4: { status: 'present', hours: 8 }
  }
};
function generate(extra = {}) {
  return AttendanceExport.generateAttendanceSubmission({
    workDate: DAY, saProjectId: SA_PROJECT, scope: SCOPE, deviceId: 'dev-1', rosterVersion: 'r1',
    employees: employees(), attendanceData, now: () => '2026-09-07T12:00:00.000Z', generateUuid: () => '7d2f0c1e-5b6a-4c3e-9f10-2a8b6e4d9c01', ...extra
  });
}
const byId = (submission, id) => submission.rows.find(r => r.miniLocalId === id);

test('without includeEmployeeProfile rows keep the previous shape', () => {
  const sub = generate();
  assert.equal('dailySalary' in byId(sub, 'u1'), false);
  assert.equal('positionName' in byId(sub, 'u1'), false, 'single position: not sent unless profile is requested');
});

test('includeEmployeeProfile sends dailySalary and the day position even with a single position', () => {
  const sub = generate({ includeEmployeeProfile: true });
  const ana = byId(sub, 'u1');
  assert.equal(ana.dailySalary, 1500);
  assert.deepEqual([ana.positionName, ana.saPositionId], ['Albañil', 'POS-1']);
  assert.equal(byId(sub, 'u2').dailySalary, 1800.5);
});

test('includeEmployeeProfile uses the position chosen for that day when there are several', () => {
  const luis = byId(generate({ includeEmployeeProfile: true }), 'u2');
  assert.deepEqual([luis.positionName, luis.saPositionId], ['Plomero', 'POS-7']);
});

test('employees without salary or position are still reported, with only what they have', () => {
  const sub = generate({ includeEmployeeProfile: true });
  const sinDatos = byId(sub, 'u3');
  assert.equal('dailySalary' in sinDatos, false);
  assert.equal('positionName' in sinDatos, false);
  const raro = byId(sub, 'u4');
  assert.equal('dailySalary' in raro, false, 'an unparseable salary is omitted, never guessed');
  assert.equal(raro.positionName, 'Peón');
  assert.equal(raro.status, 'present');
});

test('profile fields are only sent on present rows, not on roster-coverage unmarked rows', () => {
  const sub = generate({ includeEmployeeProfile: true, includeRosterCoverage: true });
  const vinculado = byId(sub, 'u5');
  assert.equal(vinculado.status, 'unmarked');
  assert.equal('dailySalary' in vinculado, false);
  assert.equal('positionName' in vinculado, false);
});

test('validator accepts a valid dailySalary and round-trips through JSON', () => {
  const sub = generate({ includeEmployeeProfile: true });
  const parsed = AttendanceExport.validateAttendanceSubmission(JSON.parse(JSON.stringify(sub)), SA_PROJECT);
  assert.equal(byId(parsed, 'u1').dailySalary, 1500);
});

test('validator rejects an invalid dailySalary', () => {
  const sub = JSON.parse(JSON.stringify(generate({ includeEmployeeProfile: true })));
  for (const bad of [0, -5, '1500', null, Number.NaN, 10000001]) {
    const copy = JSON.parse(JSON.stringify(sub));
    copy.rows.find(r => r.miniLocalId === 'u1').dailySalary = bad;
    assert.throws(() => AttendanceExport.validateAttendanceSubmission(copy, SA_PROJECT), /dailySalary/, String(bad));
  }
});

test('handleAttendanceRequest forwards includeEmployeeProfile from the responder context', () => {
  const request = { schema: 'attendance-request/v1', requestId: 'req-1', saProjectId: SA_PROJECT, fromDate: DAY, toDate: DAY };
  const common = { employees: employees(), attendanceData, scope: SCOPE, deviceId: 'dev-1', rosterVersion: 'r1' };
  const plain = AttendanceExport.handleAttendanceRequest(request, common);
  assert.equal('dailySalary' in byId(plain.submissions[0], 'u1'), false);
  const rich = AttendanceExport.handleAttendanceRequest(request, { ...common, includeEmployeeProfile: true });
  assert.equal(byId(rich.submissions[0], 'u1').dailySalary, 1500);
});

test('the P2P responder opts in to the employee profile', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'p2p-roster-ui.js'), 'utf8');
  assert.match(source, /includeEmployeeProfile:\s*true/);
});

// Size of one attendance-response message for the worst allowed request (31 days x 500 rows).
// WebRTC data channels interoperate safely up to ~64 KiB per message; Chrome's own limit is 256 KiB.
// The response is sent as a single channel.send(), so this documents a real gap. It is a `todo`
// until the response moves to the chunked transfer protocol (which needs SA to receive it too).
test('a worst-case attendance response fits in one data channel message', { todo: 'send large responses through the chunked transfer protocol (needs SA support)' }, () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: 'u' + i, name: 'Empleado Número ' + i, number: String(i + 1), position: 'Albañil', positionSaId: 'POS-1', sueldo: '1500', saEmployeeId: 'EMP-' + i }));
  const data = {};
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const key = '2026-08-' + String(d).padStart(2, '0');
    days.push(key);
    data[key] = Object.fromEntries(many.map(e => [e.id, { status: 'present', hours: 8 }]));
  }
  const response = AttendanceExport.handleAttendanceRequest(
    { schema: 'attendance-request/v1', requestId: 'big', saProjectId: SA_PROJECT, fromDate: days[0], toDate: days[days.length - 1] },
    { employees: many, attendanceData: data, scope: SCOPE, deviceId: 'dev-1', rosterVersion: 'r1', includeEmployeeProfile: true }
  );
  const bytes = Buffer.byteLength(JSON.stringify(response));
  assert.ok(bytes <= 64 * 1024, `response is ${bytes} bytes (${(bytes / 1024).toFixed(0)} KiB)`);
});
