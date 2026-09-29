const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Guard = require('../report-send-guard.js');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const sw = readFileSync(require.resolve('../sw.js'), 'utf8');

const TODAY = '2026-09-29';

test('levels by age of the day being sent', () => {
  assert.deepEqual(Guard.classify('2026-09-29', TODAY), { level: 'today', days: 0 });
  assert.deepEqual(Guard.classify('2026-09-28', TODAY), { level: 'yesterday', days: 1 });
  assert.deepEqual(Guard.classify('2026-09-27', TODAY), { level: 'recent', days: 2 });
  assert.deepEqual(Guard.classify('2026-08-30', TODAY), { level: 'recent', days: 30 });
  assert.deepEqual(Guard.classify('2026-08-29', TODAY), { level: 'old', days: 31 });
  assert.deepEqual(Guard.classify('2026-09-30', TODAY), { level: 'future', days: -1 });
});

test('day counting uses the local calendar (no timezone or DST slips)', () => {
  assert.deepEqual(Guard.classify('2026-03-01', '2026-03-31'), { level: 'recent', days: 30 });
  assert.deepEqual(Guard.classify('2025-12-31', '2026-01-01'), { level: 'yesterday', days: 1 });
  assert.equal(Guard.classify('2026-10-25', '2026-10-26').days, 1, 'across a DST change');
});

test('today and yesterday send directly; the rest ask first', () => {
  assert.equal(Guard.prompt(Guard.classify('2026-09-29', TODAY), 'martes 29 de septiembre'), null);
  assert.equal(Guard.prompt(Guard.classify('2026-09-28', TODAY), 'lunes 28 de septiembre'), null);

  const recent = Guard.prompt(Guard.classify('2026-09-21', TODAY), 'lunes 21 de septiembre');
  assert.equal(recent.danger, false);
  assert.match(recent.message, /lunes 21 de septiembre \(hace 8 días\)/);
  assert.equal(recent.confirmText, 'Enviar ese día');
  assert.equal(recent.cancelText, 'Ir a hoy');

  const old = Guard.prompt(Guard.classify('2026-08-15', TODAY), 'sábado 15 de agosto');
  assert.equal(old.danger, true);
  assert.match(old.message, /hace 45 días/);
  assert.match(old.title, /más de un mes/i);

  const future = Guard.prompt(Guard.classify('2026-10-02', TODAY), 'viernes 2 de octubre');
  assert.equal(future.danger, true);
  assert.match(future.message, /todavía no pasó/);
});

test('wiring: the guard runs before the unchanged sender; module loaded and precached', () => {
  assert.match(html, /<script src="\.\/report-send-guard\.js"><\/script>/);
  assert.match(sw, /'\.\/report-send-guard\.js'/);
  const guard = html.slice(html.indexOf('        async function shareToWhatsApp() {'), html.indexOf('        function sendWhatsAppReport() {'));
  assert.match(guard, /ReportSendGuard\.classify\(selectedDate/);
  assert.match(guard, /showConfirm\(/);
  assert.match(guard, /sendWhatsAppReport\(\);/);
});

// The message text is imported elsewhere: its format must never change by accident.
test('the WhatsApp message builder is byte-for-byte the original', () => {
  const sender = html.slice(html.indexOf('        function sendWhatsAppReport() {'), html.indexOf('        function updateDashboard() {'));
  for (const line of [
    "let message = `*Asistencia de hoy ${dateStr}${ctxSuffix}*\\n`;",
    "message += `_Última actualización: ${lastActionTime || 'Reciente'}_\\n\\n`;",
    "message += `${u.number}. ${u.name}  *${rec.hours}h*\\n`;",
    "const dateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });",
    "const ctxSuffix = activeCtx ? ` · ${activeCtx.type === 'squad' ? '👥' : '🏗️'} ${activeCtx.name}` : '';",
    "const url = `https://wa.me/?text=${encodeURIComponent(message)}`;"
  ]) assert.ok(sender.includes(line), 'format changed: ' + line);
});
