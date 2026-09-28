# P2P passive backups, consent notices, device name, back navigation

## Problems
- P2P backups were empty (bridge read `window.users`, but index.html keeps state
  in `let` bindings) and restoring one wiped the receiving Mini.
- Receiving a backup required opening Transferencias > Respaldos > "Esperar".
- Minis could stay as "Mini - Dispositivo", so peers could not recognize them.
- Android back left the app from any modal/step.

## Decisions
- One backup builder (`window.buildMiniBackupData`, repositories) for file and P2P;
  `MiniBackupSummary` blocks sending/reviewing/restoring empty backups.
- Consent before bytes (AirDrop model): `backup-offer {offerId, schema, size,
  senderName}` -> `backup-offer-reply {offerId, accepted}`. The receiver admits
  one transfer that matches the accepted offer (schema + size) and revokes the
  channel otherwise. Offers expire after 85 s (receiver) / 90 s (sender).
- Mini<->Mini only: SA does not speak the offer yet, so SA peers keep the direct
  protocol and the "Esperar" button. Mini peers get a passive, backup-only
  listener (boot, hub, online); roster/attendance are never bound to them.
- A sender leaves its own passive session before sending and closes the active
  one before rejoining, so a trusted room never holds more than two peers.
- Sileo-like notices (`MiniNotice`) for offer, waiting, progress, result.
- Blocking welcome gate (`MiniWelcome`) reusing `miniAliasIssue`.
- `BackNavigation`: one guard entry while a layer is open; Escape order.

## Out of scope / follow-ups
- Staged backups live in memory only (lost if the app is closed before review).
- Activity log (`mini_p2p_activity_v1`) is recorded but not shown in the UI.
- SA app support for `backup-offer`.
- Field test on two phones over cellular (NAT/STUN/TURN), real signaling server.
