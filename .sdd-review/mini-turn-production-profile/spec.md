# Mini production TURN profile (prepared, off)

## Scope of this change
Client-side profile for `https://miniasist.erlin.do` only. **Inert**: nothing in
`index.html`, `sw.js` or the preview packager references it, and
`tests/turn-main-integration.test.js` (main has no production bootstrap) is untouched.
No server, credential or deployment change. SA is out of scope (its production origin
is not confirmed and `main` has no TURN client).

## Profile `mini-production`
- Provider (`src/private-turn.ts`): origin exactly `https://miniasist.erlin.do`; relay
  must NOT be forced (policy `all`); contract `unix-seconds` + issuer clock; no private
  origins. Same endpoint (`https://turn-api.erlin.do/turn-creds`) and `Date` header as
  the preview profile. The preview profile is unchanged.
- Bootstrap (`src/private-turn-bootstrap.ts`): same validation; no diagnostics console,
  no preview release label.
- Users: guests (no session) and **anonymous** Firebase users never request credentials
  and keep the original STUN-only behavior. The server must enforce the same policy
  (API change, outside this repo).
- **Fail-open to STUN, production profile only.** If the credential request fails
  (`TURN_UNAVAILABLE`, `TURN_INVALID_RESPONSE`: API down, HTTP error, timeout, CORS,
  bad body), the RTC session is created with the caller's original options, exactly as
  for a guest. Never for: the preview `relay` profile, no profile, account change /
  logout (`TURN_ACCOUNT_CHANGED`), disposal or scope change (`TURN_BOOTSTRAP_STALE`).
  Pairing authentication is not involved: options are passed through untouched.
- STUN does not guarantee a connection; some networks still need TURN. The bootstrap
  reports `onRelayStatus('available' | 'unavailable' | 'not-requested')` so the UI can
  tell "direct connection only" from "relay available". Wiring that text in the UI is
  deferred.

## Entry module `src/private-turn-production.ts`
Reads `window.MiniProductionTurn = { enabled: boolean }`. Absent or `enabled !== true`
=> `off`. Wrong origin, extra keys or missing bootstrap => `configuration-invalid`.
Otherwise installs the fixed profile and publishes `mini-turn-status` on `document`.

## Deferred to the integration PR (with the v2.17.6 branch owner)
`index.html` marker (`enabled:false`) + 3 script tags, `sw.js` precache, preview
packager tolerance for already-present TURN scripts, update of the "no production
bootstrap" guard, version metadata. Activation needs: coTURN/TLS/ports verified,
`miniasist.erlin.do` in the API CORS list, user policy decided, two-phone test.

## Tests
API up/down, guest/anonymous/signed-in, account change, cancellation, flag off,
preview relay still mandatory.
