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
