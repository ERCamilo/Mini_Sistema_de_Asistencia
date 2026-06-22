# Design: draft-import-core (Slice 1)

Project: Asistencia mini — offline PWA, vanilla JS + TypeScript (tsc, `module:"none"`).
Artifact store: file-based (Engram unavailable). Language: English.
Inputs read: proposal.md, `src/employee-number-rules.ts`, `tsconfig.json`,
`index.html` (loadData/saveData ~1798, conflict modal glue ~2059-2133,
readEmployeeDraft ~2079, user-form submit ~2249, doImportEmployeesFromText ~2458).

This design is meant to be directly implementable by `sdd-tasks` with NO further
architectural decisions. Every public signature, data structure, and the
cycle-breaker mechanism are pinned below.

---

## 1. Architecture approach

**Pattern: pure functional core + thin DOM shell (hexagonal-lite).**

- All decision logic (validation, conflict detection over a batch, conflict
  resolution, chaining, additive commit planning) lives in a NEW pure module
  `src/draft-import.ts`. It is side-effect-free: it takes inputs and returns new
  state objects. No DOM, no `localStorage`, no `Date.now()` *inside the pure
  decision functions* (id generation is injected — see §4).
- `index.html` is the adapter/shell: it owns the DOM, the singleton conflict
  modal, the `users` array, and `saveData()`. It calls `DraftImport` functions
  and renders whatever state they return.
- `draft-import.ts` **COMPOSES** `employee-number-rules` for every single-pair
  number decision. It does NOT reimplement normalization, conflict-finding, or
  next-number logic. `draft-import` owns *orchestration over many rows + the
  chaining state machine*; `employee-number-rules` owns *the single-pair
  decision*.

**Layering / boundaries:**

```
index.html (DOM shell)
   │  calls, passes plain data + id-generator
   ▼
window.DraftImport  ── composes ──▶  window.EmployeeNumberRules
   (batch orchestration,                (single-pair: normalize,
    chaining state machine,              findConflict, getNext, swap)
    additive commit plan)
```

`draft-import.ts` declares `EmployeeNumberRules` as an injected dependency
(passed into a `createDraftImport(rules)` factory) so the pure module is unit
-testable in `node --test` by `require('../employee-number-rules')`, mirroring
the existing convention. This avoids a hard global coupling and keeps both
modules independently testable.

---

## 2. Module boundary: `src/draft-import.ts`

### 2.1 UMD wrapper (same convention as employee-number-rules)

```ts
declare const module: { exports: unknown } | undefined;

(function exposeDraftImport(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.DraftImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDraftImportApi() {
  // ... pure functions returned as an object literal ...
  return { /* public API below */ };
});
```

Compiled by existing `tsc` (`pretest: tsc`) → root `draft-import.js`. Browser
gets `window.DraftImport`; node gets `module.exports`.

### 2.2 Shared types (re-declared locally; `module:"none"` has no imports)

Because `module:"none"` forbids `import`, the few shared shapes are
**re-declared** in `draft-import.ts` (structurally compatible with
`employee-number-rules`). This is intentional duplication of *types only*, not
logic. `sueldo` is additive (see §4).

