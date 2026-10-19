# Private TURN development circuit

## Current delivery: explicit RTC policy

Mini and SA expose an optional `iceTransportPolicy` in `createRtcSession`.
The value is passed to the native `RTCPeerConnection` constructor when provided;
native WebRTC validation remains responsible for accepted policy values.

- `relay` and `all` are forwarded without replacing the supplied `iceServers`.
- Omitted or explicitly `undefined` policy preserves exactly `{ iceServers }`.
- Ordinary callers keep their default STUN configuration and pairing security.
- No authentication requirement or TURN credential request is added here.

The mechanical option is covered by constructor-capture regression tests in
Mini `tests/p2p-transfer.test.js` and SA `js/tests/P2PCoreTests.test.js`.
Tests cover explicit policies, default servers, custom servers and an empty
server array. These mocked checks do not prove a selected relay candidate or
real network connectivity.

## Deferred local preparation

The planned provider, same-origin development proxy and browser bootstrap are
not implemented by this first unit. They must remain explicitly opted-in on a
trusted HTTPS loopback development origin. Guest P2P must stay independent of
Google Auth. Mini must use its existing `mini-field` account; SA must use its
primary modular account. Do not introduce another implicit Firebase account.

Returned credentials must remain in memory, bound to the current UID and
account generation, and be cleared on logout/account change. Expiry units and
serialization must be explicitly confirmed, never inferred from magnitude.
The future proxy must use a fixed loopback destination/path, request/response
bounds, timeouts, no redirects, no-store and credential-free diagnostics.

## External acceptance is pending

The operator reports a private API on micro3 loopback, currently stopped, with
a five-minute lifetime. This is supplied information, not verified evidence.
No SSH forward, API start, secret access, real Firebase Auth, remote signaling,
TURN traffic or publication is authorized by this local preparation.

A future authorized live check must verify the selected connected ICE pair
uses a relay candidate and verify exact bidirectional data-channel payloads.
Gathering a relay candidate alone is not sufficient. Trusted HTTPS/Auth origin,
API expiry serialization and explicit remote session/traffic authorization
remain prerequisites. Do not record credentials in logs, HAR, traces or images.


## P2 delivery: dormant provider and private development proxy

`PrivateTurn.createProvider` is a strict UMD module; `private-turn.js` is derived
from `src/private-turn.ts` through the official build. It is not registered in
production HTML or service-worker precache. The development bootstrap is P3,
not this delivery. No code here starts micro3, opens a tunnel or signs in.

An explicitly enabled provider requires a HTTPS loopback origin and an explicit
contract `{ ttlUnit: 'seconds', expiresAtFormat: ... }`. Supported expiry formats
are `unix-seconds`, `unix-milliseconds`, or canonical UTC ISO8601 with milliseconds
(`Date.toISOString()` shape). There is no unit inference or default contract.
The live API serialization remains unconfirmed. Numeric TTL is bounded to
1–300 seconds, and expiry must be later than the refresh margin and no later
than the reported TTL from the local clock. Real use requires synchronized clocks.

The provider obtains an ID token from an injected current-account getter and
POSTs only to `/api/turn-creds`, with cookies omitted, no-store and redirects
disallowed. Tokens and replies are bounded, operations time out, server errors
are replaced by safe codes, and STUN/TURN URI/credential fields are validated.
Returned configurations are independent copies. The cache is UID/generation
bound and refreshed within a default 15-second margin before a new connection.
Call `invalidate()` on every logout/account lifecycle event, including a new
session with the same UID. Every asynchronous boundary verifies current account.
Guests and disabled providers return `null` without token or credential requests.
Signed-in credential failure rejects; it is not a successful direct fallback.

The exported Node tool factory starts only on IPv4 loopback. Its upstream host
is always `127.0.0.1`; only the local forwarded port is configurable and the
path is always `/turn-creds`. The credential route requires exact Host/Origin,
POST JSON, a single ID-token field, and no ambient Cookie/Authorization headers.
Requests/replies are bounded, timed out and never redirected. Responses use
no-store and no-referrer; errors contain only fixed codes, never upstream bodies.
Static serving is optional, requires an explicit asset allowlist, and rejects
hidden files, traversal, unlisted extensions and symlink escapes from appRoot.
The tool does not log request/response payloads or credentials.

### Local verification commands

With temporary links to the existing compiler and Node typings (no install):

```sh
node node_modules/typescript/bin/tsc -p scripts/private-turn/tsconfig.json --outDir /tmp/private-turn-test-build
node --test tests/private-turn.test.js
PRIVATE_TURN_TOOL_OUTPUT=/tmp/private-turn-test-build node --test tests/private-turn-proxy.test.js
PRIVATE_TURN_TOOL_OUTPUT=/tmp/private-turn-test-build npm test
```

The full test command requires that compiled tool path; missing output fails
rather than skipping the proxy checks. `.mts` output stays outside the repo.
Proxy tests explicitly use HTTP synthetic loopback fixtures to verify transport
controls; this does NOT bypass or prove trusted HTTPS or real Firebase Auth.
All fixtures close their owned listeners and capture no HAR, traces or images.

