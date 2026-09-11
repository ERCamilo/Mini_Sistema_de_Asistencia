const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Guard = require('../sa-roster-version-guard.js');

const T1 = '2026-09-07T00:00:00.000Z';
const T2 = '2026-09-08T00:00:00.000Z';
const T2_PLUS_1MS = '2026-09-08T00:00:00.001Z';

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    __map: map
  };
}

function makeGuard(storage, storageKey) {
  const opts = storage ? { storage } : {};
  if (storageKey) opts.storageKey = storageKey;
  return Guard.createSaRosterVersionGuard(opts);
}

function roster(project, generatedAt, rosterVersion, extra = {}) {
  const out = { schema: 'sa-roster/v1', version: 1, saProjectId: project, employees: [], ...extra };
  if (generatedAt !== undefined) out.generatedAt = generatedAt;
  if (rosterVersion !== undefined) out.rosterVersion = rosterVersion;
  return out;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// --- 1. first: no prior applied roster ---

test('first incoming with valid markers classifies as first and records nothing until markApplied', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  assert.equal(guard.getLastApplied('proj-1'), null);

  const incoming = roster('proj-1', T1, 'v1');
  const decision = guard.classifyIncoming(incoming);
  assert.equal(decision.outcome, 'first');
  assert.equal(decision.reason, 'no-prior-applied-roster');
  assert.equal(decision.applied, null);
  assert.equal(decision.saProjectId, 'proj-1');
  assert.deepEqual(decision.incoming, { rosterVersion: 'v1', generatedAt: T1 });

  // classify is read-only: still first, still no stored record.
  assert.equal(guard.classifyIncoming(incoming).outcome, 'first');
  assert.equal(guard.getLastApplied('proj-1'), null);
});

// --- 2. newer / older / equal ---

test('newer incoming is distinguishable from equal; older is blockable by caller', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));

  const newer = guard.classifyIncoming(roster('proj-1', T2, 'v1'));
  assert.equal(newer.outcome, 'newer');
  assert.equal(newer.reason, 'incoming-newer');
  assert.deepEqual(newer.applied, { rosterVersion: 'v1', generatedAt: T1 });
  assert.deepEqual(newer.incoming, { rosterVersion: 'v1', generatedAt: T2 });

  const equal = guard.classifyIncoming(roster('proj-1', T1, 'v1'));
  assert.equal(equal.outcome, 'equal');
  assert.equal(equal.reason, 'identical-freshness-markers');
  // Equal must be distinguishable from newer: distinct outcome strings.
  assert.notEqual(equal.outcome, newer.outcome);

  const sameInstantConflict = guard.classifyIncoming(roster('proj-1', T1, 'v9'));
  assert.equal(sameInstantConflict.outcome, 'ambiguous');
  // T1 < T2 once T2 is applied; first advance the stored marker.
  guard.markApplied(roster('proj-1', T2, 'v1'));
  const stale = guard.classifyIncoming(roster('proj-1', T1, 'v9'));
  assert.equal(stale.outcome, 'older');
  assert.equal(stale.reason, 'incoming-older');
  // Caller blocks older explicitly on the outcome.
  const shouldBlock = stale.outcome === 'older' || stale.outcome === 'ambiguous';
  assert.equal(shouldBlock, true);
  assert.equal(sameInstantConflict.outcome, 'ambiguous');
});

test('1ms deterministic ISO ordering decides newer/older', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T2, 'v1'));
  assert.equal(guard.classifyIncoming(roster('proj-1', T2_PLUS_1MS, 'v1')).outcome, 'newer');
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, 'v1')).outcome, 'equal');
});

test('equal covers both-versions-present-and-identical and both-versions-absent', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  assert.equal(guard.classifyIncoming(roster('proj-1', T1, 'v1')).outcome, 'equal');

  const guard2 = makeGuard(createMemoryStorage());
  guard2.markApplied(roster('proj-1', T1, undefined));
  const decision = guard2.classifyIncoming(roster('proj-1', T1, undefined));
  assert.equal(decision.outcome, 'equal');
  assert.deepEqual(decision.incoming, { generatedAt: T1 });
});

