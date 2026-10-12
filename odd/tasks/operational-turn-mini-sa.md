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
- [ ] T3: Add private-only sanitized ICE diagnostics for each application RTC session. Route: delegated; multiple nontrivial files and lifecycle logic. Forecast approximately 300 authored changed lines; delivery strategy ask-on-risk, no PR requested.
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
