# Hotfix: local attendance date + save guard

## Problem
1. `selectedDate` and other "today" keys are built with `toISOString()`, which is UTC.
   In America/Santo_Domingo (UTC-4) the app opens on *tomorrow* from 20:00 local time,
   so attendance marked in the evening is stored under the wrong date. The daily
   reminder and the "last 30 days" copy use the same UTC key. `changeDay()` also
   round-trips through UTC and drifts in UTC+ time zones.
2. When localStorage is full, a tap throws `QuotaExceededError` from
   `attendanceCoordinator.recordAttendance()`. Nothing catches it: the UI does not
   change, the user gets no message, and the record can be left half-written
   (saved in `attendance`, missing from the mirror and from IndexedDB, then
   overwritten by the stale IndexedDB snapshot on the next start).

## Changes
- New TS module `src/local-date.ts` (`window.LocalDate`):
  - `toLocalDateKey(date?)` -> `YYYY-MM-DD` from the device's local calendar.
  - `shiftLocalDateKey(key, days)` -> calendar arithmetic without UTC round-trips.
- `index.html`: every date key uses `LocalDate` (no `toISOString().split('T')[0]`).
- `AttendanceCoordinator.recordAttendance()` becomes all-or-nothing for "present":
  the outbox entry is written first; if the repository write then fails, the
  outbox is restored (a shrinking write) and the error is rethrown.
- `index.html` `setRecord()` catches save errors, re-renders from the real stored
  state and shows a toast (storage full vs. generic failure).
- `index.html` `saveData()` no longer aborts when the legacy mirror write fails:
  it still queues the IndexedDB snapshot so the saved mark is not lost on restart.

## Out of scope (follow-ups)
Outbox growth/pruning, duplicate `weeklyAttendance` mirror, per-record metadata
size, in-memory repository cache, IndexedDB-first storage.

## Acceptance
- Unit tests: local date keys under UTC-4 at 20:30, month/year boundaries,
  UTC+ shift; coordinator rollback on outbox and on repository write failures.
- Browser check: 20:30 Santo Domingo opens and saves on the same day; a tap with
  full storage shows a toast and leaves no half-written record.
