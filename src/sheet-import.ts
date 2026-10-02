// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.SheetImport` (browser global consumed by index.html).
// "Importar planilla de días": a sheet copied from Excel/Sheets (tab separated,
// one column per day like `S11`, values in workdays: 1.00 = full day) updates
// the days of employees that already exist. Blank = untouched, 0 = clear the
// mark, a double day (Sunday/holiday) counts 2.00 as one day.

interface SheetColumn { index: number; header: string; date: string; isSunday: boolean; suggestDouble: boolean; }
interface SheetRow { line: number; number: string; name: string; values: (number | null)[]; }
interface SheetParsed { columns: SheetColumn[]; rows: SheetRow[]; problems: string[]; }

interface SheetEmployee { id: string; number?: unknown; name?: unknown; [extra: string]: unknown; }
interface SheetChange { date: string; action: 'set' | 'clear'; hours: number; }
interface SheetPlanEntry {
  line: number;
  number: string;
  name: string;
  employee: SheetEmployee | null;
  match: 'number' | 'name' | 'none';
  nameOk: boolean;
  include: boolean;
  note: string;
  changes: SheetChange[];
}
interface SheetPlan { entries: SheetPlanEntry[]; unmatched: SheetPlanEntry[]; }
interface SheetPlanOptions {
  expectedHours: number;
  doubleDates: string[];
  getRecord: (employeeId: string, date: string) => { status?: unknown; hours?: unknown; position?: unknown } | null;
}
interface SheetExportOptions { from: string; to: string; expectedHours: number; doubleDates: string[]; }
interface SheetExportResult { text: string; rows: number; days: number; }
interface SheetRepository {
  setRecord(employeeId: string, date: string, status: 'present' | 'absent', hours?: number): unknown;
  setDayPosition(employeeId: string, date: string, position: string | null): boolean;
}

