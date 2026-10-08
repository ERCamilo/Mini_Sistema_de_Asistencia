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
