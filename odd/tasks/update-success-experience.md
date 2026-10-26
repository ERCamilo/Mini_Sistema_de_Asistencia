# Update successfully and continue working

## Outcome and scope
Explicit updates keep the existing save/download guards. The newly running version confirms a one-use receipt, shows a large green vector check and returns to work without another confirmation. Release notes describe benefits without technical acronyms. Production TURN remains disabled; no infrastructure or publication is authorized.

## Plan
- [x] U1: Test and implement the one-use update receipt and honest fresh-boot success.
- [x] U2: Add accessible, reduced-motion-aware success presentation and clear release copy.
- [x] U3: Normalize version 2.17.10, verify unit/release/browser flows and capture visual proof.

Route: delegated direct (multiple non-trivial files and browser execution). Test first: deterministic manager and release-copy RED → GREEN, then real worker/browser validation. Initial forecast: 450–650 authored changed lines including tests/docs; actual candidate is under 400 total changed lines, so one coherent review unit fits; delivery strategy `ask-on-risk`. No commit or publication in this phase; request slice/size decision before committing if over budget. Base: `95863def6d1ef212b2194c09bfdac90324b5cd24`.

## Acceptance
- Successful save and shell confirmation precede receipt and reload; failures/cancellation never claim success.
- Only the intended newly running version consumes the receipt, once; ordinary refresh/first install do not show success.
- Manual release history remains available, while explicit update does not reopen automatic news.
- User data is preserved; no dependency/CDN, new remote operations or production TURN activation.
- Green SVG plus text works in supported themes and without motion. App becomes usable without clicking Accept.
- Published release history is preserved; human copy is a presentation concern for legacy entries.

## Evidence and next step
Implementation and verification are observed; the single work-unit commit and native review remain parent-owned and pending. No push, PR or deployment occurred.

| Check | Observed result |
| --- | --- |
| Deterministic initial RED | 20 passed, 3 failed (receipt and human-copy regressions) |
| Focused final unit | 42 passed, 0 failed |
| Full unit | 1186 passed, 0 failed, 1 known upstream attendance-size TODO |
| Release guard against pinned main | Passed for 2.17.10; published history preserved |
| Real service-worker update flow | Passed save failure, download failure, successful refresh/reload, automatic success dismissal, no repeated news and employee preservation |
| Final browser CI | 31 passed, 0 failed |
| Connections browser | 50 passed, 0 failed |
| Visual checks | Dark/light 320px screenshots inspected; reduced motion disables animation; manual history remains available in all five themes |

Evidence: `/home/ubuntu/.cache/mini-update-success-20261023/`. Native normalization uses `MINI_BUILD_TIME=2026-10-23T10:30:00.000Z`. Initial browser harness checks needed animation completion and actual theme persistence before measurement; an offline-navigation aborted run was retained, and the final fixture restores normal canonical navigation after the immediate stale-page scenario. Final focused browser and full CI passed.

## Rollout limitation
The current 2.17.9 updater does not create this new receipt. Therefore its first upgrade to 2.17.10 can still show the legacy news confirmation. The automatic check/return is guaranteed for explicit updates initiated by 2.17.10 or later. Do not infer intent from an ordinary refresh or fabricate success to hide that migration limit. The real-worker test exercises the new manager across two locally served versions, not the old 2.17.9 manager. Parent explicitly accepted preserving this safe boundary rather than adding unplanned worker interoperability.

Memory mirror pending: authoritative runtime session identity unavailable; no memory writes permitted.

## Recovery investigation — 2026-10-23

User report: clicking Update closes the modal without the requested animation or an apparent version change. Reopened against published main `0ed98ddc3e48c23d260cba39e8b42382d17c91b5`; local branch `fix/update-success-recovery-20261023`. No production implementation has changed in this investigation.

- [x] R1: Reproduce the failed CI check with its real accessibility configuration, then test the actual published 2.17.9 application and worker upgrading to 2.17.10.
- [x] R2: Parent authorized only the accessibility-test lifecycle correction; product/cache behavior remains unchanged.
- [x] R3: Correct auditor injection, observe focused RED → GREEN, and verify the full configured browser suite plus current-version behavior.

Route: delegated direct (real-browser reproduction and related test/runtime inspection). Commit, review and publication remain parent-owned and unauthorized in this phase. Scope forecast awaits the correction decision; stop before any commit if authored changes exceed 400 lines. Memory mirror remains pending.