### Later operator-controlled steps, not executed

The CLI requires operator-provided trusted certificate/key paths and a local
forwarded port. It has no insecure HTTP CLI option. A future command has the form
`node <compiled-tool> --forward-port <local-port> --port 9443 --cert <trusted-cert-path> --key <key-path>`.
An optional `--root <app-root>` with repeated `--asset <relative-file>` serves
only explicitly owned assets. Do not supply credentials as CLI arguments.
The P3 bootstrap will resolve the existing Mini named account or SA primary
modular account after SDK initialization; no new account is created by P2.

Live acceptance remains pending: API serialization, trusted HTTPS/Auth origin,
operator-started private API and explicit remote session/traffic authorization.
Neither mocked credentials nor HTTP fixture success proves HMAC validity,
selected relay connectivity, data-channel delivery or production readiness.

## P3: explicitly opted-in development integration

Only the development server injects canonical provider/bootstrap scripts. No
production HTML/config/precache registration is changed. Mini's public config
is supplied in the served response before its original named-account setup;
SA uses its primary modular Auth and exported subscription function. Both
retain their existing SDK versions and no second account is created.

Signed users default to policy `all` with ephemeral TURN available as fallback.
Separate explicit `forceRelay` enables `relay` only in this development circuit.
Guests preserve the exact original factory options; no opt-in preserves exact
HTML bytes and exposes no implicit shared scripts. Credentials remain in memory,
account-generation bound, with explicit expiry serialization and renewal.

Clients require HTTPS loopback or an explicitly configured exact private origin:
`https://a2.tail2a0a8e.ts.net:8443` or `:8444`. The server may use supplied trusted
TLS or an explicit private HTTPS reverse-proxy mode; backend HTTP is not a client
HTTP Auth exception. No forwarded header grants trust, no arbitrary origins or
CORS are enabled. Expiry units remain operator-confirmation prerequisites.

Synthetic browser checks mock the correct existing Auth account, deny external
HTTP requests, inspect factory configuration and verify controlled selected-pair
stats. Separately, real Mini/SA factories exchange bidirectional host-only data
with empty ICE servers and guest Auth. This is not live TURN proof. The user's
standalone PC/Android relay PASS does not yet prove integrated application use.

P3 verification status: provider/bootstrap 59/59 and proxy 28/28, full Mini
775/775 with zero skipped tests. The browser runner explicitly invokes the actual
`PrivateTurnBootstrap.verifySelectedRelay` using controlled mock stats with a
selected connected successful nominated pair and valid relay candidate references,
plus gathered-only and stale-connection negatives. These are mock browser
fixtures, not network relay proof. The separate native host-only Mini/SA data
circuit and all browser fixtures remain **unexecuted successfully** because the
current browser launch capability is unavailable. No managed-browser download is
authorized by this change; do not mark P3 complete or claim browser/live PASS.

## MM delivery: existing Mini-to-Mini backup component acceptance

This independent unit adds coverage, not a new synchronization feature. Two
fresh browser contexts load actual Mini core, pairing, consent, backup bridge
and summary modules through the opted-in development server. Synthetic named
`mini-field` Auth checks ordinary `all` and explicit `relay` constructor policy;
these configurations use a mocked RTC constructor, not live TURN traffic.
Guests then use actual native WebRTC with empty ICE servers and in-memory
signaling. Same-app pairing performs the production SAS/link-token handshake
with distinct synthetic device IDs and a fixture peer store enforcing backup
purpose. This is a production-module component fixture, NOT full-page QR,
manual-entry or persistent IndexedDB UI acceptance.

The receiver starts with data distinct from the sender. A declined offer sends
no backup and leaves staging and receiver fixture data unchanged.
An accepted offer sends a real nonempty `mini-backup/v1` payload, verifies its
SHA-256 through the production receiver, stages it and returns the actual
backup-staged acknowledgement; the received text matches the sender exactly,
while the receiver's distinct existing fixture data remains unchanged. Explicit review calls the production bridge
with owned restore-modal DOM fixtures. It populates the review textarea and
requests existing validation; no import, restore, merge or attendance write is
executed. Same-app roster/attendance trust remains rejected. Controlled mocked
selected-relay stats are separate from native host-only backup transport.

Existing behavior already supports this flow; this test-only coverage unit has
no meaningful failing production regression to reproduce (coverage-addition
TDD exception). Run the focused wiring test and the explicit browser runner:

```sh
node --test tests/private-turn-mini-backup-wiring.test.js
PLAYWRIGHT_BROWSERS_PATH=/tmp/private-turn-playwright-cache \
PLAYWRIGHT_MODULE=/home/ubuntu/worktrees/sa-firebase-live-test-20261003/node_modules/playwright/index.mjs \
PRIVATE_TURN_TOOL_OUTPUT=/tmp/private-turn-p3-build \
node tests/integration/private-turn-mini-backup.browser.cjs
```

Full-page Mini QR/manual pairing, persistent device trust, native modal user
interaction and integrated real TURN remain separate acceptance boundaries.
An operator-confirmed expiry contract and renewed authorized API window are
required before real integrated TURN. Pause before any Mini-to-SA work.