```ts
type EmployeeId = string;

interface Employee {
  id: EmployeeId;
  name: string;
  number: string;        // STRING at runtime (preserves leading zeros)
  position?: string;
  sueldo?: string;       // NEW — optional, non-gating
  [extra: string]: unknown;
}

/** One editable row the user is drafting. Not yet persisted. */
interface DraftRow {
  rowId: string;         // stable client-side key for the row (NOT the employee id)
  name: string;
  number: string;        // string, may be '' while editing
  position: string;      // gated: must be non-empty to commit
  sueldo: string;        // optional, never gates
}

/** Result of validating the whole draft list against the position gate. */
interface DraftValidation {
  ok: boolean;                       // true only if EVERY row passes the gate
  incompleteRowIds: string[];        // rows missing position (the gate)
  // sueldo intentionally NOT here — never gates
}

/** A single active conflict for one draft row, surfaced to the modal. */
interface DraftConflict {
  rowId: string;                     // which draft row is in conflict
  number: string;                    // the colliding number (as typed)
  /** Owner is either an existing committed Employee or another draft row. */
  ownerKind: 'existing' | 'draft';
  ownerEmployeeId: EmployeeId | null;// set when ownerKind === 'existing'
  ownerRowId: string | null;         // set when ownerKind === 'draft'
  ownerName: string;
  /** Existing-owner display info so the user can confirm "is this the same
   *  person I'm re-adding?". Populated ONLY when ownerKind === 'existing'. */
  ownerDetails: { number: string; position?: string; sueldo?: string } | null;
  message: string;
  suggestedNumber: number;           // from rules.getNextEmployeeNumber over full pool
  /** Actions depend on ownerKind (see §3.3):
   *  - existing → ['suggest','discard-new','return']  (NO chaining)
   *  - draft    → ['suggest','proceed','return']       (proceed may chain one level) */
  actions: readonly DraftConflictAction[];
}

type DraftConflictAction = 'suggest' | 'proceed' | 'discard-new' | 'return';
// 'suggest'      → set row.number = suggestedNumber (next free), conflict-free, resolves row
// 'proceed'      → (DRAFT-owner only) keep typed number; CHAINS to the other draft row's
//                  conflict (one guarded level, §3)
// 'discard-new'  → (EXISTING-owner only) remove THIS draft row — user confirmed it
//                  duplicates an already-existing employee. Safe: the draft was never
//                  committed, so no existing id / attendanceData is touched.
// 'return'       → abandon resolution for this row; row left flagged/unresolved

/** Full draft-import session state — single source of truth, immutable updates. */
interface DraftSession {
  rows: DraftRow[];
  existingUsers: Employee[];         // snapshot of current roster (ids untouched)
  queue: ConflictQueueState;         // chaining state machine (see §3)
}

/** The conflict queue / chaining state machine. */
interface ConflictQueueState {
  active: DraftConflict | null;      // the ONE conflict the singleton modal shows
  resolvedRowIds: string[];          // rows whose conflict was resolved this session
  visited: string[];                 // visited-set keys for cycle-breaker (§3)
  depth: number;                     // current chain depth for cycle-breaker (§3)
  terminated: boolean;               // true when guard fired this chain
  flaggedRowIds: string[];           // rows left unresolved by guard/return
}
```

### 2.3 Public API (function signatures)

All functions are **pure**: `(state, args) => newState`. No mutation.

```ts
interface DraftImportApi {
  // ---- Draft list lifecycle ----
  createSession(existingUsers: Employee[]): DraftSession;
  addRow(session: DraftSession, partial?: Partial<DraftRow>): DraftSession;
  updateRow(session: DraftSession, rowId: string, patch: Partial<DraftRow>): DraftSession;
  removeRow(session: DraftSession, rowId: string): DraftSession;

  // ---- Position gate (validation as pure data) ----
  validateDraft(session: DraftSession): DraftValidation;

  // ---- Conflict detection over the whole batch ----
  // Scans every row against existingUsers AND other rows; opens the FIRST
  // conflict as `active`. Returns updated session with queue.active set (or null
  // if no conflicts). Resets cycle-breaker (visited/depth) for a fresh scan.
  detectConflicts(session: DraftSession): DraftSession;

  // ---- Conflict resolution (drives the chaining state machine, §3) ----
  resolveActiveConflict(
    session: DraftSession,
    action: DraftConflictAction
  ): DraftSession;

  // ---- Additive commit plan (§4) ----
  // Pure: returns the plan. Does NOT touch localStorage or attendanceData.
  // `generateId` is injected by the shell (wraps Date.now()/random).
  buildCommitPlan(
    session: DraftSession,
    generateId: () => EmployeeId
  ): CommitPlan;
}

interface CommitPlan {
  ok: boolean;                       // false if gate failed or unresolved conflicts remain
  reason: 'gate' | 'conflicts' | null;
  existingUsers: Employee[];         // EXACTLY the input existing users, ids untouched
  newEmployees: Employee[];          // fresh rows with NEW unique ids
  finalUsers: Employee[];            // existingUsers concat newEmployees (what shell persists)
}
```

