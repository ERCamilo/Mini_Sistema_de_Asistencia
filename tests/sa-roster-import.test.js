const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const SaRosterImport = require('../sa-roster-import.js');
const EmployeeNumberRules = require('../employee-number-rules.js');
const EmployeeRepository = require('../employee-repository.js');
const ImportHistoryRepository = require('../import-history-repository.js');

globalThis.SaRosterImport = SaRosterImport;

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function saEnvelope(employees, overrides = {}) {
  return { schema: 'sa-roster/v1', version: 1, saProjectId: 'proj-1', employees, ...overrides };
}

function makeRepo(initialUsers = [], now = () => '2026-09-06T00:00:00.000Z') {
  const storage = createMemoryStorage({ users: JSON.stringify(initialUsers) });
  const repo = EmployeeRepository.createEmployeeRepository({ storage, rules: EmployeeNumberRules, now });
  return { storage, repo };
}

// --- 1. Tagged exact match: authoritative (saProjectId, saEmployeeId), never number ---

test('SA exact match updates in place and keeps the local id (attendance key stable)', () => {
  const { repo } = makeRepo([
    { id: 'u-local-1', name: 'Ana Old', number: '1', position: 'Old', saProjectId: 'proj-1', saEmployeeId: 'e1' }
  ]);
  const roster = SaRosterImport.normalizeSaRoster(saEnvelope([
    { saEmployeeId: 'e1', number: '1', name: 'Ana New' }
  ]));
  const plan = SaRosterImport.buildSaImportPlan(repo.getAll(), roster, EmployeeNumberRules);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.updates[0].localId, 'u-local-1');

  const res = repo.importSaRoster(roster);
  assert.equal(res.createdCount, 0);
  assert.equal(res.updatedCount, 1);
  const saved = repo.getById('u-local-1');
  assert.equal(saved.name, 'Ana New');
  assert.equal(saved.saEmployeeId, 'e1');
  // Attendance keyed by local id stays valid: the id never changed.
  const attendance = { '2026-09-06': { 'u-local-1': { status: 'present', hours: 8 } } };
  assert.equal(attendance['2026-09-06'][saved.id].hours, 8);
});

test('SA number-only match never auto-links: explicit reconciliation candidate instead', () => {
  const { repo } = makeRepo([{ id: 'u9', name: 'Luis', number: '5' }]);
  const roster = SaRosterImport.normalizeSaRoster(saEnvelope([
    { saEmployeeId: 'eX', number: '5', name: 'Nuevo SA' }
  ]));
  const plan = SaRosterImport.buildSaImportPlan(repo.getAll(), roster, EmployeeNumberRules);
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'needs-confirmation');
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.reconciliationCandidates.length, 1);
  assert.equal(plan.reconciliationCandidates[0].candidates[0].id, 'u9');

  const res = repo.importSaRoster(roster);
  assert.equal(res.createdCount, 0);
  assert.equal(res.updatedCount, 0);
  assert.equal(res.skippedCount, 1);
  // No automatic cross-link: the legacy employee gains no SA identity.
  assert.equal(repo.getById('u9').saEmployeeId, undefined);
  assert.equal(repo.getBySaIdentity('proj-1', 'eX'), null);
});

test('SA confirmed link keeps the legacy local id and attaches the canonical mapping', () => {
  const { repo } = makeRepo([{ id: 'uLegacy', name: 'Luis', number: '5' }]);
  const raw = saEnvelope([{ saEmployeeId: 'eL', number: '5', name: 'Luis SA' }]);
  const res = repo.importSaRoster(raw, {
    confirmedLinks: [{ saProjectId: 'proj-1', saEmployeeId: 'eL', localId: 'uLegacy' }]
  });
  assert.equal(res.linkedCount, 1);
  assert.equal(res.updatedCount, 1);
  const linked = repo.getById('uLegacy');
  assert.equal(linked.saProjectId, 'proj-1');
  assert.equal(linked.saEmployeeId, 'eL');
  assert.equal(linked.name, 'Luis SA');
});

// --- 2. Legacy compatibility + fail-closed tagged handling ---

