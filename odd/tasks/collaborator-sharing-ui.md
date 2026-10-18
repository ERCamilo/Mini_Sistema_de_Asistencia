# Collaborator sharing UI

Implement the approved sharing home and linked-device cards locally, keeping existing connection and restore behavior intact.

## Scope and boundaries

- Baseline and first review boundary: `b86899a` on `feat/integrate-mini-turn-main-20261015`.
- Current authorization (2026-10-18): the user accepted a complete draft PR to `main` (~135 files / ~17,050 lines) with an explicit size exception. Strategy: `exception-ok`. Parent owns publication; no merge, Pages/production deployment, live account/session use, backend/auth changes, or SSH is authorized.
- Native review of the original integration refused `lens_context_budget_exceeded`. Reviewing new UX commits does not approve imported history.
- Existing Spanish UI copy remains Spanish; identifiers, comments, and these documents use English.
- Memory mirror: **pending** because the host authoritative session identity is unavailable.

## Delivery plan

Forecast: approximately **500–900 authored changed lines** across the feature, including tests/docs and excluding compiled assets. One cohesive slicing pass: T1 home/cards, T2 local account photo, T3 remaining steps/regression acceptance. Historical strategy was `ask-on-risk`; current delivery strategy is `exception-ok` under the explicit complete-draft-PR authorization above. Do not compress code or omit tests to fit a line budget.

## Tasks

- [ ] **T1 — Fullscreen sharing home and truthful device cards.** Route: delegated-direct, multi-file implementation. Preserve keyed rows, focus, pending-action ownership, consent, lease predicates, safe diagnostics, and explicit restore boundaries. Mobile shells occupy the viewport with safe-area gutters and internal scrolling; desktop stays constrained. Make device linking primary and work association secondary. Check deterministic RED → GREEN, focused P2P suite, full suite, and local synthetic-peer browser fixture. Implementation verified locally; task closure awaits the parent-owned commit and native assessment/review.
- [x] **T2 — Local Google photo and initials fallback.** Later bounded writer. Consume only available local account profile data; no new authentication/network behavior. Preserve initials on missing/failed photo and accessibility.
- [ ] **T3 — Remaining sharing-step copy/navigation and regression acceptance.** Later bounded writer. Keep one shell, neutral device wording, existing hooks and tutorial consistency; verify the end-to-end local flow without claiming live-device coverage.

## T1 acceptance and evidence

- [x] Sharing home says `Compartir`, prominently offers `Vincular dispositivo`, and separates work association.
- [x] Device alias and real initials lead each card; linked and channel states are distinct. Green requires authenticated + open channel + valid lease. Offline fallback says `Sin conexión`; technical details start collapsed.
- [x] No invented owner, role, photo, or device model fields; no protocol/backend change.
- [x] Mobile 320/390px light/dark: fullscreen, safe-area padding, internal scroll, no horizontal overflow, accessible 44px controls. Desktop constrained.
- [x] Existing actions, focus, pending-close ownership, receiving/staging/restore, and diagnostics remain intact.

## T1 verification record

