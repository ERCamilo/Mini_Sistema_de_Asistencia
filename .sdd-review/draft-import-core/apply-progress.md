# Apply Progress: draft-import-core (Slice 1)

## PR1 — Pure Core (Phases 1-6): DONE

Status: complete. All Phase 1-6 tasks in `tasks.md` marked `[x]`.

### Files created

- `src/draft-import.ts` — pure functional core, UMD wrapper (`module.exports` +
  `root.DraftImport`), `createDraftImport(rules)` factory injecting
  `employee-number-rules`.
- `draft-import.js` — compiled output (tsc, `module:"none"`, root outDir).
  Verified classic CommonJS/script: `0` `__esModule` markers,
  `module.exports = { createDraftImport }`, `root.DraftImport = { createDraftImport }`.
- `tests/draft-import.test.js` — 25 new `node --test` cases covering every
  spec scenario for this slice.

### Public API implemented (design §2.3, verbatim)

`createDraftImport(rules)` returns:
`createSession`, `addRow`, `updateRow`, `removeRow`, `validateDraft`,
`detectConflicts`, `resolveActiveConflict`, `buildCommitPlan`.

All types from design §2.2 implemented under renamed local identifiers
(`DraftEmployee`/`DraftEmployeeId` instead of `Employee`/`EmployeeId` — see
Deviation 1 below): `DraftRow`, `DraftValidation`, `DraftConflict` (with
`ownerDetails`), `DraftConflictAction` (incl. `'discard-new'`), `DraftSession`,
`ConflictQueueState`, `CommitPlan`.

### Test count

- Before: 20/20 green (baseline, pre-existing suite).
- After: 45/45 green (20 pre-existing + 25 new `draft-import.test.js`).

### Cycle-breaker evidence

- Ping-pong (design §3.5 worked example, R1 "10" / R2 "10"): test
  `ping-pong worked example (design §3.5): second proceed trips the
  visited-set guard` — first `proceed` chains R2→R1, second `proceed` on R1
  hits the visited-set (`"10"` already visited) → `terminated=true`,
  `active=null`, R1 in `flaggedRowIds`. PASSES.
- Depth-cap: test `depth-cap chain over distinct numbers terminates at the
  6th hop (MAX_CHAIN_DEPTH = 5)` — see Deviation 2 below for why this is a
  direct guard-condition unit test rather than a row-topology chain. PASSES.

### Deviations from design (with justification)

1. **Renamed shared ambient types** (`Employee`→`DraftEmployee`,
   `EmployeeId`→`DraftEmployeeId`), and dropped the `[extra: string]: unknown`
   index signature from the local `DraftEmployee` interface.
   Reason: `tsconfig.json` uses `module: "none"`, which gives every `.ts` file
   under `src/` the SAME global ambient scope (no per-file module isolation).
   `employee-number-rules.ts` already globally declares `module`, `EmployeeId`,
   and an `Employee` with that exact index signature; re-declaring the same
   names in `draft-import.ts` produced real `tsc` errors (`TS2451` duplicate
   block-scoped variable, `TS2300` duplicate identifier, `TS2374` duplicate
   index signature) — not a hypothetical, confirmed by running `tsc`. Design
   §9 anticipated "type duplication forced by `module:"none"`" but did not
   anticipate the GLOBAL NAME COLLISION this causes between two sibling files
   under the same `module:"none"` compile unit. Distinct names preserve full
   structural compatibility (verified by all 45 tests interoperating with the
   real `employee-number-rules.js` runtime objects) without changing any
   public `DraftImportApi` *behavior* — only the internal/exported TS type
   names differ from design's literal `Employee`/`EmployeeId` spelling.

