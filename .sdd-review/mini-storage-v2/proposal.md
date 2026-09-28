# Proposal: Mini storage v2 (IndexedDB as the single source of truth)

## Why
Mini state lives in three places that drift apart: `let` variables in
`index.html`, localStorage (`attendance` + `weeklyAttendance`, full JSON rewritten
on every tap) and an IndexedDB full snapshot (`asistencia-mini/app-state`).
Every data-loss bug fixed on 2026-09-28 (empty P2P backup, restore losing
attendance, tombstones growing per launch, quota errors on tap) came from that
split. localStorage also caps Mini at ~5 MB and each read re-parses the whole
history (~400 ms per tap with 60 employees x 3 months).

## What
- One IndexedDB database with one record per entity (per-day attendance,
  per-employee, per-outbox item). localStorage keeps only small UI settings.
- Repositories keep an in-memory cache and write through: one tap = one small
  IndexedDB write, reads never re-parse history.
- A durable outbox of per-day `attendance-submission` items that is the same
  shape the future Firebase `projects/{p}/submissions` will accept (Fase 7).
- Every record carries the source that produced it (`sourceId`, `sourceType`),
  so two Minis on the same crew and NFC readers can coexist as independent
  observers (see spec: Multiple sources).
- One-time, verified, reversible migration from v1; v1 data is kept read-only
  until the user has used v2 for a grace period.

## Non-goals
- No Firebase code yet (Mini must keep working without it).
- No change to P2P identity/peer stores (`sa-mini-p2p` DB) or the wire formats.
- No UI redesign; screens keep working through the same repository APIs.

## Risks
- Migration is the dangerous step: it must be verified byte-for-byte before v1
  is considered replaceable, and must be resumable if the app is killed.
- IndexedDB is async while today's UI reads synchronously: the repositories
  hydrate once at boot and serve reads from memory.
