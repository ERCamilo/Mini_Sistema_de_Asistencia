const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const SaRosterImport = require('../sa-roster-import.js');
const EmployeeNumberRules = require('../employee-number-rules.js');
const EmployeeRepository = require('../employee-repository.js');

globalThis.SaRosterImport = SaRosterImport;

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/sa-roster-v1.example.json');
const SA_PROJECT_ID = 'PRJ-EJEMPLO-0001';
const GENERATED_AT = '2026-09-07T00:00:00.000Z';

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function makeRepo(initialUsers = [], now = () => '2026-09-07T00:00:00.000Z') {
  const storage = createMemoryStorage({ users: JSON.stringify(initialUsers) });
  const repo = EmployeeRepository.createEmployeeRepository({ storage, rules: EmployeeNumberRules, now });
  return { storage, repo };
}

function loadFixtureRaw() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// (1) Fixture classifies as SA and normalizes exact envelope + all 3 rows.
test('direction fixture classifies as SA and normalizes exact schema/version/generatedAt/saProjectId with 3 rows', () => {
  const raw = loadFixtureRaw();
  assert.equal(SaRosterImport.classifyImportPayload(raw).kind, 'sa');

  const roster = SaRosterImport.normalizeSaRoster(raw);
  assert.equal(roster.schema, 'sa-roster/v1');
  assert.equal(roster.version, 1);
  assert.equal(roster.saProjectId, SA_PROJECT_ID);
  assert.equal(roster.generatedAt, GENERATED_AT);
  assert.equal(roster.employees.length, 3);

  const bySaId = new Map(roster.employees.map((e) => [e.saEmployeeId, e]));
  assert.deepEqual(
    roster.employees.map((e) => e.saEmployeeId),
    ['EMP-001', 'EMP-002', 'EMP-003']
  );
  // Exact rows from the frozen fixture, including optional-field presence.
  assert.equal(bySaId.get('EMP-001').number, '1');
  assert.equal(bySaId.get('EMP-001').name, 'Ana García');
  assert.equal(bySaId.get('EMP-001').position, 'Oficial Albañil');
  assert.equal(bySaId.get('EMP-001').sueldo, '2500');
  assert.equal('paused' in bySaId.get('EMP-001'), false);

  assert.equal(bySaId.get('EMP-002').number, '2');
  assert.equal(bySaId.get('EMP-002').name, 'Luis Pérez');
  assert.equal(bySaId.get('EMP-002').paused, true);
  assert.equal('position' in bySaId.get('EMP-002'), false);
  assert.equal('sueldo' in bySaId.get('EMP-002'), false);

  assert.equal(bySaId.get('EMP-003').number, '3');
  assert.equal(bySaId.get('EMP-003').name, 'María López');
  assert.equal('position' in bySaId.get('EMP-003'), false);
  assert.equal('sueldo' in bySaId.get('EMP-003'), false);
  assert.equal('paused' in bySaId.get('EMP-003'), false);
});

// (2) Real import creates mappings addressable by getBySaIdentity with fixture-matching optional semantics.
test('importSaRoster(fixture) creates mappings addressable by getBySaIdentity with fixture optional semantics', () => {
  const { repo } = makeRepo([]);
  const raw = loadFixtureRaw();
  const res = repo.importSaRoster(raw);
  assert.equal(res.totalValid, 3);
  assert.equal(res.createdCount, 3);
  assert.equal(res.updatedCount, 0);

  const ana = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-001');
  const luis = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-002');
  const maria = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-003');
  assert.ok(ana);
  assert.ok(luis);
  assert.ok(maria);
  assert.equal(ana.name, 'Ana García');
  assert.equal(ana.number, '1');
  assert.equal(ana.position, 'Oficial Albañil');
  assert.equal(ana.sueldo, '2500');
  assert.equal(ana.paused, undefined);

  assert.equal(luis.name, 'Luis Pérez');
  assert.equal(luis.paused, true);
  assert.equal('sueldo' in luis, false);

  assert.equal(maria.name, 'María López');
  assert.equal('sueldo' in maria, false);
  assert.equal(maria.paused, undefined);
});