test('newer/older ignore rosterVersion differences; timestamp is authoritative', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, 'v2-different')).outcome, 'newer');
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, undefined)).outcome, 'newer');
  guard.markApplied(roster('proj-1', T2, 'v2'));
  assert.equal(guard.classifyIncoming(roster('proj-1', T1, 'v-anything')).outcome, 'older');
});

// --- 3. ambiguous: equal timestamp with conflicting version fails closed ---

test('equal timestamp with conflicting version is ambiguous (fail closed)', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));

  const conflict = guard.classifyIncoming(roster('proj-1', T1, 'v2'));
  assert.equal(conflict.outcome, 'ambiguous');
  assert.equal(conflict.reason, 'equal-timestamp-conflicting-version');
  assert.deepEqual(conflict.applied, { rosterVersion: 'v1', generatedAt: T1 });

  // Missing vs present version at the same instant is also a conflict.
  const missingVsPresent = guard.classifyIncoming(roster('proj-1', T1, undefined));
  assert.equal(missingVsPresent.outcome, 'ambiguous');
  assert.equal(missingVsPresent.reason, 'equal-timestamp-conflicting-version');
});

test('present-vs-absent version conflict is symmetric', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, undefined));
  const conflict = guard.classifyIncoming(roster('proj-1', T1, 'v1'));
  assert.equal(conflict.outcome, 'ambiguous');
  assert.equal(conflict.reason, 'equal-timestamp-conflicting-version');
});

// --- 4. malformed / missing timestamp policy ---

test('missing generatedAt is ambiguous, never first', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  const noKey = roster('proj-1', undefined, 'v1');
  delete noKey.generatedAt;
  const decision = guard.classifyIncoming(noKey);
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.reason, 'missing-generatedAt');
  assert.equal(decision.applied, null);
  assert.equal(guard.getLastApplied('proj-1'), null);

  // Even against stored state, missing stays ambiguous (not older/newer).
  guard.markApplied(roster('proj-1', T1, 'v1'));
  const againstStored = guard.classifyIncoming(noKey);
  assert.equal(againstStored.outcome, 'ambiguous');
  assert.equal(againstStored.reason, 'missing-generatedAt');
  assert.deepEqual(againstStored.applied, { rosterVersion: 'v1', generatedAt: T1 });
});

test('malformed generatedAt values are ambiguous (fail closed)', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  const badValues = [
    'not-a-date',
    '2026-09-07',
    '2026-09-07T00:00:00Z',
    '2026-09-07 00:00:00',
    '  ',
    12345,
    '2026-13-40T99:99:99.000Z'
  ];
  for (const bad of badValues) {
    const decision = guard.classifyIncoming(roster('proj-1', bad, 'v1'));
    assert.equal(decision.outcome, 'ambiguous', `expected ambiguous for ${JSON.stringify(bad)}`);
    assert.equal(decision.reason, 'malformed-generatedAt');
  }
  // Same-instant non-canonical form is NOT equal: it is ambiguous.
  const nonCanonical = guard.classifyIncoming(roster('proj-1', '2026-09-07T00:00:00Z', 'v1'));
  assert.equal(nonCanonical.outcome, 'ambiguous');
});

test('malformed saProjectId throws fail-closed on classify/markApplied/getLastApplied', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  const badProjects = [undefined, null, '', '   ', 'has space', 'a\nb', 123, {}, []];
  for (const bad of badProjects) {
    assert.throws(() => guard.classifyIncoming(roster(bad, T1, 'v1')), /saProjectId is malformed/);
    assert.throws(() => guard.markApplied(roster(bad, T1, 'v1')), /saProjectId is malformed/);
  }
  assert.throws(() => guard.classifyIncoming(null), /saProjectId is malformed/);
  assert.throws(() => guard.classifyIncoming('string'), /saProjectId is malformed/);
  assert.throws(() => guard.getLastApplied('has space'), /saProjectId is malformed/);
});

