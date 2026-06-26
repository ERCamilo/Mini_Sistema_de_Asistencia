// UMD wrapper: exposes window.CheckCycle (browser) + module.exports (node --test).
// module:"none" gives every src/*.ts one shared global scope, so all type names here
// are Check-prefixed to avoid colliding with the other modules. `module` is declared
// ambiently by employee-number-rules.ts in that shared scope — do NOT redeclare it.
//
// Pure state machine for the daily checkmark. Three user-selectable modes decide what
// a tap does, given the current record + the "full day" hours value:
//   - 'modal'  : tap an absent employee -> present(full); tap a present one -> open the
//                quick-actions modal (the app handles the UI; this returns 'open-modal').
//   - 'cycle'  : off -> full -> half -> off  (half = fullHours/2).
//   - 'toggle' : off <-> full.

type CheckMode = 'modal' | 'cycle' | 'toggle';

interface CheckRecord {
  present: boolean;
  hours: number;
}

type CheckResult =
  | { action: 'set'; present: boolean; hours: number }
  | { action: 'open-modal' };

(function exposeCheckCycle(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.CheckCycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCheckCycleApi() {
  const CHECK_MODES: CheckMode[] = ['modal', 'cycle', 'toggle'];
  const DEFAULT_CHECK_MODE: CheckMode = 'modal';

  function normalizeCheckMode(mode: unknown): CheckMode {
    return mode === 'cycle' || mode === 'toggle' ? mode : DEFAULT_CHECK_MODE;
  }

  function fullDay(fullHours: unknown): number {
    const n = Number(fullHours);
    return Number.isFinite(n) && n > 0 ? n : 8;
  }

  function present(hours: number): CheckResult {
    return { action: 'set', present: true, hours: hours };
  }

  const ABSENT: CheckResult = { action: 'set', present: false, hours: 0 };

  function nextAttendanceState(
    current: CheckRecord | null | undefined,
    mode: unknown,
    fullHours: unknown
  ): CheckResult {
    const m = normalizeCheckMode(mode);
    const full = fullDay(fullHours);
    const half = full / 2;
    const isPresent = !!(current && current.present);
    const hours = current && typeof current.hours === 'number' ? current.hours : 0;

    if (m === 'modal') {
      return isPresent ? { action: 'open-modal' } : present(full);
    }

    if (m === 'toggle') {
      return isPresent ? ABSENT : present(full);
    }

    // 'cycle': off -> full -> half -> off
    if (!isPresent) return present(full);
    if (hours === full) return present(half);
    return ABSENT;
  }

  return {
    CHECK_MODES,
    DEFAULT_CHECK_MODE,
    normalizeCheckMode,
    nextAttendanceState
  };
});