## MM-MENU delivery: independent connection entry points

Mini's connections home exposes two separate actions: work association keeps
its current SA invitation/direct flow; device association opens the existing
backup hub even without a work binding or Google session. The hidden legacy
backup button remains the adapter into production backup UI. The new action
must honor the existing active-operation guard and fail safely if the adapter
is unavailable. SA's shared menu retains its existing association action.

This changes navigation only. Same-app backup-purpose pairing, user consent,
staging and explicit restoration stay unchanged. Employee merging, selective
attendance, automatic trust/synchronization and private TURN are out of scope.
Regression checks include visible touch-size actions with actual CSS, existing
Mini backup QR/manual navigation, the work route, blocked navigation while
busy and a shared-menu SA negative control. The browser uses fresh synthetic
identity/data and denies external requests; it does not capture camera data,
perform pairing/restore, authenticate accounts or claim integrated relay proof.
No connections tutorial exists in the current recorded catalog.

## MM-ACCOUNT-UI delivery: truthful Google account presentation

Mini uses one account card, with three distinct states: an available signed-out
account exposes the original Google sign-in button; a connected account shows
its name/email/status and original logout button; an unavailable integration
shows a disabled sign-in action and the reason next to it. Repeated rendering
must retain original nodes/listeners. UI never enables Firebase for a hostname,
creates another account/session or changes Auth availability/hidden state.

Mini-scoped semantic-token styles must work in original dark and light themes,
with minimum 44px targets, visible keyboard focus, no mobile horizontal overflow
and measured AA text contrast. Browser tests exercise actual unavailable Mini
HTML/CSS and controlled account DOM lifecycle fixtures; they never sign in to
Google, read real accounts or make external requests. SA behavior and all work,
backup, transfer and restoration contracts remain unchanged.

## MM-GOOGLE-PREVIEW delivery: exact client hostname allowlist

The existing public Firebase field configuration is enabled on the stable
`mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev` hostname
as well as the previous `firebase-circuit-test` preview hostname. No wildcard,
production host, immutable deployment hostname or lookalike is admitted.
Explicitly injected configuration remains unchanged. Public project/bridge
metadata is reused without modifying SDK, Auth or the private TURN issuer.

VM tests prove hostname conditions only. Operator-reported Google/Firebase
console authorization remains pending real sign-in acceptance. This does not
load private TURN modules or provide `/api/turn-creds` on Cloudflare Pages;
private issuer connectivity and live acceptance remain separate work.

## Private proxy nested expiry compatibility

The operator-documented API response includes optional integer `expiresAt`
metadata inside a TURN `iceServers` entry. The development proxy accepts this
metadata only when it is a positive safe integer equal to root `expiresAt`,
and strips it before emitting standard RTCIceServer properties. Missing nested
metadata remains compatible. Unexpected entry fields, malformed/mismatched
expiry metadata, token/origin failures, and transport limits remain rejected.
No expiry unit is inferred; the explicitly configured client contract still
validates the root expiry. This is isolated fixture evidence, not live API or
relay acceptance, and changes no production registration or security policy.

## Private application-session diagnostics

Only an explicitly opted-in development response passes `diagnostics: true` to
bootstrap installation. Ordinary installation defaults to no observer or DOM;
production HTML, service-worker caches, and configuration remain unchanged.
The private expandable panel displays at most eight anonymous session ordinals,
credential acquisition status, sanitized connection state, and local selected
relay proof. Credentials may come from the existing account-bound provider
cache; acquisition status is not an HTTP request counter. Guests remain P2P and
make no token/credential request. No identifiers, candidate addresses, URLs,
raw stats, error text, tokens, passwords, pairing codes, or payloads are shown.

Each actual factory result is observed independently, including already-connected
peers and later connection/ICE state events. Stats are sampled while connected;
relay proof requires the existing selected, connected, successful, nominated
candidate-pair validation. Missing or non-relay stats remain unverified and never
prove STUN. Retained proof is explicitly historical (verified during connection),
not an assertion that a closed connection remains active. There are at most
eight observers and three timed stats retries per observer. Session close,
disposal, account change, and stale scope suppress late results and detach
owned listeners/timers; observer/DOM failures cannot reject successful factory
creation or replace application callbacks. Disposal removes the owned panel.

Deterministic Node fixtures verify lifecycle behavior and secret-free rendering;
they are not proof of live Google authentication, selected network relay, real
pairing, or physical-device backup transfer. Native review, private runtime
update, and physical-device acceptance remain pending.

## Issuer-relative private credential lifetime
Private development bootstrap requires clockSource issuer and X-Turn-Issued-Date carrying the validated upstream RFC1123 Date. Missing, duplicate or malformed issuer dates are rejected without a proxy-clock fallback. Client clock offsets up to thirty minutes are accepted only as clock policy; expiry is checked against issuer time and TTL (maximum 300 seconds), with request/body elapsed time and a one-second precision reserve subtracted. Cache and lease use monotonic deadlines; the existing15-second refresh margin applies only to new configuration acquisition. The separately exposed peer lease reports the actual conservative deadline (at most299seconds for a fresh300-second credential), not the early-refresh margin. Exactly1000ms of issuer Date second-resolution discrepancy is permitted above TTL, but effective reuse remains capped by advertised TTL and subtracts that same precision reserve. Browser wall-clock changes cannot extend reuse. Legacy contract callers retain client-relative behavior. Lease metadata is exposed separately from standard RTCIceServer/RTCConfiguration fields for the next peer-reuse unit. Guests request no credentials and have a maximum proposed peer lease of five minutes.