test('legacy array and {employees} payloads classify as legacy', () => {
  assert.equal(SaRosterImport.classifyImportPayload([{ number: '1', name: 'A' }]).kind, 'legacy');
  assert.equal(SaRosterImport.classifyImportPayload({ employees: [{ number: '1', name: 'A' }] }).kind, 'legacy');
});

test('legacy merge import still works and SA merge arrays are rejected fail-closed', () => {
  const { repo } = makeRepo([{ id: 'u1', name: 'Ana', number: '1' }]);
  const res = repo.importBatch([{ number: '1', name: 'Ana R.', position: 'Lead' }], 'merge');
  assert.equal(res.updatedCount, 1);
  assert.equal(repo.getById('u1').name, 'Ana R.');

  assert.throws(
    () => repo.importBatch([{ number: '1', name: 'X', saEmployeeId: 'e1' }], 'merge'),
    /SA-tagged payload/
  );
});

test('malformed tagged payloads reject fail-closed and never fall back to legacy', () => {
  // Array carrying SA keys must use the versioned envelope.
  assert.equal(
    SaRosterImport.classifyImportPayload([{ saEmployeeId: 'e1', number: '1', name: 'A' }]).kind,
    'sa'
  );
  assert.throws(() => SaRosterImport.normalizeSaRoster([{ saEmployeeId: 'e1', number: '1', name: 'A' }]), /must be an object/);
  // Wrong schema / version / unknown fields reject.
  assert.throws(() => SaRosterImport.normalizeSaRoster({ schema: 'sa-roster/v9', version: 1, saProjectId: 'p', employees: [] }), /schema must be/);
  assert.throws(() => SaRosterImport.normalizeSaRoster({ schema: 'sa-roster/v1', version: 2, saProjectId: 'p', employees: [] }), /version must be 1/);
  assert.throws(() => SaRosterImport.normalizeSaRoster(saEnvelope([{ saEmployeeId: 'e', number: '1', name: 'A', salary: '5' }])), /unsupported field/);
  assert.throws(() => SaRosterImport.normalizeSaRoster({ schema: 'sa-roster/v1', version: 1, saProjectId: 'p', employees: [], extra: 1 }), /unsupported field/);
});

// --- 3. Duplicate / conflict / ambiguous / malformed rejection before persistence ---

test('duplicate SA identities in one payload are rejected', () => {
  assert.throws(() => SaRosterImport.normalizeSaRoster(saEnvelope([
    { saEmployeeId: 'e1', number: '1', name: 'A' },
    { saEmployeeId: 'e1', number: '2', name: 'B' }
  ])), /duplicate identity/);
});

test('SA tuple identities remain distinct when IDs contain the former delimiter', () => {
  const { repo } = makeRepo([
    { id: 'u1', name: 'First old', number: '1', saProjectId: 'a::b', saEmployeeId: 'c' }
  ]);
  const roster = SaRosterImport.normalizeSaRoster(saEnvelope([
    { saProjectId: 'a::b', saEmployeeId: 'c', number: '1', name: 'First new' },
    { saProjectId: 'a', saEmployeeId: 'b::c', number: '2', name: 'Second new' }
  ]));

  const plan = SaRosterImport.buildSaImportPlan(repo.getAll(), roster, EmployeeNumberRules);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].localId, 'u1');
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].saProjectId, 'a');
  assert.equal(plan.creates[0].saEmployeeId, 'b::c');

  const result = repo.importSaRoster(roster);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.createdCount, 1);
  assert.equal(repo.getBySaIdentity('a::b', 'c').name, 'First new');
  assert.equal(repo.getBySaIdentity('a', 'b::c').name, 'Second new');
  assert.equal(repo.getById('u1').saProjectId, 'a::b');
  assert.equal(repo.getById('u1').saEmployeeId, 'c');
});

test('ambiguous numbers (same normalized number, different identities) are rejected', () => {
  assert.throws(() => SaRosterImport.normalizeSaRoster(saEnvelope([
    { saEmployeeId: 'e1', number: '1', name: 'A' },
    { saEmployeeId: 'e2', number: '01', name: 'B' }
  ])), /ambiguous number/);
});

