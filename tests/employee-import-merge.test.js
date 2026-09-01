const test = require('node:test');
const assert = require('node:assert/strict');
const EmployeeNumberRules = require('../employee-number-rules.js');

function mergeEmployees(currentUsers, incoming, normalizeNum = EmployeeNumberRules.normalizeEmployeeNumber) {
  const users = currentUsers.map(u => ({ ...u }));
  let updatedCount = 0;
  let createdCount = 0;

  incoming.forEach(emp => {
    const normNum = normalizeNum(emp.number);
    const isPaused = (emp.paused === true || emp.paused === 'true' || emp.status === 'paused' || emp.status === 'inactive' || emp.active === false)
      ? true
      : (emp.paused === false || emp.active === true || emp.status === 'active')
        ? false
        : undefined;

    const existing = users.find(u => (emp.id && u.id === emp.id) || (normNum !== null && normalizeNum(u.number) === normNum));
    if (existing) {
      existing.name = String(emp.name).trim();
      if (emp.position !== undefined) existing.position = String(emp.position).trim();
      if (emp.sueldo !== undefined) {
        const s = String(emp.sueldo).trim();
        existing.sueldo = s ? s : undefined;
      }
      if (isPaused !== undefined) {
        existing.paused = isPaused ? true : undefined;
      }
      updatedCount++;
    } else {
      users.push({
        id: emp.id || ('u' + Date.now() + Math.random().toString(36).slice(2, 7)),
        name: String(emp.name).trim(),
        number: String(emp.number).trim(),
        position: emp.position ? String(emp.position).trim() : '',
        sueldo: emp.sueldo !== undefined && emp.sueldo !== null && String(emp.sueldo).trim() !== '' ? String(emp.sueldo).trim() : undefined,
        paused: isPaused ? true : undefined
      });
      createdCount++;
    }
  });

  return { users, updatedCount, createdCount };
}

test('merge mode updates existing employee position and sueldo while preserving stable ID', () => {
  const initialUsers = [
    { id: 'user-1', name: 'Ana Garcia', number: '01', position: 'Dev' },
    { id: 'user-2', name: 'Carlos Perez', number: '2', position: 'Designer', sueldo: '1500' }
  ];

  const incoming = [
    { number: '1', name: 'Ana Garcia Updated', position: 'Lead Dev', sueldo: '3000' }
  ];

  const { users, updatedCount, createdCount } = mergeEmployees(initialUsers, incoming);

  assert.equal(updatedCount, 1);
  assert.equal(createdCount, 0);
  assert.equal(users.length, 2);

  const ana = users.find(u => u.id === 'user-1');
  assert.ok(ana);
  assert.equal(ana.name, 'Ana Garcia Updated');
  assert.equal(ana.position, 'Lead Dev');
  assert.equal(ana.sueldo, '3000');
  // Original ID must be strictly preserved so attendance records stay linked
  assert.equal(ana.id, 'user-1');
});

test('merge mode appends new employees without mutating existing unchanged ones', () => {
  const initialUsers = [
    { id: 'user-1', name: 'Ana Garcia', number: '1', position: 'Dev' }
  ];

  const incoming = [
    { number: '2', name: 'Bruno Diaz', position: 'Arquitecto', sueldo: '4000' }
  ];

  const { users, updatedCount, createdCount } = mergeEmployees(initialUsers, incoming);

  assert.equal(updatedCount, 0);
  assert.equal(createdCount, 1);
  assert.equal(users.length, 2);

  const bruno = users.find(u => u.name === 'Bruno Diaz');
  assert.ok(bruno);
  assert.equal(bruno.number, '2');
  assert.equal(bruno.position, 'Arquitecto');
  assert.equal(bruno.sueldo, '4000');
  assert.ok(bruno.id.startsWith('u'));
});