Observed RED on unchanged main:
- `node --test tests/e2e/app-updates.e2e.mjs` with the configured `AXE_PATH`: 0 passed, 1 failed, `ReferenceError: axe is not defined` at line 107. This matches main CI run `39933982105`; the accessibility script is injected once, then a theme-loop reload discards it before the next audit. Update/reload assertions before that failure pass.
- `actual published 2.17.9 Update button installs 2.17.10, preserves employees and confirms success`: 0 passed, 1 failed on success visibility. The real 2.17.9 manager, HTML and worker install 2.17.10 successfully; both runtime and displayed versions are 2.17.10, employee data is unchanged, no page errors occur, but no receipt exists and legacy news requires Entendido. The reported failure to install has NOT been reproduced.
- Pages deployment for main succeeded; the public release manifest reports 2.17.10.

Evidence: `/home/ubuntu/.cache/mini-update-recovery-OBS1Eq/` contains the two RED logs, the pinned full legacy snapshot, the real-upgrade harness and before/after screenshots (visually inspected). No success DOM, receipt or fake version was injected into the legacy upgrade.

Next decision: establish the user's actual starting version/visible modal before a product fix for the still-unreproduced no-install symptom. Supporting the first legacy upgrade requires a deliberate compatibility design because its executing manager cannot create the new tab receipt.


### Bounded test correction and final checkpoint

`tests/e2e/app-updates.e2e.mjs` now injects axe into the current document immediately before each accessibility audit. All WCAG assertions remain active; no failure is skipped or swallowed. The runtime, release version and generated assets remain unchanged at 2.17.10. No commit, native review, push or PR was run.

| Check | Observed result |
| --- | --- |
| Focused browser, configured `AXE_PATH` | RED 0 passed / 1 failed before the edit; GREEN 1 passed / 0 failed after it |
| Manager/version/freshness focused unit files | 42 passed, 0 failed |
| Native `npm run test:e2e:ci`, configured `AXE_PATH` | 31 passed, 0 failed; one full run |
| Release guard against main `0ed98dd` | Passed: 2.17.10, no application changes |
| Current published version, actual UI | More → Buscar actualizaciones reports “Ya tienes la versión actual (v2.17.10).”; before/after runtime and displayed version remain 2.17.10; no reload, update offer or fake success; employees preserved |
| Mobile visual checks | Inspected dark/light 320px screenshots, large centered green SVG check; light reduced-motion assertion passes; automatic dismissal remains verified |
| Diff whitespace | Passed |

The checked-in update fixture still uses the current manager with substituted version strings; its dark/light presentation checks explicitly seed receipts. These checks prove the current implementation and presentation, NOT the real legacy migration. The separate full-asset legacy regression remains RED outside the repository and has not been weakened to accept missing success. No-install remains unreproduced.

Evidence remains in `/home/ubuntu/.cache/mini-update-recovery-OBS1Eq/`: `ci-red.log`, `ci-focused-green.log`, `unit-focused.log`, `e2e-ci-green.log`, `release-guard.log`, `current-version-check.log`, and `focused-green/*.png`. The current-version screenshot shows the exact no-update message and installed version. The immediate real-worker screenshot catches the draw animation mid-frame; the dark/light screenshots show its completed check.

## Hotfix investigation — current 2.17.10 report

The user reports the same failure while running 2.17.10 and authorizes a local hotfix. Do not treat the older 2.17.9 receipt limitation as its cause. Production `miniasist.erlin.do` HTML, update modules, version, CSS, build information and worker match published main byte-for-byte on this check.

- [x] H1: Exercise genuine archived 2.17.10 assets → a complete natively generated 2.17.11 candidate using the real update offer and button. The flow passed without a functional fix; no relevant functional RED was found.
- [x] H2: Correct the independently confirmed stale-boot receipt loss; persistence/failure/cancellation and honest fresh-version success checks pass.
- [x] H3: Run full checks and inspect all five mobile-theme screenshots, including light reduced motion. Parent-owned commit/review/publication remain pending.

Route: delegated direct. Strict behavior RED → GREEN; preparing the next release's full asset set is reproduction setup, not a functional fix. No speculative cache reset, receipt heuristic or new protocol is authorized. If the exact full-asset upgrade passes and causality remains unknown, stop with the missing reproduction input. Preserve the previously verified test-only correction. Provisional hotfix budget: under 400 authored changed lines. No commits or publication.