## Unit B: fixed reusable Mini peer connection (pending activation)

Linked Mini backup peers elect exactly one initiator by comparing their already
known device identifiers in memory. Inbox startup establishes a shared transport;
this is proactive connection establishment, not automatic attendance sync. One
trusted handshake releases the offer inbox. The channel supports either direction,
while every backup still requires a new offer decision and validated staged ACK.
Outgoing operations are queued locally; an incoming offer is declined when an
incoming decision/receiver or outgoing operation already owns the channel.

The transport lease has a fixed monotonic maximum of 300000ms from setup start,
and is capped by the original credential's conservative remaining lifetime.
Sending, receiving, foreground refresh and modal cleanup never extend that bound.
Credential/account invalidation is checked at most one second later; explicit
unlink stops the owner immediately. Expiry retires only that owner and rejects
queued operations. Existing failure retry ownership guards remain in force.
Offer history is bounded to 64 entries without evicting unanswered offers; lease
cleanup clears the history and disables late reply callbacks.

Acceptance is not yet complete after both endpoints expire: with no silent
renewal and no signaling standby, a new one-sided send cannot awaken an endpoint
whose inbox has retired. Both inboxes need renewed demand. A carefully owned,
credential-free signaling standby and buffered event replay may address this
without changing the signaling protocol; that behavior needs explicit parent
scope selection and regression/browser proof before activation.

## Loaded private preview identity
The private operator may supply a bounded beta release label and reviewed hexadecimal revision together. The development proxy validates and injects these into the document's existing opt-in bootstrap. Each installation captures its metadata and the document's loaded MINI_BUILD_INFO version after readiness, decorates Mini's existing Settings version, and adds the same release identity to sanitized diagnostic copies. Version identity is the loaded document/build, never newly fetched version metadata; other installations or future server releases cannot change it. An element-only observer preserves the captured label when asynchronous storage boot later renders the ordinary version. Disposal disconnects that observer, removes pending decoration and restores only its owned version text. Ordinary production HTML, package version, banner and transport remain unchanged when metadata is absent.

## Demand availability primitive — historical incomplete checkpoint

The next Mini-only transport model separates credential-free signaling availability from RTC allocation. An opt-in owner can start idle without requesting TURN credentials, create a transport on explicit demand or a validated remote offer, and retire RTC without closing shared signaling. The default SA and pairing call paths remain unchanged. Strict typed helpers serialize polite/impolite offer collision handling, bound initial frame buffering and reject known retired SDP identities plus mismatched ICE ufrags. The existing offer/answer/ICE wire protocol is unchanged.

This primitive is not accepted or activated yet: deterministic focused tests pass 44/44, but the two-context native forced-collision fixture times out at channel opening. Fixture serial offer delivery potentially allows an answer to overtake the other offer; this is an unverified hypothesis and requires focused evidence. Helpers are intentionally not wired into index.html or service-worker precache while this acceptance gate is unresolved. Multi-peer UI controls, lease integration, live TURN, and physical-device acceptance remain later tasks.

## Demand availability primitive — verified component scope

The primitive now passes native host-only tests for both-role unilateral demand, true simultaneous offers with an answer/ICE barrier, retained standby across RTC retirement, and unilateral wake after one-sided retirement. Fresh remote offers replace the old per-peer RTC without closing signaling; discarded provisional channel bindings cannot close a replacement later. Default SA/pairing callers remain unchanged, and page/precache integration remains the next unit. Focused tests pass 47/47, full deterministic tests pass 918/918, strict project compilation and generated-asset comparison pass, and the original six native bidirectional backup transfers still pass. This is not live TURN, physical-device, whole-app UI or three-peer acceptance. Known retired SDP/ICE generations are rejected; previously unseen delayed SDP is not fully correlatable without a wire transaction identity.

## Mini demand-driven inbox integration

Opening Mini joins standby signaling per saved Mini backup peer without allocating RTC or requesting TURN credentials. Outbound backup demand or an incoming validated offer creates one shared authenticated fixed lease; repeat sends reuse it. Lease expiry/channel failure closes RTC and consent/receiver state, settles caller promises and leaves standby available for future demand. Signaling errors reconnect with bounded backoff and fresh owner identity, without idle TURN renewal. Account/session changes, unlink and pagehide stop availability; foreground/network return restores failed standby. Closing a modal does not close a shared transport. SA's one-shot path remains unchanged.

