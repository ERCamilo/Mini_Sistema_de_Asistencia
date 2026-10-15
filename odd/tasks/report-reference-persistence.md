# Preserve confirmed employee report references across reload

Confirmation must wait for startup hydration and the reference snapshot write before reporting success. This bounded fix preserves the synchronous report ledger API and the existing storage schema.

## Scope and constraints

- One task, delegated direct: unfamiliar persistence race requires implementation and focused verification together.
- Forecast: 150–350 authored changed lines (generated JavaScript excluded); one coherent bugfix work unit, ask-on-risk delivery strategy.
- Authorized surfaces: `src/employee-report-ui.ts`, its compiled `employee-report-ui.js`, `index.html`, `tests/employee-report-ui.test.js`, `tests/employee-report-wiring.test.js`, `tests/e2e/employee-report.e2e.mjs`, this document, `.sdd-review/report-reference-persistence/spec.md`, generated `build-info.js` and `sw.js` stamps.
- No persistence redesign, schema changes, tutorial/CI/TURN changes, installs, remote operations, production data, or publication.
- Base: `ed0e8213cca82e7fdcfbb398eea0ed5a5eb45e5d`; independent local repository, feature branch `fix/report-reference-persistence-20261015`.

## Task

- [ ] T1 Reproduce delayed reference persistence, gate UI success on startup and completed storage, and verify reload retains the reference.
  - Acceptance: pending confirmation stays busy/unconfirmed; duplicate confirmation, refresh, and export are blocked; rejection is retryable; success occurs once after durable IndexedDB or explicit localStorage fallback.
  - Startup must finish before reporter mutation; scope is checked again after waiting.
  - Strict test-first: deferred readiness/write unit tests RED → GREEN; deterministic browser snapshot delay if local tooling is usable.
  - Checks: `node --test tests/employee-report-ui.test.js tests/employee-report-wiring.test.js`; focused browser `node --test --test-name-pattern='primer reporte' tests/e2e/employee-report.e2e.mjs`; one full `npm test`; deterministic build and twice-convergent pre-commit hook.

## Progress and evidence

- Implemented and functionally verified T1; parent commit and independent review remain pending, so the task is not yet closed.
- Baseline browser without an injected delay: 1/1 passed (race is timing dependent). Holding only the actual reference snapshot write reproduced reload loss: 0/1 passed, expected `Número: 22 → 33`, actual full roster including Beto.
- Focused unit RED: 6 passed / 6 failed before implementation. GREEN and post-normalization: 12/12 passed, no skipped/cancelled tests.
- Focused browser GREEN: 2/2 passed; delayed snapshot blocks success and controls until release, reload retains delta, existing write-failure fallback also retains delta.
- Full `npm test` run once: 633/633 passed, zero failures/skips/cancellations. This includes TypeScript compilation; full E2E/tutorial recordings were intentionally not run under the authorized focused scope.
- Build/normalization: `MINI_BUILD_TIME=2026-10-15T11:30:00.000Z`, existing compiler 6.0.3. Only authorized compiled JavaScript changed. Two pre-commit hook runs produced identical tracked candidate hash `8202546809eaf0d9eefde9c670eaa4916acefbaff61849b373e921d6e45e6caa` and stage-entry hash `6ef0765b6977ca8ba37b73a7abaa5319e0929cae54497a28160a564259f46caa`; package/lock remain 2.17.2 and unchanged. Hashes precede this documentation update and do not cover untracked documents.
- Browser prerequisites: existing Playwright Core 1.63.0 and system Chromium 155. Cached Chromium 1194 has no binary. An in-memory Node preload supplies `/snap/bin/chromium`; `TMPDIR=/home/ubuntu/snap/chromium/common` permits isolated snap browser profiles. No install or harness-file edit was required.
- Storage policy is unchanged: a completed startup with `localDbReady=false` and the legacy database still enabled fails closed. This includes existing `legacy-authoritative` migration results without explicit fallback. No MiniData attendance flag or migration behavior changed.
- No success guarantee exists for reload/abrupt termination before confirmation reports success.
- Parent owns commit, independent verification, native review and any publication. No commit, remote operation, PR, merge, or production access performed.
- Engram mirror pending. A discovery write (#1043) accidentally occurred without authoritative session identity; no further memory writes or repairs were attempted after the parent clarified the prohibition.

## Next step

Parent spot check: `node --test tests/employee-report-ui.test.js tests/employee-report-wiring.test.js`. Review the local diff and complete the commit/review decision; use the fixed build timestamp for any convergent commit hook. Task completion checkbox, commit identity, review outcome and publication remain pending.