test('exact-match update that would steal another employee number is rejected', () => {
  const existing = [
    { id: 'u1', name: 'A', number: '1', saProjectId: 'proj-1', saEmployeeId: 'e1' },
    { id: 'u2', name: 'B', number: '2' }
  ];
  const roster = SaRosterImport.normalizeSaRoster(saEnvelope([
    { saEmployeeId: 'e1', number: '2', name: 'A2' }
  ]));
  assert.throws(() => SaRosterImport.buildSaImportPlan(existing, roster, EmployeeNumberRules), /conflicting link/);
});

test('malformed project/employee ids are rejected', () => {
  assert.throws(() => SaRosterImport.normalizeSaRoster({ schema: 'sa-roster/v1', version: 1, saProjectId: '  ', employees: [] }), /saProjectId is malformed/);
  assert.throws(() => SaRosterImport.normalizeSaRoster(saEnvelope([{ saEmployeeId: 'has space', number: '1', name: 'A' }])), /saEmployeeId is malformed/);
  assert.throws(() => SaRosterImport.normalizeSaRoster(saEnvelope([{ number: '1', name: 'A' }])), /saEmployeeId is malformed/);
});

// --- 4. Persistence / reload of SA mapping across edit / history / undo ---

test('single-record edit preserves the SA mapping (no orphan)', () => {
  const { repo } = makeRepo([
    { id: 'u1', name: 'Ana', number: '1', saProjectId: 'proj-1', saEmployeeId: 'e1' }
  ]);
  const res = repo.save({ id: 'u1', name: 'Ana Edit', number: '1', position: 'Y' });
  assert.equal(res.status, 'saved');
  assert.equal(res.employee.saProjectId, 'proj-1');
  assert.equal(res.employee.saEmployeeId, 'e1');
  // Reload from storage keeps the mapping.
  assert.equal(repo.getBySaIdentity('proj-1', 'e1').id, 'u1');
});

test('replace restore (undo path) preserves the SA mapping', () => {
  const { repo } = makeRepo([{ id: 'u1', name: 'A', number: '1' }]);
  repo.importBatch([{ id: 'u1', name: 'A', number: '1', saProjectId: 'p', saEmployeeId: 'e1' }], 'replace');
  assert.equal(repo.getById('u1').saEmployeeId, 'e1');
});

test('SA import history round-trips and rollback restores the pre-import mapping', () => {
  const storage = createMemoryStorage();
  const empRepo = EmployeeRepository.createEmployeeRepository({ storage, rules: EmployeeNumberRules, now: () => 'T' });
  const historyRepo = ImportHistoryRepository.createImportHistoryRepository({ storage });
  empRepo.importBatch([{ id: 'u1', name: 'Ana', number: '1' }], 'replace');

  const snapshotBefore = { users: empRepo.getAll() };
  const roster = saEnvelope([{ saEmployeeId: 'e1', number: '2', name: 'Beto' }]);
  const result = empRepo.importSaRoster(roster);
  assert.equal(result.createdCount, 1);
  const entry = historyRepo.recordImport({
    source: 'sa',
    mode: 'merge',
    summary: {
      totalIncoming: result.totalValid,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      conflictsCount: result.reconciliationCandidates.length
    },
    snapshotBefore
  });
  assert.equal(entry.source, 'sa');
  assert.equal(entry.mode, 'merge');
  assert.equal(empRepo.getAll().length, 2);

  const rolled = historyRepo.rollback(entry.id, { employeeRepository: empRepo });
  assert.equal(rolled.success, true);
  assert.equal(empRepo.getAll().length, 1);
  assert.equal(empRepo.getBySaIdentity('proj-1', 'e1'), null);
});

// --- 5. Non-destructive local ids and merge-only behavior ---

test('new SA employee reuses the SA employee id only when safe; otherwise generates', () => {
  const { repo } = makeRepo([]);
  const res = repo.importSaRoster(saEnvelope([{ saEmployeeId: 'eNew', number: '8', name: 'SA New' }]));
  assert.equal(res.users.find(u => u.saEmployeeId === 'eNew').id, 'eNew');

  const occupied = makeRepo([{ id: 'eNew', name: 'Legacy occupant', number: '1' }]);
  let n = 0;
  const res2 = occupied.repo.importSaRoster(
    saEnvelope([{ saEmployeeId: 'eNew', number: '9', name: 'SA' }]),
    { generateId: () => `gen-${++n}` }
  );
  const created = res2.users.find(u => u.saEmployeeId === 'eNew');
  assert.notEqual(created.id, 'eNew');
  assert.equal(created.saProjectId, 'proj-1');
  // The occupant keeps its id and gains no SA link.
  assert.equal(occupied.repo.getById('eNew').saEmployeeId, undefined);
});

