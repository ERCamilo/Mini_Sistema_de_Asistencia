"use strict";
(function exposeEmployeeChangeReport(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.EmployeeChangeReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STORAGE_KEY = 'mini_employee_report_v1';
    const clean = (value) => typeof value === 'string' || typeof value === 'number'
        ? String(value).normalize('NFC').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const whatsapp = (value) => value.replace(/[_*~`]/g, ' ').replace(/\s+/g, ' ').trim();
    const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            return false;
        const [y, m, d] = value.split('-').map(Number);
        return localDate(new Date(y, m - 1, d, 12)) === value;
    }
    const dateText = (value) => value ? value.split('-').reverse().join('/') : 'Sin asistencia registrada';
    function price(value) {
        const text = clean(value);
        if (/^\d+(?:[.,]\d{1,2})?$/.test(text))
            return String(Number(text.replace(',', '.')));
        return text;
    }
    function readLedger(storage) {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw)
            return { schemaVersion: 1, references: [] };
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object')
                throw new Error();
            const ledger = parsed;
            if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.references))
                throw new Error();
            const scopes = new Set();
            for (const ref of ledger.references) {
                if (!(ref === null || ref === void 0 ? void 0 : ref.scope) || typeof ref.scope.id !== 'string' || typeof ref.scope.name !== 'string' || scopes.has(ref.scope.id) || typeof ref.reportId !== 'string' || !Number.isFinite(Date.parse(ref.confirmedAt)) || !Array.isArray(ref.employees))
                    throw new Error();
                scopes.add(ref.scope.id);
                const ids = new Set();
                for (const row of ref.employees) {
                    if (!row || !['id', 'number', 'name', 'position', 'salary', 'otherPositions', 'state'].every(key => typeof row[key] === 'string') || ids.has(row.id) || (row.firstDate !== null && !validDate(row.firstDate)))
                        throw new Error();
                    ids.add(row.id);
                }
            }
            return ledger;
        }
        catch (_) {
            throw new Error('No se pudo leer la referencia del último reporte. No se registró ningún cambio.');
        }
    }
    function rowsFor(input, previous, today) {
        const firstDates = new Map();
        for (const [date, records] of Object.entries(input.attendance)) {
            if (!validDate(date) || date > today || !records || typeof records !== 'object')
                continue;
            for (const [id, record] of Object.entries(records)) {
                if ((record === null || record === void 0 ? void 0 : record.status) !== 'present' || !(Number(record.hours) > 0))
                    continue;
                if (!firstDates.has(id) || date < firstDates.get(id))
                    firstDates.set(id, date);
            }
        }
        const before = new Map(previous.map(row => [row.id, row]));
        const deleted = new Set((input.tombstones || []).map(t => JSON.stringify([t.employeeId, t.date])));
        const ids = new Set();
        return input.employees.map(employee => {
            var _a, _b, _c;
            if (typeof employee.id !== 'string' || !employee.id || ids.has(employee.id))
                throw new Error('Revisa las identidades de los empleados antes de preparar el reporte.');
            ids.add(employee.id);
            let firstDate = firstDates.get(employee.id) || null;
            const known = (_a = before.get(employee.id)) === null || _a === void 0 ? void 0 : _a.firstDate;
            // Archiving removes days without tombstones. An explicit deletion may
            // correct the first day; a currently restored record takes precedence.
            const knownPresent = known && ((_c = (_b = input.attendance[known]) === null || _b === void 0 ? void 0 : _b[employee.id]) === null || _c === void 0 ? void 0 : _c.status) === 'present' && Number(input.attendance[known][employee.id].hours) > 0;
            if (known && (knownPresent || !deleted.has(JSON.stringify([employee.id, known]))) && (!firstDate || known < firstDate))
                firstDate = known;
            const extras = Array.isArray(employee.extraPositions) ? employee.extraPositions.flatMap(value => {
                const name = value && typeof value === 'object' ? clean(value.name) : '';
                return name ? [name] : [];
            }) : [];
            return { id: employee.id, number: clean(employee.number), name: clean(employee.name), position: clean(employee.position), salary: price(employee.sueldo), otherPositions: [...new Set(extras)].join(', '), state: employee.paused ? 'Pausado' : 'Activo', firstDate };
        }).sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    }
    const fields = [
        ['number', 'Número'], ['name', 'Nombre'], ['position', 'Puesto'], ['salary', 'Precio por día'],
        ['otherPositions', 'Otros puestos'], ['state', 'Estado'], ['firstDate', 'Primera asistencia registrada']
    ];
    const fieldText = (key, row) => key === 'firstDate' ? dateText(row.firstDate) : whatsapp(row[key]) || 'Sin definir';
    const heading = (row) => `*${whatsapp(row.number)}. ${whatsapp(row.name)}*`;
    function completeRow(row) {
        return [heading(row), `Puesto: ${fieldText('position', row)}`, `Precio por día: ${fieldText('salary', row)}`,
            `Primera asistencia registrada: ${dateText(row.firstDate)}`,
            ...(row.otherPositions ? [`Otros puestos: ${fieldText('otherPositions', row)}`] : []),
            ...(row.state === 'Pausado' ? ['Estado: Pausado'] : [])].join('\n');
    }
    function createReporter({ storage, now = () => new Date().toISOString(), id = () => `reporte-${Date.now()}-${Math.random().toString(36).slice(2)}` }) {
        function prepare(input) {
            var _a, _b;
            if (!((_a = input.scope) === null || _a === void 0 ? void 0 : _a.id) || !((_b = input.scope) === null || _b === void 0 ? void 0 : _b.name))
                throw new Error('Selecciona el listado de empleados que quieres reportar.');
            const generatedAt = now(), today = input.today || localDate(new Date(generatedAt));
            if (!validDate(today))
                throw new Error('No se pudo determinar la fecha del reporte.');
            const ledger = readLedger(storage), reference = ledger.references.find(ref => ref.scope.id === input.scope.id);
            const rows = rowsFor(input, (reference === null || reference === void 0 ? void 0 : reference.employees) || [], today);
            const before = new Map(((reference === null || reference === void 0 ? void 0 : reference.employees) || []).map(row => [row.id, row]));
            const current = new Set(rows.map(row => row.id));
            const added = rows.filter(row => !before.has(row.id));
            const changes = rows.flatMap(row => {
                const old = before.get(row.id);
                if (!old)
                    return [];
                const edits = fields.filter(([key]) => row[key] !== old[key]).map(([key, label]) => `${label}: ${fieldText(key, old)} → ${fieldText(key, row)}`);
                return edits.length ? [{ row, edits }] : [];
            });
            const removed = ((reference === null || reference === void 0 ? void 0 : reference.employees) || []).filter(row => !current.has(row.id));
            const mode = !reference ? 'full' : input.mode || 'changes';
            const blocks = mode === 'full' ? rows.map(completeRow) : [
                ...added.map(row => `*Nuevo*\n${completeRow(row)}`),
                ...changes.map(({ row, edits }) => `${heading(row)}\n${edits.join('\n')}`),
                ...(removed.length ? [`*Ya no figura en este listado*\n${removed.map(heading).join('\n')}`] : [])
            ];
            return { reportId: id(), scope: { ...input.scope }, generatedAt, referenceVersion: reference ? JSON.stringify(reference) : null,
                employees: rows, mode, hasReference: !!reference, hasContent: blocks.length > 0,
                counts: { added: added.length, changed: changes.length, removed: removed.length, total: rows.length },
                text: `*${mode === 'full' ? 'Listado de empleados' : 'Cambios de empleados'} · ${whatsapp(input.scope.name)}*\n\n${blocks.join('\n\n') || (mode === 'full' ? 'No hay empleados en este listado.' : 'Sin cambios desde el último reporte registrado.')}` };
        }
        function confirm(report) {
            const ledger = readLedger(storage), current = ledger.references.find(ref => ref.scope.id === report.scope.id);
            if ((current === null || current === void 0 ? void 0 : current.reportId) === report.reportId)
                return;
            if ((current ? JSON.stringify(current) : null) !== report.referenceVersion)
                throw new Error('La referencia cambió en otra revisión. Vuelve a abrir el reporte antes de registrarlo.');
            if (!report.hasContent)
                throw new Error('No hay cambios para registrar.');
            const reference = { scope: { ...report.scope }, reportId: report.reportId, confirmedAt: now(), employees: report.employees.map(row => ({ ...row })) };
            storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, references: [...ledger.references.filter(ref => ref.scope.id !== report.scope.id), reference] }));
        }
        return { prepare, confirm };
    }
    return { createReporter, STORAGE_KEY };
});
