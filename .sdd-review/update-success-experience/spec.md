# Successful updates without repeated confirmation

## Change
After the user explicitly applies an update, retain save-before-download and confirmed worker refresh. Persist a tab-scoped one-use receipt only after those operations succeed. On a fresh boot of the exact intended newer version, consume it, advance the news reference without regression, and display a large green SVG check with “Actualización completada”. Dismiss the success state automatically into the existing app; do not reopen its automatic news modal.

This supersedes only the post-explicit-update news confirmation in the older release/cache specifications. First installation, ordinary reload, postponed updates, manual news, persistence failures and cancellation retain their existing semantics. A stale or unmatched receipt cannot declare success. Receipt storage failure never produces a false success or a reload loop.

## Presentation
Success is announced politely, contains both text and vector shape, uses theme tokens and respects reduced motion. It requires no button and does not take focus away from work. Release copy explains features and benefits in neutral Spanish; curated presentation wording may clarify legacy entries without rewriting published canonical history. New version: 2.17.10.

## Verification
Manager regression cases cover receipt ordering, exact-version match, consumption, storage failures, cancellation and manual history. A real local service worker updates between two versions while preserving employees; browser checks verify check visibility, automatic return, no repeated news, themes and reduced motion. Full unit, release and existing Connections suites remain required. No live TURN or Google claim follows from these synthetic tests.

## First-upgrade compatibility
The existing 2.17.9 manager cannot emit the new receipt. Its first upgrade to this release may still display legacy news. The automatic completion flow starts with updates initiated by 2.17.10 or later. No heuristic based on last-seen version alone is permitted: a normal reload is not proof that the user completed an update. Worker-protocol migration is outside this bounded change.

## Recovery acceptance (investigation open)
The user reports no animation and no apparent installation after Update. Test an actual published legacy application, not the current manager with a substituted version string. Record both the loaded policy version and the displayed version after clicking the real button, preserve stored employees, and inspect the resulting UI. The initial legacy reproduction installs correctly but still opens legacy news without a success receipt; the separate no-install symptom remains unverified.

Browser evidence must use the CI accessibility configuration. A page reload removes injected accessibility tooling; every audit must run in a document where that tooling has been loaded. A passed run without `AXE_PATH` does not prove the configured CI check.

No runtime correction is authorized by these findings alone. Preserve the first-upgrade compatibility boundary until a scoped design is approved; never infer explicit completion from an ordinary refresh or last-seen version.


## Approved recovery slice: accessibility test lifecycle
Only the browser harness is corrected: load axe in the current page before each audit, including after theme checks reload it. Keep the WCAG assertions intact. Observed configured browser RED becomes GREEN; the full CI browser command passes 31 tests and focused unit checks pass 42. No runtime or version change is part of this slice.

The genuine 2.17.9 → 2.17.10 reproduction remains a separate failing success-experience regression. Current 2.17.10 → published 2.17.10, through More → Buscar actualizaciones, correctly reports the already-current version without pretending an update completed. The user-reported no-install symptom remains unresolved pending the actual starting version and visible button/modal. The existing version-substitution fixture does not establish legacy compatibility.

## Current-version hotfix investigation
The updated report also names 2.17.10. Reproduce using its actual published HTML, JavaScript and worker, not a newer manager labeled as an older version. A complete natively generated next-version asset set may be prepared as test setup; updater behavior must remain unchanged until a relevant functional failure is observed. Keep runtime/displayed version agreement, data preservation, cancel/save/download guards, automatic success return and silent ordinary reload as acceptance criteria. Stop rather than claim a guessed fix if the reported flow cannot be reproduced.


### Full-asset reproduction result
The real published 2.17.10 updater successfully installs the full natively generated 2.17.11 fixture with unchanged updater behavior: genuine receipt, visible green check, automatic return, matching runtime/displayed version, preserved employee and silent ordinary reload. The release-only fixture is archived externally; the worktree version and generated assets were restored to published 2.17.10. No causal functional failure was observed, so the runtime hotfix is pending exact user-flow evidence rather than a speculative cache or receipt change.

## Approved conditional receipt correction
A valid increasing receipt survives an older boot only when the running semantic version is at or after its source and before its target. Exact target boot consumes it once and confirms success. Invalid, non-increasing, before-source and overshot receipts are discarded without success. Receipt-storage failures preserve the existing graceful behavior: an update may complete without the animation, and failure to consume cannot repeatedly celebrate. This repairs a confirmed conditional defect, not a proven production diagnosis. Old already-published manager code cannot be changed retroactively.

## Implementation and verification boundaries
The receipt parser now validates before consuming. The stale/intermediate-boot regression was RED on the original manager and GREEN after the correction. The new browser fixture serves the pinned complete published 2.17.10 tree and the complete built candidate without relabeling scripts. Its dark-theme conditional case serves the authentic old version-policy asset alongside the new manager, verifies the genuine receipt survives, then models that cached asset becoming fresh without recreating a receipt or applying twice. An entirely old manager still cannot be fixed retroactively.

Each supported theme exercises a real update, an already-open second tab without update intent, automatic dismissal, data preservation and silent reload. Axe audits the actual success overlay and asserts the subtitle was examined; light uses reduced motion. A discovered 4.39:1 light subtitle contrast failure is corrected using the existing normal text token. Visual captures run separately from axe so screenshots cannot consume the short dismissal window. The foreground update tab is explicit; no success DOM or runtime timer is fabricated. Browser CI needs full Git history for the pinned fixture; its only workflow change is checkout `fetch-depth: 0`.

Receipt storage failures retain graceful degradation: updating can proceed without animation, and failed consumption cannot repeatedly claim success. Browser evidence is sandboxed Chromium with mobile viewports, not physical-device or WebKit/Firefox coverage. The production report's causal mechanism remains unconfirmed.


Final proof: 44 focused unit passes; 1188 full unit passes with one existing TODO; 36 configured browser-CI passes; 50 Connections passes; five separate visual-upgrade passes. All five success screenshots were inspected. Release guard passes for 2.17.11 against pinned main. Commit, native review and publication are not part of this worker's completed scope.
