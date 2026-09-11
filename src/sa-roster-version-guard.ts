// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.SaRosterVersionGuard` (browser global for the later P2P integrator).
// Mirrors the `sa-roster-import.ts` convention under `module: "none"` (no
// per-file isolation, no imports). All type names are `SaVersionGuard*`-prefixed
// to avoid colliding with ambient globals from other `src/*.ts` modules.
//
// Isolated roster freshness/version guard (Block B seam, reviewed-P2P only):
// - Classifies an incoming `sa-roster/v1` envelope per `saProjectId` as
//   `first` | `newer` | `equal` | `older` | `ambiguous`.
// - Records the last successfully APPLIED roster only, via an explicit
//   `markApplied` call. `classify` never persists.
// - Never touches employee/attendance storage; persists only freshness markers
//   (`rosterVersion`, `generatedAt`) per project under a single storage key.
// - `generatedAt` comparison is deterministic: only canonical ISO-8601
//   (`new Date(value).toISOString() === value`) is comparable; anything else is
//   `ambiguous` (fail closed). Equal timestamps with conflicting versions are
//   `ambiguous`. Missing/malformed timestamps are `ambiguous`, never `first`.
// - This module does NOT wire itself to legacy manual JSON import or to any
//   apply path; the later integrator calls it only around reviewed P2P apply.

type SaVersionGuardOutcome = 'first' | 'newer' | 'equal' | 'older' | 'ambiguous';

interface SaVersionGuardMarkers {
  rosterVersion?: string;
  generatedAt?: string;
}

interface SaVersionGuardDecision {
  outcome: SaVersionGuardOutcome;
  saProjectId: string;
  incoming: SaVersionGuardMarkers;
  applied: SaVersionGuardMarkers | null;
  reason: string;
}

interface SaVersionGuardRecord extends SaVersionGuardMarkers {
  saProjectId: string;
}

interface SaVersionGuardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface SaVersionGuardOptions {
  storage?: SaVersionGuardStorage | null;
  storageKey?: string;
}