test('merge mode handles combination of updates and inserts in a single payload', () => {
  const initialUsers = [
    { id: 'user-1', name: 'Ana Garcia', number: '1', position: 'Dev' },
    { id: 'user-2', name: 'Carlos Perez', number: '2', position: 'QA' }
  ];

  const incoming = [
    { number: '1', name: 'Ana Garcia', position: 'Senior Dev' },
    { number: '3', name: 'Maria Rodriguez', position: 'PM' }
  ];

  const { users, updatedCount, createdCount } = mergeEmployees(initialUsers, incoming);

  assert.equal(updatedCount, 1);
  assert.equal(createdCount, 1);
  assert.equal(users.length, 3);
  assert.equal(users.find(u => u.number === '1').position, 'Senior Dev');
  assert.equal(users.find(u => u.number === '2').position, 'QA');
  assert.equal(users.find(u => u.number === '3').name, 'Maria Rodriguez');
});

test('attendance keys keyed by user id remain valid after employee merge', () => {
  const initialUsers = [
    { id: 'u_100', name: 'Ana', number: '10' }
  ];
  const attendanceData = {
    '2026-08-31': { 'u_100': { status: 'present', hours: 8 } }
  };

  const incoming = [
    { number: '10', name: 'Ana Maria', position: 'Supervisor' }
  ];

  const { users } = mergeEmployees(initialUsers, incoming);
  const updatedAna = users.find(u => u.number === '10');

  // Verify attendance lookup works with updated employee record
  assert.equal(attendanceData['2026-08-31'][updatedAna.id].hours, 8);
});

test('clipboard export simple employee list formats clean JSON with paused flag when present', () => {
  const users = [
    { id: 'u_1', name: 'Ana', number: '1', position: 'Dev', sueldo: '2000', paused: false },
    { id: 'u_2', name: 'Carlos', number: '2', position: 'Designer', paused: true }
  ];

  const simple = users.map(u => {
    const item = { number: u.number, name: u.name };
    if (u.position) item.position = u.position;
    if (u.sueldo) item.sueldo = u.sueldo;
    if (u.paused) item.paused = true;
    return item;
  });

  assert.equal(simple.length, 2);
  assert.deepEqual(simple[0], { number: '1', name: 'Ana', position: 'Dev', sueldo: '2000' });
  assert.deepEqual(simple[1], { number: '2', name: 'Carlos', position: 'Designer', paused: true });
});

test('merge mode imports and updates paused status correctly', () => {
  const initialUsers = [
    { id: 'user-1', name: 'Ana', number: '1', paused: false },
    { id: 'user-2', name: 'Carlos', number: '2', paused: true }
  ];

  const incoming = [
    { number: '1', name: 'Ana', paused: true }, // Pausing Ana
    { number: '2', name: 'Carlos', paused: false }, // Reactivating Carlos
    { number: '3', name: 'Bruno', paused: true } // New paused employee
  ];

  const { users, updatedCount, createdCount } = mergeEmployees(initialUsers, incoming);

  assert.equal(updatedCount, 2);
  assert.equal(createdCount, 1);

  const ana = users.find(u => u.number === '1');
  const carlos = users.find(u => u.number === '2');
  const bruno = users.find(u => u.number === '3');

  assert.equal(ana.paused, true);
  assert.equal(carlos.paused, undefined);
  assert.equal(bruno.paused, true);
});

test('clipboard export with 30 days filters only dates within the 30-day window', () => {
  const attendanceData = {
    '2026-08-30': { u_1: { status: 'present', hours: 8 } },
    '2026-08-15': { u_1: { status: 'present', hours: 8 } },
    '2026-07-01': { u_1: { status: 'present', hours: 8 } } // older than 30 days relative to 2026-08-31
  };

  const cutoffStr = '2026-08-01'; // 30 days prior
  const filtered = {};
  for (const d in attendanceData) {
    if (d >= cutoffStr) {
      filtered[d] = attendanceData[d];
    }
  }

  assert.ok(filtered['2026-08-30']);
  assert.ok(filtered['2026-08-15']);
  assert.equal(filtered['2026-07-01'], undefined);
  assert.equal(Object.keys(filtered).length, 2);
});
