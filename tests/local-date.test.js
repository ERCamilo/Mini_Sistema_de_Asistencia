// Pin a UTC-4 zone (Dominican Republic) before any Date is built.
process.env.TZ = 'America/Santo_Domingo';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const LocalDate = require('../local-date.js');

test('toLocalDateKey keeps the local day after 20:00 in UTC-4', () => {
  const evening = new Date('2026-09-29T00:30:00.000Z'); // 20:30 on Sep 28 in Santo Domingo
  assert.equal(evening.toISOString().split('T')[0], '2026-09-29'); // the old UTC bug
  assert.equal(LocalDate.toLocalDateKey(evening), '2026-09-28');
});

test('toLocalDateKey pads month and day and defaults to now', () => {
  assert.equal(LocalDate.toLocalDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.match(LocalDate.toLocalDateKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('shiftLocalDateKey crosses month and year boundaries', () => {
  assert.equal(LocalDate.shiftLocalDateKey('2026-09-28', 1), '2026-09-29');
  assert.equal(LocalDate.shiftLocalDateKey('2026-09-30', 1), '2026-10-01');
  assert.equal(LocalDate.shiftLocalDateKey('2026-01-01', -1), '2025-12-31');
  assert.equal(LocalDate.shiftLocalDateKey('2028-03-01', -1), '2028-02-29');
  assert.equal(LocalDate.shiftLocalDateKey('2026-09-28', -30), '2026-08-29');
});

test('shiftLocalDateKey does not drift in UTC+ zones', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Madrid';
  try {
    assert.equal(LocalDate.shiftLocalDateKey('2026-09-28', 1), '2026-09-29');
    assert.equal(LocalDate.shiftLocalDateKey('2026-09-28', -1), '2026-09-27');
  } finally {
    process.env.TZ = previous;
  }
});

test('index.html builds date keys with LocalDate, never UTC', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.doesNotMatch(html, /toISOString\(\)\.split\('T'\)\[0\]/);
  assert.match(html, /let selectedDate = window\.LocalDate\.toLocalDateKey\(\);/);
  const script = html.indexOf('<script src="./local-date.js"></script>');
  assert.ok(script > -1, 'local-date.js is loaded');
  assert.ok(script < html.indexOf('let selectedDate'), 'loaded before the app script');
  const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.match(sw, /'\.\/local-date\.js'/);
});
