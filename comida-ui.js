"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaUI` (browser global consumed by index.html).
// Screens of the optional "Comida" section: Pedidos, Cocina and Facturación,
// plus its sheets. index.html only wires the host callbacks; state changes go
// through ComidaStore and money rules through ComidaLedger.
(function exposeComidaUI(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.ComidaUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaUIModule() {
    const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z';
    const DISH_ICONS = ['🍗', '🥩', '🐟', '🍤', '🍚', '🍛', '🫘', '🍝', '🍲', '🥘', '🥗', '🥪', '🌮', '🌯', '🍳', '🥚', '🥔', '🍠', '🥑', '🍌', '🍞', '🥤', '🧃', '☕', '🍰', '🍮', '🧀', '🌭'];
    const SUPPLY_ICONS = ['🥩', '🍗', '🐟', '🍤', '🍚', '🫘', '🥔', '🍌', '🧅', '🧄', '🍅', '🥬', '🥚', '🧀', '🥛', '🧈', '🫒', '🧂', '🌶️', '🍋', '🥤', '🧊', '🔥', '🛵', '🥡', '🧻', '🧽', '👩‍🍳', '📦', '💡'];
    const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const numberOrder = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    const monthLabel = new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' });
    let host = null;
    let repo = null;
    let state = null;
    const view = { tab: 'pedidos', day: '', dishId: '', query: '', onlyMissing: false, billFilter: 'todos', supplyId: '', editPurchase: '', deleteSupplies: false };
    let sheetRender = null;
    const rollMemory = new Map();
    const g = globalThis;
    const Store = () => g.ComidaStore;
    const Ledger = () => g.ComidaLedger;
    /* ── small helpers ── */
    function h(tag, attrs = {}, ...kids) {
        const el = document.createElement(tag);
        for (const [name, value] of Object.entries(attrs)) {
            if (value === null || value === undefined || value === false)
                continue;
            if (name === 'class')
                el.className = String(value);
            else if (name === 'text')
                el.textContent = String(value);
            else if (name.startsWith('on') && typeof value === 'function')
                el.addEventListener(name.slice(2), value);
            else
                el.setAttribute(name, value === true ? '' : String(value));
        }
        const add = (child) => {
            if (child === null || child === undefined || child === false)
                return;
            if (Array.isArray(child))
                child.forEach(add);
            else
                el.append(typeof child === 'object' ? child : String(child));
        };
        kids.forEach(add);
        return el;
    }
    const icon = (name) => h('span', { class: 'ic', 'data-icon': name, 'aria-hidden': 'true' });
    function waIcon() {
        const span = h('span', { class: 'comida-wa', 'aria-hidden': 'true' });
        span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="${WA_PATH}"/></svg>`;
        return span;
    }
    const money = (n) => Ledger().formatMoney(n);
    const sum = (items, pick) => items.reduce((t, i) => t + pick(i), 0);
    const pad = (n) => String(n).padStart(2, '0');
    function parseDay(day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function addDays(day, n) { const d = parseDay(day); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    const shortDay = (day) => { const d = parseDay(day); return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
    const longDay = (day) => { const d = parseDay(day); return `${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`; };
    const newId = () => 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const motionOk = () => !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Digits roll from their last shown value to the new one (odometer).
    function roll(key, value) {
        const text = String(value);
        const el = h('span', { class: 'comida-roll', 'aria-label': text });
        const previous = rollMemory.get(key);
        const from = previous && previous.replace(/\d/g, '0') === text.replace(/\d/g, '0') ? previous : text;
        rollMemory.set(key, text);
        const strips = [];
        [...text].forEach((ch, i) => {
            if (/\d/.test(ch)) {
                const strip = h('span', { class: 'comida-roll-strip' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => h('span', { text: n })));
                strip.style.transform = `translateY(${-Number(from[i]) * 1.15}em)`;
                strips.push([strip, Number(ch)]);
                el.append(h('span', { class: 'comida-roll-col', 'aria-hidden': 'true' }, strip));
            }
            else {
                el.append(h('span', { 'aria-hidden': 'true', text: ch }));
            }
        });
        const settle = () => strips.forEach(([strip, digit]) => { strip.style.transform = `translateY(${-digit * 1.15}em)`; });
        if (from !== text && motionOk())
            requestAnimationFrame(() => requestAnimationFrame(settle));
        else
            settle();
        return el;
    }
    /* ── state ── */
    function s() {
        if (!state)
            throw new Error('Comida no está iniciada.');
        return state;
    }
    function commit(next, message) {
        const result = repo ? repo.save(next) : { ok: true };
        if (!result.ok) {
            host === null || host === void 0 ? void 0 : host.showToast(result.quota ? 'No se guardó: el almacenamiento está lleno. Exportá un respaldo y liberá espacio.' : 'No se pudo guardar Comida. Intentá de nuevo.');
            return false;
        }
        state = next;
        if (message)
            host === null || host === void 0 ? void 0 : host.showToast(message);
        render();
        return true;
    }
    function attempt(action, message) {
        try {
            return commit(action(), message);
        }
        catch (error) {
            if (host)
                host.showToast(error instanceof Error ? error.message : 'No se pudo completar.');
            return false;
        }
    }
    function people() {
        const employees = host ? host.getEmployees() : [];
        const pausedIds = new Set(s().pausedPersonIds);
        return [
            ...employees.map(e => { var _a; return ({ id: String(e.id), num: String((_a = e.number) !== null && _a !== void 0 ? _a : ''), name: e.name, role: e.position || 'Sin cargo', employee: true, paused: pausedIds.has(String(e.id)), attendancePaused: !!e.paused }); }),
            ...s().clients.map(c => ({ id: c.id, num: c.num, name: c.name, role: c.ref || 'Cliente', employee: false, paused: pausedIds.has(c.id), attendancePaused: false }))
        ];
    }
    function comparePeople(a, b) {
        return Number(b.employee) - Number(a.employee) || Number(!a.num) - Number(!b.num)
            || numberOrder.compare(a.num, b.num) || numberOrder.compare(a.name, b.name);
    }
    const personById = (id) => people().find(p => p.id === id);
    const ordersOf = (personId, day) => s().orders.filter(o => o.personId === personId && o.day === day);
    const debtOf = (personId) => Ledger().balance(s().orders, s().payments, personId);
    const summary = (orders) => {
        const counts = new Map();
        orders.forEach(o => counts.set(o.dishEmoji, (counts.get(o.dishEmoji) || 0) + 1));
        return [...counts].map(([emoji, n]) => emoji + n).join(' ');
    };
    const openPeriod = () => s().periods.find(p => p.end === null);
    const periodNumber = (p) => s().periods.indexOf(p) + 1;
    const isLocked = (day) => Ledger().isDayLocked(s().periods, day);
    /* ── sheet ── */
    function content() {
        return host.sheet.querySelector('.modal-content');
    }
    function showSheet(build) {
        if (!host)
            return;
        const draw = () => {
            const box = content();
            const top = box.scrollTop;
            box.replaceChildren(h('div', { class: 'modal-handle' }), ...build().flat(3).filter(Boolean).map(c => (typeof c === 'object' ? c : document.createTextNode(String(c)))));
            box.scrollTop = top;
            host.applyIcons(box);
        };
        const wasOpen = host.isSheetOpen();
        sheetRender = draw;
        if (wasOpen)
            content().scrollTop = 0;
        draw();
        host.sheet.classList.remove('is-closing');
        if (!wasOpen)
            host.openSheet();
    }
    function closeSheet() {
        if (!host || !host.isSheetOpen())
            return;
        sheetRender = null;
        const sheet = host.sheet;
        if (!motionOk()) {
            host.closeSheet();
            return;
        }
        sheet.classList.add('is-closing');
        setTimeout(() => { sheet.classList.remove('is-closing'); host && host.closeSheet(); }, 260);
    }
    const sheetHead = (title, subtitle) => h('div', { class: 'modal-header' }, h('div', { class: 'modal-title', text: title }), subtitle && h('div', { class: 'modal-subtitle', text: subtitle }));
    function messageSheet(title, subtitle, text, extra, onConfirm) {
        let opened = false;
        showSheet(() => {
            const body = text();
            const pre = h('pre', { class: 'comida-msg', text: body });
            const copy = h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: () => {
                    const done = () => { copy.textContent = 'Copiado'; opened = true; sheetRender && sheetRender(); };
                    const fallback = () => { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel && (sel.removeAllRanges(), sel.addRange(r)); copy.textContent = 'Texto seleccionado'; };
                    try {
                        (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject(new Error('sin portapapeles'))).then(done).catch(fallback);
                    }
                    catch {
                        fallback();
                    }
                } }, 'Copiar');
            const wa = h('a', { class: 'btn-full whatsapp-cta comida-wa-link', href: 'https://wa.me/?text=' + encodeURIComponent(body), target: '_blank', rel: 'noopener', onclick: () => { opened = true; setTimeout(() => sheetRender && sheetRender(), 0); } }, waIcon(), 'Abrir WhatsApp');
            return [sheetHead(title, subtitle), extra && extra(), pre, h('div', { class: 'comida-row' }, copy, wa),
                onConfirm && opened && h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => { onConfirm(); closeSheet(); } }, 'Ya lo envié'),
                onConfirm && h('p', { class: 'comida-hint', text: 'Abrir WhatsApp no confirma el envío. Cuando lo mandes, toca «Ya lo envié».' })];
        });
    }
    /* ── Pedidos ── */
    function stepper(person, count, onMinus, onPlus, key) {
        return h('div', { class: 'comida-step' + (count > 0 ? ' has' : '') }, h('button', { type: 'button', class: 'comida-step-minus', 'aria-label': `Quitar un plato a ${person.name}`, disabled: count === 0, onclick: onMinus }, '−'), h('span', { class: 'comida-step-n' }, roll(key, count)), h('button', { type: 'button', class: 'comida-step-plus', 'data-person': person.id, 'aria-label': `Anotar un plato a ${person.name}`, onclick: onPlus }, '+'));
    }
    function floatPlus(personId, text) {
        if (!host || !motionOk())
            return;
        const button = host.root.querySelector(`[data-person="${CSS.escape(personId)}"]`);
        if (!button)
            return;
        const f = h('span', { class: 'comida-float', text });
        button.parentElement && button.parentElement.append(f);
        setTimeout(() => f.remove(), 900);
    }
    function addPlate(person, dishId) {
        const dish = s().dishes.find(d => d.id === dishId);
        if (attempt(() => Store().addOrder(s(), { id: newId(), personId: person.id, dishId, day: view.day }))) {
            if (dish)
                floatPlus(person.id, '+1 ' + dish.emoji);
            sheetRender && sheetRender();
        }
    }
    function removePlate(person, dishId) {
        if (attempt(() => Store().removeLastOrder(s(), person.id, view.day, dishId)))
            sheetRender && sheetRender();
    }
    function renderPedidos() {
        const day = view.day;
        const locked = isLocked(day);
        const orders = s().orders.filter(o => o.day === day);
        const orderedIds = new Set(orders.map(order => order.personId));
        const all = people().sort(comparePeople);
        const pausedCount = all.filter(p => p.paused).length;
        const visible = all.filter(p => !p.paused && (!p.attendancePaused || orderedIds.has(p.id)));
        const missing = visible.filter(p => p.employee && host && host.isPresent(p.id, day) && !orderedIds.has(p.id));
        const menu = s().dishes.filter(d => d.onMenu);
        if (!menu.some(d => d.id === view.dishId))
            view.dishId = menu[0] ? menu[0].id : '';
        const q = view.query.trim().toLowerCase();
        const match = (p) => p.name.toLowerCase().includes(q) || p.num.toLowerCase().includes(q);
        const employees = (view.onlyMissing ? missing : visible.filter(p => p.employee)).filter(match);
        const clients = view.onlyMissing ? [] : visible.filter(p => !p.employee).filter(match);
        const sentSig = s().sent[day];
        const changes = sentSig !== undefined ? Ledger().changesSinceSent(sentSig, s().orders, day) : null;
        const closed = locked ? s().periods.find(p => p.end !== null && day >= p.start && day <= p.end) : null;
        const card = (p) => {
            const mine = ordersOf(p.id, day);
            const debt = debtOf(p.id);
            return h('div', { class: 'user-card comida-card' + (p.attendancePaused ? ' paused' : '') }, calendarButton(p), h('button', { type: 'button', class: 'comida-info', 'aria-label': 'Pedido de ' + p.name, onclick: () => (locked ? openAccount(p.id) : openOrder(p.id)) }, h('span', { class: 'user-name', text: p.name }), h('span', { class: 'user-role' + (mine.length ? ' comida-today' : ''), text: mine.length ? `${summary(mine)} · ${money(sum(mine, o => o.price))}` : debt > 0 ? 'Debe ' + money(debt) : 'Al día' })), locked ? h('span', { class: 'comida-lock' }, icon('lock'), String(mine.length))
                : view.dishId && stepper(p, mine.length, () => removePlate(p), () => addPlate(p, view.dishId), 'q' + p.id));
        };
        const searchInput = h('input', { class: 'search-input', id: 'comida-search', type: 'search', placeholder: 'Nombre o número', 'aria-label': 'Buscar persona', value: view.query, autocomplete: 'off' });
        searchInput.addEventListener('input', () => {
            view.query = searchInput.value;
            const { selectionStart, selectionEnd } = searchInput;
            render();
            const input = document.querySelector('#comida-search');
            input === null || input === void 0 ? void 0 : input.focus({ preventScroll: true });
            input === null || input === void 0 ? void 0 : input.setSelectionRange(selectionStart, selectionEnd);
        });
        return [
            dateNav(day, locked),
            closed && h('div', { class: 'comida-band' }, icon('lock'), h('span', { text: `Período #${periodNumber(closed)} cerrado el ${shortDay(closed.end)}. Solo lectura.` }), h('button', { type: 'button', onclick: () => { view.day = host ? host.today() : view.day; render(); } }, 'Ir a hoy')),
            h('div', { class: 'stats-filters comida-stats' }, h('div', { class: 'stat-card' }, h('div', { class: 'stat-value' }, roll('plates', orders.length)), h('div', { class: 'stat-label', text: 'Platos' })), h('div', { class: 'stat-card' }, h('div', { class: 'stat-value' }, roll('total', money(sum(orders, o => o.price)))), h('div', { class: 'stat-label', text: 'Total' })), h('button', { type: 'button', class: 'stat-card' + (view.onlyMissing ? ' active' : ''), 'aria-pressed': String(view.onlyMissing), 'aria-label': 'Ver presentes que no han pedido', onclick: () => { view.onlyMissing = !view.onlyMissing; render(); } }, h('div', { class: 'stat-value', style: 'color: var(--warning-color)' }, roll('missing', missing.length)), h('div', { class: 'stat-label', text: 'Sin pedir' }))),
            !locked && changes && h('div', { class: 'comida-note' + (changes.changed ? ' is-warn' : ' is-ok') }, icon(changes.changed ? 'warning' : 'check'), changes.changed ? 'Cambió desde el último envío: ' + [changes.added && `${changes.added} ${changes.added > 1 ? 'platos nuevos' : 'plato nuevo'}`, changes.removed && `${changes.removed} ${changes.removed > 1 ? 'quitados' : 'quitado'}`].filter(Boolean).join(', ') : 'Pedido enviado a la cocina'),
            !locked && h('button', { type: 'button', class: 'whatsapp-cta comida-send', onclick: openKitchenMessage }, waIcon(), 'Enviar Pedido'),
            !locked && (menu.length
                ? h('div', { class: 'comida-dishbar' }, h('span', { class: 'comida-dishbar-label' }, icon('food'), 'Plato:'), h('div', { class: 'comida-chips' }, menu.map(d => h('button', { type: 'button', class: 'category-pill' + (view.dishId === d.id ? ' active' : ''), 'aria-pressed': String(view.dishId === d.id), onclick: () => { view.dishId = d.id; render(); } }, `${d.emoji} ${d.name} ${d.price}`))))
                : h('div', { class: 'comida-empty' }, h('b', { text: 'No hay platos en el menú' }), h('span', { text: 'Créalos en Cocina.' }), h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => { view.tab = 'cocina'; render(); } }, 'Ir a Cocina'))),
            h('div', { class: 'comida-list-tools' }, h('div', { class: 'search-wrapper comida-search' }, h('span', { class: 'search-icon' }, icon('search')), searchInput), pausedCount > 0 && h('button', { type: 'button', class: 'category-pill', onclick: openPausedPeople }, `Pausados (${pausedCount})`)),
            h('div', { class: 'comida-kicker', text: view.onlyMissing ? `Presentes sin pedir (${employees.length})` : `Empleados (${employees.length})` }),
            employees.length ? h('div', { class: 'comida-list' }, employees.map(card)) : h('div', { class: 'comida-empty', text: q ? 'No hay empleados que coincidan.' : view.onlyMissing ? 'Todos los presentes ya pidieron.' : 'No hay empleados activos.' }),
            !view.onlyMissing && [h('div', { class: 'comida-kicker', text: `Clientes (${clients.length})` }),
                clients.length ? h('div', { class: 'comida-list' }, clients.map(card)) : h('div', { class: 'comida-empty', text: q ? 'No hay clientes que coincidan.' : s().clients.length ? 'No hay clientes activos.' : 'Agrega clientes con el botón + del centro.' })]
        ];
    }
    function dateNav(day, locked) {
        const today = host ? host.today() : day;
        return h('div', { class: 'date-nav' }, h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Día anterior', onclick: () => { view.day = addDays(view.day, -1); render(); } }, icon('chevronLeft')), h('button', {
            type: 'button', class: 'current-date-wrapper', id: 'comida-date-jump-trigger', title: 'Ir a una fecha',
            'aria-label': `Elegir fecha de pedidos · ${longDay(day)}`, 'aria-haspopup': 'dialog',
            onclick: () => host === null || host === void 0 ? void 0 : host.openDatePicker(day, selected => {
                var _a;
                view.day = selected;
                render();
                (_a = host === null || host === void 0 ? void 0 : host.root.querySelector('#comida-date-jump-trigger')) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
            })
        }, h('span', { class: 'current-date-display', text: (day === today ? 'Hoy · ' : '') + shortDay(day) + (locked ? ' · cerrado' : '') })), h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Día siguiente', disabled: day >= today, onclick: () => { view.day = addDays(view.day, 1); render(); } }, icon('chevronRight')));
    }
    function calendarButton(person, back) {
        return h('button', {
            type: 'button', class: 'avatar-placeholder tap-calendar comida-avatar' + (person.employee ? '' : ' is-client'),
            'aria-label': 'Ver calendario de pedidos de ' + person.name, title: 'Ver calendario de pedidos',
            onclick: () => openFoodCalendar(person.id, view.day, back)
        }, person.num || icon('daily'));
    }
    function setPersonPaused(person, paused) {
        return attempt(() => Store().setPersonPaused(s(), person.id, paused), `${person.name} ${paused ? 'se ocultó de Pedidos' : 'se reactivó en Comida'}.`);
    }
    function openPausedPeople() {
        showSheet(() => {
            const paused = people().filter(person => person.paused).sort(comparePeople);
            return [sheetHead('Pausados en Comida', 'Reactiva a una persona para volver a anotar sus pedidos.'),
                h('div', { class: 'comida-list' }, paused.map(person => h('div', { class: 'user-card comida-card' }, calendarButton(person, openPausedPeople), h('div', { class: 'comida-person-label' }, h('div', { class: 'user-name', text: person.name }), h('div', { class: 'user-role', text: person.role })), h('button', { type: 'button', class: 'category-pill', 'aria-label': `Reactivar a ${person.name} en Comida`, onclick: () => {
                        var _a;
                        if (!setPersonPaused(person, false))
                            return;
                        if (paused.length === 1)
                            closeSheet();
                        else {
                            sheetRender === null || sheetRender === void 0 ? void 0 : sheetRender();
                            (_a = content().querySelector('.category-pill')) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
                        }
                    } }, 'Reactivar')))),
                h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: closeSheet }, 'Cerrar')];
        });
    }
    function openFoodCalendar(personId, initialDay, back) {
        let selectedDay = initialDay;
        const redraw = (focus) => {
            var _a;
            sheetRender === null || sheetRender === void 0 ? void 0 : sheetRender();
            (_a = content().querySelector(focus)) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
        };
        showSheet(() => {
            const person = personById(personId);
            if (!person || !host)
                return [sheetHead('Persona no encontrada')];
            const today = host.today();
            const date = parseDay(selectedDay);
            const year = date.getFullYear();
            const month = date.getMonth();
            const monthKey = selectedDay.slice(0, 7);
            const atCurrentMonth = monthKey === today.slice(0, 7);
            const firstWeekday = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const ordersByDay = new Map();
            for (const order of s().orders) {
                if (order.personId !== personId || !order.day.startsWith(monthKey + '-'))
                    continue;
                const orders = ordersByDay.get(order.day) || [];
                orders.push(order);
                ordersByDay.set(order.day, orders);
            }
            const moveMonth = (offset) => {
                selectedDay = addDays(monthKey + '-01', offset < 0 ? -1 : daysInMonth).slice(0, 7) + '-01';
                const focusNext = offset > 0 && selectedDay.slice(0, 7) !== today.slice(0, 7);
                redraw(focusNext ? '.comida-cal-next' : '.comida-cal-prev');
            };
            const days = Array.from({ length: daysInMonth }, (_, i) => {
                var _a;
                const dateKey = monthKey + '-' + pad(i + 1);
                if (dateKey > today)
                    return h('span', { class: 'cal-day comida-cal-future' }, i + 1);
                const count = ((_a = ordersByDay.get(dateKey)) === null || _a === void 0 ? void 0 : _a.length) || 0;
                return h('button', {
                    type: 'button', class: 'cal-day' + (count ? ' has-data' : ''), 'aria-pressed': String(dateKey === selectedDay),
                    'aria-label': `${longDay(dateKey)}, ${count === 1 ? '1 plato' : `${count} platos`}`,
                    onclick: () => { selectedDay = dateKey; redraw('.cal-day[aria-pressed="true"]'); }
                }, i + 1, count > 0 && h('span', { class: 'cal-hours', 'aria-hidden': 'true' }, `×${count}`));
            });
            const selectedOrders = ordersByDay.get(selectedDay) || [];
            const dishes = new Map();
            for (const order of selectedOrders) {
                const dish = `${order.dishEmoji} ${order.dishName}`;
                const item = dishes.get(dish) || { name: dish, count: 0, total: 0 };
                item.count++;
                item.total += order.price;
                dishes.set(dish, item);
            }
            return [sheetHead([person.name, person.num].filter(Boolean).join(' · '), 'Historial de pedidos'),
                h('div', { class: 'calendar-nav comida-calendar-nav' }, h('button', { type: 'button', class: 'cal-nav-btn comida-cal-prev', 'aria-label': 'Mes anterior', onclick: () => moveMonth(-1) }, icon('chevronLeft')), h('strong', { class: 'comida-cal-month', 'aria-live': 'polite', text: monthLabel.format(date) }), h('button', { type: 'button', class: 'cal-nav-btn comida-cal-next', 'aria-label': 'Mes siguiente', disabled: atCurrentMonth, onclick: () => moveMonth(1) }, icon('chevronRight'))),
                h('div', { class: 'comida-calendar-scroll' }, h('div', { class: 'calendar-grid comida-calendar' }, DOW.map(label => h('span', { class: 'cal-header', text: label.toUpperCase() })), Array.from({ length: firstWeekday }, () => h('span', { 'aria-hidden': 'true' })), days)),
                h('div', { class: 'comida-panel comida-calendar-detail' }, h('b', { text: longDay(selectedDay) }), dishes.size ? [...dishes.values()].map(dish => h('div', { class: 'comida-calendar-order' }, h('span', { text: `${dish.name} ×${dish.count}` }), h('b', { text: money(dish.total) }))) : h('span', { class: 'comida-hint', text: 'Sin pedidos este día.' }), dishes.size > 0 && h('div', { class: 'comida-calendar-order' }, h('b', { text: 'Total del día' }), h('b', { text: money(sum(selectedOrders, order => order.price)) }))),
                h('div', { class: 'comida-row' }, h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => openAccount(person.id, false, () => openFoodCalendar(personId, selectedDay, back)) }, 'Ver cuenta'), h('button', { type: 'button', class: 'btn-full btn-secondary comida-cal-pause', onclick: () => {
                        if (setPersonPaused(person, !person.paused))
                            redraw('.comida-cal-pause');
                    } }, person.paused ? 'Reactivar en Comida' : 'Pausar en Comida')),
                h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: back ? () => {
                        if (people().some(p => p.paused))
                            back();
                        else
                            closeSheet();
                    } : closeSheet }, back ? 'Volver a Pausados' : 'Cerrar calendario')];
        });
    }
    function openKitchenMessage() {
        const day = view.day;
        messageSheet('Pedido para la cocina', shortDay(day), () => Ledger().formatKitchenOrder(s().orders, day, { dateLabel: longDay(day), withPrices: s().withPrices,
            notes: people().filter(p => s().notes[p.id + '@' + day] && ordersOf(p.id, day).length).map(p => ({ name: p.name, text: s().notes[p.id + '@' + day] })) }), () => h('label', { class: 'comida-switch-row' }, h('span', {}, h('b', { text: 'Incluir precios' }), h('small', { text: 'Quítalos si la cocina no debe verlos' })), toggle('Incluir precios', s().withPrices, value => { state = Store().setWithPrices(s(), value); repo && repo.save(s()); sheetRender && sheetRender(); })), () => commit(Store().markSent(s(), day), 'Pedido marcado como enviado'));
    }
    function toggle(label, checked, onChange) {
        const input = h('input', { type: 'checkbox', 'aria-label': label });
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        return h('span', { class: 'toggle-switch' }, input, h('span', { class: 'toggle-slider' }));
    }
    function openOrder(personId) {
        const draw = () => {
            const p = personById(personId);
            if (!p)
                return [sheetHead('Persona no encontrada')];
            const day = view.day;
            const mine = ordersOf(p.id, day);
            const key = p.id + '@' + day;
            const note = h('textarea', { class: 'search-input comida-textarea', id: 'comida-note', rows: '2', placeholder: 'Ej.: sin ensalada' });
            note.value = s().notes[key] || '';
            note.addEventListener('change', () => { state = Store().setNote(s(), p.id, day, note.value); repo && repo.save(s()); });
            const hasPrevious = s().orders.some(o => o.personId === p.id && o.day < day);
            return [sheetHead(`${p.name} · ${p.num}`, longDay(day)),
                s().dishes.filter(d => d.onMenu).map(d => h('div', { class: 'comida-dish' }, h('span', { class: 'comida-dish-icon', text: d.emoji }), h('span', { class: 'comida-dish-name' }, h('b', { text: d.name }), h('small', { text: money(d.price) })), stepper(p, mine.filter(o => o.dishId === d.id).length, () => removePlate(p, d.id), () => addPlate(p, d.id), 'o' + p.id + d.id))),
                h('label', { class: 'comida-label', for: 'comida-note', text: 'Nota para la cocina' }), note,
                h('div', { class: 'comida-total' }, h('span', { text: 'Total del día' }), h('b', {}, roll('ot' + p.id, money(sum(mine, o => o.price))))),
                h('button', { type: 'button', class: 'btn-full btn-secondary', disabled: !hasPrevious || mine.length > 0, onclick: () => attempt(() => Store().repeatLastOrder(s(), p.id, day, newId), 'Se repitió el último pedido') && sheetRender && sheetRender() }, 'Repetir último pedido'),
                h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => { state = Store().setNote(s(), p.id, day, note.value); repo && repo.save(s()); closeSheet(); render(); } }, 'Listo')];
        };
        showSheet(draw);
    }
    /* ── Cocina ── */
    function renderCocina() {
        return [
            h('div', { class: 'comida-kicker', text: 'Platos' }),
            s().dishes.length ? h('div', { class: 'comida-panel' }, s().dishes.map(d => h('div', { class: 'comida-dish' }, h('span', { class: 'comida-dish-icon', text: d.emoji }), h('button', { type: 'button', class: 'comida-dish-name', 'aria-label': 'Editar ' + d.name, onclick: () => openDish(d.id) }, h('b', { text: d.name }), h('small', { text: `${money(d.price)} · costo ${money(d.cost)} · deja ${money(d.price - d.cost)}` })), toggle(d.name + ' en el menú', d.onMenu, value => attempt(() => Store().setDishOnMenu(s(), d.id, value))))))
                : h('div', { class: 'comida-empty', text: 'Todavía no hay platos. Crea el primero.' }),
            h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => openDish('') }, icon('add'), ' Nuevo plato'),
            h('div', { class: 'comida-kicker', text: 'Compras' }),
            purchaseBlocks(false)
        ];
    }
    function openDish(dishId, draft) {
        showSheet(() => {
            const d = s().dishes.find(x => x.id === dishId);
            const st = draft || { name: d ? d.name : '', price: d ? String(d.price) : '', cost: d ? String(d.cost) : '', emoji: d ? d.emoji : DISH_ICONS[0] };
            const name = h('input', { class: 'search-input comida-field', id: 'comida-dish-name', value: st.name, autocomplete: 'off' });
            const price = h('input', { class: 'search-input comida-field', id: 'comida-dish-price', inputmode: 'numeric', value: st.price });
            const cost = h('input', { class: 'search-input comida-field', id: 'comida-dish-cost', inputmode: 'numeric', value: st.cost });
            const keep = () => ({ name: name.value, price: price.value, cost: cost.value, emoji: st.emoji });
            return [sheetHead(d ? 'Editar plato' : 'Nuevo plato', d ? 'El precio nuevo vale desde ahora. Lo ya anotado no cambia.' : undefined),
                h('label', { class: 'comida-label', for: 'comida-dish-name', text: 'Nombre' }), name,
                h('div', { class: 'comida-row' }, h('div', {}, h('label', { class: 'comida-label', for: 'comida-dish-price', text: 'Precio de venta' }), price), h('div', {}, h('label', { class: 'comida-label', for: 'comida-dish-cost', text: 'Costo estimado' }), cost)),
                h('div', { class: 'comida-label', text: 'Icono' }),
                h('div', { class: 'comida-emoji-grid' }, DISH_ICONS.map(e => h('button', { type: 'button', 'aria-pressed': String(e === st.emoji), 'aria-label': 'Icono ' + e, text: e, onclick: () => openDish(dishId, { ...keep(), emoji: e }) }))),
                h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => {
                        if (attempt(() => Store().saveDish(s(), { id: d ? d.id : newId(), name: name.value, emoji: st.emoji, price: Number(price.value), cost: Number(cost.value || 0) }), 'Plato guardado'))
                            closeSheet();
                    } }, 'Guardar plato')];
        });
    }
    function purchaseBlocks(inSheet) {
        const period = openPeriod();
        const inside = (day) => day >= period.start;
        const sold = sum(s().orders.filter(o => inside(o.day)), o => o.price);
        const purchases = s().purchases.filter(p => inside(p.day));
        const spent = sum(purchases, p => p.amount);
        const ratio = sold > 0 ? Math.min(100, Math.round((spent / sold) * 100)) : 0;
        const editing = s().purchases.find(p => p.id === view.editPurchase);
        if (!s().categories.some(c => c.id === view.supplyId) && !(editing && editing.categoryId === view.supplyId))
            view.supplyId = s().categories[0] ? s().categories[0].id : '';
        const category = s().categories.find(c => c.id === view.supplyId) || (editing && editing.categoryId === view.supplyId ? { id: editing.categoryId, name: editing.categoryName, emoji: editing.categoryEmoji } : null);
        const amount = h('input', { class: 'comida-amount-input', id: 'comida-amount', inputmode: 'numeric', 'aria-label': 'Monto gastado', value: editing ? String(editing.amount) : '0' });
        amount.addEventListener('focus', () => { if (amount.value === '0')
            amount.value = ''; });
        const error = h('div', { class: 'comida-error', role: 'alert' });
        const keepAmount = (change) => { const value = amount.value; change(); const again = document.getElementById('comida-amount'); if (again && !editing)
            again.value = value; };
        const back = inSheet ? () => openPurchases() : null;
        const save = () => {
            if (!category) {
                error.textContent = s().categories.length ? 'Elige un insumo.' : 'Primero crea un insumo con el botón +.';
                return;
            }
            const value = Number(amount.value);
            const ok = attempt(() => Store().savePurchase(s(), { id: editing ? editing.id : newId(), categoryId: category.id, amount: value, day: editing ? editing.day : host.today(), time: editing ? editing.time : nowTime() }), editing ? `Compra actualizada · ${category.name} ${money(value)}` : `Compra de ${category.name} por ${money(value)}`);
            if (ok) {
                view.editPurchase = '';
                sheetRender && sheetRender();
            }
        };
        const tile = (c) => h('button', { type: 'button', class: 'comida-supply' + (view.deleteSupplies ? ' is-delete' : ''), 'aria-pressed': String(!view.deleteSupplies && view.supplyId === c.id), 'aria-label': view.deleteSupplies ? 'Eliminar insumo ' + c.name : c.name,
            onclick: () => {
                if (!view.deleteSupplies) {
                    keepAmount(() => { view.supplyId = c.id; render(); sheetRender && sheetRender(); });
                    return;
                }
                host.confirm(`¿Eliminar el insumo «${c.name}»? Sus compras se conservan en el historial.`, { title: 'Eliminar insumo', confirmText: 'Eliminar', danger: true }).then(ok => {
                    if (!ok)
                        return;
                    attempt(() => Store().removeCategory(s(), c.id), 'Insumo eliminado');
                    if (!s().categories.length)
                        view.deleteSupplies = false;
                    sheetRender && sheetRender();
                });
            } }, view.deleteSupplies && h('span', { class: 'comida-supply-x' }, icon('close')), h('span', { class: 'comida-supply-icon', text: c.emoji }), h('span', { class: 'comida-supply-name', text: c.name }));
        const when = (p) => { const today = host.today(); return (p.day === today ? 'Hoy' : p.day === addDays(today, -1) ? 'Ayer' : shortDay(p.day)) + (p.time ? ' · ' + p.time : ''); };
        return h('div', { class: 'comida-stack' }, h('div', { class: 'comida-panel' }, h('b', { text: `Ventas vs. compras del período #${periodNumber(period)}` }), h('span', { class: 'comida-hint', text: sold >= spent ? `Las compras son el ${ratio}% de lo vendido; queda el ${100 - ratio}%.` : `Las compras superan lo vendido por ${money(spent - sold)}.` }), meterRow('Ventas (cobrado + por cobrar)', sold, 100, 'var(--success-color)'), meterRow('Compras de mercado e insumos', spent, ratio, 'var(--danger-color)')), h('div', { class: 'comida-panel' }, h('div', { class: 'comida-panel-head' }, h('b', { text: editing ? `Editando compra (${editing.categoryName})` : 'Registrar compra' }), editing ? h('button', { type: 'button', class: 'comida-link is-danger', onclick: () => { view.editPurchase = ''; render(); sheetRender && sheetRender(); } }, 'Cancelar edición')
            : s().categories.length > 0 && h('button', { type: 'button', class: 'comida-link', onclick: () => { view.deleteSupplies = !view.deleteSupplies; render(); sheetRender && sheetRender(); } }, view.deleteSupplies ? 'Listo' : 'Editar insumos')), h('span', { class: 'comida-hint', text: view.deleteSupplies ? 'Toca un insumo para eliminarlo. Las compras ya registradas no se borran.' : s().categories.length ? 'Elige el insumo y suma los billetes o escribe el monto.' : 'Todavía no hay insumos. Crea el primero con el botón +.' }), h('div', { class: 'comida-supply-grid' }, s().categories.map(tile), !view.deleteSupplies && h('button', { type: 'button', class: 'comida-supply is-add', 'aria-label': 'Agregar insumo', onclick: () => openSupply(back) }, h('span', { class: 'comida-slot' }, icon('add')), h('span', { class: 'comida-supply-name', text: 'Agregar' }))), h('div', { class: 'comida-amount' }, h('div', { class: 'comida-amount-head' }, h('span', { text: 'Monto gastado (RD$)' }), h('button', { type: 'button', class: 'comida-link is-danger', onclick: () => { amount.value = '0'; } }, 'Limpiar')), h('div', { class: 'comida-amount-box' }, h('span', { class: 'comida-pill', text: category ? `${category.emoji} ${category.name}` : 'Sin insumo' }), amount), h('div', { class: 'comida-bills' }, [100, 200, 500, 1000].map(n => h('button', { type: 'button', onclick: () => { amount.value = String((Number(amount.value) || 0) + n); error.textContent = ''; } }, '+' + n.toLocaleString('en-US')))), error, h('button', { type: 'button', class: 'btn-full comida-ink', onclick: save }, editing ? 'Actualizar compra' : 'Guardar compra'))), h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Historial de compras' }), purchases.length ? [...purchases].reverse().slice(0, 30).map(p => h('div', { class: 'comida-hist' }, h('span', { class: 'comida-hist-main' }, h('b', { text: `${p.categoryEmoji} ${p.categoryName}` }), h('small', { text: when(p) })), h('b', { class: 'comida-neg', text: '-' + money(p.amount) }), h('button', { type: 'button', class: 'comida-link', onclick: () => { view.editPurchase = p.id; view.supplyId = p.categoryId; view.deleteSupplies = false; render(); sheetRender && sheetRender(); } }, 'Editar'), h('button', { type: 'button', class: 'comida-icon-btn', 'aria-label': `Eliminar compra de ${p.categoryName}`, onclick: () => {
                host.confirm(`¿Eliminar la compra de ${p.categoryName} por ${money(p.amount)}?`, { title: 'Eliminar compra', confirmText: 'Eliminar', danger: true }).then(ok => {
                    if (!ok)
                        return;
                    if (view.editPurchase === p.id)
                        view.editPurchase = '';
                    attempt(() => Store().removePurchase(s(), p.id), 'Compra eliminada');
                    sheetRender && sheetRender();
                });
            } }, icon('close'))))
            : h('div', { class: 'comida-empty', text: 'Sin compras en este período.' })));
    }
    function meterRow(label, value, percent, color) {
        const bar = h('b');
        bar.style.width = percent + '%';
        bar.style.background = color;
        return h('div', { class: 'comida-meter' }, h('div', { class: 'comida-meter-head' }, h('span', { style: 'color:' + color, text: label }), h('span', { text: money(value) })), h('i', {}, bar));
    }
    function openPurchases() {
        showSheet(() => [sheetHead('Compras e insumos', shortDay(host.today())), purchaseBlocks(true)]);
    }
    function openSupply(back, draft) {
        showSheet(() => {
            const st = draft || { name: '', emoji: SUPPLY_ICONS[0] };
            const name = h('input', { class: 'search-input comida-field', id: 'comida-supply-name', value: st.name, placeholder: 'Ej.: Carnes, Gas, Envases', autocomplete: 'off' });
            const done = () => (back ? back() : closeSheet());
            return [sheetHead('Nuevo insumo', 'Aparecerá en la cuadrícula de compras.'),
                h('label', { class: 'comida-label', for: 'comida-supply-name', text: 'Nombre' }), name,
                h('div', { class: 'comida-label', text: 'Icono' }),
                h('div', { class: 'comida-emoji-grid' }, SUPPLY_ICONS.map(e => h('button', { type: 'button', 'aria-pressed': String(e === st.emoji), 'aria-label': 'Icono ' + e, text: e, onclick: () => openSupply(back, { name: name.value, emoji: e }) }))),
                h('div', { class: 'comida-row' }, h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: done }, 'Cancelar'), h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => {
                        const id = newId();
                        if (attempt(() => Store().addCategory(s(), { id, name: name.value, emoji: st.emoji }), `Insumo ${st.emoji} ${name.value.trim()} creado`)) {
                            view.supplyId = id;
                            view.deleteSupplies = false;
                            done();
                            render();
                        }
                    } }, 'Guardar insumo'))];
        });
    }
    /* ── Facturación ── */
    function periodStats(p) {
        return Ledger().periodSummary(s().orders, s().payments, s().purchases, p);
    }
    function dailySalesChart(sales) {
        const peak = sales.reduce((max, sale) => Math.max(max, sale.clients + sale.staff), 1);
        const bars = sales.map(({ day, clients, staff }, index) => {
            const total = clients + staff;
            const bar = h('div', {
                class: 'comida-sale-bar' + (total ? '' : ' is-zero'), 'data-day': day,
                title: `${shortDay(day)} · Clientes ${money(clients)} · Personal ${money(staff)} · Total ${money(total)}`
            }, clients > 0 && h('span', { class: 'comida-sales-client', style: `flex-grow: ${clients}` }), staff > 0 && h('span', { class: 'comida-sales-staff', style: `flex-grow: ${staff}` }));
            bar.style.height = total ? `${total / peak * 100}%` : '2px';
            bar.style.animationDelay = `${Math.min(index * 12, 250)}ms`;
            return bar;
        });
        return h('div', { class: 'comida-panel comida-sales' }, h('div', { class: 'comida-kicker', text: 'Ventas por día del período' }), h('div', { class: 'comida-sales-legend' }, h('span', {}, h('i', { class: 'comida-sales-client', 'aria-hidden': 'true' }), 'Clientes'), h('span', {}, h('i', { class: 'comida-sales-staff', 'aria-hidden': 'true' }), 'Personal')), h('div', { class: 'comida-bars', role: 'img', 'aria-label': 'Ventas por día del período. Clientes en naranja y personal en azul.' }, bars), h('details', {}, h('summary', { class: 'comida-sales-summary', text: 'Importes por día' }), h('table', { class: 'comida-sales-table', 'aria-label': 'Ventas por fecha y grupo' }, h('thead', {}, h('tr', {}, ['Fecha', 'Clientes', 'Personal'].map(label => h('th', { scope: 'col', text: label })))), h('tbody', {}, sales.map(({ day, clients, staff }) => h('tr', {}, h('th', { scope: 'row', text: shortDay(day) }), h('td', { text: money(clients) }), h('td', { text: money(staff) })))))), h('span', { class: 'comida-hint', text: 'Ganancia = vendido − compras del período' }));
    }
    function renderFacturacion() {
        const today = host.today();
        const p = openPeriod();
        const stats = periodStats(p);
        const dayN = Math.max(0, Ledger().periodDay(p, today));
        const remind = Ledger().shouldRemindClose(p, today);
        const due = people().filter(x => debtOf(x.id) > 0);
        const shown = due.filter(x => view.billFilter === 'todos' || (view.billFilter === 'emp') === x.employee).sort((a, b) => debtOf(b.id) - debtOf(a.id));
        const past = s().periods.filter(x => x.end !== null).reverse();
        const sales = Ledger().dailySales(s().orders, new Set(s().clients.map(c => c.id)), p.start, today);
        const progress = h('b');
        progress.style.width = Math.min(100, (dayN / Ledger().REMIND_AFTER_DAYS) * 100) + '%';
        progress.style.background = remind ? 'var(--warning-color)' : 'var(--accent-color)';
        return [
            h('div', { class: 'comida-panel' }, h('div', { class: 'comida-panel-head' }, h('b', { text: `Período #${periodNumber(p)}` }), h('span', { class: 'comida-hint', text: p.start > today ? `Empieza ${shortDay(p.start)}` : `Desde ${shortDay(p.start)} · día ${dayN} de ${Ledger().REMIND_AFTER_DAYS}` })), h('div', { class: 'comida-meter' }, h('i', {}, progress)), remind && h('div', { class: 'comida-note is-warn' }, icon('warning'), 'Ya pasaron 21 días. Cierra el período cuando termines de cobrar.'), h('button', { type: 'button', class: 'btn-full comida-ink', onclick: openClosePeriod }, icon('lock'), ' Cerrar período')),
            h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Por cobrar' }), h('div', { class: 'comida-big' }, roll('due', money(sum(due, x => debtOf(x.id))))), h('span', { class: 'comida-hint', text: `${due.length} ${due.length === 1 ? 'persona' : 'personas'} con saldo pendiente` })),
            h('div', { class: 'stats-filters comida-stats' }, statCard('Vendido', money(stats.sold)), statCard('Cobrado', money(stats.collected)), statCard('Ganancia', money(stats.profit), stats.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)')),
            sales.length > 0 && dailySalesChart(sales),
            past.length > 0 && h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Períodos anteriores' }), h('div', { class: 'comida-mrow is-head' }, h('span'), h('span', { text: 'Vendido' }), h('span', { text: 'Compras' }), h('span', { text: 'Ganancia' })), past.map(x => { const st = periodStats(x); return h('div', { class: 'comida-mrow', title: `${shortDay(x.start)} – ${shortDay(x.end)}` }, h('b', { text: '#' + periodNumber(x) }), h('span', { text: money(st.sold) }), h('span', { text: money(st.purchases) }), h('b', { style: `color: var(${st.profit >= 0 ? '--success-color' : '--danger-color'})`, text: money(st.profit) })); })),
            h('div', { class: 'comida-chips' }, [['todos', 'Todos'], ['emp', 'Empleados'], ['cli', 'Clientes']].map(([k, l]) => h('button', { type: 'button', class: 'category-pill' + (view.billFilter === k ? ' active' : ''), 'aria-pressed': String(view.billFilter === k), onclick: () => { view.billFilter = k; render(); } }, l))),
            shown.length ? h('div', { class: 'comida-list' }, shown.map(x => h('button', { type: 'button', class: 'user-card comida-card comida-debtor', onclick: () => openAccount(x.id) }, h('span', { class: 'avatar-placeholder comida-avatar' + (x.employee ? '' : ' is-client'), text: x.num }), h('span', { class: 'comida-info' }, h('span', { class: 'user-name', text: x.name }), h('span', { class: 'user-role', text: x.employee ? x.role : 'Cliente' })), h('b', { class: 'comida-money', text: money(debtOf(x.id)) }))))
                : h('div', { class: 'comida-empty', text: 'Nadie debe en este grupo.' })
        ];
    }
    function statCard(label, value, color) {
        return h('div', { class: 'stat-card' }, h('div', { class: 'stat-value', style: color ? 'color:' + color : null, text: value }), h('div', { class: 'stat-label', text: label }));
    }
    function openClosePeriod() {
        showSheet(() => {
            const today = host.today();
            const p = openPeriod();
            const st = periodStats(p);
            const pending = sum(people(), x => Math.max(0, debtOf(x.id)));
            const already = p.start > today;
            return [sheetHead(`Cerrar período #${periodNumber(p)}`, already ? 'Ya cerraste un período hoy.' : `Del ${shortDay(p.start)} a hoy · ${Ledger().periodDay(p, today)} días`),
                h('div', { class: 'stats-filters comida-stats' }, statCard('Vendido', money(st.sold)), statCard('Cobrado', money(st.collected)), statCard('Ganancia', money(st.profit), st.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)')),
                h('div', { class: 'comida-note ' + (pending ? 'is-warn' : 'is-ok') }, icon(pending ? 'warning' : 'check'), pending ? `Quedan ${money(pending)} por cobrar. Esa deuda pasa al período siguiente.` : 'Todos pagaron.'),
                h('p', { class: 'comida-hint', text: 'El cierre incluye hoy. Desde mañana empieza un período nuevo, y los días cerrados quedan de solo lectura.' }),
                h('button', { type: 'button', class: 'btn-full comida-ink', disabled: already, onclick: () => {
                        if (attempt(() => Store().closePeriod(s(), today, newId()), `Período #${periodNumber(p)} cerrado. El siguiente empieza mañana.`))
                            closeSheet();
                    } }, already ? 'Ya cerraste hoy' : 'Cerrar período'),
                h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: closeSheet }, 'Cancelar')];
        });
    }
    function accountText(p) {
        const account = Ledger().pendingAccount(s().orders, s().payments, p.id);
        const byDay = new Map();
        account.items.forEach((it) => byDay.set(it.order.day, [...(byDay.get(it.order.day) || []), it]));
        const lines = [...byDay].map(([day, items]) => {
            const partial = items.some(it => it.remaining < it.order.price);
            return `${shortDay(day)}: ${summary(items.map(it => it.order))} = ${money(sum(items, it => it.remaining))}${partial ? ' (resto)' : ''}`;
        });
        return `*Tu cuenta de comida*\n${p.name} (${p.num})\n\n${lines.join('\n') || '(nada pendiente)'}\n\n*Debes: ${money(account.total)}*`;
    }
    function openAccount(personId, paying = false, back) {
        showSheet(() => {
            const p = personById(personId);
            if (!p)
                return [sheetHead('Persona no encontrada')];
            const debt = debtOf(p.id);
            const mine = s().orders.filter(o => o.personId === p.id);
            const paid = s().payments.filter(x => x.personId === p.id);
            const counts = new Map();
            mine.forEach(o => { const c = counts.get(o.dishId) || { label: `${o.dishEmoji} ${o.dishName}`, n: 0 }; c.n += 1; counts.set(o.dishId, c); });
            const days = new Map();
            mine.forEach(o => { const d = days.get(o.day) || { bought: [], paid: 0 }; d.bought.push(o); days.set(o.day, d); });
            paid.forEach(x => { const d = days.get(x.day) || { bought: [], paid: 0 }; d.paid += x.amount; days.set(x.day, d); });
            let payBox = null;
            if (paying && debt > 0) {
                const input = h('input', { class: 'search-input comida-field', id: 'comida-pay', inputmode: 'numeric', value: String(debt) });
                const error = h('div', { class: 'comida-error', role: 'alert' });
                payBox = h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Pago en efectivo' }), h('label', { class: 'comida-label', for: 'comida-pay', text: 'Monto' }), input, h('div', { class: 'comida-chips' }, h('button', { type: 'button', class: 'category-pill', onclick: () => { input.value = String(debt); } }, 'Todo ' + money(debt)), h('button', { type: 'button', class: 'category-pill', onclick: () => { input.value = String(Math.round(debt / 2)); } }, 'Mitad ' + money(Math.round(debt / 2)))), error, h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => {
                        const value = Number(input.value);
                        try {
                            const next = Store().addPayment(s(), { id: newId(), personId: p.id, amount: value, day: host.today() });
                            if (commit(next, `${value < debt ? 'Pago parcial' : 'Pago'} de ${money(value)} · ${p.name}`))
                                openAccount(p.id, false, back);
                        }
                        catch (e) {
                            error.textContent = e instanceof Error ? e.message : 'Revisa el monto.';
                        }
                    } }, 'Guardar pago'));
            }
            return [sheetHead(`${p.name} · ${p.num}`, p.employee ? p.role : 'Cliente · ' + p.role),
                h('div', { class: 'comida-total' }, h('span', { text: debt > 0 ? 'Debe' : 'Al día' }), h('b', { style: debt > 0 ? null : 'color: var(--success-color)' }, roll('acc' + p.id, money(Math.max(0, debt))))),
                h('div', { class: 'stats-filters comida-stats' }, statCard('Comprado', money(sum(mine, o => o.price))), statCard('Pagado', money(sum(paid, x => x.amount))), statCard('Platos', String(mine.length))),
                counts.size > 0 && [h('div', { class: 'comida-kicker', text: 'Lo que ha comprado' }), h('div', { class: 'comida-chips' }, [...counts.values()].sort((a, b) => b.n - a.n).map(c => h('span', { class: 'category-pill', text: `${c.label} × ${c.n}` })))],
                payBox,
                h('div', { class: 'comida-row' }, h('button', { type: 'button', class: 'btn-full btn-primary', disabled: debt <= 0, onclick: () => openAccount(p.id, !paying, back) }, paying ? 'Cancelar pago' : 'Registrar pago'), h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: () => messageSheet('Cuenta de ' + p.name, 'Para que la revise antes de pagar', () => accountText(p)) }, 'Enviar cuenta')),
                h('div', { class: 'comida-kicker', text: 'Movimientos' }),
                days.size ? h('div', { class: 'comida-panel' }, [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 40).map(([day, d]) => h('div', { class: 'comida-mrow' }, h('span', { text: shortDay(day) }), h('span', { text: d.bought.length ? summary(d.bought) : '' }), h('b', { text: d.bought.length ? money(sum(d.bought, o => o.price)) : '' }), h('b', { style: 'color: var(--success-color)', text: d.paid ? '-' + money(d.paid) : '' }))))
                    : h('div', { class: 'comida-empty', text: 'Sin movimientos.' }),
                back && h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: back }, 'Volver al calendario')];
        });
    }
    /* ── add (central + button inside Comida) ── */
    function openAdd() {
        const option = (iconName, title, text, run) => h('button', { type: 'button', class: 'export-option comida-option', onclick: run }, h('span', { class: 'comida-option-icon' }, icon(iconName)), h('span', {}, h('b', { text: title }), h('small', { text })));
        showSheet(() => [sheetHead('Agregar'),
            option('employees', 'Empleado', 'Se le toma asistencia. Igual que siempre en Mini.', () => { closeSheet(); setTimeout(() => host && host.addEmployee(), 280); }),
            option('food', 'Cliente', 'Compra comida y no se le toma asistencia', openNewClient),
            option('receipt', 'Compra de insumos', 'Registra lo que compras para la cocina', openPurchases)]);
    }
    function openNewClient() {
        showSheet(() => {
            const name = h('input', { class: 'search-input comida-field', id: 'comida-client-name', autocomplete: 'off' });
            const ref = h('input', { class: 'search-input comida-field', id: 'comida-client-ref', autocomplete: 'off', placeholder: 'Ej.: almacén, vecino, teléfono' });
            const next = 'C' + String(s().lastClientNumber + 1).padStart(2, '0');
            return [sheetHead('Nuevo cliente', `Recibirá el número ${next}. No se le toma asistencia.`),
                h('label', { class: 'comida-label', for: 'comida-client-name', text: 'Nombre' }), name,
                h('label', { class: 'comida-label', for: 'comida-client-ref', text: 'Referencia' }), ref,
                h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => {
                        if (attempt(() => Store().addClient(s(), { id: newId(), name: name.value, ref: ref.value }), `${name.value.trim()} agregado como ${next}`))
                            closeSheet();
                    } }, 'Agregar cliente')];
        });
    }
    /* ── public API ── */
    function render() {
        if (!host || !state)
            return;
        const tabs = h('div', { class: 'view-selector' }, h('div', { class: 'view-mode-pills' }, [['pedidos', 'Pedidos'], ['cocina', 'Cocina'], ['facturacion', 'Facturación']].map(([k, l]) => h('button', { type: 'button', class: 'view-btn' + (view.tab === k ? ' active' : ''), 'aria-pressed': String(view.tab === k), onclick: () => { view.tab = k; view.query = ''; render(); window.scrollTo(0, 0); } }, l))));
        const body = view.tab === 'cocina' ? renderCocina() : view.tab === 'facturacion' ? renderFacturacion() : renderPedidos();
        host.root.replaceChildren(tabs, h('div', { class: 'dashboard-panel comida-panel-wrap' }, body));
        host.applyIcons(host.root);
    }
    function init(options) {
        host = options;
        repo = g.ComidaRepository.createComidaRepository({ storage: options.storage, today: options.today, newId });
        state = repo.load();
        view.day = options.today();
    }
    function enter() {
        if (!host)
            return;
        if (view.day > host.today())
            view.day = host.today();
        render();
    }
    function navSlot() {
        return state ? state.navSlot : null;
    }
    function setNavSlot(slot) {
        if (!state)
            return;
        if (commit(Store().setNavSlot(state, slot)))
            host === null || host === void 0 ? void 0 : host.onNavSlotChange();
    }
    function hasDebt(personId) {
        return !!state && Store().hasDebt(state, String(personId));
    }
    function employeeFoodButton(employee) {
        if (!state)
            return null;
        const person = { id: String(employee.id), name: employee.name };
        const button = h('button', { type: 'button', class: 'export-btn comida-employee-toggle', 'aria-label': `Comida para ${person.name}` }, h('span', { class: 'ic comida-employee-icon', 'data-icon': 'food', 'data-icon-vector': true, 'aria-hidden': 'true' }));
        const isPaused = () => s().pausedPersonIds.includes(person.id);
        const update = () => {
            const paused = isPaused();
            button.setAttribute('aria-pressed', String(!paused));
            button.title = paused ? 'Reactivar en Comida' : 'Pausar en Comida';
        };
        button.addEventListener('click', () => {
            if (setPersonPaused(person, !isPaused()))
                update();
        });
        update();
        return button;
    }
    function exportBackup() {
        return state;
    }
    function importBackup(section) {
        if (!host)
            return;
        const next = g.ComidaRepository.parseBackup(section, host.today(), newId());
        commit(next);
    }
    // The bar space that used to hold Reportes shows an empty slot until the user picks.
    function chooseNavSlot() {
        const option = (slot, iconName, title, text) => h('button', { type: 'button', class: 'export-option comida-option', onclick: () => { setNavSlot(slot); host && host.openView(slot); } }, h('span', { class: 'comida-option-icon' }, icon(iconName)), h('span', {}, h('b', { text: title }), h('small', { text })));
        showSheet(() => [sheetHead('¿Qué quieres en este espacio?', 'Lo eliges una vez. Después se cambia desde Más.'),
            option('comida', 'food', 'Comida', 'Pedidos del día, cocina y facturación'),
            option('requests', 'requests', 'Reportes y Solicitudes', 'Lo que antes estaba en este lugar')]);
    }
    return { init, enter, render, openAdd, closeSheet, navSlot, setNavSlot, chooseNavSlot, hasDebt, employeeFoodButton, exportBackup, importBackup };
});