Private signed demand transport must carry remaining lease metadata installed by the current bootstrap. Frozen or unowned metadata cannot silently fall back to a five-minute lease; explicit ordinary guest eligibility remains supported. Retirement rejects running/queued callers promptly without claiming cancellation of arbitrary underlying asynchronous work. Factory acquisition and negotiation are generation guarded and deadline bounded. Consent/receiver/sender callbacks retain transport/view ownership.

Verified scope: 116 focused tests and 931 full tests pass; strict compilation/generated comparison pass. Native two-context core/availability/manager proof includes both-role wake, simultaneous offers, managed one-sided expiry/reconnect and three queued messages each direction; original six backup transfers remain green. This is isolated host-only component proof, not live TURN or physical-device acceptance. Peer-state menu controls are the next separate unit; three-device acceptance is deferred by the user.

## Per-peer Mini connection controls

Mini's Conexiones menu now has live peer-name/state cards independent of SA/cloud links. Stored links alone never imply connection: Conectado requires an authenticated open channel and valid lease. Cerrar conexión retires the current RTC without pausing receipt availability or signing out/unlinking/restoring/deleting data. Existing channel-close handling retires the counterpart RTC too; both remain available without immediate RTC renewal. Conectar/Reconectar starts one owned demand, disables duplicate requests, and rejects stale completions after close/replacement. Names use literal text; stable keyed rows retain focus and changed state text uses polite announcements. Touch controls meet 44px and use theme tokens/SVGs.

Verified: 46 focused tests, 937 full tests, strict compile/generated comparison, and native two-context bilateral retirement/wake plus actual DOM focus/alias/touch checks. Original six native backup transfers remain green. No new wire messages, SA changes, cloud-error hiding, permanent pause, production activation or three-device requirement. One earlier native timeout remains unclassified; final instrumented passes are component evidence, not live TURN or physical-device stability proof. No affected recorded tutorial exists; whole-app physical testing and four-theme visual inspection remain separate acceptance.

## T3o — reconnect acquisition ownership
A Mini reconnect intent is reserved per linked peer before identity or listener acquisition. Close, unlink, account change, and shutdown invalidate that intent even when no listener/RTC exists. Cancellation rejects the caller promptly; underlying asynchronous work is not physically aborted and must check intent ownership before acting after each acquisition await.

A resumed reconnect must not retire a transport acquired by a different send/validated incoming offer, a replacement listener, or an active incoming/outgoing transfer. Repeated legitimate reconnect clicks share one intent. An explicit Connect after Close reserves a new intent; late old lookup/demand/readiness completions cannot overwrite its state. Close still preserves credential-free standby, Google identity, links, and stored backups. Newly arriving remote demand remains allowed after Close.

Implementation uses the existing strict TypeScript session-manager module for intent ownership and narrow UI wiring. The temporary `reconnectIntent` on an entry identifies only its own awaited demand factory; it is cleared before authenticated readiness. Registry creation is lazy so unrelated UI does not depend on feature setup. SA behavior and the F3 answer/negotiation-timeout hypothesis are unchanged.

Verification: deterministic actual-function UI VM exercises delayed lookup/setup cancellation, actual sender and validated remote-offer takeover, busy refusal, a fresh connect completing before old lookup resumes, missing-entry unlink/logout, stale-owner stop, and existing six-send same-lease behavior. Focused 53/53 and full 947/947 passed. Native Chromium/physical/live TURN regression was not repeated: existing native transport mechanics evidence does not itself prove this corrected async acquisition path. Review and preview activation remain separate parent-owned steps.

## T3p — visible current Mini connection
Each linked Mini card displays a prominent semantic SVG/text badge: Disponible (no active connection, still available to receive while Mini is open), Conectando, Conectado, or Error. Only a currently authenticated, open channel with a valid owned lease permits Conectado and the ready-to-send/receive copy. Historical relay verification, available credentials, and saved links never establish that status.

Cards use existing theme tokens for solid badge fills and a soft card accent/border. Badge text contrast is at least 4.5:1 in all five currently shipped themes, controls remain at least 44px, and border width stays constant across status changes. Neutral status has no success color. Text and distinct SVGs communicate meaning independently of color. The existing keyed row/buttons remain mounted; unchanged refreshes do not rewrite the polite live status. Alias text remains literal and busy/close/reconnect actions retain existing ownership behavior.

This is presentation only. The supplied same-beta diagnostics show local channel success followed by channel failures/DTLS stalls; snapshots taken at different times and local session numbers do not prove paired simultaneous stability or the F3 timeout hypothesis. No transport, server, credential policy, timers, auto-connect, SA behavior, or independent cloud banner changes are included.

Proof: observable DOM tests cover all statuses, false-connected fallback, disconnect reset, stable focus/nodes, and unchanged live-region refreshes. Native synthetic component visual-only checks cover two isolated sandboxed contexts, 390/1000px widths, dark/light/contrast/ocean/sol project definitions, status text/icons, badge contrast, fit, touch sizes, and disconnect/focus reset, with zero credential and external requests. Existing network acceptance branches and six-transfer assertions remain unchanged; live/physical/network battery was not repeated for this presentation unit. No tutorial flow changed.

