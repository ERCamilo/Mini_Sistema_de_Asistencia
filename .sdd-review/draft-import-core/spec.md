# Spec: draft-import-core (Slice 1)

Domain: NEW capability — `draft-import` (pure logic module `src/draft-import.ts`)
Status: full spec (no existing spec for this domain)

## Purpose

Define the pure-logic contract for safely building a multi-row draft of new
employees, gating commit on required fields, detecting and chaining number
conflicts against `employee-number-rules`, and producing an additive commit
plan that never disturbs existing employees or their attendance history.
UI wiring (index.html) is OUT of this spec's testable surface except where
noted as "UI-only."

## Requirements

### Requirement: Draft-List Model

The system MUST represent an in-progress import as an ordered list of draft
rows, each with fields `número`, `nombre`, `posición`, `sueldo`. Each row
MUST be independently editable without affecting other rows. A row is
"valid" only when `número` and `nombre` are both non-empty; `posición` and
`sueldo` MAY be empty while still in draft.

#### Scenario: Empty draft list

- GIVEN no rows have been added
- WHEN the draft-list state is read
- THEN it reports zero rows and zero incomplete rows

#### Scenario: Editing one row does not affect others

- GIVEN a draft list with two rows
- WHEN one row's `nombre` is updated
- THEN the other row's fields are unchanged

### Requirement: Position-Required Commit Gate

The system MUST expose, as pure data, which draft rows are missing
`posición`. The system MUST NOT allow a commit plan to be produced while one
or more rows are missing `posición`. `sueldo` MUST NEVER be part of this gate
or any other commit-blocking check.

#### Scenario: Row missing position blocks commit

- GIVEN a draft list where one row has an empty `posición`
- WHEN the gate is evaluated
- THEN the gate reports that row as incomplete
- AND commit-plan generation is refused (returns a blocked/error result, not a plan)

#### Scenario: Empty sueldo never blocks

- GIVEN a draft list where every row has `posición` set but `sueldo` empty
- WHEN the gate is evaluated
- THEN the gate reports no incomplete rows due to `sueldo`

### Requirement: Per-Draft Number-Conflict Detection

The system MUST detect, for each draft row, whether its normalized `número`
collides with (a) an existing committed employee's number, or (b) another
draft row's number in the same batch. Normalization MUST reuse
`employee-number-rules`'s existing semantics (numeric coercion; e.g. `"007"`
and `7` are the same number).

#### Scenario: Draft row collides with existing employee

- GIVEN an existing employee with number `7`
- AND a draft row with número `"007"`
- WHEN conflict detection runs
- THEN that draft row is reported as conflicting with the existing employee

#### Scenario: Two draft rows share the same number

- GIVEN two draft rows both using número `12`
- WHEN conflict detection runs
- THEN a conflict is reported between those two draft rows

### Requirement: One-Level Conflict Chaining

When a conflict is resolved by the user choosing to proceed onto a number
owned by ANOTHER DRAFT ROW, the system MUST mark the current conflict
RESOLVED and open a NEW conflict for that other draft row. Chaining applies
ONLY to draft-vs-draft conflicts; a collision with an existing employee is
handled by the separate "Existing-Owner Conflict" requirement and NEVER
chains. At any time, the system MUST expose which
conflict (if any) is ACTIVE and which are RESOLVED, as pure data. Resolving
via `suggest` (next available number, per `getNextEmployeeNumber`) MUST mark
the conflict RESOLVED without opening a new conflict, because the suggested
number is guaranteed conflict-free.

#### Scenario: Resolve via suggest (no chaining)

- GIVEN an active conflict for a draft row
- WHEN the user resolves it via "suggest" (max+1)
- THEN the conflict is marked RESOLVED
- AND no new conflict is opened
- AND the queue has no ACTIVE conflict afterward (or advances to the next pending one, if any existed before this one)

#### Scenario: Resolve via proceed-onto-owned-number (chaining trigger, draft-vs-draft only)

- GIVEN an active DRAFT-vs-DRAFT conflict where row R1 wants number `N` also wanted by draft row R2
- WHEN the user resolves R1 by proceeding onto `N` anyway
- THEN R1's conflict is marked RESOLVED
- AND a NEW conflict is opened for R2 (which still wants `N`)
- AND the new conflict becomes the ACTIVE one

#### Scenario: Chain reaches its terminal/guard state

- GIVEN a draft-vs-draft proceed chain (e.g. R1 "10", R2 "10": proceed on R1's
  conflict, then proceed again on R2's conflict — same number `10` revisited)
- WHEN the visited-set guard (key = normalized number) OR the depth cap
  (`MAX_CHAIN_DEPTH = 5`) fires
- THEN `terminated` becomes true, the ACTIVE conflict becomes `null`, and the
  unresolved row is flagged (`flaggedRowIds`)
- AND commit is blocked while any flagged row still collides
- AND a depth-cap chain over distinct numbers (10→11→12→13→14→15) terminates the
  same way at the 6th hop

### Requirement: Existing-Owner Conflict Surfaces Identity, Offers Discard or Reassign

When a draft row's number collides with an EXISTING committed employee, the
system MUST surface that existing employee's identifying info (número,
posición, sueldo) so the user can confirm whether they are re-adding someone
who already exists. For an existing-owner conflict the available actions MUST
be `discard-new` (remove the draft row — it duplicates an existing employee),
`suggest` (reassign the draft row to the next available number), and `return`.
An existing-owner conflict MUST NOT offer `proceed` and MUST NOT chain. If a
draft row collides with both an existing employee and another draft row, the
existing-owner conflict MUST be surfaced first.

