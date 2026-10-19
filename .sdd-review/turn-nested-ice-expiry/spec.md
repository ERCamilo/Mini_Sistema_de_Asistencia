# Accept matching nested TURN expiry metadata

The direct public issuer returns `expiresAt` at the response root and on its authenticated TURN server. The Mini parser currently rejects that otherwise valid response as `ICE_FIELDS_INVALID`; the private proxy already removes this metadata.

## Contract
- Validate root expiry using the existing declared units, clock, TTL, and margin checks first.
- Permit an optional own `expiresAt` field only on an ICE server containing a validated TURN URI, with the exact same value and type as the validated raw root expiry. Do not guess units or coerce strings.
- Reject nested expiry on STUN-only servers and retain the strict allowlist for every other server key.
- Keep URI, authentication, credential type, guest behavior, relay policy, and lease handling unchanged.
- Construct browser RTC servers from the existing supported fields only, never forwarding expiry metadata.

## Verification
Observe RED with a synthetic backend-shaped public-profile response, fixed issuer Date, Unix-seconds expiry, STUN and authenticated TURN. GREEN must preserve both servers and forced relay while removing nested expiry. Cover every existing root expiry mode and reject mismatches, malformed types, inconsistent units, STUN metadata, and unrelated keys. Run focused tests, application/tool compilation, one configured full unit suite, and convergent fixed-time normalization. Physical relay and deployment remain separate parent-owned acceptance steps.

## Scope
Only the parser, its compiled output, regression tests, this specification, the existing task tracker, and generated build stamps may change. No backend, production, Google authentication, coturn, version, or package changes are authorized.
