# Named public Mini TURN preview preparation

## Intent and boundary
Prepare an explicitly packaged beta 1.9 profile for exactly `https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev`, with issuer `https://turn-api.erlin.do/turn-creds`, issuer Date expiry validation, forced relay and sanitized diagnostics. Reuse existing Mini Firebase compat mini-field authentication. Production/private A2 defaults and guest original P2P remain unchanged. No Pages upload/login, remote operations, connector restart/extension or live credential proof.

## Design
Add a named provider/bootstrap profile, not configurable issuer URLs or clock headers. Public entry is package-only, not production source index/precache baggage; explicit marker and exact origin must agree. Packager copies only tracked public PWA precache assets into a NEW directory, inserts ordered preview scripts/marker, extends only the packaged precache, and records SHA256 manifest/beta identity. Candidate packages are explicitly unreviewed; ordinary release packages require exact clean committed asset bytes. Existing source metadata is normalized using the installed compiler/stamp before candidate freeze.

## Checks
Observe provider/profile/packager RED, then focused GREEN with unchanged private/guest/Firebase gate checks; compile strict TypeScript, run full npm test once, diff check. Package identity/allowlist/hash/order/no-overwrite tests are offline. No new tutorial or user interaction is introduced: the existing backup/signin flow is unchanged, so tutorial recording is N/A. Public Firebase/relay/physical acceptance and upload/controller authorization remain pending. Native review/commit are parent-owned; memory mirror pending authoritative identity.

## Offline preparation and release procedure
The public entry and its provider/bootstrap dependencies are package-only; source `index.html` remains byte-identical and ordinary precache changes only its generated cache stamp. A2 injection code/configuration is unchanged. The packager derives the tracked public asset list from the existing PWA precache, rejects unsafe/untracked paths (except the explicitly named new generated entry in candidate mode), symlinks, repository output parents and overwrite. It never copies Git, backend files, account data or ambient credential directories. Existing HTML's known embedded OCR-key debt is unchanged, not newly introduced or repaired by this unit.

```sh
node --experimental-transform-types scripts/private-turn/package-mini-pages.mts \
  --source-root /home/ubuntu/worktrees/mini-private-turn-test-20261008 \
  --out /tmp/NEW_OWNED_PARENT/mini-public-pages \
  --revision FULL_REVIEWED_COMMIT_SHA
```

Create the owned external parent first, not the output directory. Release mode requires the full current commit SHA and byte parity between every packaged app asset and that commit. Manifest provenance is `committed-assets`, not proof of review authority; parent supplies the independently reviewed commit. `--candidate` is only offline verification, marks provenance `unreviewed-candidate` and must not be published. Exact package injection installs the named profile after core loading, adds the three scripts to only the packaged precache and isolates its cache identity from ordinary production. No manual source version/seal changes.

## Observed checks (2026-10-14)
- Initial test-first RED 85 total/79 pass/6 fail, exit 1: named public provider rejected, public entry missing and packager missing. Focused final 169/169, zero failures/skips, exit 0. Existing private defaults, guest no-fetch/original ICE behavior, Mini named Auth reuse, forceRelay distinction, host gates and sanitized diagnostics passed.
- Interim focused 165/166 found an overstrict guest object-reference assertion: diagnostics adds an existing observational onState callback, but no ICE override or credential fetch. Corrected the test to check actual transport preservation. Expanded 168/169 found a VM fixture lacking browser performance for issuer clock; supplied its synthetic monotonic clock, no runtime workaround.
- Packaged service-worker syntax regression was made RED 1/2 before correcting missing array separator; final package tests parse packaged SW syntax and verify manifest hashes, order/opt-in, identity, exclusive external output and rejection of dirty/mismatched release source. A separate invocation with the real full current b00c094 SHA also rejected dirty asset bytes before creating its output (exit1; `dirty-release-rejection.log`). Source index remains uninjected.
- `npm run build` with the existing protected checkout's compiler on PATH passed, normalizing strict generated JS and automatic build-info/SW stamps before final checks. Fresh strict temporary compilation and cmp verified all three provider/bootstrap/public-entry outputs, parity exit 0, output `/tmp/mini-public-pages-parity-568ZsG`. Packager Node transform-types syntax check passed; experimental-transform warning retained.
- First full `npm test` failed 972/1015: all 43 failures were unchanged private proxy fixture before-hooks requiring PRIVATE_TURN_TOOL_OUTPUT; no skip. Parent authorized one correctly configured closure. Unchanged committed dev-server source and retained generated tool parity verified, SHA256 4041e20ec2c6eec91f2acc1e2c1e9525d83bebb15cd12cc407d1d01fccb31c50. `PRIVATE_TURN_TOOL_OUTPUT=/tmp/preview-release-tool.fAoPU2 npm test` then passed 1015/1015, zero failures/skips, exit 0 (11.311s). No further full reruns.
- Evidence `/tmp/mini-public-pages-20261014/{red,package-sw-red,focused-initial,focused-final,focused-closure,build-initial,build-final,full,full-configured}.log`. Final diff check passed. No remote/private-preview/account/API/browser operations, Pages upload or live token issuance occurred.
- Offline candidate output `/tmp/mini-public-pages-20261014/normalized-candidate`: 80 hashed assets; release beta 1.9/revision abcdef1 is an explicitly synthetic fixture, NOT b00c094 or an approved release. Manifest SHA256 17c3a626c79df5b6b43dcacf8e40939079599daf65d361fc19a0ca3616845de0. Package-only output has no account/token data added; existing vendored SDK and public Firebase project metadata are reused.
- Source HTML has no CSP meta; deployed Pages edge policies are unverified. Public issuer exact CORS is already separately reviewed; no broad CORS or CSP bypass is added. Real Firebase authorized-domain/signin, ordinary DNS, selected relay and acknowledged physical bidirectional acceptance remain pending.

## Next actions (what / who / where)
1. Parent, local Mini worktree: independent spot, candidate commit/risk consent/native review and release-package identity. Worker does not commit or review.
2. Human/operator, Cloudflare Pages: separately authorize controller/login/upload to the exact named origin. Tunnel management certificate is not Pages upload authentication; never discover ambient Wrangler credentials.
3. Verifier/human, public endpoint and physical devices: reconcile the expired/expiring connector window with separate authorization, then real Google credential acquisition and relay A→B→A; continue Mini↔SA separately. No automatic connector restart/extension.
