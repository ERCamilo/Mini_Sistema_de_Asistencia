# Mini visible pending SA roster

Project the existing staged roster store into a first-class Connections review section, independent of hidden extras and cloud notices. Delegate Review and Discard to native staged-roster UI APIs; do not request a fresh roster or auto-apply anything. Background accepted staging emits only an empty change event. A scoped typed listener updates pending presentation/empty state without calling transport-cleaning renderHome, navigating away or rebuilding the whole modal. Preserve focused controls on unchanged refresh; cleanup closes listeners and suppresses stale async continuations.

Reopening reads durable staging. Applied/cleared/discarded work updates the projection through native render or payload-free signals. Strict TS compiles to committed generated JS; CSS follows existing theme tokens/44px targets. Deterministic module tests precede implementation; parent full verification/Playwright/review/delivery remain pending. Recovery mirror pending without runtime identity.

## Local proof and pending acceptance
Observed RED 12/14 passing before production changes; final focused runtime tests pass 16/16. Compile-only tsc and whitespace checks pass, and generated JS is convergent. Real native accepted-roster staging/discard and validated ACK encoding are covered alongside menu DOM behavior, without modifying import semantics or transport. Parent full verification, mapper's complete browser review/apply/finalize flow, review/commit, preview deployment and user acceptance remain pending. This change only restores visibility/refresh; it does not claim to fix physical transport failures.

Pending-card controls must size to their labels while retaining 44px minimum touch targets. Harvested SA roster-pending badges must track the same current staged peer IDs after arrival, apply and discard, without altering unrelated badges or rerendering native transport-owning home. Browser acceptance found both regressions and correction remains within T1.

Correction proof: focused tests observed 16/18 passing RED and 18/18 GREEN. Peer-scoped runtime arrival/discard/apply assertions preserve unrelated badges; a CSS contract check requires label-sized pending buttons with 44px minima. Compile-only generated output is convergent. Repeat mapper browser acceptance and parent full verification remain pending.

The second browser run still failed label containment despite intrinsic button widths. The pending actions wrapper must span the full existing action-card grid row, rather than occupy its 44px icon column. Browser A–E acceptance remains pending; width-only node checks are not layout proof.

Full-row wrapper contract observed RED 18/19 and GREEN 19/19 after the scoped grid-column correction. This verifies stylesheet wiring, not actual browser geometry; mapper must recheck actual label containment and complete A–E acceptance.
