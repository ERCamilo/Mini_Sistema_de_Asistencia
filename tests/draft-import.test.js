const test = require('node:test');
const assert = require('node:assert/strict');

const rules = require('../employee-number-rules.js');
const { createDraftImport } = require('../draft-import.js');

const draftImport = createDraftImport(rules);
const {
  createSession,
  addRow,
  updateRow,
  removeRow,
  validateDraft,
  detectConflicts,
  resolveActiveConflict,
  buildCommitPlan
} = draftImport;

// ---------------------------------------------------------------------------
// Phase 1/2: Draft-List Lifecycle
// ---------------------------------------------------------------------------

test('createSession starts with the given existing users and an empty draft list', () => {
  const session = createSession([]);

  assert.deepEqual(session.rows, []);
});

test('an empty draft list reports zero rows and zero incomplete rows', () => {
  const session = createSession([]);
  const validation = validateDraft(session);

  assert.equal(session.rows.length, 0);
  assert.equal(validation.incompleteRowIds.length, 0);
});

test('editing one row does not affect another row in the same draft', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Ana', number: '1', position: 'Admin' });
  session = addRow(session, { name: 'Bruno', number: '2', position: 'Ops' });
  const [first, second] = session.rows;

  const updated = updateRow(session, first.rowId, { name: 'Ana María' });

  assert.equal(updated.rows[0].name, 'Ana María');
  assert.deepEqual(updated.rows[1], second);
});

test('removeRow removes only the targeted row', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Ana' });
  session = addRow(session, { name: 'Bruno' });
  const [first, second] = session.rows;

  const updated = removeRow(session, first.rowId);

  assert.equal(updated.rows.length, 1);
  assert.equal(updated.rows[0].rowId, second.rowId);
});

// ---------------------------------------------------------------------------
// Phase 3: Position-Required Commit Gate
// ---------------------------------------------------------------------------

test('a row missing position blocks the gate and refuses commit-plan generation', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Ana', number: '1', position: '' });
  const validation = validateDraft(session);

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.incompleteRowIds, [session.rows[0].rowId]);

  session = detectConflicts(session);
  const plan = buildCommitPlan(session, () => 'new-id');
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'gate');
});

test('empty sueldo never blocks the gate', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Ana', number: '1', position: 'Admin', sueldo: '' });
  const validation = validateDraft(session);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.incompleteRowIds, []);
});

// ---------------------------------------------------------------------------
// Phase 4: Per-Draft Number-Conflict Detection
// ---------------------------------------------------------------------------

test('a draft row colliding with an existing employee is reported as conflicting', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '007', position: 'Ops' });

  session = detectConflicts(session);

  assert.ok(session.queue.active);
  assert.equal(session.queue.active.ownerKind, 'existing');
  assert.equal(session.queue.active.ownerEmployeeId, 'e1');
  assert.equal(session.queue.active.rowId, session.rows[0].rowId);
});

test('two draft rows sharing the same number are reported as conflicting with each other', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'R1', number: '12', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '12', position: 'Ops' });

  session = detectConflicts(session);

  assert.ok(session.queue.active);
  assert.equal(session.queue.active.ownerKind, 'draft');
  assert.equal(session.queue.active.rowId, session.rows[1].rowId);
  assert.equal(session.queue.active.ownerRowId, session.rows[0].rowId);
});

test('existing-owner conflict exposes the existing employee identifying info and exact actions', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin', sueldo: '1000' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '007', position: 'Ops' });

  session = detectConflicts(session);
  const conflict = session.queue.active;

  assert.equal(conflict.ownerKind, 'existing');
  assert.equal(conflict.ownerEmployeeId, 'e1');
  assert.deepEqual(conflict.ownerDetails, { number: '7', position: 'Admin', sueldo: '1000' });
  assert.deepEqual(conflict.actions, ['suggest', 'discard-new', 'return']);
});

test('draft-owner conflict offers suggest/proceed/return, no discard-new', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'R1', number: '12', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '12', position: 'Ops' });

  session = detectConflicts(session);

  assert.deepEqual(session.queue.active.actions, ['suggest', 'proceed', 'return']);
});

test('existing-owner conflict takes precedence over a draft-vs-draft conflict on the same row', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '5', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'R1', number: '5', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '5', position: 'Ops' });

  session = detectConflicts(session);

  assert.equal(session.queue.active.ownerKind, 'existing');
  assert.equal(session.queue.active.rowId, session.rows[0].rowId);
});

