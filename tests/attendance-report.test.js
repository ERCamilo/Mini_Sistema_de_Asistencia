const test = require('node:test');
const assert = require('node:assert/strict');
const AttendanceReport = require('../attendance-report.js');

const users = [
  { id: 'b', name: 'Bruno', number: '2', position: 'Ops' },
  { id: 'a', name: 'Ana', number: '1', position: 'Admin' }
];

const attendance = {
  '2026-01-01': { a: { status: 'present', hours: 8 }, b: { status: 'present', hours: 8 } },
  '2026-01-02': { a: { status: 'present', hours: 4 } },
  '2026-01-03': { a: { status: 'present', hours: 12 } }
};

test('listDays builds the inclusive range with weekday flags and labels', () => {
  const days = AttendanceReport.listDays('2026-01-01', '2026-01-07');
  assert.equal(days.length, 7);
  assert.equal(days[0].date, '2026-01-01');
  assert.equal(days[6].date, '2026-01-07');
  assert.equal(days[0].dateLabel, '1/1');
  days.forEach(d => {
    const p = d.date.split('-').map(Number);
    const wd = new Date(p[0], p[1] - 1, p[2]).getDay();
    assert.equal(d.weekday, wd);
    assert.equal(d.isSunday, wd === 0);
    assert.equal(d.weekdayLabel.length >= 3, true);
  });
});

test('weekIndex increments after each Sunday', () => {
  const days = AttendanceReport.listDays('2026-01-01', '2026-01-14');
  const sundayIdx = days.findIndex(d => d.isSunday);
  assert.ok(sundayIdx >= 0);
  assert.equal(days[sundayIdx].weekIndex, 0);
  assert.equal(days[sundayIdx + 1].weekIndex, 1);
});

test('rangeDays counts inclusive days', () => {
  assert.equal(AttendanceReport.rangeDays('2026-01-01', '2026-01-01'), 1);
  assert.equal(AttendanceReport.rangeDays('2026-01-01', '2026-01-07'), 7);
  assert.equal(AttendanceReport.rangeDays('2026-01-01', '2026-03-31'), 90);
});

test('builds per-employee hours, ratios and totals, sorted by number', () => {
  const report = AttendanceReport.buildAttendanceReport(users, attendance, '2026-01-01', '2026-01-05', 8);
  assert.equal(report.days.length, 5);
  assert.equal(report.expectedHours, 8);
  // sorted by number: Ana (1) before Bruno (2)
  assert.deepEqual(report.rows.map(r => r.employee.name), ['Ana', 'Bruno']);

  const ana = report.rows[0];
  assert.deepEqual(ana.hours, [8, 4, 12, null, null]);
  assert.deepEqual(ana.ratio, [1, 0.5, 1.5, null, null]);
  assert.equal(ana.totalHours, 24);
  assert.equal(ana.totalRatio, 3);
  assert.equal(ana.daysPresent, 3);
  assert.equal(ana.overtimeHours, 4); // only the 12h day is +4 over 8

  const bruno = report.rows[1];
  assert.deepEqual(bruno.hours, [8, null, null, null, null]);
  assert.equal(bruno.totalHours, 8);
  assert.equal(bruno.daysPresent, 1);
  assert.equal(bruno.overtimeHours, 0);
});

test('expectedHours changes the ratio', () => {
  const report = AttendanceReport.buildAttendanceReport(users, attendance, '2026-01-01', '2026-01-03', 4);
  const ana = report.rows[0];
  // 8/4 = 2, 4/4 = 1, 12/4 = 3
  assert.deepEqual(ana.ratio, [2, 1, 3]);
  assert.equal(ana.expectedHours, undefined); // ratio lives on the row, expectedHours on the report
  assert.equal(report.expectedHours, 4);
});

test('absent / unrecorded days are null, never counted', () => {
  const report = AttendanceReport.buildAttendanceReport(users, {}, '2026-01-01', '2026-01-03', 8);
  const ana = report.rows[0];
  assert.deepEqual(ana.hours, [null, null, null]);
  assert.equal(ana.totalHours, 0);
  assert.equal(ana.daysPresent, 0);
});
