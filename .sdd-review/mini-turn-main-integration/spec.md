# Preserve main and tested TURN in one local integration

## Intent
Merge pinned tested TURN `8b3ff3a42b0892d6967c9d62e3a30af1382ad6cc` into current main `91ef02340776e554ca8c3121bacdc9a3ef3bfc17` on an independent feature branch. Resolve overlapping data/wiring conflicts before a later connections UX/UI redesign.

## Requirements and design
Preserve employee proposal scripts, employee sending, durable report confirmation and manual WhatsApp confirmation from main. Preserve TURN connection registration, roster guard reset, separate Firebase roster review, session ownership and nested ICE expiry normalization. Retain both CSS families and both design requirements, with unique new section numbering. Keep all main CI scripts and do not downgrade its version. Production HTML must not activate private TURN bootstrap; development tooling retains injection ownership.

## Acceptance and limits
Add a focused text-wiring regression before resolution and observe RED against main, then GREEN after the additive merge. Run the existing complete unit suite and CI browser baseline, plus synthetic local TURN fixtures with existing read-only tools and SA fixture. Generated outputs and imported committed vendor files only; no installation, broad refactor, new UI design, remote access, account/backend mutation, publication, commit, push or PR by the worker. Source checkouts and dirty/staged content remain unchanged. Parent owns final commit and any native review; physical relay acceptance remains out of scope.
