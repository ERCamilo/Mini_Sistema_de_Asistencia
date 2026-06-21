# Apply Progress: Prevent Duplicate Employee Numbers

## Status

- Mode: Strict TDD
- Delivery: feature-branch-chain
- Work Unit 1: complete
- Work Unit 2: complete
- Result: Ready for `sdd-verify`
- Cumulative suite: 21 passed, 0 failed
- Integrated relevant diff excluding `.atl`: 552 changed lines (535 additions, 17 deletions)

## Completed Work

### Work Unit 1
- Implemented normalized employee-number rules, coordinator, conflict UI, stable-ID swaps, pending cleanup, and offline support.
- Established a 17-test dependency-free regression suite.

### Work Unit 2
- Extracted exact dialog focus and keyboard behavior into `employee-number-modal.js`, shared by production and Node tests.
- Added a purpose-built minimal DOM harness covering only production-used APIs.
- Executed production modal behavior for focus entry/restoration, Escape, Tab/Shift+Tab wrapping, and hidden/disabled exclusion.
- Added runtime attendance fixtures for two employee histories plus unrelated attendance and proved stable-ID ownership after swap.
- Removed superseded inline focus/trap mechanics from `index.html`.
- Bumped offline cache to v2.1.0 and precached the modal module.

## TDD Cycle Evidence — Work Unit 1

The cumulative evidence from the previous apply remains valid: rule RED from a missing module, coordinator RED from missing production exports, final 17/17 GREEN, honest `N/A — no pre-existing automated tests` for legacy `index.html` and `sw.js`, browser focus verification, and import/restore scope guards. Work Unit 2 adds—not replaces—the evidence below.

## TDD Cycle Evidence — Work Unit 2

| Task | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 5.1 | Existing 17-test suite; N/A for real modal DOM behavior. | Production DOM test file failed with `MODULE_NOT_FOUND: employee-number-modal.js`. | Three tests execute the shared production modal module. | Focus, Escape, forward/backward Tab, hidden and disabled controls covered. | Fixture construction centralized. |
| 5.2 | Existing stable-ID swap tests. | Characterization passed immediately because swap already leaves attendance outside its mutation boundary; no failure fabricated. | Runtime fixture confirms attendance object and ID lookup remain unchanged. | Two dates, Ana, Bruno, and unrelated Carla histories covered. | Snapshot and ID lookup assertions kept local to the test. |
| 6.1 | Failing production DOM tests. | Modal factory absent. | Browser/CommonJS injected-document factory made production behavior executable. | Open, close, active-state and keyboard paths covered. | Narrow factory owns only modal mechanics. |
| 6.2 | Failing production DOM tests. | Required DOM seam/harness absent after initial missing-module RED. | Minimal document, element, class, visibility, focus, attributes, and events support the exact production API. | Hidden and disabled controls excluded at runtime. | No unused standards-complete DOM features added. |
| 6.3 | Existing app suite; N/A pre-existing browser integration for legacy HTML/SW. | v2.1.0/modal precache contract failed against v2.0.5. | `index.html` delegates to shared module; `sw.js` precaches it at v2.1.0. | Script ordering, coordinator tests, and modal suite all remain green. | Removed duplicated inline mechanics. |
| 7.1 | Production DOM suite. | Initial missing seam proved tests were not exercising a test double implementation. | Exact module controls focus/keyboard state. | First focus, origin restoration, Escape, Tab, Shift+Tab, hidden and disabled all asserted. | One focusable query path. |
| 7.2 | Existing swap suite. | Existing behavior already satisfied preservation; recorded as characterization rather than retroactive RED. | Attendance remains byte-for-byte equal and resolvable by stable IDs. | Two owned histories plus unrelated employee data. | No attendance coupling added to the coordinator. |
| 8.1 | 21-test cumulative suite. | Inline behavior was not independently executable. | Inline focus/trap logic replaced by module calls. | Conflict close still clears pending state; DOM tests cover module close. | `index.html` retains only state bridge. |
| 8.2 | Full suite and syntax checks. | N/A verification task. | 21/21 Node tests, syntax, and diff hygiene pass. | Targeted DOM, attendance, domain, cache, and full-suite runs. | Work Unit 2 remains a focused +165 net-line slice. |

## Verification Evidence

- RED modal run: one file-level failure from missing `employee-number-modal.js`; existing UI/attendance tests 9 passed.
- RED cache run: attendance and coordinator tests passed; service-worker v2.1.0/modal-asset assertion failed.
- GREEN targeted run: 12 passed, 0 failed.
- GREEN full run: `node --test` → 21 passed, 0 failed.
- Fresh reproducible command: `npm.cmd test` → exit code 0; 21 passed, 0 failed.
- Syntax passed for inline application code, rules, modal, service worker, harness, and DOM tests.
- `git diff --check` passed.
- Supplementary browser acceptance was attempted; the local browser connection closed and the later file URL was blocked by browser policy. No browser success is claimed.

## Diff Accounting

These metrics describe different boundaries and MUST NOT be added together:

- Historical Work Unit 1 artifact estimate: 395 changed lines.
- Historical Work Unit 2 net file-line impact: +165. This is a net line-count metric, not exact additions plus deletions.
- Current integrated relevant diff excluding unrelated `.atl` files: **552 changed lines (535 additions, 17 deletions)**.
- Exact Work Unit 2 churn is unavailable because no intermediate commit or clean diff boundary exists between Work Units 1 and 2.

## Files Changed — Work Unit 2

| File | Action | Historical Net Lines |
|---|---|---:|
| `employee-number-modal.js` | Created | +50 |
| `tests/helpers/minimal-dom.js` | Created | +54 |
| `tests/employee-conflict-modal-dom.test.js` | Created | +52 |
| `tests/employee-conflict-ui.test.js` | Modified | +14 |
| `index.html` | Modified | -6 file lines |
| `sw.js` | Modified | +1 net line |
| **Historical Work Unit 2 net** | | **+165** |

## Deviations

- Task 5.2 could not honestly produce RED because Work Unit 1 already preserved attendance by stable ID. It is recorded as characterization coverage rather than fabricated failure.
- Supplementary browser acceptance could not complete due the browser connection/policy; executable production DOM tests provide the required evidence.
- Git branch/commit/push was intentionally not attempted because local `.git` is read-only and delivery belongs to the orchestrator.

## Remaining Tasks

None in Work Unit 2.