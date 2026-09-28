// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.LocalDate` (browser global consumed by index.html).
// Attendance day keys follow the device's local calendar. Never derive them from
// `toISOString()`: that is UTC and jumps to tomorrow in the evening west of UTC.

(function exposeLocalDate(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.LocalDate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalDateModule() {
  function pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  function toLocalDateKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function shiftLocalDateKey(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    // Noon avoids DST edges; the Date is only used for calendar arithmetic.
    return toLocalDateKey(new Date(year, month - 1, day + days, 12));
  }

  return {
    toLocalDateKey,
    shiftLocalDateKey
  };
});
