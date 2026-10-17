"use strict";
(function exposeAttendanceDays(root, factory) { const api = factory(); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.MiniAttendanceDays = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MAX_DAYS = 31;
    function dateStamp(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
            throw new Error('Elige una fecha válida.');
        const stamp = Date.parse(value + 'T00:00:00Z');
        if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value)
            throw new Error('Elige una fecha válida.');
        return stamp;
    }
    function validateDates(values) {
        if (!Array.isArray(values) || !values.length)
            throw new Error('Selecciona al menos un día.');
        const dates = [...new Set(values)];
        dates.forEach(dateStamp);
        if (dates.length > MAX_DAYS)
            throw new Error('Puedes compartir hasta 31 días por envío.');
        return dates.sort();
    }
    function rangeDates(from, to) {
        const start = dateStamp(from), end = dateStamp(to), count = (end - start) / 86400000 + 1;
        if (count < 1)
            throw new Error('La fecha inicial debe ser anterior o igual a la final.');
        if (count > MAX_DAYS)
            throw new Error('Elige un intervalo de hasta 31 días.');
        return Array.from({ length: count }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
    }
    function lastSeven(today) { return { from: new Date(dateStamp(today) - 6 * 86400000).toISOString().slice(0, 10), to: today }; }
    function formatDate(date) { return new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(dateStamp(date))); }
    function createSelection(today) {
        let available = validateDates([today]), chosen = new Set(available);
        return { single(date) { available = validateDates([date]); chosen = new Set(available); }, range(from, to) { available = rangeDates(from, to); chosen = new Set(available); }, toggle(date, selected) { if (!available.includes(date))
                throw new Error('Ese día no pertenece al intervalo.'); if (selected)
                chosen.add(date);
            else
                chosen.delete(date); }, dates: () => validateDates([...chosen]), available: () => [...available] };
    }
    function mount(o) {
        const d = o.document, input = o.input, host = d.createElement('section');
        host.id = 'cloud-field-dates';
        host.className = 'attendance-days';
        host.setAttribute('aria-label', 'Días de asistencia para compartir');
        const label = d.querySelector('label[for="' + input.id + '"]');
        input.before(host);
        const title = d.createElement('strong');
        title.textContent = '¿Qué días quieres compartir?';
        host.append(title);
        const modes = d.createElement('div');
        modes.className = 'attendance-days-modes';
        host.append(modes);
        const single = d.createElement('div'), multiple = d.createElement('div');
        single.className = 'attendance-days-single';
        multiple.className = 'attendance-days-multiple';
        multiple.hidden = true;
        if (label) {
            label.textContent = 'Día de asistencia';
            single.append(label);
        }
        single.append(input);
        host.append(single, multiple);
        let multi = false, error = '', disabled = false;
        const selection = createSelection(input.value);
        function button(text) { const b = d.createElement('button'); b.type = 'button'; b.textContent = text; return b; }
        const one = button('Un día'), many = button('Varios días');
        one.dataset.dayMode = 'single';
        many.dataset.dayMode = 'multiple';
        modes.append(one, many);
        const quick = button('Últimos 7 días');
        quick.dataset.daysWeek = '';
        multiple.append(quick);
        const fields = d.createElement('div');
        fields.className = 'attendance-days-range';
        function field(text, id) { const label = d.createElement('label'); label.textContent = text; const n = d.createElement('input'); n.type = 'date'; n.id = id; n.className = 'search-input'; n.value = input.value; label.append(n); fields.append(label); return n; }
        const from = field('Desde', 'cloud-field-date-from'), to = field('Hasta', 'cloud-field-date-to');
        multiple.append(fields);
        const all = button('Seleccionar todos los días');
        all.dataset.daysAll = '';
        const list = d.createElement('div');
        list.className = 'attendance-days-list';
        multiple.append(all, list);
        const hint = d.createElement('p');
        hint.className = 'attendance-days-hint';
        hint.setAttribute('role', 'status');
        host.append(hint);
        function announce() {
            try {
                const dates = multi ? selection.dates() : validateDates([input.value]);
                hint.textContent = dates.length === 1 ? '1 día seleccionado' : dates.length + ' días seleccionados';
                hint.removeAttribute('data-error');
            }
            catch (e) {
                hint.textContent = e instanceof Error ? e.message : 'Revisa las fechas.';
                hint.dataset.error = 'true';
            }
            o.changed();
        }
        function paintList() {
            list.replaceChildren();
            let chosen = [];
            try {
                chosen = selection.dates();
            }
            catch { }
            for (const date of selection.available()) {
                const row = d.createElement('label'), check = d.createElement('input'), text = d.createElement('span');
                row.className = 'attendance-day-choice';
                check.type = 'checkbox';
                check.value = date;
                check.checked = chosen.includes(date);
                check.disabled = disabled;
                check.dataset.attendanceDay = date;
                text.textContent = formatDate(date);
                row.append(check, text);
                check.onchange = () => { selection.toggle(date, check.checked); announce(); };
                list.append(row);
            }
        }
        function applyRange() {
            try {
                selection.range(from.value, to.value);
                error = '';
                paintList();
            }
            catch (e) {
                error = e instanceof Error ? e.message : 'Revisa las fechas.';
                list.replaceChildren();
            }
            if (error) {
                hint.textContent = error;
                hint.dataset.error = 'true';
                o.changed();
            }
            else
                announce();
        }
        function mode(next) { multi = next; single.hidden = multi; multiple.hidden = !multi; one.setAttribute('aria-pressed', String(!multi)); many.setAttribute('aria-pressed', String(multi)); if (multi)
            applyRange();
        else {
            error = '';
            announce();
        } }
        one.onclick = () => mode(false);
        many.onclick = () => mode(true);
        from.onchange = applyRange;
        to.onchange = applyRange;
        quick.onclick = () => { const days = lastSeven(input.value); from.value = days.from; to.value = days.to; applyRange(); };
        all.onclick = () => { if (error)
            return; selection.range(from.value, to.value); paintList(); announce(); };
        input.addEventListener('change', () => { if (!multi)
            announce(); });
        one.setAttribute('aria-pressed', 'true');
        many.setAttribute('aria-pressed', 'false');
        return { host, dates: () => { if (error)
                throw new Error(error); return multi ? selection.dates() : validateDates([input.value]); }, setDisabled(value) { disabled = value; for (const n of host.querySelectorAll('input,button'))
                n.disabled = value; }, multiple: () => multi };
    }
    return { MAX_DAYS, validateDates, rangeDates, lastSeven, formatDate, createSelection, mount };
});
