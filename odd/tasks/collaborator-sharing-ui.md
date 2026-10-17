# Collaborator sharing UI

Implement the approved sharing home and linked-device cards locally, keeping existing connection and restore behavior intact.

## Scope and boundaries

- Baseline and first review boundary: `b86899a` on `feat/integrate-mini-turn-main-20261015`.
- Local implementation only; no push, PR, remote operation, or real account/session use is authorized.
- Native review of the original integration refused `lens_context_budget_exceeded`. Reviewing new UX commits does not approve imported history.
- Existing Spanish UI copy remains Spanish; identifiers, comments, and these documents use English.
- Memory mirror: **pending** because the host authoritative session identity is unavailable.

## Delivery plan

Forecast: approximately **500–900 authored changed lines** across the feature, including tests/docs and excluding compiled assets. One cohesive slicing pass: T1 home/cards, T2 local account photo, T3 remaining steps/regression acceptance. Strategy: `ask-on-risk`; chain strategy not selected and no PR authorized. Parent must resolve the over-budget delivery decision before the next affected commit. Do not compress code or omit tests to fit a line budget.

## Tasks

- [ ] **T1 — Fullscreen sharing home and truthful device cards.** Route: delegated-direct, multi-file implementation. Preserve keyed rows, focus, pending-action ownership, consent, lease predicates, safe diagnostics, and explicit restore boundaries. Mobile shells occupy the viewport with safe-area gutters and internal scrolling; desktop stays constrained. Make device linking primary and work association secondary. Check deterministic RED → GREEN, focused P2P suite, full suite, and local synthetic-peer browser fixture. Implementation verified locally; task closure awaits the parent-owned commit and native assessment/review.
- [ ] **T2 — Local Google photo and initials fallback.** Later bounded writer. Consume only available local account profile data; no new authentication/network behavior. Preserve initials on missing/failed photo and accessibility.
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

## Next step

Parent spot check: `node --test tests/connection-menu.test.js tests/connection-presentation.test.js tests/p2p-ui-wiring.test.js`. Parent owns commit identity, assessment/review, and task closure; no stage, commit, push, or PR was performed. T2/T3 remain unimplemented. Memory mirror remains pending. Rollback boundary: T1 authored files and generated connection assets only, without reverting imported integration history.