#### Scenario: Existing-owner conflict exposes the existing employee's info

- GIVEN an existing employee `{ id: "e1", name: "Ana", number: "7", position: "Admin" }`
- AND a draft row with número `"007"`
- WHEN the conflict is opened
- THEN the active conflict reports ownerKind `existing`, the existing employee's id,
  and its display details (number/position/sueldo)
- AND its actions are exactly `['suggest','discard-new','return']`

#### Scenario: Discard-new removes the duplicate draft row

- GIVEN an active existing-owner conflict for draft row R
- WHEN the user chooses `discard-new`
- THEN row R is removed from the draft list
- AND no existing employee or attendance entry is touched

#### Scenario: Suggest reassigns the draft row to the next free number

- GIVEN an active existing-owner conflict for draft row R wanting an owned number
- WHEN the user chooses `suggest`
- THEN R's número becomes the next available number (conflict-free) and R resolves

### Requirement: Additive Commit Plan

The system MUST produce a commit plan that appends valid, conflict-free
draft rows to the existing employee list without modifying, removing, or
reassigning the `id` of any existing employee. Attendance history, which is
keyed by employee `id`, MUST remain associated with the same `id` after
commit. A commit plan MUST only be producible when there are zero incomplete
rows (position gate) and zero unresolved (ACTIVE/pending) conflicts.

#### Scenario: Clean draft commits correctly

- GIVEN a draft list with two valid rows, no missing positions, no conflicts
- WHEN a commit plan is generated
- THEN the plan's resulting list contains the existing employees plus the two new rows appended
- AND no existing employee's fields were altered

#### Scenario: Existing ids and attendance survive commit

- GIVEN an existing employee with `id: "e1"` and attendance entries keyed by `"e1"`
- AND a conflict-free draft commit is generated and applied
- WHEN the resulting employee list is inspected
- THEN an employee with `id: "e1"` still exists with its original fields
- AND attendance entries keyed by `"e1"` still resolve to that same employee

#### Scenario: Commit refused while conflicts are unresolved

- GIVEN a draft list with an ACTIVE (unresolved) conflict
- WHEN a commit plan is requested
- THEN generation is refused (blocked/error result, not a plan)

### Requirement: Optional Salary Field

The system MUST store `sueldo` on both the draft row model and the resulting
committed employee record. `sueldo` MUST be optional at every stage and MUST
NOT participate in any gate or validation that blocks commit.

#### Scenario: Sueldo persists through commit when provided

- GIVEN a valid draft row with `sueldo: 50000`
- WHEN it is committed
- THEN the resulting employee record has `sueldo: 50000`

#### Scenario: Sueldo absent does not block or corrupt commit

- GIVEN a valid draft row with no `sueldo`
- WHEN it is committed
- THEN the commit succeeds and the resulting record has no/empty `sueldo`

### Requirement: Destructive Reset Is a Separate, Explicitly-Confirmed Action

The "Borrar y reemplazar todo" action MUST replace all existing employees
ONLY after an explicit user confirmation step. This action MUST be
distinguishable in code path and intent from the additive draft-import
commit. The additive commit path MUST NEVER, under any input or conflict
state, erase or replace existing employees outside the rows it explicitly
appends. (UI-only: the confirmation modal and visual separation are app-layer
concerns, not part of the pure `draft-import` module's testable surface.)

#### Scenario: Additive path never wipes existing employees

- GIVEN an existing employee roster of N employees
- WHEN any sequence of valid draft-import commits is applied (any number of
  rows, any resolved conflicts)
- THEN all N original employees are still present and unmodified afterward

#### Scenario: Destructive reset requires confirmation [UI-only]

- GIVEN the user triggers "Borrar y reemplazar todo"
- WHEN no confirmation has been given yet
- THEN the existing employee list is NOT replaced
- AND replacement only proceeds after explicit confirmation

## Non-Goals (Out of Scope for This Spec)

- Similar-name detection between draft rows or against existing employees.
- Merge or delete-duplicate of employees, and any related attendance-key migration.
- A stored canonical "positions" entity, suggestions, or autocomplete.
- OCR capture (photo -> n8n -> JSON) — this slice is manual-entry-only; the
  draft-list model is designed to be source-agnostic for a future slice, but
  OCR integration itself is not specified here.
- Fixing the `<input type="number" id="user-number">` leading-zeros bug
  (flagged in the proposal, deferred).

## Open Design Dependency

The cycle-breaker mechanism for one-level-chaining termination (depth cap
vs. visited-set of `(number, owner)` pairs) is explicitly deferred to
`sdd-design`. This spec only commits to the REQUIREMENT that chaining always
terminates in a defined, observable state — see the placeholder scenario
under "One-Level Conflict Chaining" above, to be finalized once design picks
the mechanism.