`detectConflicts` and `resolveActiveConflict` internally call
`rules.findEmployeeNumberConflict`, `rules.normalizeEmployeeNumber`, and
`rules.getNextEmployeeNumber`. `buildCommitPlan` calls
`rules.normalizeEmployeeNumber` only to dedupe-check. No single-pair logic is
re-implemented.

---

## 3. THE CYCLE-BREAKER (highest-priority decision — resolved concretely)

### 3.1 Mechanism: visited-set + hard depth cap, BOTH

We use **both** guards because they catch different cycle shapes:

- **Visited-set** catches the deterministic ping-pong (same number revisited).
- **Depth cap** is a hard backstop for any non-obvious cycle or future action
  that the visited-set key does not capture.

**Visited-set key:** the **normalized number** that the chain is currently
landing on, i.e. `String(rules.normalizeEmployeeNumber(number))`. We key on the
*number*, not `(number, owner)`, because the hazard is "the chain keeps arriving
at a number that already has an owner." Once a number has been visited in this
chain, arriving at it again means we are looping.

**Depth cap:** `MAX_CHAIN_DEPTH = 5`. Concrete constant in the module. A single
`proceed` that opens a new conflict increments `depth`. `suggest` (which always
lands on a conflict-free `getNextEmployeeNumber`) does NOT chain and resets the
chain. Five is generous: real one-level chaining is depth 1–2; depth 5 means the
input is pathological.

### 3.2 Scope and reset of the guard

