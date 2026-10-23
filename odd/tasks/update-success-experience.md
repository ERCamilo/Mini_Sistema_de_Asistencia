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
