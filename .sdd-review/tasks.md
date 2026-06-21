# Tasks: Prevent Duplicate Employee Numbers

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | Unit 1: 395 complete; Unit 2: 165 net lines complete; combined net: 560 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 feature behavior -> PR 2 executable DOM/attendance evidence |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Unique-number rules, coordinator, conflict UI, offline assets | PR 1 | Base: feature/tracker branch. Complete at 395 lines; includes its 17-test regression net. |
| 2 | Execute real modal DOM behavior and prove attendance ownership | PR 2 | Base: PR 1 branch. Complete; 21-test cumulative suite. |

Recommended strategy: **feature-branch-chain** because Unit 2 closes Strict TDD evidence gaps in Unit 1 before the integrated feature reaches main.

## Work Unit 1 — Completed Feature Slice

### RED — Foundation
- [x] 1.1 Add dependency-free `node --test` command.
- [x] 1.2-1.4 Record failing rule tests for normalization, exclusion, suggestion, cancellation, swap, and immutability.

### GREEN — Rules and Integration
- [x] 2.1-2.4 Implement normalization, conflict lookup, max+1, stable-ID immutable swap; make rule tests green.
- [x] 3.1-3.5 Add accessible conflict UI; wire create/edit recovery, pending-state cleanup, and view refresh.

### REFACTOR / Verification
- [x] 4.1-4.4 Refactor handlers, update offline cache, run 17-test suite and manual scenarios, confirm import/restore scope.
- [x] 4.5 Record honest limitation: no pre-existing automated safety net existed for `index.html` or `sw.js`; manual/source evidence is supplementary.

## Work Unit 2 — Completed Verification Remediation

### RED
- [x] 5.1 Add `tests/employee-conflict-modal-dom.test.js` expecting production focus entry/restoration, Escape close, and Tab/Shift+Tab wrapping; confirm failure before the shared DOM seam exists.
- [x] 5.2 Add a runtime fixture in `tests/employee-conflict-ui.test.js`: swap numbers, then assert attendance data and ownership lookup remain unchanged by employee ID.

### GREEN
- [x] 6.1 Create `employee-number-modal.js` as a dependency-free browser/CommonJS factory using an injected `document`.
- [x] 6.2 Create `tests/helpers/minimal-dom.js` for only the DOM APIs used by production modal behavior; make DOM tests pass.
- [x] 6.3 Delegate `index.html` modal focus/keyboard behavior to the shared module; precache it in `sw.js` with a cache bump.

### TRIANGULATE
- [x] 7.1 Cover first focus, origin restoration, Escape, Tab/Shift+Tab wrap, and hidden/disabled controls through real production behavior.
- [x] 7.2 Cover two attendance histories and unrelated attendance; prove stable-ID ownership before and after swap.

### REFACTOR / Verify
- [x] 8.1 Remove superseded inline modal mechanics without changing conflict state or domain contracts.
- [x] 8.2 Run all Node tests, syntax checks, diff hygiene, and supplementary browser acceptance; update apply evidence without claiming retroactive safety coverage.

## Work Unit 2 Completion Evidence

- Modal RED: missing `employee-number-modal.js` caused the production DOM suite to fail before implementation.
- Attendance fixture passed immediately as a characterization of existing stable-ID behavior; no retroactive failure was fabricated.
- Cache RED: updated v2.1.0/modal asset expectation failed before `sw.js` changed.
- Final suite: 21 passed, 0 failed with `node --test`.
- `npm.cmd test` invoked the same `node --test` script; this environment did not return the child reporter/exit code, so direct Node execution is the authoritative result.
- Inline and file syntax checks passed; `git diff --check` passed.
- Supplementary browser acceptance was unavailable after the local browser connection closed; executable DOM tests are authoritative.
- Work Unit 2 net line impact: +165 lines across the focused seam/tests/wiring.