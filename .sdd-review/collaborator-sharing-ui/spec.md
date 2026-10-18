# Make sharing device-first without changing trust

## Outcome

Replace the technical sharing home with a clear `Compartir` entry point, a primary `Vincular dispositivo` action, and readable linked-device cards. Existing work association remains secondary. Keep Spanish UI, native JavaScript/TypeScript, existing theme tokens, and all action hooks.

## Requirements

1. At mobile widths, the existing sharing overlay/shell fills the viewport and uses safe-area padding and internally scrolling content. Desktop remains constrained. No new shell or dependency.
2. Cards show only real alias-derived initials, alias, a separate linked marker, truthful connection state, useful hint, and accessible existing actions. `Conectado` requires `authenticated && channelOpen && leaseValid`; fallback is grey `Sin conexión`, never inferred online. Connecting stays `Conectando`.
3. Native `details`/`summary` hides safe fingerprint, phase, countdown, and close reason by default. Keyed rows, expanded details, focus, and pending-action ownership survive refreshes.
4. Receiving a backup only stages it; restoring still requires explicit review/consent. Do not change protocol, leases, auth, persisted schemas, or account behavior.
5. Use clean existing light/dark tokens, vector icons, 44px controls, and safe wrapping for long aliases. No external assets or fabricated profile fields.

## Verification

Deterministic test-first changes cover home copy, all connection predicate combinations, initials, disclosure persistence, and existing async/focus behavior. Focused and full Node suites plus a local-only synthetic-peer browser fixture check layout/actions at 320px, 390px, and desktop in light/dark themes. Deny external requests and make no live TURN/device claim. Review the tutorial catalog; rerun affected tutorials only when a scripted flow exists.

## Boundaries

T1 implements home/cards. T2 adds local Google photo fallback. T3 finishes remaining-step copy/navigation/regression acceptance. First new UX review boundary is `b86899a`; imported history remains unreviewed after its original context-budget refusal. Commits/review are parent-owned; the historical T1 authorization was local only. Current draft-PR authorization is stated below.

## T4 account stability and CI acceptance

Account metadata emits that do not change the effective identity must not rebuild the account view. When identity or photo changes, update the existing summary/card in place so native login/logout and secondary controls retain their DOM nodes and focus. Keep safe photo fallback, availability, account-switch and sign-out presentation current; do not change authentication, network behavior or metadata contracts.

The browser CI job must run `npm run test:e2e:connections` as an unconditional dedicated step with its globally installed Playwright environment. Preserve `test:e2e` and `test:e2e:ci` verbatim and retain tutorial opt-in behavior. Regression proof must reject a merely commented command.

Current delivery authorization is a full draft PR to `main` with a size exception (`exception-ok`), parent-owned publication only; no merge or Pages/production deployment. Pending T3 and separate blind-judge findings are outside T4.

## T5 full-app integration regressions

Correct three independently reproduced bucket-C root clusters without extending account/network behavior:

1. `narrow-toolbar-intrinsics`: stack the existing attendance toolbar when its combined intrinsic controls cannot fit. Preserve controls and text; do not hide overflow or constrain the sharing shell to mask document expansion.
2. `modal-open-focus-lifecycle`: after home/presentation settles, place first-open and reopened dialog focus inside the mounted shell; preserve visible in-dialog focus on refresh and retain native Tab/Shift+Tab/Escape and opener restoration. Deferred focus must not run after release.
3. `shared-auth-capability-presentation`: derive capability once from endpoint availability and existing native login/logout controls. Signed-out available builds offer sign-in; unavailable builds and signed-in accounts offer navigable `Mi cuenta`.

Acceptance uses fresh full-application 320/390 mobile-touch and 1280 desktop contexts in light/dark, native onboarding/tutorial dismissal, exact-local-origin HTTP and WebSocket denial, no accounts or real storage. Named full-app regressions must fail before fixes and pass afterward; the existing 20 component tests remain unchanged. Full configured Node and relevant CI browser checks, generated parity/convergence, and actual 320px screenshot are required. No live TURN/pair/Google proof, hosted-CI provisioning fix, or T3 expansion is claimed. Parent retains commit, independent review, and publication ownership.

## T6 manual pairing and shared confirmation accessibility

Manual code/key entry must focus the code field on rendering and announce format errors associated with precisely the invalid fields. Validate with the exported core normalizers before descriptor construction, never infer field invalidity from transport/hash/expiry errors. When both fields fail, feedback identifies both; editing clears stale invalidity and feedback. Preserve single-flight submission and restore focus when returning. Implement new behavior in the existing typed presentation module with minimal native DOM wiring.

The shared confirmation dialog uses the existing title as its accessible name and message as its description. A synthetically staged backup must open a dialog named `¿Restaurar respaldo?`; cancel preserves existing synthetic employees and the staged backup. No restore or protocol behavior changes. Test actual local-only application paths, field-specific feedback, editing, transport failure, keyboard navigation, and cancellation before closure.

## T7 shared confirmation danger-text contrast

Use the existing theme text token only for the shared confirmation danger action, retaining the current danger background and leaving unrelated destructive controls unchanged. Light and Original/dark text contrast must reach 4.5:1 in normal, visible keyboard focus and hover states. Preserve visible focus, existing accessible name/description, explicit restore consent, and Cancel preservation of hydrated synthetic employees/staged backup. Verify real local-only application paths with programmatic composited contrast and settled scoped axe; no manual-pairing or restore logic changes.

## T8 isolated CI private-tool prerequisite

The unit job must prepare the existing private-TURN development tool before the unchanged required `npm test`: install one pinned Node 22 declaration release into runner temp without scripts or a package lock, compile with the existing root TypeScript compiler and strict tool configuration, and append `PRIVATE_TURN_TOOL_OUTPUT` to `GITHUB_ENV` for following steps. Keep declarations/output outside the application tree and retain TypeScript as the only root development dependency. No runtime dependency, proxy-test skip, browser-job change or server/protocol/UI change is authorized.

Executable regressions must prove unit-specific install → compile → environment export → test ordering, isolation, pinning, append semantics, next-process visibility and fail-closed install/compile errors. Exercise each command in a separate fail-fast shell, including quoted runner-temp paths with spaces and preservation of existing environment-file entries; keep these stub regressions separate from actual pinned-package compilation and import proof. Use single-line preparation steps so the existing first browser `run: |` routing boundary remains unchanged. Verify the actual pinned package and fresh compiled module locally with configured synthetic-loopback proxy tests and one full Node suite. Hosted CI awaits parent publication; PR #20 is open and its state remains unchanged. Existing review acknowledgement through `c85e83b` does not cover this new candidate.