// ---------------------------------------------------------------------------
// Phase 5: Conflict Resolution + Cycle-Breaker
// ---------------------------------------------------------------------------

test('resolve via suggest marks the conflict resolved without opening a new conflict', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '7', position: 'Ops' });
  session = detectConflicts(session);

  const suggested = session.queue.active.suggestedNumber;
  session = resolveActiveConflict(session, 'suggest');

  assert.equal(session.rows[0].number, String(suggested));
  assert.equal(session.queue.active, null);
});

test('resolve via return flags the row and leaves no active conflict when none remain', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '7', position: 'Ops' });
  session = detectConflicts(session);

  const rowId = session.queue.active.rowId;
  session = resolveActiveConflict(session, 'return');

  assert.equal(session.queue.active, null);
  assert.ok(session.queue.flaggedRowIds.includes(rowId));
});

test('discard-new removes the duplicate draft row without touching existing employees', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '007', position: 'Ops' });
  const rowId = session.rows[0].rowId;
  session = detectConflicts(session);

  session = resolveActiveConflict(session, 'discard-new');

  assert.equal(session.rows.find(row => row.rowId === rowId), undefined);
  assert.deepEqual(session.existingUsers, existing);
});

test('proceed on a draft-vs-draft conflict chains to the displaced draft row', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'R1', number: '10', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '10', position: 'Ops' });
  session = detectConflicts(session);

  const firstConflict = session.queue.active;
  assert.equal(firstConflict.rowId, session.rows[1].rowId); // R2 conflicts (R1 first in scan order)

  session = resolveActiveConflict(session, 'proceed');

  assert.ok(session.queue.active);
  assert.equal(session.queue.active.ownerKind, 'draft');
  assert.equal(session.queue.active.rowId, session.rows[0].rowId); // now R1 is in conflict
});

test('ping-pong worked example (design §3.5): second proceed trips the visited-set guard', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'R1', number: '10', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '10', position: 'Ops' });
  const r1Id = session.rows[0].rowId;

  session = detectConflicts(session); // active = conflict for R2 (owner R1)
  session = resolveActiveConflict(session, 'proceed'); // R2 resolved, active = conflict for R1 (owner R2)
  assert.equal(session.queue.active.rowId, r1Id);

  session = resolveActiveConflict(session, 'proceed'); // proceed again on R1 -> guard fires

  assert.equal(session.queue.terminated, true);
  assert.equal(session.queue.active, null);
  assert.ok(session.queue.flaggedRowIds.includes(r1Id));
});

test('depth-cap chain over distinct numbers terminates at the 6th hop (MAX_CHAIN_DEPTH = 5)', () => {
  // DEVIATION NOTE (documented, see apply report): design §3.3 step 5 always
  // re-targets the SAME contested number `N` for the remainder of one
  // `proceed` chain ("recompute who now owns N" — N never changes mid-chain),
  // so a literal implementation of §3.3 can only ever reach the depth cap by
  // ping-ponging the SAME number repeatedly — it can never naturally visit
  // 5 DISTINCT numbers within one chain (confirmed by tracing the algorithm).
  // Design §3.5's own "10->11->12->13->14->15 distinct numbers" prose example
  // is therefore unreachable through the row-topology + repeated-`proceed`
  // mechanism as literally specified; it appears to describe the depth-cap
  // GUARD in isolation, independent of the specific keys it accumulates.
  // This test exercises that exact guard condition directly: a `visited` set
  // already holding 5 DISTINCT keys (depth=5) plus one more `proceed` hop
  // landing on a 6th, not-yet-visited key — proving `depth + 1 > MAX_CHAIN_DEPTH`
  // fires independently of the visited-set membership check, matching the
  // spec's literal assertion ("the depth cap... fires") and design's constant
  // `MAX_CHAIN_DEPTH = 5`.
  let session = createSession([]);
  session = addRow(session, { name: 'R1', number: '15', position: 'Ops' });
  session = addRow(session, { name: 'R2', number: '15', position: 'Ops' });

  session = detectConflicts(session);
  const conflict = session.queue.active;
  assert.ok(conflict);

  // Simulate having already chained through 5 distinct prior hops (10..14)
  // without tripping the visited-set guard, landing on this 6th conflict (15).
  session = {
    ...session,
    queue: { ...session.queue, visited: ['10', '11', '12', '13', '14'], depth: 5 }
  };

  session = resolveActiveConflict(session, 'proceed');

  assert.equal(session.queue.terminated, true);
  assert.equal(session.queue.active, null);
  assert.ok(session.queue.flaggedRowIds.includes(conflict.rowId));
});

