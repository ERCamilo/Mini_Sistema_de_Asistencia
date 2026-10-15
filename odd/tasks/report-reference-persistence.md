# Preserve confirmed employee report references across reload

Confirmation must wait for startup hydration and the reference snapshot write before reporting success. This bounded fix preserves the synchronous report ledger API and the existing storage schema.

## Scope and constraints

- Two bounded tasks, delegated direct: persistence repair, then integration of reviewed browser-test bytes and combined verification.
- Forecast: 150–350 authored changed lines (generated JavaScript excluded); one coherent bugfix work unit, ask-on-risk delivery strategy.
- Authorized surfaces: `src/employee-report-ui.ts`, its compiled `employee-report-ui.js`, `index.html`, `tests/employee-report-ui.test.js`, `tests/employee-report-wiring.test.js`, `tests/e2e/employee-report.e2e.mjs`, this document, `.sdd-review/report-reference-persistence/spec.md`, generated `build-info.js` and `sw.js` stamps.
- No persistence redesign, schema changes, tutorial/CI/TURN source changes, installs, production data, or main merge. This worker performs local integration only; the parent owns authorized PR updates.
- Base: `ed0e8213cca82e7fdcfbb398eea0ed5a5eb45e5d`; independent local repository, feature branch `fix/report-reference-persistence-20261015`.

## Task

- [x] T1 Reproduce delayed reference persistence, gate UI success on startup and completed storage, and verify reload retains the reference.
  - Acceptance: pending confirmation stays busy/unconfirmed; duplicate confirmation, refresh, and export are blocked; rejection is retryable; success occurs once after durable IndexedDB or explicit localStorage fallback.
  - Startup must finish before reporter mutation; scope is checked again after waiting.
  - Strict test-first: deferred readiness/write unit tests RED → GREEN; deterministic browser snapshot delay if local tooling is usable.
  - Checks: `node --test tests/employee-report-ui.test.js tests/employee-report-wiring.test.js`; focused browser `node --test --test-name-pattern='primer reporte' tests/e2e/employee-report.e2e.mjs`; one full `npm test`; deterministic build and twice-convergent pre-commit hook.

- [ ] T2 Integrate the exact reviewed theme test and verify the combined report candidate (checks complete; parent commit/review pending).
  - Authorized integration surfaces: `tests/e2e/theme.e2e.mjs`, this document, the existing report spec, and generated build/service-worker stamps only.
  - Forecast: 80–110 additional authored lines; report PR approximately 350 total. No standalone theme tracker/spec or application behavior change.
  - Reuse blob from `64f1fd0875b0604ebc347ee593eff25d74c48083`; no new RED run because the exact reviewed test already has observed deterministic RED evidence.
  - Normalize before checks, preserve version/lock 2.17.2, run the hook twice for convergence, then one full `npm test` and one full `npm run test:e2e` including tutorial checks.
  - Preserve HEAD, main, absolute index identity/bytes, staged diff and status of all six protected source repositories. Local objects only; no source ref/index edits, installs or remote operations.
  - Commit and native integration review pending with the parent; Engram mirror pending.

## Progress and evidence