// (3) Second import is stable/non-destructive; unrelated local employee remains (merge-only).
test('second fixture import keeps stable local ids and unrelated local employee remains (merge-only)', () => {
  const { repo } = makeRepo([{ id: 'u-local-legacy', name: 'Local Only', number: '99' }]);
  const raw = loadFixtureRaw();

  const first = repo.importSaRoster(raw);
  assert.equal(first.createdCount, 3);
  assert.equal(repo.getAll().length, 4);

  const idsBefore = ['EMP-001', 'EMP-002', 'EMP-003'].map(
    (saId) => repo.getBySaIdentity(SA_PROJECT_ID, saId).id
  );

  const second = repo.importSaRoster(loadFixtureRaw());
  assert.equal(second.createdCount, 0);
  assert.equal(second.updatedCount, 3);
  assert.equal(repo.getAll().length, 4);

  const idsAfter = ['EMP-001', 'EMP-002', 'EMP-003'].map(
    (saId) => repo.getBySaIdentity(SA_PROJECT_ID, saId).id
  );
  assert.deepEqual(idsAfter, idsBefore);

  // Unrelated pre-existing local employee omitted from the roster is untouched.
  const legacy = repo.getById('u-local-legacy');
  assert.ok(legacy);
  assert.equal(legacy.name, 'Local Only');
  assert.equal(legacy.number, '99');
  assert.equal(legacy.saProjectId, undefined);
  assert.equal(legacy.saEmployeeId, undefined);
});

// (4) Attendance keyed by linked localId stays valid after update/re-import (history invariant, no remap).
test('attendance keyed by linked localId remains valid after update and re-import (no id remap)', () => {
  const { repo } = makeRepo([]);
  repo.importSaRoster(loadFixtureRaw());
  const linked = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-001');
  assert.ok(linked);

  // Established Mini history invariant: attendance rows are keyed by local id.
  const attendance = { '2026-09-07': { [linked.id]: { status: 'present', hours: 8 } } };
  assert.equal(attendance['2026-09-07'][linked.id].hours, 8);

  // Update path keeps the same local id (rename only), then plain re-import.
  const updated = clone(loadFixtureRaw());
  updated.employees[0].name = 'Ana García R.';
  const updateRes = repo.importSaRoster(updated);
  assert.equal(updateRes.updatedCount >= 1, true);
  const saved = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-001');
  assert.equal(saved.id, linked.id);
  assert.equal(saved.name, 'Ana García R.');
  assert.equal(repo.getById(linked.id).saEmployeeId, 'EMP-001');
  assert.equal(attendance['2026-09-07'][saved.id].hours, 8);

  const reimported = repo.importSaRoster(loadFixtureRaw());
  assert.equal(reimported.updatedCount, 3);
  const stable = repo.getBySaIdentity(SA_PROJECT_ID, 'EMP-001');
  assert.equal(stable.id, linked.id);
  assert.equal(attendance['2026-09-07'][stable.id].hours, 8);
  assert.ok(repo.getById(stable.id));
});

// (5) No scope.siteId == saProjectId claim: fixture carries no such mapping.
test('fixture makes no scope.siteId equals saProjectId claim (no such mapping added)', () => {
  const raw = loadFixtureRaw();
  const roster = SaRosterImport.normalizeSaRoster(raw);
  // The Direction freeze candidate is a roster envelope only; Mini attendance
  // scope.siteId stays independent and must never be equated to saProjectId here.
  assert.equal('scope' in raw, false);
  assert.equal('siteId' in raw, false);
  assert.equal('scope' in roster, false);
  assert.equal('siteId' in roster, false);
});

// (6) Unknown Group/Leader/private extras fail closed on a derived copy (fixture file untouched).
test('derived copy with extra Group/Leader/private fields fails closed via existing consumer contract', () => {
  const { repo } = makeRepo([]);
  repo.importSaRoster(loadFixtureRaw());
  const countBefore = repo.getAll().length;

  const withGroup = clone(loadFixtureRaw());
  withGroup.employees[0].group = 'G1';
  assert.equal(SaRosterImport.classifyImportPayload(withGroup).kind, 'sa');
  assert.throws(() => SaRosterImport.normalizeSaRoster(withGroup), /unsupported field/);
  assert.throws(() => repo.importSaRoster(withGroup), /unsupported field/);

  const withLeader = clone(loadFixtureRaw());
  withLeader.employees[1].leader = 'L1';
  assert.throws(() => SaRosterImport.normalizeSaRoster(withLeader), /unsupported field/);
  assert.throws(() => repo.importSaRoster(withLeader), /unsupported field/);

  const withPrivate = clone(loadFixtureRaw());
  withPrivate.employees[2].privateNote = 'confidencial';
  assert.throws(() => SaRosterImport.normalizeSaRoster(withPrivate), /unsupported field/);
  assert.throws(() => repo.importSaRoster(withPrivate), /unsupported field/);

  const withEnvelopeExtra = clone(loadFixtureRaw());
  withEnvelopeExtra.group = 'G1';
  assert.throws(() => SaRosterImport.normalizeSaRoster(withEnvelopeExtra), /unsupported field/);

  // Fail-closed: no partial persistence from the rejected derived copies.
  assert.equal(repo.getAll().length, countBefore);
});
