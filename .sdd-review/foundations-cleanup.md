# Foundations Cleanup — Remove Dead Keyboard Helper

## Status
- Mode: Strict TDD (characterize-and-remove)
- Result: Complete, verified safe by dual fresh-context review
- Suite: 21 -> 20 passing, 0 failed (`npm test` / `node --test`)
- Date: 2026-06-21

## Context
A knowledge-graph pass flagged a `semantically_similar_to` link between
`getDialogKeyboardAction` (employee-number-rules.js) and `handleKeydown`
(employee-number-modal.js), suggesting duplicated logic. Investigation showed
it was NOT active duplication: `getDialogKeyboardAction` had zero production
callers. The prior change ("Prevent Duplicate Employee Numbers") deliberately
superseded the pure helper with the DOM-executing `handleKeydown` but left the
old function and its unit test behind as dead code.

## Change
- Removed `getDialogKeyboardAction` (function + export) from `employee-number-rules.js`.
- Removed its import and unit test from `tests/employee-conflict-ui.test.js`.

## Verification
- Baseline suite green at 21 before removal.
- Independent repo-wide search confirmed zero production callers (only the
  regenerable `graphify-out/` snapshot referenced it).
- Production keyboard/focus-trap behavior remains in `handleKeydown`, covered by
  `tests/employee-conflict-modal-dom.test.js`.
- Suite green at 20 after removal; module still loads; 7 remaining exports intact.
- Dual fresh-context adversarial review: verdict "safe", no dangling code references.

## Notes / Out of Scope
- The historical "21 passed" counts in `apply-progress.md` / `tasks.md` are left
  intact as an accurate record of the prior change's end state. This change is
  what brought the suite to 20.
- `AGENTS.md` generic boilerplate (React/Tailwind/Node) does not match this
  vanilla-JS PWA — deferred as optional documentation debt.
