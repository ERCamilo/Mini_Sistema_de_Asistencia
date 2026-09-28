# Spec: Mini storage v2

## 1. Database `mini-data` (version 1)

| Store | keyPath | Record | Indexes |
|---|---|---|---|
| `meta` | `key` | `{ key, value }` (schema version, migration state, deviceId) | — |
| `employees` | `id` | employee as today + `updatedAt`, `deletedAt?` (soft delete) | `number`, `saEmployeeId` |
| `attendanceDays` | `date` (`YYYY-MM-DD`, local calendar) | `{ date, sourceId, records: { [employeeId]: { hours, markedAt, updatedAt } }, revision, updatedAt }` | `updatedAt` |
| `outbox` | `id` | see section 3 | `state`, `date` |
| `requests` / `templates` | `id` | as today | — |
| `workContexts` | `id` | as today | — |
| `importHistory` | `id` | as today (bounded, newest 20) | — |

Rules:
- A day with no marks has no record (absence = no record, unchanged semantics).
- Per-record metadata shrinks to what is used: `hours`, `markedAt`, `updatedAt`.
  `status: 'present'`, `schemaVersion` and `localOnly` per record are dropped
  (the day carries `revision`; presence is implied by existence).
- Tombstones are replaced by `revision` on the day plus soft-deleted employees;
  sync compares revisions instead of replaying deletions.
- Settings (`appTheme`, `iconStyle`, `checkMode`, `reminderConfig`,
  `expectedHoursPerDay`) stay in localStorage: small, synchronous, per device.

## 2. Repositories (TS, `src/`)
- `createStore(db)` hydrates all stores once at boot into memory maps.
- Reads are synchronous from memory (same API the UI uses today:
  `getRecord`, `getByDate`, `getAll`, `getDateRange`, employees `getAll`...).
- Writes update memory first, then persist the single affected record in one
  IndexedDB transaction together with its outbox change (atomic: the day and
  its submission never diverge). On failure the in-memory change is rolled back
  and the caller gets an error (the UI already shows the "no se guardó" toast).
- A marking tap costs one `attendanceDays.put` + one `outbox.put`, O(day size).

## 3. Outbox = future Firebase submission
One item per `(date, sourceId)`, coalesced: re-marking the same day updates the
pending item instead of appending (fixes today's never-drained outbox).

```
{
  id: `${sourceId}_${date}`,          // deterministic -> idempotent upload
  schema: 'attendance-submission/v1', // existing F3.4 contract
  sourceId, sourceType: 'mini',
  projectId | null, groupId | null,
  date, revision,                     // bumps on every change of that day
  rows: [{ employeeId, saEmployeeId?, hours }],
  state: 'pending' | 'sent' | 'acknowledged' | 'failed',
  attempts, lastError?, updatedAt
}
```
- Items stay `pending` while there is no transport (standalone Mini).
- P2P/file/WhatsApp/Firebase all read from the same outbox.
- `acknowledged` items older than 60 days are pruned; the day itself is kept.

## 4. Multiple sources (two Minis on one crew, NFC readers)
Each producer is an independent observer. Nobody overwrites another source.

- `sourceId` = stable device id (Mini) or reader id (NFC); `sourceType` =
  `mini` | `nfc`. Submissions are keyed per source, so two Minis marking the
  same crew and day produce two submissions, never a merge conflict.
- **Double check (2 Minis):** both are linked to the same project/group.
  They must not sync marks with each other (their independence is the point).
  SA compares them per employee/day:
  agree -> suggested for approval; disagree (present vs absent, hours diff >
  threshold) -> flagged for review with both values side by side.
  Optional roles per device: `primary` (counts by default) and `verifier`.
- **NFC:** readers produce raw events, not day summaries:
  `{ id: readerId_seq, readerId, cardUid, at (reader clock), receivedAt, kind? }`.
  SA maps `cardUid -> employeeId` (F8.3) and derives hours per day with a
  policy (first-in/last-out, open shift if no tap-out, clock-skew tolerance).
  The derived day becomes one more observer in the same comparison.
- Mini never needs NFC data; the comparison lives in SA (the authority).

## 5. Migration v1 -> v2 (resumable, verified, reversible)
1. Read v1: prefer the IndexedDB snapshot if `legacy-migration-v1` marker
   exists, else localStorage (`attendance`, then `weeklyAttendance`, `users`...).
2. Build v2 records in memory; write all stores in one transaction; set
   `meta.migration = { state: 'written', from: 'v1', at }`.
3. Verify: re-read every store and compare with the source (counts per day,
   per-record hours, employee ids). Only then set `state: 'verified'`.
4. Keep v1 untouched (read-only) for 30 days, then offer cleanup. A setting
   "volver al almacenamiento anterior" exists during the grace period.
5. If the app is killed mid-way, step 1 restarts from v1 (v2 not verified
   = v2 ignored). Old outbox entries are coalesced into the new outbox.
6. Existing backups (`mini-backup/v1` JSON) keep importing/exporting: the
   backup builder maps to/from v2 so file and P2P backups stay compatible.

## 6. Acceptance
- Tap latency independent of history size (target < 16 ms for the write path).
- 2 years x 100 employees fits without quota errors (IndexedDB + `persist()`).
- Migration test fixtures: current production shapes, bloated tombstones,
  string-status legacy records, missing keys, corrupted JSON (stays on v1).
- Killing the app between any two migration steps never loses data.
- Two sources marking the same day never overwrite each other.

## 7. Work units (each one PR, tests first)
1. `src/mini-db.ts`: open/upgrade, typed stores, transaction helpers.
2. Repositories on top of it with in-memory cache (attendance, employees).
3. Outbox coalescing + submission builder (reuses AttendanceExport contract).
4. Migration + verification + grace-period rollback.
5. Switch the UI boot to v2 behind a flag; remove v1 writes after bake time.

