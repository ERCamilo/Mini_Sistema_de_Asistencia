const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

test('employee-positions.js loads before the modules that use it and is precached', () => {
  const at = name => html.indexOf(`<script src="./${name}"></script>`);
  assert.ok(at('employee-positions.js') > -1);
  assert.ok(at('employee-positions.js') < at('sa-roster-import.js'));
  assert.ok(at('employee-positions.js') < at('attendance-export.js'));
  assert.match(sw, /'\.\/employee-positions\.js'/);
});

test('form: principal + 2 optional positions, read and filled through EmployeePositions', () => {
  assert.match(html, /id="user-position-2"[^>]*list="position-options"/);
  assert.match(html, /id="user-position-3"[^>]*list="position-options"/);
  const read = between('function readEmployeeDraft() {', 'function refreshEmployeeViews()');
  assert.match(read, /EmployeePositions\.fromNames\(/);
  const edit = between('window.editUser = (id) => {', 'openModal(\'user-modal\');');
  assert.match(edit, /user-position-2/);
  const add = between('function openAddUserModal() {', 'function openCalendar(');
  assert.match(add, /user-position-2/);
});

test('attendance card: employees with more than one position show position chips', () => {
  const list = between('function renderList() {', 'function changeWeek(');
  assert.match(list, /EmployeePositions\.hasMultiple\(u\)/);
  assert.match(list, /positionChips\(u, record\)/);
  assert.match(between('function positionChips(u, record) {', 'window.selectDayPosition = '), /class="pos-chip/);
  assert.match(html, /window\.selectDayPosition = /);
  const select = between('window.selectDayPosition = ', '// --- END DAY POSITION ---');
  assert.match(select, /attendanceRepository\.setDayPosition\(/);
});

test('WhatsApp line: identical for one position; " _Position_" after the hours only when there are more', () => {
  const sender = between('        function sendWhatsAppReport() {', '        function updateDashboard() {');
  assert.ok(sender.includes("message += `${u.number}. ${u.name}  *${rec.hours}h*${window.EmployeePositions.whatsappSuffix(u, rec)}\\n`;"));
});
