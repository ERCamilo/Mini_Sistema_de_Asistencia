# Operational TURN for Mini and SA

## Objective
Make TURN operational for real Mini-to-Mini and Mini-to-SA application transfers. Create additional API or administration functionality only when required for that outcome; a private probe or mocked constructor is not completion.

## Authorization and constraints
- Develop in isolated test branches; preserve original staged worktrees and all main refs.
- No production deployment, push, merge, or public API exposure is authorized.
- Use the existing micro3 API and ubuntu Tailscale SSH circuit. Never record ID tokens, TURN credentials, raw ICE addresses, attendance contents, or private pairing codes.
- Complete Mini-to-Mini and pause for the user before modifying SA.
- Native review stays enabled. The user authorized omission only for the existing proxy-expiry compatibility fix, not future candidates.
- Repository commits remain pending applicable full-suite and hook requirements; focused verification is not a full-suite claim.
- Engram mirror pending: authoritative runtime memory attribution is unavailable.

## Evidence and current state
- Existing micro3 API service `turn-api-restart-20261010.service` stopped with Result=timeout after its configured 24-hour limit. Restarted unchanged; empty POST through the private tunnel returns 422. This proves reachability, not valid-token acceptance.
- Tunnel: local A2 127.0.0.1:19753 to micro3 127.0.0.1:9753; parent owns session35484.
- Private Mini HTTPS origin: https://a2.tail2a0a8e.ts.net:8443/. Static page returns 200; explicit test-only forceRelay is enabled.
- Proxy metadata correction passed independent isolated compilation and 37/37 focused tests. No live credential or relay result has been observed in the integrated apps.
- Existing Mini UI creates separate RTC sessions for pairing and backup transfer. Both boundaries need real acceptance evidence.

## Tasks
- [x] T1: Restore the existing private API and validate non-sensitive reachability. Route: inline, bounded known service operation.
- [x] T2: Correct documented nested expiry compatibility. Route: delegated writer and independent verifier; focused RED/GREEN observed. Candidate-only native omission authorized.
- [x] T3: Add private-only sanitized ICE diagnostics for each application RTC session. Route: delegated; multiple nontrivial files and lifecycle logic. Forecast approximately 300 authored changed lines; delivery strategy ask-on-risk, no PR requested.
- [ ] T4: Verify real Mini-to-Mini pairing and nonempty backup staging on separate physical devices, with local selected-relay evidence on both sides and unchanged receiver data before explicit restore. Pause for user after Mini acceptance.
- [ ] T5: Inspect and complete the isolated SA integration, with its existing primary Google/Firebase account; verify real Mini-to-SA transfer without changing production or protected worktrees.
- [ ] T6: Audit the full operational outcome and determine whether persistence or administration additions are actually required. Additional backend/dashboard work requires precise destination and mutation scope before execution.

## T3 acceptance and checks
Private opt-in only; no public HTML or service-worker registration. Diagnostics distinguish unmeasured relay from verified relay, do not alter pairing callbacks, and suppress stale results after close/dispose. No tokens, credentials, candidates, addresses, user identity, pairing keys, or payload content may be rendered or logged.

Observe deterministic regression RED, implement GREEN, and compile TypeScript without application metadata stamping. Run focused bootstrap, proxy, and Mini-backup-wiring tests. Normalize before candidate review; record native outcome truthfully. Review and runtime update remain pending until observed.

## T3 implementation evidence (2026-10-11)
- Implementation and functional verification finished; task closure remains pending native review, runtime update, and its work-unit commit. No remote operations or services were touched by the writer.
- Deterministic RED on the unmodified bootstrap: `node --test tests/private-turn-bootstrap.test.js` observed 28 pass / 3 fail (31 total). The failing cases exposed absent diagnostic status/credential-error reporting; lifecycle cases were strengthened to require installed listeners.
- Root TypeScript compilation: `node /home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin/tsc -p tsconfig.json --outDir /tmp/turn-diagnostics-app-O3FOtO` succeeded; only generated `private-turn-bootstrap.js` was copied. All other emitted root JavaScript bytes matched before running pretest.
- Tool compilation: `node /home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin/tsc -p scripts/private-turn/tsconfig.json --typeRoots /home/ubuntu/worktrees/sa-reconciliation-commit-20260927/node_modules/@types --outDir /tmp/turn-diagnostics-tool-etuj5U` succeeded using existing dependencies, with no install.
- Focused GREEN: `PRIVATE_TURN_TOOL_OUTPUT=/tmp/turn-diagnostics-tool-etuj5U node --test tests/private-turn-bootstrap.test.js tests/private-turn-proxy.test.js tests/private-turn-mini-backup-wiring.test.js`: 77/77 passed, zero skipped.
- Applicable full suite: `PATH=/home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin:$PATH PRIVATE_TURN_TOOL_OUTPUT=/tmp/turn-diagnostics-tool-etuj5U npm test`: 807/807 passed, zero skipped. Pretest emitted only byte-identical compiled files; no build stamping was run.
- `git diff --check` passed. Native review not started; prior proxy-only omission does not authorize omission for diagnostics. No commit performed.
- Proposed work-unit: `feat(turn): expose private per-session relay diagnostics`, including TS/derived JS, dev injection line, focused tests and specification. Keep the already pending proxy-expiry correction separate. Hook version/stamp mutations affect files outside this writer's authorized surface and require parent-managed normalization before review/commit.
- Recovery mirror pending: authoritative runtime memory attribution remains unavailable.

