# Successful updates without repeated confirmation

## Change
After the user explicitly applies an update, retain save-before-download and confirmed worker refresh. Persist a tab-scoped one-use receipt only after those operations succeed. On a fresh boot of the exact intended newer version, consume it, advance the news reference without regression, and display a large green SVG check with “Actualización completada”. Dismiss the success state automatically into the existing app; do not reopen its automatic news modal.

This supersedes only the post-explicit-update news confirmation in the older release/cache specifications. First installation, ordinary reload, postponed updates, manual news, persistence failures and cancellation retain their existing semantics. A stale or unmatched receipt cannot declare success. Receipt storage failure never produces a false success or a reload loop.

## Presentation
Success is announced politely, contains both text and vector shape, uses theme tokens and respects reduced motion. It requires no button and does not take focus away from work. Release copy explains features and benefits in neutral Spanish; curated presentation wording may clarify legacy entries without rewriting published canonical history. New version: 2.17.10.

## Verification
Manager regression cases cover receipt ordering, exact-version match, consumption, storage failures, cancellation and manual history. A real local service worker updates between two versions while preserving employees; browser checks verify check visibility, automatic return, no repeated news, themes and reduced motion. Full unit, release and existing Connections suites remain required. No live TURN or Google claim follows from these synthetic tests.

## First-upgrade compatibility
The existing 2.17.9 manager cannot emit the new receipt. Its first upgrade to this release may still display legacy news. The automatic completion flow starts with updates initiated by 2.17.10 or later. No heuristic based on last-seen version alone is permitted: a normal reload is not proof that the user completed an update. Worker-protocol migration is outside this bounded change.