test('malformed rosterVersion is ambiguous on classify and throws on markApplied', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  for (const bad of ['', '   ', 123, {}, []]) {
    const decision = guard.classifyIncoming(roster('proj-1', T1, bad));
    assert.equal(decision.outcome, 'ambiguous');
    assert.equal(decision.reason, 'malformed-rosterVersion');
    assert.throws(() => guard.markApplied(roster('proj-1', T2, bad)), /rosterVersion is malformed/);
  }
  // Failed markApplied does not clobber the stored marker.
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T1 });
});

test('markApplied rejects malformed generatedAt without persisting', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  assert.throws(() => guard.markApplied(roster('proj-1', 'not-a-date', 'v1')), /generatedAt must be ISO-8601/);
  assert.throws(() => guard.markApplied(roster('proj-1', '2026-09-07T00:00:00Z', 'v1')), /generatedAt must be ISO-8601/);
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T1 });
});

// --- 5. project isolation ---

test('guard state is isolated per saProjectId', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-A', T2, 'v1'));

  // Other projects are untouched: still first.
  const firstB = guard.classifyIncoming(roster('proj-B', T1, 'v1'));
  assert.equal(firstB.outcome, 'first');
  assert.equal(guard.getLastApplied('proj-B'), null);
  assert.deepEqual(guard.getLastApplied('proj-A'), { saProjectId: 'proj-A', rosterVersion: 'v1', generatedAt: T2 });

  // Advancing B does not move A.
  guard.markApplied(roster('proj-B', T1, 'v9'));
  assert.deepEqual(guard.getLastApplied('proj-A'), { saProjectId: 'proj-A', rosterVersion: 'v1', generatedAt: T2 });
  assert.deepEqual(guard.getLastApplied('proj-B'), { saProjectId: 'proj-B', rosterVersion: 'v9', generatedAt: T1 });
  assert.equal(guard.classifyIncoming(roster('proj-A', T1, 'v1')).outcome, 'older');
  assert.equal(guard.classifyIncoming(roster('proj-B', T2, 'v9')).outcome, 'newer');
});

// --- 6. persistence / corruption ---

test('applied markers persist across guard instances on the same storage', () => {
  const storage = createMemoryStorage();
  makeGuard(storage).markApplied(roster('proj-1', T2, 'v7'));
  const reloaded = makeGuard(storage);
  assert.deepEqual(reloaded.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v7', generatedAt: T2 });
  assert.equal(reloaded.classifyIncoming(roster('proj-1', T2, 'v7')).outcome, 'equal');
  assert.equal(reloaded.classifyIncoming(roster('proj-1', T1, 'v7')).outcome, 'older');
});

test('corrupt store JSON fails closed to ambiguous and heals on next markApplied', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));
  storage.setItem(Guard.STORAGE_KEY, '{not-json');

  const decision = guard.classifyIncoming(roster('proj-1', T2, 'v1'));
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.reason, 'corrupt-store');
  assert.equal(decision.applied, null);
  assert.equal(guard.getLastApplied('proj-1'), null);

  // Explicit markApplied overwrites the corruption.
  guard.markApplied(roster('proj-1', T2, 'v1'));
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T2 });
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, 'v1')).outcome, 'equal');
});

test('non-object store payload fails closed to ambiguous', () => {
  for (const bad of ['[]', '"str"', '42', 'null']) {
    const storage = createMemoryStorage();
    const guard = makeGuard(storage);
    storage.setItem(Guard.STORAGE_KEY, bad);
    const decision = guard.classifyIncoming(roster('proj-1', T1, 'v1'));
    assert.equal(decision.outcome, 'ambiguous');
    assert.equal(decision.reason, 'corrupt-store');
  }
});

