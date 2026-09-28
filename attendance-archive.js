"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceArchive` (browser global consumed by index.html).
// "Archivar meses antiguos": keep the last N months on the device, save the
// older ones to a `mini-archive/v1` file that can be merged back later.
(function exposeAttendanceArchive(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.AttendanceArchive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceArchiveModule() {
    const ARCHIVE_KIND = 'mini-archive';
    const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    // First day of the oldest month to keep: current month counts as one.
    function cutoffFor(today, keepMonths) {
        const [year, month] = today.split('-').map(Number);
        const keep = Math.max(1, Math.floor(keepMonths));
        const first = new Date(year, month - 1 - (keep - 1), 1);
        return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    }
    function planArchive(attendance, options) {
        const cutoff = cutoffFor(options.today, options.keepMonths);
        const days = isRecord(attendance) ? attendance : {};
        const dates = Object.keys(days).filter(date => DAY_KEY.test(date) && date < cutoff).sort();
        const byMonth = new Map();
        let records = 0;
        for (const date of dates) {
            const count = isRecord(days[date]) ? Object.keys(days[date]).length : 0;
            records += count;
            const month = date.slice(0, 7);
            const summary = byMonth.get(month) || { month, days: 0, records: 0 };
            summary.days += 1;
            summary.records += count;
            byMonth.set(month, summary);
        }
        return {
            cutoff,
            keepMonths: Math.max(1, Math.floor(options.keepMonths)),
            dates,
            months: [...byMonth.values()],
            records,
            from: dates[0] || null,
            to: dates[dates.length - 1] || null
        };
    }
    function buildArchiveFile(plan, attendance, users, meta = {}) {
        const archived = {};
        const employeeIds = new Set();
        for (const date of plan.dates) {
            archived[date] = attendance[date];
            if (isRecord(attendance[date]))
                Object.keys(attendance[date]).forEach(id => employeeIds.add(id));
        }
        return {
            kind: ARCHIVE_KIND,
            schemaVersion: 1,
            exportedAt: meta.exportedAt || new Date().toISOString(),
            sourceName: meta.sourceName || '',
            range: { from: plan.from, to: plan.to },
            users: (Array.isArray(users) ? users : []).filter(user => employeeIds.has(String(user.id))),
            attendance: archived
        };
    }
    function isArchiveFile(parsed) {
        return isRecord(parsed) && parsed.kind === ARCHIVE_KIND && parsed.schemaVersion === 1 && isRecord(parsed.attendance);
    }
    // Characters the archived days take inside the stored attendance JSON.
    function estimateFreedChars(plan, attendance) {
        return plan.dates.reduce((sum, date) => sum + JSON.stringify(date).length + 1 + JSON.stringify(attendance[date]).length + 1, 0);
    }
    return { ARCHIVE_KIND, planArchive, buildArchiveFile, isArchiveFile, estimateFreedChars };
});
