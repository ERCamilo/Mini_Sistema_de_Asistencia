# Firebase field circuit preview

Base Mini d9db66b. This integration includes the previous reviewed P2P recovery and Firebase invitation UI patches without changing their frozen source worktrees.

Google identity authorizes the server-provided organization/project/group; local employees remain editable offline. The roster uses the canonical sa-roster/v1 review/import flow. Attendance uses attendance-submission/v1, stable UUID, actor-derived device prefix and per-scope increasing sequence. An IndexedDB outbox persists the immutable pending payload before network submission, survives reload, retries with identical bytes and only deletes it after matching received acknowledgement. The outbox is separated by Google UID. SA must stage and review before applying.

Tests must cover failed send, account separation, replay, IDB reload and one SA with three separate Mini browser contexts. Auth emulator Google credentials are synthetic, not certification of human OAuth or external networking.

Cloud previews ship with Firebase internet configuration disabled until the specifically named isolated Spark project is authorized and activated. No billing, production database writes or broad CLI credentials are part of this candidate.

## Local M9 verification boundary

The three browser lifecycle fixtures load this repository's Mini root and read the existing SA fixture without changing its sources. They use the explicit demo-sa-field-access Auth/Firestore emulators and synthetic identities, never real OAuth credentials or production services. Roster receipt and review must leave local personnel unchanged; only the application-owned explicit apply records personnel and its accepted version before attendance submission. Session restoration, durable pending reports, explicit logout and device-access scenarios retain the original assertions.

The existing cached Firestore ZIP container is normalized only in temporary storage, with every entry's name, order, CRC, metadata and uncompressed payload preserved. The original cache, runtime sources, security manager and loopback-only policy remain unchanged. Browser checks do not certify real Google login, deployed security rules or production permissions. The older session/device fixtures may require navigation adaptation if their historical selectors no longer match the current connection shell; failures remain reported, not masked by runtime changes.

Fixture compatibility: linked phase is paired with the visible current-shell connection result, account control and actual work link. Publish, receive, device access and logout use the shared navigation rather than hidden legacy controls. The initial old-selector failures are retained as RED evidence; application code is not changed to satisfy fixtures.

Navigation waits for the application-owned cloud operation to become idle before leaving the invitation result. Mini uses the visible presentation back control; device actions are reached through the account detail and alias editing through work detail. Hidden legacy status/card elements alone never establish success.

Grouped SA accounts receive through the visible pending-assistance review notice in the overview. The application validates its scope, saves the remote submissions durably, and automatically opens the connected importer; fixture assertions verify zero attendance changes before explicit human consolidation and apply. Device details are for access administration, not a substitute receive entry. Subsequent restored-session receipt verifies additional inbox records while applied attendance remains unchanged.

The fixtures use the current Mini header-back capability and wait for SA refresh to finish before reviewing a pending notice. Synthetic gateway diagnostics emit only operation, HTTP status and allowlisted error codes, never request headers, credentials or payloads. Device/session fixtures retain the default per-UID limit unless observed synthetic rate-limit rejection requires the explicitly authorized fixture-only adjustment; runtime validation and deployment limits are unchanged.

Observed HTTP diagnostics corroborated 429 RATE_LIMITED on field/submit and field/updates with the default 30-per-UID synthetic fixture budget. All three lifecycle fixtures now use the existing connections fixture budget of 300 per UID; production defaults are unchanged and rate-limit controls remain covered by the existing gateway unit tests. Repeated equal attendance submissions must be acknowledged by their specific remote IDs and match the existing durable semantic record without creating inbox versions or changing canonical attendance. Aggregate inbox growth is not a valid repeated-receipt invariant.

Revocation scenarios prepare through the visible Mini send action and require the service ACCESS_REVOKED response, disabled visible send, unchanged remote submission IDs, and retained local outbox/personnel. They do not force clicks on disabled controls. SA alias and leave-state assertions navigate into the affected account/device details after refresh, where those native controls and labels are displayed.

Observed local closure: the unchanged session fixture and the final connections/device fixtures each completed with exit 0 against this Mini root and the read-only SA fixture. Configured roster review/apply, durable receive with no automatic attendance mutation, explicit SA human apply, restored sessions/logout, queued retry and semantic dedup passed. Device scenarios additionally passed revoked-access rejection/disabled send, no forbidden submission, same-account device isolation, explicit restoration, alias edit and persistent leave/cancel. These are synthetic local integration results, not certification of Google OAuth, deployed permissions or production behavior.