(function exposeSaRosterVersionGuard(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SaRosterVersionGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSaRosterVersionGuardApi() {
  const STORAGE_KEY = 'sa_roster_version_guard_v1';

  function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidSaProjectId(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128) return false;
    if (trimmed !== value.trim()) return false;
    return !/[\s\x00-\x1f\x7f]/.test(trimmed);
  }

  function extractProjectId(roster: unknown): string {
    if (!isObject(roster) || !isValidSaProjectId(roster.saProjectId)) {
      throw new Error('SA roster version guard: saProjectId is malformed');
    }
    return (roster.saProjectId as string).trim();
  }

  function extractVersionField(roster: Record<string, unknown>): { value: string | undefined; malformed: boolean } {
    if (!hasOwn(roster, 'rosterVersion') || roster.rosterVersion === undefined || roster.rosterVersion === null) {
      return { value: undefined, malformed: false };
    }
    const raw = roster.rosterVersion;
    if (typeof raw !== 'string' || !raw.trim()) return { value: undefined, malformed: true };
    return { value: raw.trim(), malformed: false };
  }

  function extractTimestampField(roster: Record<string, unknown>): { value: string | undefined; present: boolean; malformed: boolean } {
    if (!hasOwn(roster, 'generatedAt') || roster.generatedAt === undefined || roster.generatedAt === null) {
      return { value: undefined, present: false, malformed: false };
    }
    const raw = roster.generatedAt;
    if (typeof raw !== 'string' || !raw.trim()) return { value: undefined, present: true, malformed: true };
    const trimmed = raw.trim();
    if (Number.isNaN(Date.parse(trimmed))) return { value: undefined, present: true, malformed: true };
    let canonical = '';
    try {
      canonical = new Date(trimmed).toISOString();
    } catch {
      return { value: undefined, present: true, malformed: true };
    }
    if (canonical !== trimmed) return { value: undefined, present: true, malformed: true };
    return { value: trimmed, present: true, malformed: false };
  }

  function isCanonicalTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    const trimmed = value.trim();
    if (Number.isNaN(Date.parse(trimmed))) return false;
    try {
      return new Date(trimmed).toISOString() === trimmed;
    } catch {
      return false;
    }
  }

  function freezeMarkers(markers: SaVersionGuardMarkers): SaVersionGuardMarkers {
    return Object.freeze({ ...markers });
  }

  function snapshotMarkers(value: { rosterVersion?: string; generatedAt?: string }): SaVersionGuardMarkers {
    const out: SaVersionGuardMarkers = {};
    if (value.rosterVersion !== undefined) out.rosterVersion = value.rosterVersion;
    if (value.generatedAt !== undefined) out.generatedAt = value.generatedAt;
    return freezeMarkers(out);
  }

  function createSaRosterVersionGuard(options: SaVersionGuardOptions = {}) {
    const storageKey = options.storageKey || STORAGE_KEY;
    const storage = options.storage === undefined ? null : options.storage;
    const memoryFallback = new Map<string, string>();

    function readRaw(): string | null {
      try {
        if (storage) return storage.getItem(storageKey);
        return memoryFallback.has(storageKey) ? (memoryFallback.get(storageKey) as string) : null;
      } catch {
        return null;
      }
    }

    function writeRaw(serialized: string): void {
      try {
        if (storage) storage.setItem(storageKey, serialized);
        else memoryFallback.set(storageKey, serialized);
      } catch {
        // Defensive write: quota or storage failure must never break the apply
        // flow. The guard simply remains on its previous state.
      }
    }

    function loadMap(): { map: Record<string, SaVersionGuardMarkers>; corrupt: boolean } {
      const raw = readRaw();
      if (raw === null || raw === undefined || raw === '') return { map: {}, corrupt: false };
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isObject(parsed)) return { map: {}, corrupt: true };
        return { map: parsed as Record<string, SaVersionGuardMarkers>, corrupt: false };
      } catch {
        return { map: {}, corrupt: true };
      }
    }

    function storedEntryFor(map: Record<string, SaVersionGuardMarkers>, saProjectId: string): { found: boolean; entry: SaVersionGuardMarkers | null; malformed: boolean } {
      if (!hasOwn(map, saProjectId)) return { found: false, entry: null, malformed: false };
      const raw = map[saProjectId];
      if (!isObject(raw)) return { found: true, entry: null, malformed: true };
      const record = raw as Record<string, unknown>;
      let rosterVersion: string | undefined;
      if (hasOwn(record, 'rosterVersion') && record.rosterVersion !== undefined && record.rosterVersion !== null) {
        if (typeof record.rosterVersion !== 'string' || !(record.rosterVersion as string).trim()) {
          return { found: true, entry: null, malformed: true };
        }
        rosterVersion = (record.rosterVersion as string).trim();
      }
      let generatedAt: string | undefined;
      if (hasOwn(record, 'generatedAt') && record.generatedAt !== undefined && record.generatedAt !== null) {
        if (!isCanonicalTimestamp(record.generatedAt)) return { found: true, entry: null, malformed: true };
        generatedAt = (record.generatedAt as string).trim();
      }
      const entry: SaVersionGuardMarkers = {};
      if (rosterVersion !== undefined) entry.rosterVersion = rosterVersion;
      if (generatedAt !== undefined) entry.generatedAt = generatedAt;
      return { found: true, entry: freezeMarkers(entry), malformed: false };
    }

    function decide(
      saProjectId: string,
      incomingVersion: string | undefined,
      incomingGeneratedAt: string,
      stored: SaVersionGuardMarkers | null
    ): SaVersionGuardDecision {
      if (stored === null) {
        return Object.freeze({
          outcome: 'first' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
          applied: null,
          reason: 'no-prior-applied-roster'
        });
      }
      if (stored.generatedAt === undefined) {
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
          applied: snapshotMarkers(stored),
          reason: 'missing-or-malformed-stored-markers'
        });
      }
      const incomingTime = Date.parse(incomingGeneratedAt);
      const storedTime = Date.parse(stored.generatedAt as string);
      if (incomingTime > storedTime) {
        return Object.freeze({
          outcome: 'newer' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
          applied: snapshotMarkers(stored),
          reason: 'incoming-newer'
        });
      }
      if (incomingTime < storedTime) {
        return Object.freeze({
          outcome: 'older' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
          applied: snapshotMarkers(stored),
          reason: 'incoming-older'
        });
      }
      const storedVersion = stored.rosterVersion;
      if (storedVersion === incomingVersion) {
        return Object.freeze({
          outcome: 'equal' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
          applied: snapshotMarkers(stored),
          reason: 'identical-freshness-markers'
        });
      }
      return Object.freeze({
        outcome: 'ambiguous' as const,
        saProjectId,
        incoming: snapshotMarkers({ rosterVersion: incomingVersion, generatedAt: incomingGeneratedAt }),
        applied: snapshotMarkers(stored),
        reason: 'equal-timestamp-conflicting-version'
      });
    }

    function classifyIncoming(roster: unknown): SaVersionGuardDecision {
      const saProjectId = extractProjectId(roster);
      const record = roster as Record<string, unknown>;
      const version = extractVersionField(record);
      if (version.malformed) {
        const loaded = loadMap();
        const previous = storedEntryFor(loaded.map, saProjectId);
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: freezeMarkers({}),
          applied: previous.found && previous.entry ? snapshotMarkers(previous.entry) : null,
          reason: 'malformed-rosterVersion'
        });
      }
      const timestamp = extractTimestampField(record);
      const loadedForTimestamp = loadMap();
      if (loadedForTimestamp.corrupt) {
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: timestamp.value !== undefined
            ? snapshotMarkers({ rosterVersion: version.value, generatedAt: timestamp.value })
            : snapshotMarkers(version.value !== undefined ? { rosterVersion: version.value } : {}),
          applied: null,
          reason: 'corrupt-store'
        });
      }
      const previousForTimestamp = storedEntryFor(loadedForTimestamp.map, saProjectId);
      const appliedSnapshot = previousForTimestamp.found && previousForTimestamp.entry
        ? snapshotMarkers(previousForTimestamp.entry)
        : null;
      if (timestamp.malformed || timestamp.value === undefined) {
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: snapshotMarkers(version.value !== undefined ? { rosterVersion: version.value } : {}),
          applied: appliedSnapshot,
          reason: timestamp.present ? 'malformed-generatedAt' : 'missing-generatedAt'
        });
      }
      if (previousForTimestamp.malformed) {
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: version.value, generatedAt: timestamp.value }),
          applied: null,
          reason: 'missing-or-malformed-stored-markers'
        });
      }
      if (!previousForTimestamp.found || !previousForTimestamp.entry) {
        return decide(saProjectId, version.value, timestamp.value as string, null);
      }
      if (previousForTimestamp.entry.generatedAt === undefined) {
        return Object.freeze({
          outcome: 'ambiguous' as const,
          saProjectId,
          incoming: snapshotMarkers({ rosterVersion: version.value, generatedAt: timestamp.value }),
          applied: snapshotMarkers(previousForTimestamp.entry),
          reason: 'missing-or-malformed-stored-markers'
        });
      }
      return decide(saProjectId, version.value, timestamp.value as string, previousForTimestamp.entry);
    }

    function markApplied(roster: unknown): SaVersionGuardRecord {
      const saProjectId = extractProjectId(roster);
      const record = roster as Record<string, unknown>;
      const version = extractVersionField(record);
      if (version.malformed) throw new Error('SA roster version guard: rosterVersion is malformed');
      const timestamp = extractTimestampField(record);
      if (timestamp.malformed) throw new Error('SA roster version guard: generatedAt must be ISO-8601');
      const loaded = loadMap();
      const base = loaded.corrupt ? {} : loaded.map;
      const next: Record<string, SaVersionGuardMarkers> = { ...base };
      const entry: SaVersionGuardMarkers = {};
      if (version.value !== undefined) entry.rosterVersion = version.value;
      if (timestamp.value !== undefined) entry.generatedAt = timestamp.value;
      next[saProjectId] = { ...entry };
      try {
        writeRaw(JSON.stringify(next));
      } catch {
        // Defensive: serialization of trimmed markers cannot realistically fail.
      }
      return Object.freeze({ saProjectId, ...snapshotMarkers(entry) });
    }

    function getLastApplied(saProjectId: unknown): SaVersionGuardRecord | null {
      if (!isValidSaProjectId(saProjectId)) throw new Error('SA roster version guard: saProjectId is malformed');
      const id = (saProjectId as string).trim();
      const loaded = loadMap();
      if (loaded.corrupt) return null;
      const slot = storedEntryFor(loaded.map, id);
      if (!slot.found || !slot.entry || slot.malformed) return null;
      return Object.freeze({ saProjectId: id, ...snapshotMarkers(slot.entry) });
    }

    function clearProject(saProjectId: unknown): void {
      if (!isValidSaProjectId(saProjectId)) throw new Error('SA roster version guard: saProjectId is malformed');
      const id = (saProjectId as string).trim();
      const loaded = loadMap();
      const base = loaded.corrupt ? {} : loaded.map;
      if (!hasOwn(base, id)) return;
      const next: Record<string, SaVersionGuardMarkers> = { ...base };
      delete next[id];
      try {
        writeRaw(JSON.stringify(next));
      } catch {
        // Defensive write: never break callers on quota failure.
      }
    }

    function clearAll(): void {
      try {
        writeRaw(JSON.stringify({}));
      } catch {
        // Defensive write: never break callers on quota failure.
      }
    }

    return {
      classifyIncoming,
      markApplied,
      getLastApplied,
      clearProject,
      clearAll
    };
  }

  return {
    STORAGE_KEY,
    createSaRosterVersionGuard
  };
});
