"use strict";
// UMD wrapper: exposes window.AttendanceReport (browser) + module.exports (node --test).
// module:"none" gives every src/*.ts one shared global scope, so all type names here
// are Report-prefixed to avoid colliding with employee-number-rules / draft-import.
// `module` is already declared ambiently by employee-number-rules.ts in that shared
// scope, so we must NOT redeclare it here (would be a TS2451 redeclaration error).
(function exposeAttendanceReport(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.AttendanceReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceReportApi() {
    const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    function parseDate(s) {
        const parts = String(s).split('-');
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function toKey(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function listDays(from, to) {
        const end = parseDate(to);
        const days = [];
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
            if (wd === 0)
                weekIndex += 1; // a Sunday closes its week
            cur.setDate(cur.getDate() + 1);
        }
        return days;
    }
    function rangeDays(from, to) {
        const ms = parseDate(to).getTime() - parseDate(from).getTime();
        return Math.floor(ms / 86400000) + 1;
    }
    function round2(n) { return Math.round(n * 100) / 100; }
    function normalizeNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }
    function buildAttendanceReport(users, attendanceData, from, to, expectedHours) {
        const expected = expectedHours > 0 ? expectedHours : 8;
        const days = listDays(from, to);
        const sorted = [...users].sort((a, b) => normalizeNumber(a.number) - normalizeNumber(b.number));
        const rows = sorted.map(emp => {
            const hours = [];
            const ratio = [];
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
                    if (h > expected)
                        overtimeHours += h - expected;
                }
                else {
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
