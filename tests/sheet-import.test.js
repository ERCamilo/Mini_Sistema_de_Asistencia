const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../sheet-import.js');

const SHEET = fs.readFileSync(path.join(__dirname, 'fixtures', 'sheet-2026-09.tsv'), 'utf8');
const TODAY = '2026-10-01';

const users = [
  { id: 'u1', number: '001', name: 'Ramón Gutiérrez', position: 'Albañil', extraPositions: [{ name: 'Plomero' }] },
  { id: 'u2', number: '002', name: 'Marysol Betancourt', position: 'Capataz' },
  { id: 'u3', number: '003', name: 'Tomas Rivera Luna', position: 'Ayudante' },
  { id: 'u4', number: '004', name: 'Elena Paredes', position: 'Ayudante' },
  { id: 'u5', number: '005', name: 'María López', position: 'Ayudante' },
  { id: 'u34', number: '034', name: 'Alonso Suárez', position: 'Chofer' }
];

function memoryRepository(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  const calls = [];
  return {
    data, calls,
    getRecord: (id, date) => (data[date] && data[date][id]) || null,
    setRecord(id, date, status, hours) {
      calls.push(['setRecord', id, date, status, hours]);
      if (status === 'absent') { if (data[date]) delete data[date][id]; return { status: 'deleted' }; }
      data[date] = data[date] || {};
      data[date][id] = { ...(data[date][id] || {}), status: 'present', hours };
      return { status: 'saved' };
    },
    setDayPosition(id, date, position) {
      calls.push(['setDayPosition', id, date, position]);
      if (!data[date] || !data[date][id]) return false;
      if (position) data[date][id].position = position; else delete data[date][id].position;
      return true;
    }
  };
}

test('parse: the pasted sheet gives 21 consecutive days S11..O01 and one row per employee', () => {
  const sheet = S.parseSheet(SHEET, { today: TODAY });
  assert.deepEqual(sheet.problems, []);
  assert.equal(sheet.columns.length, 21);
  assert.equal(sheet.columns[0].date, '2026-09-11');
  assert.equal(sheet.columns[20].date, '2026-10-01');
  assert.equal(sheet.rows.length, 34);
  assert.deepEqual(sheet.rows[0], {
    line: 2, number: '1', name: 'Ramon Gutierez',
    values: [0, 0, null, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, null, null, null, null, null]
  });
  assert.equal(sheet.rows[2].values[6], 1.25);
});

test('double days: Sundays always, plus a weekday whose values are mostly 2 (holiday)', () => {
  const sheet = S.parseSheet(SHEET, { today: TODAY });
  const doubles = sheet.columns.filter(c => c.suggestDouble).map(c => c.date);
  assert.deepEqual(doubles, ['2026-09-13', '2026-09-20', '2026-09-24', '2026-09-27']);
  assert.deepEqual(sheet.columns.filter(c => c.isSunday).map(c => c.date), ['2026-09-13', '2026-09-20', '2026-09-27']);
});

test('dates: ambiguous month letters resolve backwards from today; d/m and ISO headers too', () => {
  const dates = text => S.parseSheet(text, { today: TODAY }).columns.map(c => c.date);
  assert.deepEqual(dates('No\tNombre\tA30\tA31\tS01\n1\tAna\t1\t1\t1'), ['2026-08-30', '2026-08-31', '2026-09-01'], 'A = agosto here, not abril');
  assert.deepEqual(dates('No\tNombre\tD31\tE01\n1\tAna\t1\t1'), ['2025-12-31', '2026-01-01'], 'year wrap');
  assert.deepEqual(dates('No\tNombre\t11/9\t12/9\n1\tAna\t1\t1'), ['2026-09-11', '2026-09-12']);
  assert.deepEqual(dates('No\tNombre\t2026-09-11\n1\tAna\t1'), ['2026-09-11']);
});

test('parse: decimal comma, bad cells and a text without tabs are reported, never guessed', () => {
  const sheet = S.parseSheet('No\tNombre\tS11\tS12\n7\tAna\t1,5\tx', { today: TODAY });
  assert.deepEqual(sheet.rows[0].values, [1.5, null]);
  assert.equal(sheet.problems.length, 1);
  assert.match(sheet.problems[0], /fila 2.*S12.*"x"/i);
  assert.match(S.parseSheet('No Nombre S11', { today: TODAY }).problems[0], /tabulaciones|Excel/);
  assert.match(S.parseSheet('No\tNombre\tTotal\n1\tAna\t3', { today: TODAY }).problems[0], /días|fecha/i);
});

