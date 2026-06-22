# Proposal: draft-import-core (Slice 1)

Project: Asistencia mini — offline PWA for worksite employee attendance
Artifact store: file-based (Engram unavailable this session)
Scope: SLICE 1 of a multi-slice feature

## 1. Problem / Intent

Adding employees in bulk today is unsafe and unreviewable. The existing
`doImportEmployeesFromText()` (index.html:2458-2506) pastes JSON and
**destructively overwrites the entire `users` array** with zero conflict
checks. There is no way to:

- enter several employees at once, review them, and fix mistakes before saving;
- detect that a typed employee number already belongs to an existing worker;
- add new workers **without wiping the existing roster** (and, critically,
  without orphaning their attendance history, which is keyed by employee `id`).

This is a real operational risk: a foreman onboarding a new crew can erase the
whole site's employee list and silently break every prior attendance record,
because `attendanceData[dateStr][employeeId]` is keyed by `id` — overwriting
`users` desynchronizes attendance from any employee whose `id` changed.

**Why now:** the team is standardizing onboarding and wants a single, safe,
reviewable entry path. Just as importantly, this draft + per-row conflict
resolution flow is the **source-agnostic core** that a future OCR feature
(photo -> n8n -> JSON) will plug into. Building it as a clean draft model now
means OCR later becomes "another way to fill the same draft list," not a new
parallel pipeline. We solve the data-safety problem today and lay the
foundation for automated capture tomorrow.

**Success looks like:** a user can enter multiple employee rows manually,
review and edit them as a draft list, be required to fill `posición` before
saving, get a clear per-row resolution when a number already has an owner
(including the one-level chained case), and commit the new employees
**additively** — existing employees keep their `id` and their attendance
history, untouched.

## 2. Scope (Slice 1 — exactly this)

### In scope — user-visible flow

1. **Manual multi-row draft entry.** User enters several employees, each with
   fields: `número`, `nombre`, `posición`, `sueldo`.
2. **Editable draft list.** The entered rows render as a reviewable, editable
   list. The user can correct any field before committing.
3. **Position-required gate.** `posición` is REQUIRED on every draft row before
   the draft can be saved. Saving is blocked (with clear messaging) while any
   row is missing a position.
4. **Per-draft number-conflict detection with one-level chaining.** For each
   draft row whose `número` collides with an existing employee (or another
   draft row), a conflict resolution is opened. If the user resolves by
   proceeding onto a number that **already has its own owner**, the previous
   conflict is marked **resolved** and a **new** conflict resolution opens for
   the newly-collided number. This is the "one level of chaining" semantic.
5. **Additive commit.** On commit, new employees are APPENDED. Existing
   employees MUST NOT be overwritten — their `id`s and their
   `attendanceData` history are preserved exactly.

### In scope — model change

- Add `sueldo` (salary) to the employee and draft model. Fields become:
  `número`, `nombre`, `posición`, `sueldo`.
- `sueldo` is **OPTIONAL** and **non-gating** — it behaves like `position`
  does today (storable, displayable, but never blocks save). Only `posición`
  gates the commit in this slice.

### In scope — destructive path, repurposed (separate feature)

- The existing destructive `doImportEmployeesFromText()` is **NOT deleted**.
- It is **repurposed** into an explicit, clearly-labeled
  **"Borrar y reemplazar todo"** (wipe & replace all) action, guarded by an
  ALERT/confirmation modal. Kept intentionally for "start from scratch" and
  testing.
- This is treated as a **distinct, clearly-separated second feature** from the
  safe additive import. The two must be visually and behaviorally separated so
  a user can never trigger a wipe while doing a normal additive import.

### Out of scope (non-goals for THIS slice)

- Similar-name detection.
- Merge / delete-duplicate of employees (and the attendance-key migration that
  would require).
- A stored canonical positions entity / position suggestions / autocomplete.
- OCR capture (photo -> n8n -> JSON).
- Fixing the `<input type="number" id="user-number">` leading-zeros bug
  (latent; flagged below, deferred).
- Engram persistence of artifacts (unavailable this session).

## 3. Approach

### New TypeScript module: `src/draft-import.ts`