- T1 completed in local work-unit commit `edc0d6e`; parent spot check passed 12/12. Native assessment: medium, `review_due=false`, `under_budget` (279 changed lines). Review remains deferred in this slice; no approval is claimed.
- Baseline browser without an injected delay: 1/1 passed (race is timing dependent). Holding only the actual reference snapshot write reproduced reload loss: 0/1 passed, expected `Número: 22 → 33`, actual full roster including Beto.
- Focused unit RED: 6 passed / 6 failed before implementation. GREEN and post-normalization: 12/12 passed, no skipped/cancelled tests.
- Focused browser GREEN: 2/2 passed; delayed snapshot blocks success and controls until release, reload retains delta, existing write-failure fallback also retains delta.
- Full `npm test` run once: 633/633 passed, zero failures/skips/cancellations. This includes TypeScript compilation; full E2E/tutorial recordings were intentionally not run under the authorized focused scope.
- Build/normalization: `MINI_BUILD_TIME=2026-10-15T11:30:00.000Z`, existing compiler 6.0.3. Only authorized compiled JavaScript changed. Two pre-commit hook runs produced identical tracked candidate hash `8202546809eaf0d9eefde9c670eaa4916acefbaff61849b373e921d6e45e6caa` and stage-entry hash `6ef0765b6977ca8ba37b73a7abaa5319e0929cae54497a28160a564259f46caa`; package/lock remain 2.17.2 and unchanged. Hashes precede this documentation update and do not cover untracked documents.
- Browser prerequisites: existing Playwright Core 1.63.0 and system Chromium 155. Cached Chromium 1194 has no binary. An in-memory Node preload supplies `/snap/bin/chromium`; `TMPDIR=/home/ubuntu/snap/chromium/common` permits isolated snap browser profiles. No install or harness-file edit was required.
- Storage policy is unchanged: a completed startup with `localDbReady=false` and the legacy database still enabled fails closed. This includes existing `legacy-authoritative` migration results without explicit fallback. No MiniData attendance flag or migration behavior changed.
- No success guarantee exists for reload/abrupt termination before confirmation reports success.
- Parent completed the local commit and spot check. Publication, PR creation, merge, production access and any deferred native review remain pending; no remote mutation was performed for this fix.
- Engram mirror pending. A discovery write (#1043) accidentally occurred without authoritative session identity; no further memory writes or repairs were attempted after the parent clarified the prohibition.

## Integration review context

- Report repair commits `edc0d6e` / `ad7c8b5` were approved in closed lineage `review-c82823af85637de1`. Theme commit `64f1fd0` was approved in lineage `review-4c9317dd0a719704`; the parent consumed its exact acknowledgement. These approvals do not replace review of changed integration bytes.
- Theme RED already demonstrated a held IndexedDB write: parse-time Sol was later hydrated to dark, so the next tap produced Sol rather than the expected dark. Reviewed GREEN: 5/5 theme browser tests, 627 unit tests at `ed0e821`, and parent spot check 3/3. No production theme behavior changes.
- Planned PR relationship: PR #18 targets `main`; after this report integration is committed, PR #17 will target the report branch and contain only its CI/tutorial opt-in unit. No main merge, production access or force push is authorized.

## T2 verification

- Exact theme blob: `52ea29cff28fed08932a91d5433afdfcdc6b6fbc`, identical to `64f1fd0`; no application-source changes relative to `ad7c8b5`. No new theme documents were added.
- Normalization preceded functional checks: `MINI_BUILD_TIME=2026-10-15T12:48:09.000Z node scripts/stamp-build.mjs`, then `.githooks/pre-commit` twice with the same override. Both hooks produced working-diff SHA-256 `6935b080167901c1f30f32663fd7a5266b62a9ae37b3c542d48d0b194689d833` and stage-entry SHA-256 `0e6b698c3cd71eb96b9aaf9a73b30fa7970984fe4f2c6082f23f2ea89e16b9d4` (before this evidence update). Package/lock remain unchanged at 2.17.2; this isolated clone has no `origin/main`.
- Full `npm test` once: 633/633 passed; zero failures, skipped or cancelled tests. Existing compiler 6.0.3 ran; compilation left all application bytes unchanged.
- Full `npm run test:e2e` once: 40/40 passed in 72.54 seconds, including five theme tests and the existing tutorial replay/caption checks; zero failures, skipped or cancelled tests. No recording update was needed.
- Browser setup reused local Playwright Core 1.63.0, Chromium 155 and axe-core 4.14.0 via the existing local-only wrapper; synthetic data only, no installs or non-local browser requests.
- `git diff --check` passed. All six protected source repositories retain identical HEAD/main, absolute index path/hash, staged diff and status snapshots. The independent clone has no alternates; only generated stamps are staged by the hook.
- RED repetition: N/A, exact previously reviewed test bytes were reused rather than new logic. Integration commit/review/publication: pending parent; no worker commit, remote operation or native review. Engram mirror remains pending.

## Next step

Hand the verified uncommitted candidate to the parent for commit/review and authorized PR #18 update. CI stacking is a later dependent unit, not part of this worker. Preserve the fixed timestamp for convergent hooks; TURN remains out of scope.