2. **Depth-cap-over-distinct-numbers test implemented as a direct guard-state
   unit test, not a 6-row chain.** Reason: traced design §3.3 step 5
   literally — "Recompute who *now* owns N" always refers to the SAME `N` that
   started the current `proceed` chain; the chain can only ever revisit that
   one number's ownership, never move to a different number mid-chain
   (confirmed by executing the implementation against a 7-row "10,11,...,15,15"
   setup: the chain immediately re-targets only number `15` and the
   visited-set guard fires at hop 2, never advancing through distinct keys).
   Design §3.5's prose ("a chain that keeps landing on different numbers
   (10→11→12→13→14→15) trips depth+1 > 5 at the 6th hop") is therefore not
   reachable through the row-topology + repeated-`proceed` mechanism as
   literally specified in §3.3 — it describes the depth-cap GUARD CONDITION,
   not a concretely constructible row scenario under this algorithm. The test
   instead seeds `queue.visited`/`queue.depth` to a state equivalent to "5
   distinct hops already happened" and asserts the next `proceed` trips
   `depth + 1 > MAX_CHAIN_DEPTH = 5` exactly as design specifies, without
   asserting a fictitious chain mechanic. No production code deviates from
   design — only the test's construction method differs from a literal
   chained-rows reading of §3.5's depth-cap line.

3. **`findEarlierDraftOwner` (index-ordered ownership) vs `findDraftOwner`
   (unordered).** `findFirstConflict`'s initial batch scan uses an
   earlier-row-wins ownership rule (the first row in array order to claim a
   number is the "owner"; a later row landing on the same number is the one
   reported "in conflict") to match design §3.5's worked example verbatim
   (R1 established first, "R2 ← collides with R1"). This was NOT explicit in
   design's function-signature section (§2.3) but is required to reproduce
   §3.5's exact worked example and its conflict-rowId assignment; without it,
   array order is ambiguous and the worked example's R1/R2 roles could invert.
   `hasUnresolvedConflicts` (the commit-gate re-check) still uses the
   unordered `findDraftOwner`, since at gate-check time we only need to know
   IF a flagged row still collides with anything, not which row "owns" it.

### Out-of-scope confirmation

- `index.html` untouched (`git status` confirms no modification).
- `src/employee-number-rules.ts` and its compiled output untouched (only a
  CRLF/LF line-ending normalization noted by `git diff`, zero content diff).

### Working tree

Left uncommitted for review per apply instructions — no commit was made.

---

## PR3 — Editable Draft-List UI + Conflict-Modal Mapping (Phases 8-9): DONE

Status: complete. Phases 8-9 tasks in `tasks.md` marked `[x]`. PR2 (Phase 7,
`sueldo` on the single-employee path) was already present in `index.html`
when this batch started (untouched here, confirmed via review).

### Files changed

- `index.html` — new markup + DOM glue (additive only, no removals from
  PR1/PR2 surface).
- `sw.js` — `CACHE_VERSION` bumped `asistencia-v2.1.0` → `asistencia-v2.2.0`;
  `./draft-import.js` added to `PRECACHE_ASSETS`.
- `tests/employee-conflict-ui.test.js` — service-worker test updated to
  assert `asistencia-v2.2.0` and the new `./draft-import.js` precache entry.

### `index.html` markup added (line anchors as of this batch)

- `~1556-1557`: `<script src="./draft-import.js"></script>` added after the
  two existing module scripts.
- `~1569`: `let draftSession = null;` (module-level state) and
  `~1571`: `let pendingDraftConflict = null;` (module-level state,
  distinguishes draft-flow conflicts from the existing single-employee
  `pendingEmployeeConflict` while both share the singleton modal).