## T3q — manual reconnect supersedes armed signaling retry
An explicit Mini reconnect supersedes the already armed automatic backoff authority before its first acquisition await. Clearing the timer also clears the entry's timer identity, so an already queued callback cannot stop the manually acquired listener/demand. A closed-socket listener acquisition can arm another retry; manual reconnect revokes that setup timer after verifying entry, transport, and busy ownership and before starting its demand.

The existing automatic retry identity guard remains unchanged. If an owned manual operation fails after taking an armed retry (or the socket remains closed), it returns recovery to a fresh bounded automatic retry using existing scheduling. Normal automatic retry without manual demand, later socket-error recovery, account/unlink stops, duplicate intent coalescing, and F1/F2 busy/new-transport protection remain intact. No new state machine, protocol, lease timeout, signaling-client behavior, or server policy is introduced.

Actual-function synthetic VM tests reproduce the pre-fix old timer stopping/replacing a listener during delayed lookup and held factory. Additional cases cover suspended signaling setup, setup-time retry rearming, stale callback execution despite clearTimeout, recovery after manual lookup/factory failure, and subsequent automatic failure recovery. This establishes a deterministic ownership defect only; physical beta 1.3 socket-error/APP_ERROR causality and F3 remain unproven. No native transport/physical/tutorial battery was repeated for this queue-ownership correction.

## T3r — restore current-account availability without opening Connections
Persisted-auth restoration and subsequent account/guest transitions retire old RTC, pending reconnect intents, and standby owners, then prepare fresh credential-free Mini standby without requiring menu/focus interaction. The existing typed account watcher now provides ownership checkpoints: older account generation, peer stop/unlink, and disposed/shutdown acquisitions cannot complete into a current listener. Peer-listing results and listener setup continuations use those checkpoints alongside existing entry ownership guards. Account retirement intentionally does not revoke the newly issued account checkpoint; ordinary peer stops do. Disposing the watcher invalidates late work and prevents future callback rearming.

No RTC or credential request is made simply to restore standby. A validated incoming offer wakes the current factory, normal trust handshake and MiniNotice consent remain mandatory, and receipt stages a backup without importing/restoring. Logout retains guest availability. SA, protocol, server, fixed lease, selective exchange, merge, and F3 behavior are unchanged.

Proof combines deterministic actual-function UI VM hydration/account/listing/setup/disposal tests with a bounded native two-context fixture executing the production inbox, promptIncomingBackup, armBackupReceiver, stageReceivedBackup, and real MiniNotice. Its receiver stays on an isolated synthetic attendance screen with no Connections menu; delayed SDK-shaped hydration rebuilds standby, then guest host-only transport permits visible acceptance, staging/ACK, and one repeat after RTC close. This is production-function component proof, not the complete index.html application or live TURN/real Google proof. An earlier native channel-phase timeout remains unclassified; the final instrumented run passed without transport changes.

Selective payload choices and consolidation/merge remain deferred backlog, with conflict/identity/deduplication policy unresolved and no automatic restoration authorized.


## T3s — preparation deadline through trusted readiness
The generation-owned preparation deadline remains armed after factory completion/channel opening until current trusted authentication with a valid owned lease. Default 10 seconds, bounded 1–30000 ms: timeout retires half-open RTC and pending readiness waiters while preserving credential-free standby. Early readiness is retained; stale readiness/queued cancelled timers cannot affect replacements. Authentication precedes connected publication/offer release. Readiness cancels preparation only, not the unchanged five-minute lease; collision protocol, ignored-offer replay and automatic RTC renewal are unchanged.