All new **pure logic** lives in a new TS module `src/draft-import.ts`,
compiled via the established `tsc` pipeline (`module: "none"`,
`rootDir: src`, `outDir: .`, `pretest: tsc`) into a root `draft-import.js`
consumed by both the browser (global `window.DraftImport`) and `node --test`
(CommonJS `module.exports`), following the existing **dual UMD factory**
convention used by `employee-number-rules`.

The module is responsible for:

- **Draft-list model.** Represent the in-progress set of draft rows
  (`{ número, nombre, posición, sueldo }`), with validation that surfaces the
  position-required gate as pure data (e.g. which rows are incomplete), so the
  HTML layer just renders state and the gate is testable headlessly.
- **Conflict queue/stack** supporting the chained
  "mark previous resolved -> open next" semantic. This composes — does NOT
  reimplement — the existing `employee-number-rules` engine for the actual
  per-pair number normalization and resolution options (suggest max+1 / swap /
  return). `draft-import.ts` owns the *orchestration over many rows and the
  chaining*; `employee-number-rules` owns the *single-pair decision*.
- **Additive commit planning.** Produce the final list to persist as
  `existing users (unchanged ids) + new draft rows`, with assurance that no
  existing `id` is reused or overwritten. The actual `localStorage` write and
  attendance preservation stay in the app layer, driven by this plan.

### App-layer (index.html) integration

- Wire the new draft entry UI + editable list + per-row conflict modal flow to
  `DraftImport`. The existing singleton conflict modal assumes one conflict at
  a time; the chaining model means the queue feeds the modal one active
  conflict at a time (open next only after current is marked resolved), which
  fits the singleton without needing N simultaneous modals.
- Add `sueldo` to the single-employee draft helpers
  (`readEmployeeDraft` / `saveEmployeeDraft`) and to display
  (alongside `position || 'Sin cargo'`).

### Destructive reset (separate small piece)

- Reframe `doImportEmployeesFromText()` as the alert-guarded
  "Borrar y reemplazar todo" action. Minimal logic change; the work is the
  confirmation modal and the clear separation from the safe import entry point.

## 4. Key risks (and what the design phase MUST resolve)

- **(a) Chained-conflict infinite-loop / ping-pong hazard — MUST RESOLVE IN
  DESIGN.** The "proceed anyway -> new conflict opens" chaining can cycle
  forever (A wants B's number, take it, now B-displaced wants A's number, etc.,
  or two rows ping-ponging the same pair). The design phase MUST specify a
  **cycle-breaker**: a depth cap and/or a visited-set of (number, owner) pairs,
  with a defined terminal state when the cap/visited guard fires. This is a
  must-resolve-in-design item, not optional.
- **(b) Additive commit must preserve existing `id`s + attendance.** The commit
  must never overwrite or reassign existing employee `id`s, because
  `attendanceData[dateStr][employeeId]` is keyed by `id`. Any `id` churn
  orphans history. Design must make the additive (append-only for existing)
  guarantee explicit and testable.
- **(c) Safe vs. destructive separation.** The additive import and the
  "Borrar y reemplazar todo" reset must be clearly separated in UI and flow so
  a user can never trigger a wipe by accident. Design must define the
  confirmation gate and the visual/locational separation.

## 5. Delivery

This is a **multi-slice** feature. This proposal covers **Slice 1 only**
(manual draft entry + position gate + number-conflict with one-level chaining +
additive commit + salary field + repurposed destructive reset). The overall
feature (similar-name, merge, positions entity, OCR) will likely need
**chained PRs**; Slice 1 itself may also split if the changed-line budget
warrants it.

## 6. Success criteria

- The draft + conflict core works **end-to-end with MANUAL entry only**
  (no OCR): enter rows -> review/edit -> position-required gate -> per-draft
  number-conflict with one-level chaining -> additive commit.
- Additive commit preserves existing employee `id`s and their attendance.
- `sueldo` is added to the model, stored and displayed, and never gates save.
- The destructive path exists only as the explicit, alert-guarded
  "Borrar y reemplazar todo" action, clearly separated from safe import.
- All **new pure logic** is `node --test`-covered (Strict TDD).
- App stays **offline** (no new network dependency).
- All existing **20 tests stay green**.

## 7. Flagged but deferred (not fixed here)

- Latent bug: `<input type="number" id="user-number">` strips leading zeros,
  contradicting the rules engine's string-preservation assumption. Flagged;
  deferred out of this slice.