### T3 verified source hashes (SHA-256)
- `src/private-turn-bootstrap.ts`: `7777ad09337077444ae471ef19f24ce0da82933667dddd33176867f64fbe77a1`
- `private-turn-bootstrap.js`: `1a7389a7130728ccf2c6431140fb71746ff165fe1680c17772bfc0e12c32efe7`
- `scripts/private-turn/dev-server.mts`: `3374e7af8e39333131652abaa8d7f14d595a28da1d3f5c6b095a9a728eed31fa`
- `tests/private-turn-bootstrap.test.js`: `c35b88f5981648af786045c0372e428f7baa7a1e9f5c9b8c34aca5c356a067ff`
- `tests/private-turn-proxy.test.js`: `aab7cdb442013b3e277b114cbebf687dc7a1a82c229992ef5d07492774af6ca8`

## Candidate normalization (2026-10-12)
- Parent authorized repository-owned version/build normalization before native freeze. Timestamp pinned in `/tmp/private-turn-diagnostics-build-time.txt`: `MINI_BUILD_TIME=2026-10-12T00:00:36.000Z`; use this exact environment value for any subsequent hook run on this candidate.
- Commands: `export MINI_BUILD_TIME=$(cat /tmp/private-turn-diagnostics-build-time.txt); node scripts/bump-version.mjs; node scripts/stamp-build.mjs`. Version remained 2.17.1 (already advanced on this feature branch); generated build ID became 20261012-000036-000.
- Both normalizers ran a second time with the same timestamp. `sha256sum --check /tmp/private-turn-diagnostics-normalized-first.sha256` verified identical bytes for `package.json`, `package-lock.json`, `build-info.js`, and `sw.js`: all four OK. No hook disabled or generated file hand-edited.
- Post-normalization full suite: `PATH=/home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin:$PATH PRIVATE_TURN_TOOL_OUTPUT=/tmp/turn-diagnostics-tool-etuj5U npm test`: 807/807 passed, zero skipped (log `/tmp/private-turn-diagnostics-normalized-full-test.log`). Native review, commit and runtime restart remain pending. Only the two recovery documents are staged for explicit candidate inventory; original protected worktree/index remains untouched.

## Next step
Review the T3 diagnostic candidate, update the private runtime only after its applicable review outcome, then ask the user to retry both physical Mini clients with observable relay status. Current source and Git state remain authoritative; do not restart healthy services merely because a tool handle is unavailable.

## T3 closure and private runtime activation
- Work-unit commit: `7f07856` (`feat(turn): expose verified private relay diagnostics`). Commit tree exactly matches the reviewed candidate tree `1fe408990c51b886620db964dfe11092144ad40b`; pinned hook normalization was a no-op.
- Native consolidated reliability review approved without findings, then acknowledged exactly for lineage `review-0280fd732336e845`; authority burned. No further review of unchanged bytes was started. Post-commit assessment marked the alternate committed-only projection due; the exact tree had already been reviewed and acknowledged in workspace projection.
- The private runtime now runs as user transient unit `mini-private-turn-diagnostics.service`, loopback port19443, 24-hour maximum, no restart loop or permanent startup. Existing Tailscale Serve8443 and default443 mapping unchanged.
- HTTPS response injects forceRelay:true and diagnostics:true. Served bootstrap SHA-256 matches the reviewed generated file: `1a7389a7130728ccf2c6431140fb71746ff165fe1680c17772bfc0e12c32efe7`. Empty-token API probe through local19753 returns422. Source worktree was clean after commit and runtime activation; this recovery update is documentation-only.
- Real two-device Mini pairing/backup staging and both selected relay observations remain pending. Pause before SA modifications is retained; no full-goal completion is claimed.
- Recovery mirror remains pending: no authoritative registered runtime identity is available.

## T3a: accessible private diagnostic control
User authorized replacing the bottom bar with a top-left floating control above application overlays. Route: inline mechanical presentation adjustment only; preserve native details/summary keyboard toggling, all observer logic, privacy, and cleanup. Add render assertions before changing styles, compile only the derived bootstrap asset, and run focused checks. Native review and private runtime update remain pending.
- [x] T3a: Move and style the existing diagnostic toggle as a compact floating control; preserve the expandable sanitized output.
- Focused render tests: observed RED 35/36, then GREEN 36/36; diff whitespace check passed. No full suite rerun for this presentation-only delta; physical-browser visual acceptance remains pending.
- User selected candidate-specific review omission (option 2); exact native decline confirmed for target sha256:64b84e56e1750d45cc0ce5922cb5e86fee8962d94d732d6b9a236dbf7e444a1d. No review approval or global mode change claimed.
- Activated only the private runtime bootstrap asset via atomic replacement in its temporary canonical asset root; no service restart, production change, or commit. HTTPS /__private-turn/bootstrap.js matches tested source hash c60e092423d24df45e02907111a22ed1d2617efffa4b7c89926c686f370977dc. Initial verification used the wrong URL (404), then the actual injected route returned successfully.
- Next: refresh both physical Mini clients, retry pairing, and collect sanitized per-session credential/connection/relay rows from the floating TURN control. Engram mirror remains pending until host session registration.