### Verified outcome
- Retained deterministic RED: 75/77, expanded 76/79. Fresh focused 80/80 (`/tmp/t3s-recovery-focused.log`), strict changed-module compile/generated comparison, syntax/diff/doc readback passed.
- Native final `/tmp/t3s-native-h3-coherent-observation.log` passed once: BOTH ID roles reached deadline/retirement standby without idle factory renewal, explicitly retried with current native connected/open channels and exchanged three messages each direction; all four measured selected pairs were `succeeded/host/host`. Zero credential/external requests.
- Full closure passed once: 966/966, zero failures/cancellations/skips (`/tmp/t3s-full.log`). Retained production trusted inbox/notice/staging outside Connections PASS (`/tmp/t3s-native-inbox.log`), repeat after close/no restore, was not rerun.
- Fixture proof resets both counters before sends, verifies current owned-channel traffic before stats and returns measurements from one coherent current-session report through a disposed handle. Referenced pair/candidates must exist with correct types, pair `succeeded`, local `host`, remote only `host`/`prflx`; no missing/historical/relay/server-reflexive values accepted. Retirement clears old references/counters. [W3C defines `prflx` as peer-reflexive, distinct from relay](https://www.w3.org/TR/webrtc/#rtcicecandidatetype-enum). This is native direct-component/no-ICE-servers proof, not live TURN.

### Preserved counterexamples
| Failed artifact | Actual observation and limit |
| --- | --- |
| `/tmp/t3s-native-h3.log` | Role-0 retry assertion without pair details; original cause remains unclassified. |
| `/tmp/t3s-native-h3-diagnostic.log` | Role-0 pair assertion: connected/open, `host/prflx` and `host/host`; payload/role 1 not reached. |
| `/tmp/t3s-native-h3-final.log` | Role-0 message timeout after bilateral succeeded host pairs; counts 3/0, role 1 not reached. |
| `/tmp/t3s-native-h3-ordered-counters.log` | Role 0 passed three messages each way; role-1 pair assertion with `{}`/succeeded host pair; payload not reached, displayed counters were from role 0. |

All failed logs remain unchanged. Counter-reset ordering and inconsistent wait/snapshot selectors were real fixture defects, but their correction does not retrospectively classify failed-run causes; final single-run acceptance is not a stability/repeatability claim. Native simultaneous glare/ordinary controls were not rerun; fresh glare evidence is deterministic. Tutorials N/A. Native review, commit, preview activation, authoritative Engram mirror and broader SA/full-index/physical/live/selective-merge acceptance remain pending. Fixture recovery did not alter production bytes.

## T3t — truthful connection-card observations
The existing keyed Mini card now presents a secondary `Vínculo` code, observed phase, current fixed-deadline countdown and explicitly known last-close reason. The code is an informational 96-bit SHA-256 prefix of a validated high-entropy link token, domain-separated with `mini-connection-card/link-fingerprint/v1:` and grouped into four six-digit hex blocks. It is not a room, private proof, session identifier or authorization credential. Matching codes identify the same link, not an authenticated active channel; invalid/unavailable derivation stays unknown.

Fingerprint derivation is asynchronous and never delays standby. Current entry, account checkpoint and captured link identity guard publication and later snapshots. Presentation snapshots contain only the existing keyed peer identifier/alias and safe boolean, enum, duration and display-digest observations; no new raw token, room/proof, SDP, address, account identity or credential fields are exposed.

The connected predicate remains current authentication plus open channel plus valid owned lease. Phases distinguish standby, preparation, local offer awaiting an answer, negotiation after a remote description, open-but-unverified channel, trusted readiness and error. No credential/signaling stage is guessed before factory completion. Attempt remaining time reads the existing preparation generation deadline with the lease manager's clock; channel remaining time reads the existing fixed lease deadline. A display-only timer refreshes only while an observed deadline has positive remaining time, preserves keyed card/buttons/focus, avoids a countdown live region and stops on disposal or idle. It creates no sessions and moves no deadline.

Known close classifications come from explicit user close, reconnect replacement, preparation timeout, signaling error/loss, transport error/disconnection and the lease's actual expiry predicate. Unknown causes are not inferred from generic local-close diagnostics or elapsed time. Initial idle startup does not fabricate a close, and stale owner/generation callbacks cannot overwrite replacement details. Closing RTC preserves the existing signaling listener; no lifetime, retry schedule, authentication, collision, protocol, data schema, transfer consent or restoration behavior changes.

### Verified outcome and limits
- Test-first RED: 82/91 passed, nine expected missing-observation failures (`/tmp/mini-card-red.log`). Final focused actual-module/wiring suite: 96/96, no failures/skips (`/tmp/mini-card-focused-complete.log`). Strict isolated compilation and exact comparison passed for all three generated modules; JS syntax and diff checks passed.
- Parent-authorized existing bump-version/stamp-build normalizers ran with `MINI_BUILD_TIME=2026-10-12T00:00:36.000Z` before final verification. All four metadata file hashes were unchanged; no hook/staging or manual metadata edits. Full deterministic suite ran once: 980/980, no failures/cancellations/skips (`/tmp/mini-card-full.log`).
- Local native fixture `tests/integration/mini-connection-card.browser.cjs` passed once (`/tmp/mini-card-native-ui.log`): 40 combinations of 390px/desktop, five production themes and four states; minimum measured text contrast 4.626:1, controls >=44px, no overflow, literal unsafe alias, preserved keyed focus, disposed timers, zero external requests and zero RTC constructors. It uses only current production presentation/CSS/theme tokens and synthetic snapshots, not the complete app, Google, public signaling or TURN.
- Tutorials N/A: current tutorial scripts cover manual/local workflows, not these Mini peer cards. H3/transport/public-signaling batteries were not rerun. Commit, native review, preview activation and two physical-device acceptance remain parent-owned pending actions; SA and throughput remain deferred.
- Rollback: remove only T3t typed/generated presentation, availability observation and lease-reason hunks, narrow roster observations/CSS, four focused regression additions, local card fixture and these T3t spec/tracker records. Preserve all prior tracker activation/probe evidence and prior transport readiness fixes. Protected original, index/refs, preview, backend and production remain untouched; attributed memory mirror remains pending registration.

## T3u.1 — settle an already-ready closing or closed channel
A send must not return to the initial authentication wait when its previously supplied authenticated channel has transitioned from open to closing/closed. `authenticated()` retires the current logical lease and rejects immediately for those terminal channel states; queued sends settle without executing transfer code. Initial absence of a supplied channel still waits for authentication, and an open supplied channel is reused exactly with existing serialization. Retirement remains idempotent and delegates external transport cleanup to its existing owner, rather than closing it directly or allocating a replacement. Fixed lease/credential deadlines, authentication, intents and signaling are unchanged; this is not proof of the reported physical reverse-transfer cause.

Test-first acceptance covers both terminal states, prompt event-turn settlement, zero transfer executions, exactly one logical retirement, invalid/non-busy lease, unchanged deadline, multiple queued sends and externally-owned cleanup. Existing open reuse/serialization and pending initial authentication must remain valid. Source changes are bounded to the manager; T3u.2 consent/receiver corrections, native networking, preview/backend changes and delivery are excluded. Parent owns work-unit commit/review; attributed memory mirror remains pending.

Verification: unchanged manager RED12/16 (four terminal-channel hangs); final manager GREEN16/16, owner-wiring54/54 and full985/985, with no final failures/skips. Strict whole-tsconfig isolated compile/generated manager comparison, syntax/diff/readback and pinned metadata no-op checks passed. Terminal-channel failure uses an explicit Spanish reconnect message; public retirement reason remains `unknown` rather than fabricated `lease-expired`. Local cleanup closes once; external cleanup stays delegated to `onRetired` and is never directly closed by the manager.

Native/browser/tutorial checks are N/A for this deterministic promise branch; no networking proof or physical-cause attribution is claimed. Commit/review/preview remain pending. Rollback only this manager TS/generated terminal-state/error-message branch, its regression additions and T3u.1 evidence; preserve prior observational code, external owner semantics, tracker history and future T3u.2 plan.

## T3u.2 — settle abandoned consent and accepted receivers without START
Pending sender consent accepts an optional attempt-owned AbortSignal. Cancellation/supersession settles as the existing `closed` result immediately, removes timers/channel/abort listeners, emits no further offers and ignores late acceptance. Already-aborted attempts send nothing. Existing accepted/declined/timeout results and framing stay intact; abort does not promise cancellation of already-streaming bytes. Old cancellation/catch/finally cannot change the replacement send's UI/notice/ownership.

An accepted Mini receiver installs a local20-second pre-start guard before replying accepted. An existing-core-validated START matching the accepted offer cancels that guard even when no chunk arrives yet; malformed/mismatched START cannot disable it through a truthy receiver return. Timeout/channel close/error before START detaches only the current receiver, releases its busy state and reports `Respaldo no recibido`, without closing the shared channel or sending a second consent reply. Detach/replacement/transport retirement cancels guard resources; late callbacks cannot touch replacement busy/receiver/notice. Valid-start completion detaches reception without releasing busy before asynchronous staging completes. Authentication, revocation/framing, transport lifetimes, credential limits and explicit staging/restore remain unchanged.

Verification requires deterministic behavioral RED/GREEN plus actual production consent/transfer/staging ACK A→B→A on reused authenticated channels, and one local native production-inbox control. None establishes the reported physical failure's cause or live TURN bidirectionality. T3u.1 remains committed and independent; delivery belongs to the parent.

### T3u.2 verified outcome and limits
- Pending consent now uses the exact sender attempt's AbortController; all accepted/declined/timeout/closed/abort paths remove channel/abort listeners and timeout/resend timers. Already-aborted attempts send nothing. Cleanup aborts before discarding the attempt; stale cancel/progress/auth-error/catch/finally cannot update a replacement UI. No cancellation frame or claim to abort already-streaming bytes was added.
- Accepted receiver guard is installed before the sole `respond(true)`. `validateTransferStart` plus the existing offer match precede `onStarted`; only that valid START cancels waiting, irrespective of delayed first chunks. Guard timeout/close/error fails the exact current receiver without closing shared transport or replying again. Cold detach releases its current pre-start owner; completion detach after START cancels resources without releasing busy until staging calls its current-owner completion. Replacement revokes the previous receiver reference before disposal; cancelled callbacks cannot clear new busy/receiver/notice.
- Behavioral proof: pending abort and already-aborted emission RED retained, plus isolated exact-HEAD sender/no-start receiver RED0/2 and direct cold-detach RED0/1. Final focused114/114 and one full1003/1003 passed without failures/skips. Strict compile/generated parity, syntax/diff/readback and pinned metadata no-op checks passed.
- Deterministic actual production sender/consent/receiver/staging ACK A→B→A reused the same authenticated LinkedChannels and leases, busy released, no new factory/transport close. A single local native production-inbox fixture passed actual trust/consent/transfer/staging ACK A→B→A on the same owned native channels, plus the retained repeat-after-close/no-restore control. Fresh sandboxed isolated contexts used host-only ICE, local signaling and a mocked account; external/credential requests0. This is production-component proof, not full-index, live TURN, physical causality or repeatability.
- Earlier failed iteration artifacts remain unchanged: `/tmp/t3u2-green-initial.log`104/107 included a misplaced START hook corrected before final source, a legacy timer fixture missing its attempt controller and cross-VM validation mismatch; `/tmp/t3u2-green-expanded.log`107/108 observed staging too early after one event turn, corrected to await the actual callback. VM boundaries now serialize into production Core validators, not substitute validation. Final native passed once. Delivery/review/preview and real two-device acceptance remain pending; no protocol/security/staging-revocation/credential/lease changes or attributed memory writes.