test('plan: matched by number with a tolerant name check; blank untouched, 0 clears, doubles halved', () => {
  const sheet = S.parseSheet(SHEET, { today: TODAY });
  const repo = memoryRepository({
    '2026-09-11': { u1: { status: 'present', hours: 8 } },
    '2026-09-28': { u1: { status: 'present', hours: 8, position: 'Plomero' } }
  });
  const plan = S.planSheetImport(sheet, users, {
    expectedHours: 8,
    doubleDates: sheet.columns.filter(c => c.suggestDouble).map(c => c.date),
    getRecord: repo.getRecord
  });
  const byNumber = Object.fromEntries(plan.entries.map(e => [e.number, e]));

  const franklin = byNumber['1'];
  assert.equal(franklin.employee.id, 'u1');
  assert.equal(franklin.nameOk, true, 'Gutierez ~ Gutiérrez');
  assert.equal(franklin.include, true);
  assert.deepEqual(franklin.changes.find(c => c.date === '2026-09-11'), { date: '2026-09-11', action: 'clear', hours: 0 });
  assert.equal(franklin.changes.some(c => c.date === '2026-09-12'), false, '0 without a mark: nothing to clear');
  assert.deepEqual(franklin.changes.find(c => c.date === '2026-09-20'), { date: '2026-09-20', action: 'set', hours: 8 }, '2.00 on Sunday = one day');
  assert.deepEqual(franklin.changes.find(c => c.date === '2026-09-24'), { date: '2026-09-24', action: 'set', hours: 4 }, '1.00 on the holiday = half a day');
  assert.equal(franklin.changes.some(c => c.date === '2026-09-28'), false, 'blank cell leaves the mark (and its position) alone');

  assert.equal(byNumber['2'].nameOk, true, 'Marisol Betancur ~ Marysol Betancourt');
  const grand = byNumber['3'].changes;
  assert.deepEqual(grand.find(c => c.date === '2026-09-17'), { date: '2026-09-17', action: 'set', hours: 10 });
  assert.deepEqual(grand.find(c => c.date === '2026-09-23'), { date: '2026-09-23', action: 'set', hours: 9 });

  assert.equal(byNumber['5'].nameOk, false, 'number 005 is someone else in Mini');
  assert.equal(byNumber['5'].include, false, 'a different name waits for confirmation');
  assert.equal(byNumber['34'].employee.id, 'u34', 'accents do not matter');
  assert.equal(byNumber['7'].employee, null, 'number not in Mini');
  assert.equal(byNumber['7'].changes.length, 0);
  assert.equal(plan.unmatched.map(e => e.number).includes('7'), true);
});

test('plan: unknown number falls back to an identical name; duplicates are skipped', () => {
  const sheet = S.parseSheet('No\tNombre\tS11\n99\tElena Paredes\t1\n4\tElena Paredes\t1', { today: TODAY });
  const plan = S.planSheetImport(sheet, users, { expectedHours: 8, doubleDates: [], getRecord: () => null });
  assert.equal(plan.entries[0].employee.id, 'u4');
  assert.equal(plan.entries[0].match, 'name');
  assert.equal(plan.entries[1].employee.id, 'u4');
  assert.equal(plan.entries[1].include, false);
  assert.match(plan.entries[1].note, /repetid/i);
});

test('plan: unchanged days are not rewritten', () => {
  const sheet = S.parseSheet('No\tNombre\tS11\tS12\n4\tElena Paredes\t1\t1', { today: TODAY });
  const repo = memoryRepository({ '2026-09-11': { u4: { status: 'present', hours: 8 } } });
  const plan = S.planSheetImport(sheet, users, { expectedHours: 8, doubleDates: [], getRecord: repo.getRecord });
  assert.deepEqual(plan.entries[0].changes, [{ date: '2026-09-12', action: 'set', hours: 8 }]);
});

test('apply: only included rows; sets present hours on the principal position, clears zeros', () => {
  const sheet = S.parseSheet(SHEET, { today: TODAY });
  const repo = memoryRepository({
    '2026-09-11': { u1: { status: 'present', hours: 8 } },
    '2026-09-20': { u1: { status: 'present', hours: 8, position: 'Plomero' } }
  });
  const plan = S.planSheetImport(sheet, users, {
    expectedHours: 8, doubleDates: ['2026-09-13', '2026-09-20', '2026-09-24', '2026-09-27'], getRecord: repo.getRecord
  });
  const included = plan.entries.filter(e => e.include).map(e => e.line);
  const result = S.applySheetImport(plan, included, repo);
  assert.equal(repo.getRecord('u1', '2026-09-11'), null, '0.00 cleared the mark');
  assert.deepEqual(repo.getRecord('u1', '2026-09-20'), { status: 'present', hours: 8 }, 'back on the principal');
  assert.deepEqual(repo.getRecord('u4', '2026-09-27'), { status: 'present', hours: 8 });
  assert.equal(repo.getRecord('u5', '2026-09-11'), null, 'unconfirmed name not imported');
  assert.equal(result.employees, 5);
  assert.equal(result.cleared, 1);
  assert.ok(result.set > 60);
  assert.deepEqual(result.dates[0], '2026-09-11');
});