## T3b: sanitized private TURN console
User authorized precise, console-style diagnosis of failed credential acquisition and stalled RTC sessions. Route: delegated writer; provider stages and bootstrap lifecycle require two nontrivial TypeScript modules. Root class: missing observability, not a proven transport defect. Preserve all connection behavior, retries, deadlines, guest P2P, and the floating native control.
- [x] T3b: Add allowlisted auth/token/request/response/validation/cache/shared-request events with bounded elapsed time and HTTP status; display bounded per-session chronology and observable RTC states without raw errors, tokens, identities, addresses, SDP, candidates, or attendance data.
- [x] Verify deterministic RED/GREEN, privacy, callback isolation, concurrent request sharing, and cleanup with focused provider/bootstrap tests and isolated compilation. Full verification, native review, commit, and private activation remain parent-owned and pending.
- Scope: `src/private-turn.ts`, `src/private-turn-bootstrap.ts`, their generated root modules, their existing focused tests, and this tracker. No new dependency or remote operation. Engram mirror remains pending until host registration.

### T3b focused verification
- Writer observed RED 71/76 then GREEN 76/76; after its final diagnostic detail delta, parent observed 77/77 passing via node --test tests/private-turn.test.js tests/private-turn-bootstrap.test.js. Whitespace check passed.
- Native assessment: medium executable risk, review due. Full-suite/commit/private activation pending; existing private runtime remains on previous assets.

### T3b delivery evidence
- Independent final isolated TypeScript compilation succeeded and both generated modules matched byte-for-byte. Full deterministic suite: 813/813 passed, zero failures/skips; parent focused spot check: 77/77 passed. E2E and physical-client acceptance remain pending.
- User declined review only for target sha256:8e819182bdd0c6927cf7a59a41f653c6e32b0c64b30629cb43cca66d4ffd1b7c; exact provider invocation returned declined_this_candidate. No approval claimed and review mode unchanged.
- Private preview activated using only tested provider/bootstrap assets, both served HTTPS responses matched source bytes. No production deployment, API changes, or transport behavior changes.
- Next: refresh both physical clients, reproduce pairing, and collect bounded sanitized console events. This diagnostics task does not close the unresolved connectivity task. Memory mirror still pending authoritative host registration.

- T3b work-unit commit: 6445bd6 (feat(turn): add sanitized private diagnostic console). Pinned normalization and commit hook converged without changing the verified runtime modules. No push/merge; original protected worktree remains untouched.

## T3c: copy the sanitized private TURN console
User authorized copying the entire TURN diagnostic history for future reports. Route: delegated bounded writer; TS rendering, derived asset and deterministic DOM tests form one behavior. Scope excludes transport/provider changes: inspect contract validation read-only, add a native 44px copy button inside details, and copy only a fresh allowlisted diagnostic snapshot. Clipboard denial/unavailability offers a readonly selectable manual fallback; asynchronous completion must not revive disposed/account-invalidated output. No app body, attendance, identity, pairing data, raw errors, or credentials may be copied.
- [x] T3c: Observe focused RED/GREEN, compile only the derived bootstrap asset, and verify clipboard success/fallback/privacy/cleanup.
- Native review, commit and private activation remain parent-owned; memory mirror pending host session registration.

### T3c implementation evidence
- Focused observed RED: 38/42 passed, four new copy-button regressions failed on the unchanged module. GREEN: 43/43 passed after isolated TypeScript compilation; only `private-turn-bootstrap.js` copied from compiler output. Additional coverage proves actual fallback focus/selection and account-invalidated async feedback suppression.
- Final full deterministic suite: `PRIVATE_TURN_TOOL_OUTPUT=/tmp/turn-diagnostics-tool-etuj5U node --test tests/*.test.js`: 818/818 passed, zero skipped; `git diff --check` passed. Logs: `/tmp/turn-copy-red.log`, `/tmp/turn-copy-green.log`, `/tmp/turn-copy-full-final.log`. No build stamping, commit, native review, runtime update, remote access or real tokens.
- Read-only contract diagnosis: validation rejects expiry beyond client-now plus advertised TTL (`src/private-turn.ts:86`). Synthetic aligned clock and +2s clock accepted a valid 300-second response; -2s clock rejected it as TURN_INVALID_RESPONSE. This confirms clock sensitivity, not the real phone's clock offset. CONTRACT_INVALID also covers payload/string/TTL/expiry/ICE-server shape and credentials constraints; actual failing branch remains unmeasured.
- Next: parent checks candidate/review, activates private assets only under applicable authorization, and asks for automatic date/time verification or a sanitized expiry-specific diagnostic before changing transport/provider behavior. Clipboard manual/device acceptance remains pending.