- Test-first RED: `node --test tests/connection-menu.test.js tests/connection-presentation.test.js tests/p2p-ui-wiring.test.js` — 53 tests, 41 passed / 12 expected failures before implementation. Additional focus-trap/vector-icon RED: 25 tests, 23 passed / 2 expected failures.
- Focused P2P checks initially passed 143/143. Final focused command adds `tests/ci-tutorials-pause.test.js` to the seven authorized focused files: **148/148 passed**, no skips.
- Initial `npm test`: 1075/1076 passed; the sole failure was `full local replay is unchanged and CI excludes only tutorial replay` (`tests/ci-tutorials-pause.test.js:9`). Appending to aggregate browser scripts violated their pinned contract. Restored those scripts and added only `test:e2e:connections`. Parent authorized one corrected full run: **1076/1076 passed**, no skips.
- `npm run test:e2e:connections` — **6/6 passed**, no skips. Uses shipped menu/presentation/CSS with synthetic peers and native action hooks, denies non-fixture-origin requests, and checks 320/390/1024px in light/dark, all channel predicates, pending ownership, alias wrapping, 44px controls, native details, keyboard trapping, work/account/device actions, and employee-send fullscreen/internal scrolling.
- The first browser pass exposed later stylesheet overrides of mobile height and toolbar ordering. Scoped selectors now beat the existing `connection-screens.css` rules without editing that file. Native personal-review and employee-send surfaces are also covered.
- Tutorial catalog inspected (`tests/tutorials/index.mjs`): attendance marking, employee creation, storage cleanup only. No scripted sharing tutorial is affected, so no tutorial rerecording or unrelated tutorial replay was performed.
- Normalization: `MINI_BUILD_TIME=2026-10-17T12:00:00.000Z npm run build` with the pre-existing TypeScript binary on PATH; build passed. Generated JS was produced only by TypeScript; build/cache stamps only by `scripts/stamp-build.mjs`. Stamp convergence verified: repeating the fixed-time stamp left both file hashes unchanged.
- Logs and four mobile screenshots: external recovery directory `collaborator-sharing-ui-20261017`. Screenshots inspected in both themes. No live TURN, Google account, real-device transfer, backend, protocol, schema, or restore behavior claim.
- Authored additions + deletions excluding generated connection JS/build/cache stamps: **436 authored lines (+395/-41)**. T1 is one cohesive home/cards behavior with its tests and specification; the one slicing pass remains T1/T2/T3. Parent must resolve the >400-line delivery decision before committing.
- Parent spot check: the three-file command below passed **54/54**, zero skips; `git diff --check` passed. Parent inspected the 390px light screenshot. Initial native assessment could not classify unstaged untracked documentation/browser files without explicit inventory selection; no review transaction or approval was created. Commit, properly inventoried native assessment/review, and delivery-size decision remain pending.

## Historical T1 handoff next step

Parent spot check: `node --test tests/connection-menu.test.js tests/connection-presentation.test.js tests/p2p-ui-wiring.test.js`. Parent owns commit identity, assessment/review, and task closure; no stage, commit, push, or PR was performed. T2/T3 remain unimplemented. Memory mirror remains pending. Rollback boundary: T1 authored files and generated connection assets only, without reverting imported integration history.

## T2 and initial T3 follow-up (2026-10-17)

- Added optional authenticated Google account photo metadata; display accepts only HTTPS Googleusercontent hosts, with initials when absent or failing. No new login, account or backend calls.
- Improved sharing return copy and linked-workflow labels. Other T3 navigation/acceptance remains open.
- TypeScript check: PASS. Full configured Node suite: 1078/1078 PASS. Live TURN and compatible visual browser rerun remain outstanding; do not claim approval of imported integration.

## T4 — Account focus stability and explicit connections CI (2026-10-18)

- [ ] **T4** — Route: delegated-direct (two behavior/config surfaces plus regression tests). Preserve the native account and summary nodes during duplicate profile emissions and actual identity updates; add a dedicated browser-job connections regression step without changing aggregate scripts.
- Authorized baseline: `185cc93cc43bf0c013757ebd8c894bce9429d8e2`. Existing T1/T2/follow-up commits `9f8bf9e`, `2d33b02`, `4754018`, `185cc93` were created externally, not by this writer; no native approval is implied. Prior tracker entries remain historical evidence, not current commit status.
- T3 and pending independent Judgment Day findings remain separate; this task does not authorize additional judge findings.
- Forecast: 100–250 new authored lines, excluding generated JavaScript/build stamps. Single writer; no stage/commit/publish in this handoff. Parent closes the work unit and records its commit.
- Acceptance: focused login/logout and secondary controls retain focus and DOM identity across unchanged metadata, failed/busy emits, and profile changes; photo fallback/account switch/sign-out stay current. No auth/network metadata contract changes or observer self-loop.
- Checks: deterministic executable CI-step RED; offline real-browser focus/identity RED → GREEN; focused eight-file Node command; connections browser suite; one full `npm test` using the existing TypeScript/tool-output environment; fixed-time build and convergence.
- Memory mirror remains pending: authoritative runtime identity unavailable. No feature mirror synchronization or native approval is claimed.