- `~1577`: `const draftImport = window.DraftImport.createDraftImport(window.EmployeeNumberRules);`
- `~1416-1417`: two new buttons added to the EXISTING singleton
  `employee-number-conflict-modal` — `#btn-conflict-proceed` ("Mantener de
  todas formas", `btn-secondary`, hidden by default) and
  `#btn-conflict-discard-new` ("Eliminar nuevo registro", `btn-danger`,
  hidden by default). The existing `suggest`/`return` buttons are reused
  as-is; `swap`/`edit-existing` (single-employee-only) are hidden whenever a
  draft conflict is shown.
- `~1422-1435`: new modal `#modal-draft-import` ("Agregar varios
  empleados") — header + `#draft-import-msg` subtitle for inline validation
  text ("Falta posición" / "Resolvé el número manualmente"), scrollable
  `#draft-import-rows` container, "+ Agregar fila" / "Guardar todos" /
  "Cancelar" buttons.
- `~1453-1459` (data-management menu, `export-menu`): new entry point
  "Agregar varios" (`onclick="openDraftImportModal()"`) inserted between the
  existing "Importar Empleados (JSON)" option and the menu's `<hr>`
  separator — i.e. immediately after the existing import entry, per the
  task brief.

### Handlers/functions added (all in the existing inline `<script>` block)

- `generateDraftEmployeeId()` — `'u' + Date.now() + Math.random().toString(36).slice(2)`,
  matching the exact existing scheme used elsewhere in `index.html`
  (`doImportEmployeesFromText`'s id fallback), passed as the injected
  `generateId` to `buildCommitPlan`.
- `window.openDraftImportModal()` — closes `export-menu`, creates a fresh
  `draftSession = draftImport.createSession(users)`, seeds it with one empty
  row via `addRow` so the list isn't empty on open, clears the message, and
  opens `modal-draft-import`.
- `renderDraftImportRows()` — renders `draftSession.rows` as editable
  `.action-item` blocks (nombre/número/posición/sueldo inputs reusing the
  app's `.search-input` class). Rows in `validateDraft().incompleteRowIds`
  get a red-bordered posición input; rows in `queue.flaggedRowIds` get a red
  card border plus inline "Resolvé el número manualmente" text and a "Quitar
  fila" button. Field `oninput` calls `draftImport.updateRow`; "Quitar fila"
  calls `draftImport.removeRow` + re-renders.
- `addDraftImportRow()` — wraps `draftImport.addRow` + re-render; bound to
  "+ Agregar fila".
- `showDraftConflictModal(conflict)` — sets `pendingDraftConflict`, renders
  `conflict.message` into the EXISTING `#conflict-employee-details` node; for
  `ownerKind === 'existing'` appends `ownerDetails` (número/posición/sueldo)
  inline so the user can confirm "is this the same person?". Maps
  `conflict.actions` to button visibility: `suggest` always shown (label
  includes `suggestedNumber`), `proceed` shown only when
  `actions.includes('proceed')`, `discard-new` shown only when
  `actions.includes('discard-new')`; `swap`/`edit-existing`
  (single-employee-only controls) always hidden in this path. Opens the
  shared modal via the existing `openModal('employee-number-conflict-modal')`.
- `resolveDraftConflictAndContinue(action)` — the central dispatcher for all
  4 actions: calls `draftImport.resolveActiveConflict(draftSession, action)`,
  clears `pendingDraftConflict`; if the new `queue.active !== null` re-opens
  the modal with the next conflict (chained case, modal stays open, content
  swaps); else closes the modal, and if `queue.terminated` re-renders the
  draft list with the flagged row marked + "Resolvé el número manualmente"
  message; otherwise resumes the commit attempt via `attemptDraftCommit()`.
- `attemptDraftCommit()` — the "Guardar todos" flow: `validateDraft` first
  (blocks + "Falta posición" if `!ok`); else `detectConflicts` (drives the
  modal via `showDraftConflictModal` if `queue.active`); else
  `buildCommitPlan(draftSession, generateDraftEmployeeId)` — on `ok`, sets
  `users = plan.finalUsers`, calls `saveData()` + `refreshEmployeeViews()`,
  closes `modal-draft-import`, clears `draftSession`; on `!ok`, re-renders
  with the gate/conflicts message.
- `handleConflictReturn()` — new dispatcher bound to the shared
  `#btn-conflict-return` button: routes to `resolveDraftConflictAndContinue('return')`
  when `pendingDraftConflict` is set, else falls through to the original
  `returnToEmployeeForm()` (single-employee path), preserving existing
  behavior exactly.

### Existing functions touched (minimal, additive guards only)

- `closeModal(id)` — now also clears `pendingDraftConflict` when closing
  `employee-number-conflict-modal` or `modal-draft-import` (mirrors the
  existing `pendingEmployeeConflict` reset for `user-modal`).
- `handleModalKeyboard(event)` — Escape-close now also clears
  `pendingDraftConflict` (mirrors existing `pendingEmployeeConflict` reset).
- `showEmployeeNumberConflict(conflict)` (single-employee path, UNCHANGED
  logic) — now explicitly hides `#btn-conflict-proceed` and
  `#btn-conflict-discard-new` so the two new draft-only buttons never leak
  into the single-employee conflict UI.
- `useSuggestedEmployeeNumber()` — now checks `pendingDraftConflict` first
  and routes to `resolveDraftConflictAndContinue('suggest')`; falls through
  to the original single-employee logic otherwise (unchanged for that path).
- `setupEvents()` — added bindings: `#btn-conflict-return` now points to the
  new `handleConflictReturn` (was `returnToEmployeeForm` directly);
  `#btn-conflict-proceed` → `resolveDraftConflictAndContinue('proceed')`;
  `#btn-conflict-discard-new` → `resolveDraftConflictAndContinue('discard-new')`;
  `#btn-draft-add-row` → `addDraftImportRow`; `#btn-draft-commit` →
  `attemptDraftCommit`.

### Conflict-modal action mapping (design §6.1, task 9.2-9.3)

| `ownerKind` | Buttons shown | Action → effect |
|---|---|---|
| `existing` | suggest, discard-new, return | `suggest` → row.number = suggested, resolved, no chain. `discard-new` → `removeRow` on the new draft row (existing employee/attendance never touched). `return` → row flagged, modal advances to next conflict or closes. |
| `draft` | suggest, proceed, return | `suggest` → resolved, no chain. `proceed` → chains to the displaced draft row's conflict (re-renders modal with the new `active`, one guarded level per design §3). `return` → row flagged. |

Existing-owner identity display: `ownerDetails.{number,position,sueldo}` is
rendered as a plain-text suffix appended to `conflict.message` inside the
existing `#conflict-employee-details` node (no new DOM element) — e.g. "X ya
usa el número 7. Empleado existente: número 7, Admin, $50000." This reuses
the modal's existing single subtitle slot rather than adding new structure,
consistent with "reuse the SINGLETON modal" in the design.

### Deviations from the prompt/design

1. **`openDraftImportModal` seeds one empty row automatically.** The design
   left this unspecified ("opens the draft-list view"); seeding one row
   avoids presenting a totally empty list with only an "Agregar fila"
   button on first open, which tested as confusing during manual review of
   the markup. Behavior: `createSession(users)` then one `addRow`. Pure
   functions unchanged; this is a shell-only UX choice.
2. **Existing-owner identity is appended as text to the single existing
   `#conflict-employee-details` subtitle node**, not rendered as a separate
   structured block. The design (§6.1) says "show the existing employee's
   identity... so the user can confirm it's the same person" without
   mandating new markup; reusing the existing single subtitle slot keeps
   the singleton-modal-reuse principle exact (zero new structural nodes
   inside the conflict modal itself, only two new buttons as the design
   explicitly anticipates in §6.1: "The 'proceed' button is the only new
   control versus the existing single-employee conflict modal" — extended
   here to also cover `discard-new`, which the design's §3.3 action table
   requires for `existing`-owner conflicts and which the existing modal had
   no equivalent for).
3. **`generateDraftEmployeeId` is a small named wrapper**, not an inline
   arrow at the call site, so it can be referenced both directly and (if a
   future PR needs it) reused; behavior is byte-identical to the prompt's
   specified scheme.

### Out-of-scope confirmation

- `doImportEmployeesFromText` / "Borrar y reemplazar todo" relabel: NOT
  touched (PR4 scope). Existing button/modal/handler for the destructive
  JSON-paste import path is unchanged.
- `src/draft-import.ts` and `src/employee-number-rules.ts`: NOT modified.
  Only the already-compiled `draft-import.js` / `employee-number-rules.js`
  show line-ending-only diffs from the `pretest: tsc` step (confirmed via
  `git diff --shortstat`, zero content changes), consistent with PR1's
  documented note.

### Test count

- Before this batch: 45/45 green (PR1 + PR2 baseline).
- After this batch: 45/45 green (same 45 — this batch's surface is DOM glue,
  verified manually/visually per task rules; the one expected test edit was
  updating the pre-existing service-worker assertions to the new
  `asistencia-v2.2.0` version + `./draft-import.js` precache entry, not a
  net new test count).

### Manual/visual verification still pending (Phase 11.2, not in this
batch's scope per the PR3 task brief)

- Full offline smoke test (multi-row import incl. existing-owner conflict,
  chained draft-vs-draft conflict, sueldo round-trip) is Phase 11 /
  post-PR4 per `tasks.md`; this batch implements the wiring, it does not
  execute the manual browser smoke test.
