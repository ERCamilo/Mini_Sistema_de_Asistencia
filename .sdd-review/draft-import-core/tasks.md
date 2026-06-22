# Tasks: draft-import-core (Slice 1)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 950-1300 (new module ~350-450 LOC + ~6 test files ~400-550 LOC + index.html DOM glue ~150-250 LOC + sueldo field ~20 LOC) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 -> PR4 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `src/draft-import.ts` pure core (types, lifecycle, gate, conflicts, chaining/cycle-breaker, commit plan) + full `node --test` coverage | PR 1 | Base: main (stacked) or tracker branch (feature-branch-chain). ~600-750 lines. Independently mergeable/testable; no UI dependency. |
| 2 | `sueldo` field: `Employee`/draft model already covered by PR1 types; add `user-sueldo` input + `readEmployeeDraft` wiring + display in index.html | PR 2 | Base: PR1 (or main if stacked). ~30-60 lines. Small, isolated, low risk. |
| 3 | Editable draft-list UI + conflict-modal mapping (suggest/proceed/discard-new/return, ownerDetails rendering) wired to `DraftImport` | PR 3 | Base: PR2. ~250-400 lines. Largest UI unit; depends on PR1 API + PR2 sueldo input existing in the form partial reused by draft rows (if shared). |
| 4 | Relabel `doImportEmployeesFromText` -> "Borrar y reemplazar todo" behind confirmation modal, visually separated from additive entry | PR 4 | Base: PR3 (or main if stacked). ~40-80 lines. Independent of PR3 logic; only needs PR1 module present conceptually (no hard dependency). |

Ask the user which chain strategy (`stacked-to-main` or `feature-branch-chain`) before starting PR branches; do not proceed to `sdd-apply` until that decision and the chain choice are recorded.

## Phase 1: Pure Core Foundation (PR 1)

- [x] 1.1 RED: create `tests/draft-import.test.js` with a single failing test requiring `../draft-import.js` and calling `createSession([])`, asserting `rows: []` (drives scaffold).
- [x] 1.2 GREEN: scaffold `src/draft-import.ts` — UMD wrapper (`module.exports` + `root.DraftImport`, matches `employee-number-rules.ts` convention), re-declared types (`Employee` w/ `sueldo?`, `DraftRow`, `DraftValidation`, `DraftConflict` w/ `ownerDetails`, `DraftConflictAction` incl `'discard-new'`, `DraftSession`, `ConflictQueueState`, `CommitPlan`), `createDraftImport(rules)` factory injecting `employee-number-rules`, implement minimal `createSession` to pass 1.1. Run `npm test` — confirm all 20 existing tests + new test green.

## Phase 2: Draft-List Lifecycle (PR 1)

- [x] 2.1 RED: tests for `addRow`/`updateRow`/`removeRow` in `tests/draft-import.test.js` (Spec: "Draft-List Model" — empty draft list reports zero rows; editing one row leaves others unchanged).
- [x] 2.2 GREEN: implement `addRow`, `updateRow`, `removeRow` as pure, immutable-update functions on `DraftSession.rows`. Run `npm test`.

## Phase 3: Position Gate (PR 1)

- [x] 3.1 RED: tests for `validateDraft` (Spec: "Position-Required Commit Gate" — row missing `posición` blocks; empty `sueldo` never blocks).
- [x] 3.2 GREEN: implement `validateDraft` returning `{ ok, incompleteRowIds }`, gating ONLY on `position`. Run `npm test`.

## Phase 4: Conflict Detection (PR 1)

- [x] 4.1 RED: tests for `detectConflicts` — existing-employee collision, draft-vs-draft collision, existing-owner precedence when a row collides with both (Spec: "Per-Draft Number-Conflict Detection", "Existing-Owner Conflict Surfaces Identity").
- [x] 4.2 GREEN: implement `detectConflicts` using `rules.findEmployeeNumberConflict` / `rules.normalizeEmployeeNumber` over `existingUsers` then other rows; populate `ownerDetails` (number/position/sueldo) only for `ownerKind: 'existing'`; set `actions` per ownerKind (`existing` -> `['suggest','discard-new','return']`, `draft` -> `['suggest','proceed','return']`); reset `visited`/`depth`/`terminated` on each scan. Run `npm test`.

## Phase 5: Conflict Resolution + Cycle-Breaker (PR 1)

- [x] 5.1 RED: test `resolveActiveConflict` action `'suggest'` — resolves without chaining, no new conflict opened (Spec scenario "Resolve via suggest").
- [x] 5.2 RED: test action `'return'` — row flagged, chain guard reset, next conflict opened or null.
- [x] 5.3 RED: test action `'discard-new'` (existing-owner only) — draft row removed, no existing employee/attendance touched (Spec scenario "Discard-new removes the duplicate draft row").
- [x] 5.4 RED: test action `'proceed'` (draft-owner only) chaining one level — R1 vs R2 same number, proceed on R1 opens new active conflict for R2 (Spec scenario "Resolve via proceed-onto-owned-number").
- [x] 5.5 RED: test the worked ping-pong example verbatim from design §3.5 (R1 "10", R2 "10": proceed, proceed again) — second proceed hits visited-set, `terminated=true`, `active=null`, R1 in `flaggedRowIds`.
- [x] 5.6 RED: test depth-cap chain over distinct numbers (10->11->12->13->14->15) terminates at the 6th hop with `MAX_CHAIN_DEPTH=5`. DEVIATION: design §3.3 step 5 always re-targets the SAME contested number `N` for the life of one `proceed` chain, so the literal algorithm cannot naturally visit 5 distinct numbers within a single chain (traced and confirmed). Implemented as a direct unit test of the guard condition (`visited` pre-seeded with 5 distinct keys, `depth=5`, one more `proceed` trips `depth+1 > MAX_CHAIN_DEPTH`) — see inline comment in `tests/draft-import.test.js`.
- [x] 5.7 GREEN: implement `resolveActiveConflict` per design §3.3-3.4 — all four actions, visited-set keyed on `String(rules.normalizeEmployeeNumber(N))`, depth cap constant `MAX_CHAIN_DEPTH=5`, guard-fire terminal state. Run `npm test` after each RED above as you implement incrementally, or once covering all 6 — whichever keeps cycles small.

