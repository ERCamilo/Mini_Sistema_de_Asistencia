const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const IconSet = require('../icon-set.js');

test('IconSet has pause and play icons registered in emoji and lucide formats', () => {
  assert.equal(IconSet.hasIcon('pause'), true);
  assert.equal(IconSet.hasIcon('play'), true);
  assert.equal(IconSet.iconEmoji('pause'), '⏸️');
  assert.equal(IconSet.iconEmoji('play'), '▶️');
  assert.ok(IconSet.iconSvg('pause').includes('<svg'));
  assert.ok(IconSet.iconSvg('play').includes('<svg'));
});

test('daily filter logic: paused employee is hidden when absent but shown when present on selected date', () => {
  const users = [
    { id: 'u_1', name: 'Ana', number: '1', paused: false },
    { id: 'u_2', name: 'Carlos', number: '2', paused: true },
    { id: 'u_3', name: 'Bruno', number: '3', paused: true }
  ];

  const attendanceData = {
    '2026-08-31': {
      'u_1': { status: 'present', hours: 8 },
      'u_2': { status: 'present', hours: 8 }
      // u_3 has no record on this date
    }
  };

  function filterForDate(dateStr) {
    const records = attendanceData[dateStr] || {};
    return users.filter(u => {
      const isPresent = !!records[u.id];
      if (u.paused && !isPresent) return false;
      return true;
    });
  }

  const visibleOnAug31 = filterForDate('2026-08-31');
  assert.equal(visibleOnAug31.length, 2);
  assert.ok(visibleOnAug31.some(u => u.id === 'u_1'));
  // u_2 is paused, but attended on Aug 31 -> MUST BE VISIBLE (historical preservation)
  assert.ok(visibleOnAug31.some(u => u.id === 'u_2'));
  // u_3 is paused and has no attendance on Aug 31 -> MUST BE HIDDEN
  assert.equal(visibleOnAug31.some(u => u.id === 'u_3'), false);

  // On a new date (2026-09-01) where nobody has checked in yet:
  const visibleOnSept1 = filterForDate('2026-09-01');
  assert.equal(visibleOnSept1.length, 1);
  assert.equal(visibleOnSept1[0].id, 'u_1'); // Only active employee shows
});

test('weekly table filter logic: includes active employees and only paused employees with attendance that week', () => {
  const users = [
    { id: 'u_1', name: 'Ana', number: '1', paused: false },
    { id: 'u_2', name: 'Carlos', number: '2', paused: true },
    { id: 'u_3', name: 'Bruno', number: '3', paused: true }
  ];

  const weekDates = ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'];

  const attendanceData = {
    '2026-08-26': { 'u_2': { status: 'present', hours: 8 } }
    // u_3 has no record this entire week
  };

  const filteredForWeek = users.filter(u => {
    if (!u.paused) return true;
    return weekDates.some(dateStr => !!attendanceData[dateStr]?.[u.id]);
  });

  assert.equal(filteredForWeek.length, 2);
  assert.ok(filteredForWeek.some(u => u.id === 'u_1'));
  assert.ok(filteredForWeek.some(u => u.id === 'u_2'));
  assert.equal(filteredForWeek.some(u => u.id === 'u_3'), false);
});

test('dashboard total computation correctly accounts for active and historical paused attendees', () => {
  const users = [
    { id: 'u_1', name: 'Ana', number: '1', paused: false },
    { id: 'u_2', name: 'Beatriz', number: '2', paused: false },
    { id: 'u_3', name: 'Carlos', number: '3', paused: true }
  ];

  // Case 1: normal day, no paused attendee
  let records = {
    'u_1': { status: 'present', hours: 8 }
  };
  let activeCount = users.filter(u => !u.paused || (records[u.id] && records[u.id].status === 'present')).length;
  assert.equal(activeCount, 2);

  // Case 2: historical day where paused employee Carlos had attended
  records = {
    'u_1': { status: 'present', hours: 8 },
    'u_3': { status: 'present', hours: 8 }
  };
  activeCount = users.filter(u => !u.paused || (records[u.id] && records[u.id].status === 'present')).length;
  assert.equal(activeCount, 3);
});

test('index.html contains pause markup, switch toggle, and togglePauseUser handler', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  // Check CSS
  assert.match(html, /\.user-card\.paused/);
  assert.match(html, /\.badge-paused/);

  // Check form switch
  assert.match(html, /id="user-paused"/);

  // Check togglePauseUser function
  assert.match(html, /window\.togglePauseUser\s*=/);
  assert.match(html, /data-icon="\$\{isPaused \? 'play' : 'pause'\}"/);
});