(function exposeSheetImport(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SheetImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSheetImportModule() {
  // Spanish month initials: E F M A M J J A S O N D.
  const MONTHS_BY_LETTER: Record<string, number[]> = {
    E: [1], F: [2], M: [3, 5], A: [4, 8], J: [6, 7], S: [9], O: [10], N: [11], D: [12]
  };
  const NUMBER_HEADER = /^(no\.?|n[°º]\.?|#|num(ero)?\.?|número)$/i;
  const NAME_HEADER = /descrip|nombre|empleado/i;

  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

  function isValidDate(y: number, m: number, d: number): boolean {
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  // Every date a header could mean (latest years first are tried by the resolver).
  function headerCandidates(header: string, today: string): string[] | null {
    const text = header.trim();
    const year = Number(today.slice(0, 4));
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return isValidDate(+iso[1], +iso[2], +iso[3]) ? [text] : null;
    let months: number[] = [];
    let day = 0;
    const letter = /^([EFMAJSOND])\s*(\d{1,2})$/i.exec(text);
    const dm = /^(\d{1,2})[/-](\d{1,2})$/.exec(text);
    if (letter) { months = MONTHS_BY_LETTER[letter[1].toUpperCase()]; day = +letter[2]; }
    else if (dm) { months = [+dm[2]]; day = +dm[1]; }
    else return null;
    const out: string[] = [];
    for (const y of [year - 1, year]) {
      for (const m of months) if (isValidDate(y, m, day)) out.push(dateKey(y, m, day));
    }
    return out.length ? out.sort() : null;
  }

  // Last column = latest candidate not after today; each earlier column = the
  // latest candidate before the next one. Resolves M/A/J and the year wrap.
  function resolveDates(candidates: string[][], today: string): (string | null)[] {
    const dates: (string | null)[] = new Array(candidates.length).fill(null);
    let limit: string | null = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const list = candidates[i];
      const pick: string | undefined = limit === null
        ? ([...list].reverse().find(d => d <= today) || list[0])
        : [...list].reverse().find(d => d < (limit as string));
      dates[i] = pick || null;
      if (pick) limit = pick;
    }
    return dates;
  }

  function parseValue(raw: string): number | null | 'bad' {
    const text = raw.trim();
    if (!text) return null;
    if (!/^\d+([.,]\d+)?$/.test(text)) return 'bad';
    return Number(text.replace(',', '.'));
  }

  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

  function parseSheet(text: string, options: { today: string }): SheetParsed {
    const result: SheetParsed = { columns: [], rows: [], problems: [] };
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
    const dateCols: { index: number; header: string; candidates: string[] }[] = [];
    header.forEach((h, index) => {
      const candidates = headerCandidates(h, options.today);
      if (candidates) dateCols.push({ index, header: h, candidates });
    });
    const dates = resolveDates(dateCols.map(c => c.candidates), options.today);
    dateCols.forEach((col, i) => {
      const date = dates[i];
      if (!date) { result.problems.push(`No pude ubicar la fecha de la columna ${col.header}.`); return; }
      const [y, m, d] = date.split('-').map(Number);
      result.columns.push({ index: col.index, header: col.header, date, isSunday: new Date(y, m - 1, d).getDay() === 0, suggestDouble: false });
    });

    for (let i = headerAt + 1; i < lines.length; i++) {
      const cells = lines[i].split('\t');
      const number = clean(cells[numberCol] || '');
      const name = clean(cells[nameCol] || '');
      if (!/^\d+$/.test(number) || !name) continue;
      const values = result.columns.map(col => {
        const value = parseValue(cells[col.index] || '');
        if (value !== 'bad') return value;
        result.problems.push(`Fila ${i + 1} (${name}), columna ${col.header}: "${clean(cells[col.index])}" no es un número; se dejó sin tocar.`);
        return null;
      });
      result.rows.push({ line: i + 1, number: String(Number(number)), name, values });
    }

    // A weekday column whose worked values are mostly 2.00 is a holiday paid double.
    result.columns.forEach((col, c) => {
      const worked = result.rows.map(r => r.values[c]).filter((v): v is number => v !== null && v > 0);
      const doubled = worked.filter(v => v >= 2).length;
      col.suggestDouble = col.isSunday || (worked.length > 0 && doubled * 2 >= worked.length);
    });
    return result;
  }

  function nameTokens(value: unknown): string[] {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-z]+/).filter(t => t.length >= 3);
  }

  function editDistance(a: string, b: string): number {
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
  function similarNames(a: unknown, b: unknown): boolean {
    const left = nameTokens(a);
    const right = nameTokens(b);
    return left.some(x => right.some(y => editDistance(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 4))));
  }

  const sameName = (a: unknown, b: unknown) => nameTokens(a).join(' ') === nameTokens(b).join(' ');
  const round2 = (n: number) => Math.round(n * 100) / 100;

  function findEmployee(row: SheetRow, users: SheetEmployee[]): { employee: SheetEmployee | null; match: SheetPlanEntry['match'] } {
    const byNumber = users.find(u => String(u.number || '').trim() !== '' && Number(String(u.number).trim()) === Number(row.number));
    if (byNumber) return { employee: byNumber, match: 'number' };
    const byName = users.filter(u => sameName(u.name, row.name));
    return byName.length === 1 ? { employee: byName[0], match: 'name' } : { employee: null, match: 'none' };
  }

  function planChanges(row: SheetRow, employee: SheetEmployee, columns: SheetColumn[], options: SheetPlanOptions): SheetChange[] {
    const doubles = new Set(options.doubleDates);
    const expected = options.expectedHours > 0 ? options.expectedHours : 8;
    const changes: SheetChange[] = [];
    columns.forEach((col, c) => {
      const value = row.values[c];
      if (value === null || value === undefined) return;
      const current = options.getRecord(employee.id, col.date);
      if (value === 0) {
        if (current) changes.push({ date: col.date, action: 'clear', hours: 0 });
        return;
      }
      const hours = round2((doubles.has(col.date) ? value / 2 : value) * expected);
      const unchanged = current && current.status === 'present' && Number(current.hours) === hours && !current.position;
      if (!unchanged) changes.push({ date: col.date, action: 'set', hours });
    });
    return changes;
  }

  function planSheetImport(parsed: SheetParsed, users: SheetEmployee[], options: SheetPlanOptions): SheetPlan {
    const taken = new Set<string>();
    const entries = parsed.rows.map(row => {
      const { employee, match } = findEmployee(row, users);
      const entry: SheetPlanEntry = { line: row.line, number: row.number, name: row.name, employee, match, nameOk: false, include: false, note: '', changes: [] };
      if (!employee) { entry.note = 'No está en Mini'; return entry; }
      entry.nameOk = match === 'name' || similarNames(employee.name, row.name);
      entry.changes = planChanges(row, employee, parsed.columns, options);
      if (taken.has(employee.id)) entry.note = 'Empleado repetido en la planilla';
      else if (!entry.nameOk) entry.note = `En Mini el ${String(employee.number)} es ${String(employee.name)}`;
      entry.include = entry.nameOk && !taken.has(employee.id);
      taken.add(employee.id);
      return entry;
    });
    return { entries, unmatched: entries.filter(e => !e.employee) };
  }

  function applySheetImport(plan: SheetPlan, includedLines: number[], repository: SheetRepository): { employees: number; set: number; cleared: number; dates: string[] } {
    const include = new Set(includedLines);
    const done = new Set<string>();
    const dates = new Set<string>();
    let set = 0;
    let cleared = 0;
    for (const entry of plan.entries) {
      if (!entry.employee || !include.has(entry.line) || done.has(entry.employee.id)) continue;
      done.add(entry.employee.id);
      for (const change of entry.changes) {
        if (change.action === 'clear') {
          repository.setRecord(entry.employee.id, change.date, 'absent');
          cleared += 1;
        } else {
          repository.setRecord(entry.employee.id, change.date, 'present', change.hours);
          repository.setDayPosition(entry.employee.id, change.date, null);
          set += 1;
        }
        dates.add(change.date);
      }
    }
    return { employees: done.size, set, cleared, dates: [...dates].sort() };
  }

  // --- Export: the same sheet, built from Mini (round-trips through parseSheet) ---
  const MONTH_LETTERS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  function listDates(from: string, to: string): string[] {
    const [y, m, d] = from.split('-').map(Number);
    const cur = new Date(y, m - 1, d);
    const dates: string[] = [];
    for (let key = from; key <= to && dates.length < 400; ) {
      dates.push(key);
      cur.setDate(cur.getDate() + 1);
      key = dateKey(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
    }
    return dates;
  }

  // 1.00, 0.50, 1.125: two decimals, a third only when it carries information.
  function formatWorkdays(value: number): string {
    const fixed = (Math.round(value * 1000) / 1000).toFixed(3);
    return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
  }

  function buildSheet(
    users: SheetEmployee[],
    attendance: Record<string, Record<string, { status?: unknown; hours?: unknown }>>,
    options: SheetExportOptions
  ): SheetExportResult {
    const dates = listDates(options.from, options.to);
    const doubles = new Set(options.doubleDates);
    const expected = options.expectedHours > 0 ? options.expectedHours : 8;
    const header = dates.map(date => MONTH_LETTERS[Number(date.slice(5, 7)) - 1] + date.slice(8, 10));
    const lines = [['No.', 'Descripcion', 'OCUPACION', ...header].join('\t')];
    const sorted = [...users].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    for (const user of sorted) {
      const cells = dates.map(date => {
        const rec = (attendance[date] || {})[user.id];
        if (!rec || rec.status !== 'present' || !Number.isFinite(Number(rec.hours))) return '';
        return formatWorkdays(Number(rec.hours) / expected * (doubles.has(date) ? 2 : 1));
      });
      // Paused employees without marks in the range are left out, as in the SA export.
      if (user.paused && cells.every(c => c === '')) continue;
      const number = String(user.number || '').trim();
      const label = /^\d+$/.test(number) ? String(Number(number)) : number;
      lines.push([label, clean(String(user.name || '')), clean(String(user.position || '')), ...cells].join('\t'));
    }
    return { text: lines.join('\n'), rows: lines.length - 1, days: dates.length };
  }

  return { parseSheet, planSheetImport, applySheetImport, similarNames, buildSheet };
});
