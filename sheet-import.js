"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.SheetImport` (browser global consumed by index.html).
// "Importar planilla de días": a sheet copied from Excel/Sheets (tab separated,
// one column per day like `S11`, values in workdays: 1.00 = full day) updates
// the days of employees that already exist. Blank = untouched, 0 = clear the
// mark, a double day (Sunday/holiday) counts 2.00 as one day.
(function exposeSheetImport(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.SheetImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSheetImportModule() {
    // Spanish month initials: E F M A M J J A S O N D.
    const MONTHS_BY_LETTER = {
        E: [1], F: [2], M: [3, 5], A: [4, 8], J: [6, 7], S: [9], O: [10], N: [11], D: [12]
    };
    const NUMBER_HEADER = /^(no\.?|n[°º]\.?|#|num(ero)?\.?|número)$/i;
    const NAME_HEADER = /descrip|nombre|empleado/i;
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
    function isValidDate(y, m, d) {
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
    }
    // Every date a header could mean (latest years first are tried by the resolver).
    function headerCandidates(header, today) {
        const text = header.trim();
        const year = Number(today.slice(0, 4));
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (iso)
            return isValidDate(+iso[1], +iso[2], +iso[3]) ? [text] : null;
        let months = [];
        let day = 0;
        const letter = /^([EFMAJSOND])\s*(\d{1,2})$/i.exec(text);
        const dm = /^(\d{1,2})[/-](\d{1,2})$/.exec(text);
        if (letter) {
            months = MONTHS_BY_LETTER[letter[1].toUpperCase()];
            day = +letter[2];
        }
        else if (dm) {
            months = [+dm[2]];
            day = +dm[1];
        }
        else
            return null;
        const out = [];
        for (const y of [year - 1, year]) {
            for (const m of months)
                if (isValidDate(y, m, day))
                    out.push(dateKey(y, m, day));
        }
        return out.length ? out.sort() : null;
    }
    // Last column = latest candidate not after today; each earlier column = the
    // latest candidate before the next one. Resolves M/A/J and the year wrap.
    function resolveDates(candidates, today) {
        const dates = new Array(candidates.length).fill(null);
        let limit = null;
        for (let i = candidates.length - 1; i >= 0; i--) {
            const list = candidates[i];
            const pick = limit === null
                ? ([...list].reverse().find(d => d <= today) || list[0])
                : [...list].reverse().find(d => d < limit);
            dates[i] = pick || null;
            if (pick)
                limit = pick;
        }
        return dates;
    }
    function parseValue(raw) {
        const text = raw.trim();
        if (!text)
            return null;
        if (!/^\d+([.,]\d+)?$/.test(text))
            return 'bad';
        return Number(text.replace(',', '.'));
    }
    const clean = (value) => value.replace(/\s+/g, ' ').trim();
    function parseSheet(text, options) {
        const result = { columns: [], rows: [], problems: [] };
        const lines = String(text || '').split(/\r?\n/);
        if (!lines.some(line => line.includes('\t'))) {
            result.problems.push('No encontré columnas: copiá la tabla desde Excel o Sheets (las columnas van separadas por tabulaciones).');
            return result;
        }
        const headerAt = lines.findIndex(line => line.split('\t').some(cell => headerCandidates(cell, options.today)));
        if (headerAt < 0) {
            result.problems.push('No encontré columnas de días (por ejemplo S11, 11/9 o 2026-09-11) en el encabezado.');
            return result;
        }
        const header = lines[headerAt].split('\t').map(clean);
        const numberCol = Math.max(0, header.findIndex(h => NUMBER_HEADER.test(h)));
        const nameIdx = header.findIndex(h => NAME_HEADER.test(h));
        const nameCol = nameIdx >= 0 ? nameIdx : numberCol + 1;
        const dateCols = [];
        header.forEach((h, index) => {
            const candidates = headerCandidates(h, options.today);
            if (candidates)
                dateCols.push({ index, header: h, candidates });
        });
        const dates = resolveDates(dateCols.map(c => c.candidates), options.today);
        dateCols.forEach((col, i) => {
            const date = dates[i];
            if (!date) {
                result.problems.push(`No pude ubicar la fecha de la columna ${col.header}.`);
                return;
            }
            const [y, m, d] = date.split('-').map(Number);
            result.columns.push({ index: col.index, header: col.header, date, isSunday: new Date(y, m - 1, d).getDay() === 0, suggestDouble: false });
        });
        for (let i = headerAt + 1; i < lines.length; i++) {
            const cells = lines[i].split('\t');
            const number = clean(cells[numberCol] || '');
            const name = clean(cells[nameCol] || '');
            if (!/^\d+$/.test(number) || !name)
                continue;
            const values = result.columns.map(col => {
                const value = parseValue(cells[col.index] || '');
                if (value !== 'bad')
                    return value;
                result.problems.push(`Fila ${i + 1} (${name}), columna ${col.header}: "${clean(cells[col.index])}" no es un número; se dejó sin tocar.`);
                return null;
            });
            result.rows.push({ line: i + 1, number: String(Number(number)), name, values });
        }
        // A weekday column whose worked values are mostly 2.00 is a holiday paid double.
        result.columns.forEach((col, c) => {
            const worked = result.rows.map(r => r.values[c]).filter((v) => v !== null && v > 0);
            const doubled = worked.filter(v => v >= 2).length;
            col.suggestDouble = col.isSunday || (worked.length > 0 && doubled * 2 >= worked.length);
        });
        return result;
    }
    function nameTokens(value) {
        return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .split(/[^a-z]+/).filter(t => t.length >= 3);
    }
    function editDistance(a, b) {
        const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            let diag = prev[0];
            prev[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const keep = prev[j];
                prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
                diag = keep;
            }
        }
        return prev[b.length];
    }
    // Same person if any name word matches allowing small typos (Marisol ~ Marysol).
    function similarNames(a, b) {
        const left = nameTokens(a);
        const right = nameTokens(b);
        return left.some(x => right.some(y => editDistance(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 4))));
    }
    const sameName = (a, b) => nameTokens(a).join(' ') === nameTokens(b).join(' ');
    const round2 = (n) => Math.round(n * 100) / 100;
    function findEmployee(row, users) {
        const byNumber = users.find(u => String(u.number || '').trim() !== '' && Number(String(u.number).trim()) === Number(row.number));
        if (byNumber)
            return { employee: byNumber, match: 'number' };
        const byName = users.filter(u => sameName(u.name, row.name));
        return byName.length === 1 ? { employee: byName[0], match: 'name' } : { employee: null, match: 'none' };
    }
    function planChanges(row, employee, columns, options) {
        const doubles = new Set(options.doubleDates);
        const expected = options.expectedHours > 0 ? options.expectedHours : 8;
        const changes = [];
        columns.forEach((col, c) => {
            const value = row.values[c];
            if (value === null || value === undefined)
                return;
            const current = options.getRecord(employee.id, col.date);
            if (value === 0) {
                if (current)
                    changes.push({ date: col.date, action: 'clear', hours: 0 });
                return;
            }
            const hours = round2((doubles.has(col.date) ? value / 2 : value) * expected);
            const unchanged = current && current.status === 'present' && Number(current.hours) === hours && !current.position;
            if (!unchanged)
                changes.push({ date: col.date, action: 'set', hours });
        });
        return changes;
    }
    function planSheetImport(parsed, users, options) {
        const taken = new Set();
        const entries = parsed.rows.map(row => {
            const { employee, match } = findEmployee(row, users);
            const entry = { line: row.line, number: row.number, name: row.name, employee, match, nameOk: false, include: false, note: '', changes: [] };
            if (!employee) {
                entry.note = 'No está en Mini';
                return entry;
            }
            entry.nameOk = match === 'name' || similarNames(employee.name, row.name);
            entry.changes = planChanges(row, employee, parsed.columns, options);
            if (taken.has(employee.id))
                entry.note = 'Empleado repetido en la planilla';
            else if (!entry.nameOk)
                entry.note = `En Mini el ${String(employee.number)} es ${String(employee.name)}`;
            entry.include = entry.nameOk && !taken.has(employee.id);
            taken.add(employee.id);
            return entry;
        });
        return { entries, unmatched: entries.filter(e => !e.employee) };
    }
    function applySheetImport(plan, includedLines, repository) {
        const include = new Set(includedLines);
        const done = new Set();
        const dates = new Set();
        let set = 0;
        let cleared = 0;
        for (const entry of plan.entries) {
            if (!entry.employee || !include.has(entry.line) || done.has(entry.employee.id))
                continue;
            done.add(entry.employee.id);
            for (const change of entry.changes) {
                if (change.action === 'clear') {
                    repository.setRecord(entry.employee.id, change.date, 'absent');
                    cleared += 1;
                }
                else {
                    repository.setRecord(entry.employee.id, change.date, 'present', change.hours);
                    repository.setDayPosition(entry.employee.id, change.date, null);
                    set += 1;
                }
                dates.add(change.date);
            }
        }
        return { employees: done.size, set, cleared, dates: [...dates].sort() };
    }
    return { parseSheet, planSheetImport, applySheetImport, similarNames };
});