// ---------------------------------------------------------------------------
// Phase 6: Additive Commit Plan
// ---------------------------------------------------------------------------

test('clean draft commits correctly: existing + new rows appended, existing fields untouched', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo1', number: '8', position: 'Ops' });
  session = addRow(session, { name: 'Nuevo2', number: '9', position: 'Ops' });
  session = detectConflicts(session);

  let counter = 0;
  const plan = buildCommitPlan(session, () => `gen-${++counter}`);

  assert.equal(plan.ok, true);
  assert.equal(plan.finalUsers.length, 3);
  assert.equal(plan.finalUsers[0], existing[0]);
  assert.equal(plan.newEmployees.length, 2);
  assert.equal(plan.newEmployees[0].name, 'Nuevo1');
  assert.equal(plan.newEmployees[1].name, 'Nuevo2');
});

test('existing ids and attendance-key invariant: every existing element is === at the same order', () => {
  const existing = [
    { id: 'e1', name: 'Ana', number: '7', position: 'Admin' },
    { id: 'e2', name: 'Bruno', number: '8', position: 'Ops' }
  ];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '9', position: 'Ops' });
  session = detectConflicts(session);

  const plan = buildCommitPlan(session, () => 'gen-1');

  assert.equal(plan.ok, true);
  existing.forEach((employee, index) => {
    assert.equal(plan.finalUsers[index], employee);
  });
});

test('gate refusal: commit plan is refused with reason "gate" when a row is missing position', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Nuevo', number: '1', position: '' });
  session = detectConflicts(session);

  const plan = buildCommitPlan(session, () => 'gen-1');

  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'gate');
});

test('conflict refusal: commit plan is refused with reason "conflicts" while a conflict is active', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo', number: '7', position: 'Ops' });
  session = detectConflicts(session);

  assert.ok(session.queue.active);
  const plan = buildCommitPlan(session, () => 'gen-1');

  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'conflicts');
});

test('injected generateId collision disambiguation: a repeated id gets a numeric suffix', () => {
  const existing = [{ id: 'e1', name: 'Ana', number: '7', position: 'Admin' }];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo1', number: '8', position: 'Ops' });
  session = addRow(session, { name: 'Nuevo2', number: '9', position: 'Ops' });
  session = detectConflicts(session);

  const stubId = () => 'dup-id';
  const plan = buildCommitPlan(session, stubId);

  assert.equal(plan.ok, true);
  assert.equal(plan.newEmployees.length, 2);
  const ids = plan.newEmployees.map(employee => employee.id);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.includes('dup-id'));
  assert.ok(ids.includes('dup-id-1'));
});

test('sueldo passthrough: present value persists on the committed record', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Nuevo', number: '1', position: 'Ops', sueldo: '50000' });
  session = detectConflicts(session);

  const plan = buildCommitPlan(session, () => 'gen-1');

  assert.equal(plan.ok, true);
  assert.equal(plan.newEmployees[0].sueldo, '50000');
});

test('sueldo absent does not block or corrupt commit', () => {
  let session = createSession([]);
  session = addRow(session, { name: 'Nuevo', number: '1', position: 'Ops' });
  session = detectConflicts(session);

  const plan = buildCommitPlan(session, () => 'gen-1');

  assert.equal(plan.ok, true);
  assert.equal(plan.newEmployees[0].sueldo, '');
});

test('additive path never wipes existing employees across any sequence of commits', () => {
  const existing = [
    { id: 'e1', name: 'Ana', number: '1', position: 'Admin' },
    { id: 'e2', name: 'Bruno', number: '2', position: 'Ops' }
  ];
  let session = createSession(existing);
  session = addRow(session, { name: 'Nuevo1', number: '3', position: 'Ops' });
  session = detectConflicts(session);
  const plan1 = buildCommitPlan(session, () => 'n1');
  assert.equal(plan1.ok, true);

  let session2 = createSession(plan1.finalUsers);
  session2 = addRow(session2, { name: 'Nuevo2', number: '4', position: 'Ops' });
  session2 = detectConflicts(session2);
  const plan2 = buildCommitPlan(session2, () => 'n2');

  assert.equal(plan2.ok, true);
  assert.equal(plan2.finalUsers.length, 4);
  existing.forEach(employee => {
    assert.ok(plan2.finalUsers.some(user => user.id === employee.id && user.name === employee.name));
  });
});
