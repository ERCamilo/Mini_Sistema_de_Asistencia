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
