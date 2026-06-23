// UMD wrapper: exposes window.AttendanceReport (browser) + module.exports (node --test).
// module:"none" gives every src/*.ts one shared global scope, so all type names here
// are Report-prefixed to avoid colliding with employee-number-rules / draft-import.
// `module` is already declared ambiently by employee-number-rules.ts in that shared
// scope, so we must NOT redeclare it here (would be a TS2451 redeclaration error).

type ReportEmployeeId = string;

interface ReportEmployee {
  id: ReportEmployeeId;
  name: string;
  number: string;
  position?: string;
  sueldo?: string;
  [extra: string]: unknown;
}

interface ReportDay {
  date: string;          // 'YYYY-MM-DD'
  weekday: number;       // 0=Sun .. 6=Sat
  isSunday: boolean;
  weekdayLabel: string;  // 'lun'
  dateLabel: string;     // '1/2'  (day/month)
  weekIndex: number;     // 0-based week within the range; increments after each Sunday
}

interface ReportRow {
  employee: ReportEmployee;
  hours: (number | null)[];   // per day; null = no 'present' record
  ratio: (number | null)[];   // hours / expectedHours; null when no record
  totalHours: number;
  totalRatio: number;
  daysPresent: number;
  overtimeHours: number;       // sum of max(0, hours - expected) on present days
}

interface AttendanceReportResult {
  from: string;
  to: string;
  expectedHours: number;
  days: ReportDay[];
  rows: ReportRow[];
}

interface AttendanceData {
  [date: string]: { [empId: string]: { status?: string; hours?: number } };
}

(function exposeAttendanceReport(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.AttendanceReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceReportApi() {
  const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  function parseDate(s: string): Date {
    const parts = String(s).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

  function toKey(d: Date): string {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function listDays(from: string, to: string): ReportDay[] {
    const end = parseDate(to);
    const days: ReportDay[] = [];
    let weekIndex = 0;
    const cur = parseDate(from);
    while (cur.getTime() <= end.getTime()) {
      const wd = cur.getDay();
      days.push({
        date: toKey(cur),
        weekday: wd,
        isSunday: wd === 0,
        weekdayLabel: WEEKDAYS[wd],
        dateLabel: cur.getDate() + '/' + (cur.getMonth() + 1),
        weekIndex: weekIndex
      });
      if (wd === 0) weekIndex += 1; // a Sunday closes its week
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  function rangeDays(from: string, to: string): number {
    const ms = parseDate(to).getTime() - parseDate(from).getTime();
    return Math.floor(ms / 86400000) + 1;
  }

  function round2(n: number): number { return Math.round(n * 100) / 100; }

  function normalizeNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function buildAttendanceReport(
    users: ReportEmployee[],
    attendanceData: AttendanceData,
    from: string,
    to: string,
    expectedHours: number
  ): AttendanceReportResult {
    const expected = expectedHours > 0 ? expectedHours : 8;
    const days = listDays(from, to);
    const sorted = [...users].sort((a, b) => normalizeNumber(a.number) - normalizeNumber(b.number));
    const rows: ReportRow[] = sorted.map(emp => {
      const hours: (number | null)[] = [];
      const ratio: (number | null)[] = [];
      let totalHours = 0, totalRatioRaw = 0, daysPresent = 0, overtimeHours = 0;
      days.forEach(day => {
        const dayData = attendanceData[day.date];
        const rec = dayData ? dayData[emp.id] : undefined;
        if (rec && rec.status === 'present' && typeof rec.hours === 'number') {
          const h = rec.hours;
          hours.push(h);
          ratio.push(round2(h / expected));
          totalHours += h;
          totalRatioRaw += h / expected;
          daysPresent += 1;
          if (h > expected) overtimeHours += h - expected;
        } else {
          hours.push(null);
          ratio.push(null);
        }
      });
      return {
        employee: emp,
        hours,
        ratio,
        totalHours: round2(totalHours),
        totalRatio: round2(totalRatioRaw),
        daysPresent,
        overtimeHours: round2(overtimeHours)
      };
    });
    return { from, to, expectedHours: expected, days, rows };
  }

  return { buildAttendanceReport, listDays, rangeDays };
});