### Hotfix reproduction outcome — resumed 2026-10-24

The actual full-asset 2.17.10 → 2.17.11 test passes on unchanged updater behavior. Steps: install the archived published 2.17.10 application and worker in a fresh sandboxed browser, seed one synthetic employee, switch the loopback server to the complete natively generated 2.17.11 release fixture, let the real worker update produce the update offer, then click **Actualizar ahora**. The new boot reports runtime **2.17.11** and displayed **v2.17.11**, consumes its genuine receipt, shows the large green check without news, dismisses automatically, preserves the employee, and stays silent on ordinary reload. No receipt, success DOM or runtime version was injected. The completed check screenshot was inspected.

The release-only fixture had no functional changes. Its source metadata and native build outputs were archived outside the repository, then the owned worktree was regenerated back to the exact published 2.17.10 version/build. No release or runtime diff remains. Evidence: `/home/ubuntu/.cache/mini-update-hotfix-u2tSnm/`, including `current-upgrade.log`, `current-upgrade-resume.log`, before/after screenshots, the full old and candidate asset sets, and restoration log.

H2 and H3 remain pending: no causal functional RED was observed, so no guessed runtime hotfix or unnecessary release bump is being delivered. Full unit and Connections suites were not rerun for an absent functional change; the earlier test-only correction retains its observed 42 focused tests and 31 configured CI-browser passes. The next useful input is a short recording showing the user's exact modal, button and result on their 2.17.10 installation. A legacy upgrade and an already-current check are distinct verified cases, not explanations assumed for this report.

## Confirmed conditional defect — 2026-10-26
Independent audit reproduced premature receipt deletion: a boot older than the intended target clears the receipt before matching its version, so the later correct boot shows news instead of success. This conditional defect is confirmed; it is not established as the user's production cause. Main remains `0ed98dd`.

H2 is now authorized for this root only. Policy: validate an increasing semantic-version receipt; retain it while the running version is within `[from, target)`; consume once only at `target`; discard malformed, non-increasing, before-source and overshot receipts without success. Storage failure must not prevent an otherwise valid update. No new state, timers, cross-tab fallback or cache-reset behavior. Add deterministic RED first, then a full published-asset upgrade and a separately identified stale-policy-asset browser case. Forecast remains approximately 300–400 authored lines; report any overage honestly before commit.

### Conditional hotfix implementation
- Receipt ordering: original manager RED (`retain at 1.9.0`, 18 passed / 1 failed), corrected focused suite GREEN (44 passed).
- Full unit: 1188 passed, 0 failed, 1 existing attendance-message-size TODO.
- Configured browser CI: final 36 passed, 0 failed, including five new full-published-asset cases and actual success-overlay axe audits. Initial fixture runs exposed the light subtitle contrast error and background-tab animation throttling; neither failure was suppressed. The subtitle now uses the normal text token, and the user-clicked tab is explicitly foregrounded.
- Release guard against `0ed98dd`: passed for 2.17.11; published history preserved. Fixed native normalization: `MINI_BUILD_TIME=2026-10-26T12:00:00.000Z`.
- Parent authorized only two extra CI lines: browser checkout `fetch-depth: 0`, required by the pinned historical asset fixture.

Proof: `/home/ubuntu/.cache/mini-update-receipt-hotfix-r3Bdyq/`. Includes unit RED/GREEN, contrast RED, fixture diagnostic failures, final CI log, build/release proof and screenshots. The dark conditional browser case is explicitly mixed-policy-cache recovery, while the other four cases use full old → full new assets. No receipts, version strings or success DOM are fabricated. Receipt-storage failure still permits the update without promising animation. Mobile-viewports in Chromium do not prove other engines or physical devices. Memory mirror remains pending; no commit, review or publication yet.


Final checkpoint: Connections **50 passed / 0 failed**; separate visual full-release run **5 passed / 0 failed**. Inspected all five 320px screenshots: centered vector check, readable subtitle, no additional confirmation button. Final browser CI **36 passed** includes the five-theme axe run; visual capture intentionally omits axe because both compete for the automatic-dismiss window, not because accessibility is skipped overall. `git diff --check` passes. One coherent hotfix remains below 400 authored changed lines; no commit or publication occurred. Next: parent structural/readback and ordinary delivery decisions, retaining the distinction between the confirmed conditional bug and the unproven production cause.
