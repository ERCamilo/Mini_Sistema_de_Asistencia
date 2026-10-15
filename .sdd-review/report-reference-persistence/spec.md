# Confirm reports only after the reference survives normal reload

## Problem

The report UI currently announces success immediately after synchronous localStorage mutation, while the legacy IndexedDB snapshot write is queued. Reload can hydrate an older snapshot without the reference and produce a full roster instead of changes.

## Design

Keep `EmployeeChangeReport.confirm()` synchronous. Add optional asynchronous readiness and persistence dependencies to the existing TypeScript UI controller. Confirmation enters a busy state, awaits startup before mutating the ledger, checks scope again, saves the exact shared report, then awaits persistence. Only then announce success. A failed dependency leaves confirmation retryable and never announces durable success.

Wire the page to the actual startup promise and current snapshot queue. Readiness requires completed initialization plus either a ready database or explicit localStorage fallback. Queue completion is accepted only with a ready database or existing explicit fallback; unresolved startup is not equivalent to persistence. Existing migration results that leave the database unready but still enabled fail closed for confirmation; this fix does not change migration or feature-toggle policy.

## Acceptance and verification

- Deferred readiness prevents ledger mutation; deferred snapshot completion prevents success.
- Pending state blocks refresh/export/duplicate confirmation; completed success notifies once.
- Errors do not confirm and permit retry; original report, schema, IDs and attendance remain unchanged.
- IndexedDB failure followed by explicit fallback remains usable; incomplete startup cannot report success.
- Focused browser delay must expose premature baseline success and confirm reload delta after release on the fixed code.

No guarantee is made for reload/abrupt termination before the UI reports success. No global persistence redesign or schema migration is included.

## Reviewed-test integration

Reuse only the exact theme browser-test blob from `64f1fd0`, with its existing delayed-write RED evidence and approved lineage `review-4c9317dd0a719704`. The report fix was independently approved in `review-c82823af85637de1`. This integration changes no application behavior or tutorial/CI source. Verify the combined candidate with the complete unit and browser/tutorial suites, convergent generated stamps, and unchanged protected source repositories.

PR #18 remains the report fix against `main`; PR #17 will subsequently stack its separate CI opt-in unit on the report branch. Commit, fresh integration review and remote operations remain parent-owned; no main merge or force push.