### T4 verification and handoff

- [x] Duplicate profile writes and actual account changes preserve summary/card/native-control DOM identity and focused login, logout, and secondary actions in offline Chromium. Effective identity snapshots suppress duplicate profile observer refreshes; actual identity/photo updates patch the existing card. Native auth/network behavior is unchanged.
- [x] Dedicated unconditional `Connections browser regressions` CI step exports the globally installed Playwright module and runs `npm run test:e2e:connections`. Aggregate scripts remain untouched. Its regression executes the shell with a stub and requires the command to execute; a commented command cannot satisfy it, and failure exits propagate.
- RED: `node --test tests/ci-tutorials-pause.test.js` — **4/5 passed, 1 expected failure** before CI change. Browser focus selection (`--test-name-pattern='account .* preserves native and secondary focus'`) — **0/2 passed, 2 expected failures**; native login survived as an object but focus and summary/card identity were lost.
- GREEN: CI regression **5/5**; account focus selection **2/2**; final complete offline connections browser command **20/20**, zero skips. Existing profile success/failure/account-switch/sign-out and Mini↔SA action coverage stayed green across widths/themes.
- Focused eight-file command: initial **87/88**, with one obsolete wiring assertion demanding the teardown expression that caused focus loss. Parent explicitly extended this task's surface to `tests/firebase-link-wiring.test.js`; replaced that assertion with persistent summary/native-control guards and retained auth-disabled protections. Final command: **88/88**, zero skips.
- One configured full `npm test`: **1079/1079 passed**, zero skips, with existing TypeScript 6 and `PRIVATE_TURN_TOOL_OUTPUT` pointing at the authorized local recovery tool output. No installs or remote activity.
- Known pre-existing CI setup gap remains separate: the unit job does not provision `PRIVATE_TURN_TOOL_OUTPUT` required by `tests/private-turn-proxy.test.js`. Local full-suite success is not a claim that hosted CI ran or that this unrelated setup gap is fixed.
- Normalization: `MINI_BUILD_TIME=2026-10-17T12:00:00.000Z npm run build`; compiled JavaScript and stamp/cache bytes converged on repetition. No generated JavaScript or stamp/cache edits by hand. `git diff --check` passed.
- External logs: `collaborator-sharing-ui-review/t4-{ci-red,account-red,ci-green,account-green,focused,focused-final,browser,browser-final,full,build-final,build-convergence}.log`. Final hash manifest and diff hash are in the same external recovery directory.
- Implementation/checks are complete locally; T4 task closure awaits the parent-owned work-unit commit and independent readback. No stage, commit, push, PR, native review, merge, or deployment occurred in this handoff. Pending T3 and blind-judge findings remain separate.

- Final authored delta: **199 lines** (additions plus deletions; excludes generated connection JavaScript and stamp/cache files). One cohesive T4 fix/check unit, without artificial compression.

### Independent dual review and parent acceptance

- User explicitly requested two GPT-6 Luna judges. Both inspected immutable commit `185cc93cc43bf0c013757ebd8c894bce9429d8e2` independently; neither found a severe issue. Judge A recorded one informational warning: the header offers sign-in when Google is unavailable in the build. This warning was not automatically expanded into this fix.
- Both judges then inspected only the frozen ledger and T4 delta to immutable tree `f7de7987961ed294ce1c674a98d39c585fec4135`; neither found a fix-caused defect. One scoped re-judgment round, no Judgment Day correction round, zero confirmed/suspect severe issues, zero contradictions, one informational warning.
- Parent spot check: **17/17 passed**, zero skips; diff whitespace check passed. This is standalone dual-review acceptance of the scoped UX delta, not a native receipt, approval of imported history, hosted CI success, or live TURN/device proof.
- External frozen ledger: `collaborator-sharing-ui-review/judgment-day-ledger.json`. Parent work-unit commit identity will be recorded after commit; no remote publication is part of this review task.
