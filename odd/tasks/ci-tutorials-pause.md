# Temporarily pause automatic tutorial replay

## Objective and problem

Keep CI browser regressions while temporarily skipping automatic tutorial replay.
The upstream assertion failure is not diagnosed; this is a reversible scope change.

## Authorized scope and constraints

Only `.github/workflows/ci.yml`, `package.json`, the focused regression test, this
tracker, and `.sdd-review/ci-tutorials-pause/spec.md` change. Generated build stamps
may change only if required by existing tooling. No dependencies/lock changes,
application changes, remote operations, commits, or publication in this worker.
Preserve full local `test:e2e`, job identity, unit checks, and browser prerequisites.

## Work unit

- [x] T1: Add manual tutorial opt-in and CI-only non-tutorial replay; prove exact
  script preservation, retained browser coverage, routing, and failure propagation.

Route: delegated direct; multiple non-trivial files and test/build execution
require a bounded writer. Forecast: 100–180 authored changed lines, generated
files excluded. Delivery: ask-on-risk, one local work unit; parent owns commit,
review, and publication. No authored work-unit commit exists yet.

## Checks and progress

- Focused RED → GREEN: observed; `node --test tests/ci-tutorials-pause.test.js`
  failed 4/4 before behavior edits (exit 1), then passed 4/4 (exit 0).
- Full `npm test` once: passed 631/631, zero failures/skips (exit 0).
  Command: `PATH=/home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/.bin:$PATH npm test`.
  Node 22.23.2 and read-only TypeScript 6.0.3 match the project prerequisites.
  No dependency installation was needed; generated stamps were normalized below.
- `git diff --check`: passed. All seven changed/new paths match the authorized
  surfaces; no lockfile or application behavior changed. The only generated
  changes are the build timestamp/ID and matching service-worker cache stamp.
- Both protected originals: HEAD, main, index SHA-256, staged-diff SHA-256, and
  tracked-status SHA-256 match their pre-work snapshots exactly.
- Independent repository: pinned base `ed0e821`, requested feature branch, no
  remote, alternates, or shared Git directory. CodeGraph cache is locally excluded.
- Browser/Playwright, full E2E, recordings, device checks: N/A (no UI change).
- Pre-commit normalization: configured `core.hooksPath=.githooks` only in the
  isolated repository, then ran `sh .githooks/pre-commit` with the fixed
  `MINI_BUILD_TIME=2026-10-15T05:08:51.000Z`. Build ID: `20261015-050851-000`.
  A second identical invocation preserved all four version/stamp file hashes.
  Package version remains 2.17.2; package and lockfile bytes did not change.
  `sw.js` differs only in CACHE_VERSION; `build-info.js` only in stamp metadata.
- Post-normalization focused checks: `node --test tests/ci-tutorials-pause.test.js
  tests/bump-version.test.js tests/mini-version-auto-update.test.js
  tests/mini-update-freshness.test.js` passed 27/27, zero failures/skips.
  Both staged and unstaged `git diff --check` passed. Full suite was not rerun.
- Parent commit must reuse exactly `MINI_BUILD_TIME=2026-10-15T05:08:51.000Z`
  so the hook remains byte-convergent after candidate freeze.
- Parent commit, native review, GitHub run: pending; no CI-green claim.
- Engram mirror `odd/ci-tutorials-pause/tasks`: pending (no authoritative session
  identity supplied; worker must not write memory). Local locator is this file.

Implementation and local checks are complete. Parent work-unit commit/review
remain pending separately; the implementation checkbox conveys no review approval.
Next: parent spot-check with
`node --test tests/ci-tutorials-pause.test.js`, reconcile the mirror, then apply
ordinary commit/review policy. No remote execution or publication was performed.