- The visited-set (`visited`) and `depth` are scoped to **one resolution chain**.
- A "chain" starts when `detectConflicts` opens the first `active` conflict (or
  when a new row's conflict becomes active after the previous row resolved).
- `visited`/`depth` **reset to `[]`/`0`** whenever we move to a *different row's*
  conflict or when `active` returns to `null` (no more conflicts). They only
  accumulate while `proceed` keeps re-opening conflicts for the *same logical
  chain* (the displaced-owner ping-pong).
- `detectConflicts` always resets the entire guard (fresh full scan).

### 3.3 State transitions (`resolveActiveConflict`)

**Action availability depends on `C.ownerKind`:**
- `ownerKind === 'existing'` → actions `['suggest','discard-new','return']`. The
  modal shows `C.ownerDetails` (the existing employee's número/posición/sueldo) so
  the user can confirm whether they are re-adding someone who already exists.
  **NO `proceed`, NO chaining** — you are not editing the existing employee.
- `ownerKind === 'draft'` → actions `['suggest','proceed','return']`. `proceed`
  is the only path that chains (§3, guarded).

**Precedence in `detectConflicts`:** if a row's number collides with BOTH an
existing employee AND another draft row, the **existing-owner** conflict is
surfaced first (its identity info matters more, and `proceed`/chaining must never
be offered against an existing employee).

Given `queue.active = C` (for row R, landing number N):

- **`action === 'suggest'`**
  - Set `R.number = String(C.suggestedNumber)` (conflict-free by construction).
  - Mark R resolved: push `R.rowId` to `resolvedRowIds`.
  - Reset chain guard (`visited=[]`, `depth=0`).
  - Re-scan remaining rows for the NEXT conflict → set `active` to it or `null`.

- **`action === 'return'`**
  - Do not change `R.number`. Push `R.rowId` to `flaggedRowIds` (unresolved).
  - Mark R resolved-for-flow (remove from active path): push to `resolvedRowIds`
    so the scan does not immediately re-open the same row; the row stays flagged
    and the commit gate will reject while it's flagged + still conflicting.
  - Reset chain guard. Open next row's conflict or `null`.

- **`action === 'discard-new'`** (EXISTING-owner conflicts only)
  - Remove draft row R entirely (`removeRow`) — the user confirmed it duplicates
    an already-existing employee. Safe: R was never committed, so no existing
    `id` or `attendanceData` is touched.
  - Reset chain guard. Re-scan remaining rows; open next conflict or `null`.

- **`action === 'proceed'`** (DRAFT-owner conflicts only — the chaining + cycle-breaker path)
  1. Compute `key = String(rules.normalizeEmployeeNumber(N))`.
  2. **GUARD CHECK** — if `key ∈ visited` OR `depth + 1 > MAX_CHAIN_DEPTH`:
     → **fire the guard** (terminal state, §3.4). Stop chaining.
  3. Otherwise: push `key` to `visited`, `depth += 1`.
  4. Mark the CURRENT conflict's row resolved (push to `resolvedRowIds`); the
     row keeps its typed number N.
  5. Recompute who *now* owns N among the OTHER DRAFT ROWS. Existing employees are
     never displaced by this flow, and existing-owner collisions are surfaced as
     `existing`-owner conflicts that do NOT offer `proceed` (see precedence above),
     so a `proceed` chain only ever lands on another draft row. Re-run conflict
     detection limited to N against the other draft rows:
     - If another DRAFT row owns N → build a new `draft`-owner `DraftConflict` for
       it and set it `active` (this is the "one level of chaining" — and each
       additional level re-enters this same guarded path, so it can never run
       unbounded).
     - If no draft row remains on N → `active = null` for this chain; reset guard;
       scan for the next *unrelated* row conflict.

### 3.4 Terminal state when the guard fires

When the visited-set or depth cap fires on a `proceed`:

- `queue.terminated = true`.
- `queue.active = null` (close the modal; stop opening chained conflicts).
- The current row is pushed to `flaggedRowIds` (left **unresolved / flagged**).
- The shell returns the user to the **editable draft list**, with the flagged
  row visibly marked (e.g. red border + "Resolvé el número manualmente").
- `buildCommitPlan` returns `{ ok: false, reason: 'conflicts' }` while any
  flagged row still has an active number collision, forcing manual edit before
  commit. No data is written. **The flow ALWAYS terminates** because every
  `proceed` either resolves to no-owner, opens exactly one bounded next
  conflict, or trips the guard.

### 3.5 Worked example (ping-pong → termination)

Existing roster: empty. Draft rows (number ping-pong):

```
R1: number "10"
R2: number "10"   ← collides with R1
```

1. `detectConflicts`: R1 vs R2 → first conflict C1 = {row R2, number 10,
   owner = R1}. `active = C1`, `visited=[]`, `depth=0`.
2. User clicks **proceed** on C1 (R2 keeps "10"):
   - key = "10". Not in visited, depth 0+1 ≤ 5 → push "10", depth=1.
   - R2 marked resolved. Re-scan number 10: R1 still owns 10 → new conflict
     C2 = {row R1, number 10, owner = R2}. `active = C2`. (one level chained)
3. User clicks **proceed** on C2 (R1 keeps "10"):
   - key = "10". **"10" ∈ visited → GUARD FIRES.**
   - `terminated = true`, `active = null`, R1 → flaggedRowIds.
   - Return to draft list; R1 flagged "resolvé manualmente". Commit blocked.

Depth-cap example: a chain that keeps landing on *different* numbers
(10→11→12→13→14→15) trips `depth+1 > 5` at the 6th hop and terminates the same
way. Either guard guarantees termination.

---

## 4. Additive commit (`buildCommitPlan`)

### 4.1 Guarantee: existing ids/attendance untouched

```
finalUsers = existingUsers (verbatim, same object identities/ids)
           ++ newEmployees (rows with FRESH ids)
```

- `existingUsers` is returned **by reference identity per element** — no element
  is mapped, re-spread, or re-keyed. Their `id` strings are the exact input
  strings. This is the testable invariant: for every `e` in input
  `existingUsers`, `plan.finalUsers` contains an element `===`-equal (same id,
  same number) at the same relative order.
- `attendanceData` is keyed by employee `id` and is **never referenced** by
  `draft-import.ts`. The shell's `saveData()` writes `attendanceData`
  separately and unchanged. Design invariant: this flow only ever *appends* to
  `users`; it never deletes, re-orders existing ids, or mutates existing
  numbers — so no `attendanceData[date][id]` key can be orphaned.

### 4.2 New rows get fresh ids — duplicate-within-batch risk handled

Existing scheme (index.html:2484): `'u' + Date.now() + Math.random()...`.
`Date.now()` can return the same ms for rows created in a tight loop; random
suffix mitigates but is not a *guarantee*.

**Decision:** `buildCommitPlan` takes an injected `generateId: () => EmployeeId`
(the shell passes the existing `'u'+Date.now()+random` generator), and the pure
function **enforces uniqueness defensively**:

- Maintain a `Set<EmployeeId>` seeded with all `existingUsers` ids.
- For each new row, call `generateId()`; if the result is already in the set
  (collision with an existing id OR a just-generated one), append a numeric
  disambiguation suffix (`id + '-' + n`) until unique, then add to the set.
- This makes id-uniqueness a **pure, testable** property independent of clock
  resolution, while keeping the id *generation* strategy in the shell.

`generateId` is injected (not called inside the pure core directly as
`Date.now()`) precisely so tests can pass a deterministic stub and assert the
collision-disambiguation branch.

### 4.3 Commit gate

`buildCommitPlan` returns `ok:false` when:
- `validateDraft(session).ok === false` → `reason:'gate'` (a row missing
  position), or
- any row still has an unresolved number collision / is flagged →
  `reason:'conflicts'`.

Only when both pass does it produce `newEmployees` + `finalUsers`.

---

## 5. Model change: `sueldo`

- Add `sueldo?: string` to `Employee` and `sueldo: string` to `DraftRow` (see
  §2.2). String to mirror `number` (no numeric coercion, no locale issues,
  display-as-typed). Optional + never appears in `DraftValidation` → it can
  never gate.
- `readEmployeeDraft()` (index.html:2079) gains
  `sueldo: document.getElementById('user-sueldo').value` (new input added to
  the single-employee form). Display alongside position
  (`position || 'Sin cargo'`), e.g. show `sueldo` when present.
- The single-employee path keeps using `employee-number-rules.saveEmployeeDraft`
  unchanged; `sueldo` rides along via the `[extra: string]: unknown` index
  signature and the spread in `saveEmployeeDraft` (`{ ...draft, id }`), so no
  change to the rules engine is needed for `sueldo` to persist.

---

## 6. App-layer integration (index.html shell)

### 6.1 Singleton conflict modal serves the queue one at a time

The existing `employee-number-conflict-modal` + `employeeNumberModal` singleton
(index.html:1572, 2059-2133) is reused **as-is structurally**. The draft flow
maps the queue's single `active` conflict to it:

- The shell holds the `DraftSession` in a module-level variable (sibling to
  `pendingEmployeeConflict`), e.g. `draftSession`.
- When `draftSession.queue.active !== null`, the shell renders that ONE conflict
  into the singleton modal (reusing `conflict-employee-details`,
  the suggest/return buttons). Button set is mapped:
  `suggest` → "Usar número sugerido (N)", `proceed` → a new
  "Mantener de todas formas" button, `return` → existing return button.
- On a button click the shell calls `DraftImport.resolveActiveConflict(...)`,
  replaces `draftSession` with the returned state, then:
  - if new `queue.active !== null` → re-render the modal with the next conflict
    (the chained case — modal stays open, content swaps);
  - if `null` → close the modal, return to the editable draft list.

**No N-simultaneous-modals rework is needed.** Chaining is sequential by design:
the next conflict only opens after the current one is marked resolved, which is
exactly what a singleton modal supports. The "proceed" button is the only new
control versus the existing single-employee conflict modal.

### 6.2 Editable draft-list UI bound to pure state

- New "Agregar varios" (additive import) entry point opens a draft-list view.
- The list renders `draftSession.rows`. Each field edit calls
  `DraftImport.updateRow(...)` and re-renders. "Add row" → `addRow`, "remove"
  → `removeRow`.
- "Save/Commit" button:
  1. `validateDraft` → if `!ok`, highlight `incompleteRowIds`, block, show
     "Falta posición" messaging. Stop.
  2. `detectConflicts` → if `queue.active`, drive the modal (§6.1).
  3. When no active conflict and gate passes →
     `buildCommitPlan(session, shellGenerateId)`; if `ok`, set
     `users = plan.finalUsers`, call `saveData()`, re-render lists, close.
- All DOM glue is thin: read inputs → call pure fn → render returned state.
  No business decision lives in the shell.

---

## 7. Destructive reset separation

- `doImportEmployeesFromText` (index.html:2458) keeps its destructive
  whole-`users`-overwrite behavior but is **relabeled and gated**:
  - UI: moved/labeled as **"Borrar y reemplazar todo"**, visually separated
    (different section/color, e.g. danger styling) from the safe "Agregar
    varios" additive entry. They live in distinct UI locations so a normal
    additive import can never reach the wipe.
  - Gate: before overwriting, a confirmation alert/modal
    ("Esto BORRARÁ todos los empleados y reemplazará la lista. ¿Continuar?").
    Only on explicit confirm does it proceed to overwrite `users` + `saveData()`.
    The `data-ready === 'yes'` validation guard stays.
- No logic merge with the additive path: two separate entry points, two separate
  handlers. The additive path NEVER calls the destructive handler.
- This is the only place where existing ids can be discarded — and it is now an
  explicit, confirmed, clearly-labeled destructive action, per proposal risk (c).

---

## 8. Testability (Strict TDD, `node --test`)

`pretest: tsc` compiles `src/draft-import.ts` → `draft-import.js`; new tests
`require('../draft-import')` (CommonJS export). All 20 existing tests stay green
(no change to `employee-number-rules.ts` logic; `sueldo` rides the index
signature).

**Pure-testable in `node --test` (the core of the slice):**
- Position gate: `validateDraft` returns correct `incompleteRowIds` /
  `ok` (missing position blocks; missing sueldo does NOT).
- Batch conflict detection: `detectConflicts` finds existing-owner and
  draft-vs-draft collisions, opens the first as `active`.
- **Cycle-breaker:** visited-set ping-pong terminates (worked example §3.5);
  depth-cap chain (6 distinct numbers) terminates; terminal state sets
  `terminated`, `active=null`, row flagged.
- Conflict resolution actions: `suggest` lands conflict-free + resolves;
  `proceed` chains exactly one bounded level then resolves/guards; `return`
  flags the row.
- **Additive commit:** `buildCommitPlan` preserves every existing element
  (same id, same order, `===` identity), appends new rows with unique ids,
  and the injected-`generateId` collision branch disambiguates duplicates.
  Gate/conflicts produce `ok:false`.

**DOM-only (not unit-tested headlessly; manual/visual):**
- Modal rendering and button wiring (§6.1), draft-list rendering/editing glue,
  the "Borrar y reemplazar todo" confirmation modal, `readEmployeeDraft`
  reading the new `sueldo` input. These are thin adapters over already-tested
  pure functions.

Every must-resolve item (cycle-breaker, conflict chaining, position gate,
additive-commit plan) is in the **pure-testable** column by construction —
that is the reason the decision logic was pushed entirely into `draft-import.ts`.

---

## 9. Risks / tradeoffs / assumptions

- **Type duplication** (`Employee` re-declared in `draft-import.ts`): forced by
  `module:"none"` (no imports). Tradeoff accepted; structural compatibility is
  guaranteed by tests, not the compiler. Low risk — small, stable shapes.
- **Visited-set keyed on number, not (number,owner):** chosen because the
  hazard is "chain keeps landing on an owned number." A more granular key would
  permit one extra hop in rare shapes; the depth cap (5) backstops it. Accepted.
- **`proceed` semantics with additive model:** because existing employees'
  numbers are NEVER mutated by this flow, a `proceed` onto an existing owner's
  number creates a duplicate-number situation that the user explicitly accepts
  for the new row; chaining mainly arises in draft-vs-draft ping-pong. The
  guard covers both. Assumption: duplicate *numbers* are tolerable (the rules
  engine already allows "proceed anyway" semantics); duplicate *ids* are NOT
  (enforced in §4.2).
- **Id generation stays clock-based in shell:** the pure dedupe guarantee makes
  this safe within a batch; cross-session id collisions remain astronomically
  unlikely (existing behavior, not regressed).
- **Singleton modal reuse:** assumes one active conflict at a time is acceptable
  UX for chaining — consistent with the proposal's "one-level chaining" intent
  and the existing single-conflict modal. No multi-modal work in this slice.
- **Assumption:** `sdd-tasks` will add the new `sueldo` input element and the
  two separated UI entry points; this design fixes their behavior and the pure
  API they bind to, not their exact markup.
- **Deferred (per proposal):** `<input type="number">` leading-zeros bug; OCR;
  merge/similar-name; positions entity. Out of scope, not addressed here.