## Phase 6: Additive Commit Plan (PR 1)

- [x] 6.1 RED: test `buildCommitPlan` happy path — clean draft commits, `finalUsers` = existing + new rows appended, existing fields untouched (Spec scenario "Clean draft commits correctly").
- [x] 6.2 RED: test existing ids/attendance-key invariant — every input `existingUsers` element appears `===`-equal at the same relative order in `finalUsers` (Spec scenario "Existing ids and attendance survive commit").
- [x] 6.3 RED: test gate refusal (`reason:'gate'`) when a row is missing position, and conflict refusal (`reason:'conflicts'`) when an ACTIVE/flagged conflict remains (Spec scenario "Commit refused while conflicts are unresolved").
- [x] 6.4 RED: test injected-`generateId` collision disambiguation — stub `generateId` to return a colliding id twice, assert the second new employee gets a disambiguated id (`id + '-' + n`) and both are unique.
- [x] 6.5 RED: test `sueldo` passthrough — present value persists on the committed record; absent value does not block or corrupt commit (Spec: "Optional Salary Field").
- [x] 6.6 GREEN: implement `buildCommitPlan` per design §4 — gate checks, `Set<EmployeeId>` seeded with existing ids, per-row `generateId()` + disambiguation loop, `finalUsers = existingUsers ++ newEmployees`. Run full `npm test` — all 20 existing + all new draft-import tests green.

## Phase 7: Sueldo on Single-Employee Path (PR 2)

- [ ] 7.1 Add `<input id="user-sueldo">` to the single-employee form in `index.html` (near existing position input).
- [ ] 7.2 Update `readEmployeeDraft()` (index.html:~2079) to read `sueldo` from the new input.
- [ ] 7.3 Update employee display/list rendering to show `sueldo` when present (alongside `position || 'Sin cargo'`).
- [ ] 7.4 Run `npm test` — confirm all 20 existing tests stay green (no `employee-number-rules.ts` logic changed; `sueldo` rides the `[extra: string]: unknown` index signature).

## Phase 8: Editable Draft-List UI (PR 3)

- [ ] 8.1 Add "Agregar varios" entry point in `index.html` that calls `DraftImport.createSession(users)` and opens the draft-list view.
- [ ] 8.2 Render `draftSession.rows` as editable rows (número, nombre, posición, sueldo); wire field edits to `DraftImport.updateRow`, "add row" to `addRow`, "remove" to `removeRow`, re-rendering after each call.
- [ ] 8.3 Wire "Save/Commit" button: call `validateDraft` first (block + highlight `incompleteRowIds` with "Falta posición" if `!ok`), else proceed to conflict detection (Phase 9).

## Phase 9: Conflict Modal Mapping (PR 3)

- [ ] 9.1 Hold `draftSession` in a module-level variable (sibling to existing `pendingEmployeeConflict`).
- [ ] 9.2 Reuse the singleton `employee-number-conflict-modal` to render the ONE `queue.active` conflict: existing-owner conflicts show `ownerDetails` (número/posición/sueldo) plus `suggest`/`discard-new`/`return` buttons; draft-owner conflicts show `suggest`/`proceed`/`return` buttons (new "Mantener de todas formas" control for `proceed`).
- [ ] 9.3 On each button click call `DraftImport.resolveActiveConflict(...)`, replace `draftSession`, then re-render the modal with the next `active` conflict (chained case) or close it and return to the draft list when `active === null`.
- [ ] 9.4 On commit: after gate + no active conflict, call `buildCommitPlan(draftSession, shellGenerateId)`; if `ok`, set `users = plan.finalUsers`, call `saveData()`, re-render, close the draft view.

## Phase 10: Destructive Reset Separation (PR 4)

- [ ] 10.1 Relabel the `doImportEmployeesFromText` (index.html:~2458) entry point as "Borrar y reemplazar todo"; move/style it visually separated (danger styling) from "Agregar varios".
- [ ] 10.2 Add a confirmation modal/alert ("Esto BORRARÁ todos los empleados y reemplazará la lista. ¿Continuar?") gating the overwrite; only proceed to replace `users` + `saveData()` on explicit confirm. Keep the existing `data-ready === 'yes'` guard.
- [ ] 10.3 Manual/visual check: confirm the additive path has no code path reaching `doImportEmployeesFromText`, and the destructive action requires confirmation before any write.

## Phase 11: Final Verification

- [ ] 11.1 Run full `npm test` — all 20 pre-existing tests + all new `draft-import.test.js` tests green.
- [ ] 11.2 Manual offline smoke test in browser: additive multi-row import (incl. one existing-owner conflict, one draft-vs-draft chained conflict), sueldo field round-trip, destructive reset confirmation flow.

## Rules

- Pure logic (Phases 1-6) MUST follow RED -> GREEN per task; never write production code before its failing test exists.
- Existing 20 tests MUST stay green after every phase — re-run `npm test` at each checkpoint listed above.
- Phases 7-10 (index.html DOM glue) are manual/visual verification only, per spec's "UI-only" scenarios — no headless DOM test required.
- Do not touch `employee-number-rules.ts` logic; `sueldo` and new behavior must compose it, not modify it.