test('SA import is merge-only and never deletes legacy employees', () => {
  const { repo } = makeRepo([
    { id: 'u1', name: 'Legacy', number: '1' },
    { id: 'u2', name: 'Other', number: '2' }
  ]);
  const res = repo.importSaRoster(saEnvelope([{ saEmployeeId: 'e9', number: '9', name: 'New SA' }]));
  assert.equal(res.users.length, 3);
  assert.ok(repo.getById('u1'));
  assert.ok(repo.getById('u2'));
});

// --- 6. Optional sueldo / position / paused semantics ---

test('optional SA fields apply only when explicitly present', () => {
  const base = [{ id: 'u1', name: 'A', number: '1', position: 'Old', sueldo: '500', paused: true, saProjectId: 'proj-1', saEmployeeId: 'e1' }];

  // Absent: preserved.
  let r = makeRepo(structuredClone(base));
  let roster = SaRosterImport.normalizeSaRoster(saEnvelope([{ saEmployeeId: 'e1', number: '1', name: 'A2' }]));
  let applied = SaRosterImport.applySaRosterToUsers(r.repo.getAll(), saEnvelope([{ saEmployeeId: 'e1', number: '1', name: 'A2' }]), { now: () => 'T' });
  assert.equal(applied.users[0].sueldo, '500');
  assert.equal(applied.users[0].position, 'Old');
  assert.equal(applied.users[0].paused, true);

  // Present: applied (including explicit clear of sueldo / unpause).
  applied = SaRosterImport.applySaRosterToUsers(r.repo.getAll(), {
    schema: 'sa-roster/v1', version: 1, saProjectId: 'proj-1',
    employees: [{ saEmployeeId: 'e1', number: '1', name: 'A2', sueldo: '900', position: 'New', paused: false }]
  }, { now: () => 'T' });
  assert.equal(applied.users[0].sueldo, '900');
  assert.equal(applied.users[0].position, 'New');
  assert.equal(applied.users[0].paused, undefined);

  // Present-but-empty sueldo clears.
  applied = SaRosterImport.applySaRosterToUsers(r.repo.getAll(), {
    schema: 'sa-roster/v1', version: 1, saProjectId: 'proj-1',
    employees: [{ saEmployeeId: 'e1', number: '1', name: 'A2', sueldo: '  ' }]
  }, { now: () => 'T' });
  assert.equal('sueldo' in applied.users[0], false);

  assert.ok(roster);
});

// --- 7. Count correctness (repository counts + UI wiring) ---

test('repository counts distinguish created vs updated', () => {
  const { repo } = makeRepo([{ id: 'u1', name: 'A', number: '1', saProjectId: 'proj-1', saEmployeeId: 'e1' }]);
  const res = repo.importSaRoster(saEnvelope([
    { saEmployeeId: 'e1', number: '1', name: 'A2' },
    { saEmployeeId: 'e2', number: '2', name: 'B' }
  ]));
  assert.equal(res.updatedCount, 1);
  assert.equal(res.createdCount, 1);
  assert.equal(res.totalValid, 2);
  assert.equal(res.users.length, 2);
});

test('index.html SA route and legacy import use createdCount/updatedCount (count-mismatch fix)', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /createdCount: result\.createdCount/);
  assert.match(html, /updatedCount: result\.updatedCount/);
  assert.match(html, /result\.updatedCount\} actualizado\(s\), \$\{result\.createdCount\} agregado/);
  assert.doesNotMatch(html, /result\.created[^C]/);
  assert.doesNotMatch(html, /result\.updated[^C]/);
  // SA route is merge-only and explicitly blocks replace.
  assert.match(html, /importSaRoster\(roster/);
  assert.match(html, /Reemplazo deshabilitado para SA/);
  assert.match(html, /sa-roster-import\.js/);
});
