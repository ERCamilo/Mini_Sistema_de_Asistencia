# Resume SA inbox after a manual P2P transfer

Reproduced 2026-10-02 with the SA multi-device Playwright circuit. After pairing and applying a roster, closing the Mini modal closes the manual channel but only restarts the Mini backup listener. The SA passive listener remains absent; SA attendance requests time out. Reloading Mini starts the listener and makes the same request succeed.

Closing with keepSession=false must restart startPassiveInbox, which includes the backup inbox and filters SA peers before arming authenticated attendance responders. keepSession=true must continue retaining the current session. No peer identity, data or protocol changes.

Frozen behavioral regression: SA e2e/multi-device.spec.cjs against baseline d9db66b versus this candidate. It must pair three Minis, apply reviewed rosters, close the modals, then obtain all three attendance submissions without a reload workaround. Same-app backup consent, restore, reload and reverse transfer must also pass. Scope is the existing handwritten P2P UI close wiring; no compiled TypeScript file is edited.

Second RED: after a device-level WebRTC/signaling outage, the offline handler cleared retry timers but retained session objects. Online ensurePeerListener returned that closed session and SA retry timed out. Offline now uses the existing stopPeerListener cleanup; persisted trusted peers and all employee/attendance data stay intact. Online reconstructs listeners from those persisted peers. Frozen circuit also covers outage, preservation, retry and durable staged correction.

## Local M8 activation boundary

M8 restores the integrated Mini close/reconnect wiring and its deterministic wiring tests. The direct multiday runner resolves Mini from its own repository location and uses synthetic identities and local signaling. The full multi-device outage/backup circuit remains later integration coverage; no real accounts, remote signaling or production permissions are exercised here.
