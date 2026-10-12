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