test('tampered per-project entry fails closed to ambiguous', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T1, 'v1'));

  storage.setItem(Guard.STORAGE_KEY, JSON.stringify({ 'proj-1': 'tampered' }));
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, 'v1')).outcome, 'ambiguous');
  assert.equal(guard.getLastApplied('proj-1'), null);

  storage.setItem(Guard.STORAGE_KEY, JSON.stringify({ 'proj-1': { rosterVersion: 'v1', generatedAt: 'tampered' } }));
  const decision = guard.classifyIncoming(roster('proj-1', T2, 'v1'));
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.reason, 'missing-or-malformed-stored-markers');
});

test('stored roster without generatedAt makes every future compare ambiguous', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  // markApplied allows a missing timestamp (reviewed apply without markers).
  const stored = guard.markApplied(roster('proj-1', undefined, 'v1'));
  assert.deepEqual(stored, { saProjectId: 'proj-1', rosterVersion: 'v1' });
  const decision = guard.classifyIncoming(roster('proj-1', T1, 'v1'));
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.reason, 'missing-or-malformed-stored-markers');
});

// --- 7. record only after explicit markApplied ---

test('classify never persists: older/ambiguous/newer leave the stored marker untouched', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  guard.markApplied(roster('proj-1', T2, 'v1'));

  assert.equal(guard.classifyIncoming(roster('proj-1', T1, 'v1')).outcome, 'older');
  assert.equal(guard.classifyIncoming(roster('proj-1', T2_PLUS_1MS, 'v1')).outcome, 'newer');
  assert.equal(guard.classifyIncoming(roster('proj-1', T2, 'v-other')).outcome, 'ambiguous');
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T2 });

  // Only an explicit markApplied advances the marker.
  guard.markApplied(roster('proj-1', T2_PLUS_1MS, 'v1'));
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T2_PLUS_1MS });
});

// --- 8. safety: no employee/attendance mutation, minimal persistence, source preserved ---

test('guard never touches employee/attendance keys and persists only markers', () => {
  const storage = createMemoryStorage({
    users: JSON.stringify([{ id: 'u1', name: 'Ana', number: '1' }]),
    weeklyAttendance: JSON.stringify({ '2026-09-07': {} })
  });
  const guard = makeGuard(storage);
  const usersBefore = storage.getItem('users');
  const attendanceBefore = storage.getItem('weeklyAttendance');

  guard.classifyIncoming(roster('proj-1', T1, 'v1', { employees: [{ saEmployeeId: 'e1', number: '1', name: 'A' }] }));
  guard.markApplied(roster('proj-1', T1, 'v1', { employees: [{ saEmployeeId: 'e1', number: '1', name: 'A' }] }));
  guard.classifyIncoming(roster('proj-1', T2, 'v1'));

  assert.equal(storage.getItem('users'), usersBefore);
  assert.equal(storage.getItem('weeklyAttendance'), attendanceBefore);

  const raw = JSON.parse(storage.getItem(Guard.STORAGE_KEY));
  assert.deepEqual(Object.keys(raw), ['proj-1']);
  assert.deepEqual(raw['proj-1'], { rosterVersion: 'v1', generatedAt: T1 });
  assert.equal('employees' in raw['proj-1'], false);
});

test('guard preserves source data: inputs are never mutated and stored copies are detached', () => {
  const storage = createMemoryStorage();
  const guard = makeGuard(storage);
  const incoming = roster('proj-1', T1, 'v1', { employees: [{ saEmployeeId: 'e1', number: '1', name: 'A' }] });
  const before = clone(incoming);
  guard.classifyIncoming(incoming);
  assert.deepEqual(incoming, before);

  const applied = roster('proj-1', T2, 'v2');
  guard.markApplied(applied);
  applied.rosterVersion = 'MUTATED';
  applied.generatedAt = T1;
  applied.saProjectId = 'MUTATED';
  assert.deepEqual(guard.getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v2', generatedAt: T2 });
});

test('guard module stays isolated: no employee/attendance keys referenced', () => {
  const source = readFileSync(path.resolve(__dirname, '../sa-roster-version-guard.js'), 'utf8');
  assert.doesNotMatch(source, /weeklyAttendance/);
  assert.doesNotMatch(source, /['"]users['"]/);
});
