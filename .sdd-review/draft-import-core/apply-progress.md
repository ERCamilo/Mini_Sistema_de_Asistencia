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
