"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaStore` (browser global consumed by index.html).
// State of the optional "Comida" section and the pure actions that change it.
// Every action returns a new state (never mutates its input) and throws a
// Spanish message the UI can show as is. Money rules live in ComidaLedger.
(function exposeComidaStore(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.ComidaStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaStoreModule() {
    const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
    function ledger() {
        const found = globalThis.ComidaLedger;
        if (!found)
            throw new Error('ComidaLedger no está cargado.');
        return found;
    }
    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }
    const isText = (v) => typeof v === 'string';
    const isAmount = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    const isDay = (v) => isText(v) && DAY_KEY.test(v);
    const listOf = (value, valid) => (Array.isArray(value) ? value.filter(valid) : []);
    function emptyState(today, periodId) {
        return {
            schemaVersion: 1, navSlot: null, withPrices: true, lastClientNumber: 0,
            clients: [], pausedPersonIds: [], dishes: [], categories: [], orders: [], notes: {}, payments: [], purchases: [],
            periods: [{ id: periodId, start: today, end: null }], sent: {}
        };
    }
    const validOrder = (o) => isRecord(o) && isText(o.id) && isText(o.personId) && isText(o.dishId) && isText(o.dishName)
        && isText(o.dishEmoji) && isAmount(o.price) && isAmount(o.cost) && isDay(o.day);
    const validClient = (c) => isRecord(c) && isText(c.id) && isText(c.num) && isText(c.name) && isText(c.ref);
    const validDish = (d) => isRecord(d) && isText(d.id) && isText(d.name) && isText(d.emoji) && isAmount(d.price) && isAmount(d.cost) && typeof d.onMenu === 'boolean';
    const validCategory = (c) => isRecord(c) && isText(c.id) && isText(c.name) && isText(c.emoji);
    const validPayment = (p) => isRecord(p) && isText(p.id) && isText(p.personId) && isAmount(p.amount) && isDay(p.day);
    const validPurchase = (p) => isRecord(p) && isText(p.id) && isText(p.categoryId) && isText(p.categoryName) && isText(p.categoryEmoji)
        && isAmount(p.amount) && isDay(p.day) && isText(p.time);
    const validPeriod = (p) => isRecord(p) && isText(p.id) && isDay(p.start) && (p.end === null || isDay(p.end));
    function textMap(value) {
        const out = {};
        if (isRecord(value))
            for (const [k, v] of Object.entries(value))
                if (isText(v))
                    out[k] = v;
        return out;
    }
    // Accepts whatever storage returned (object, JSON text, null) and repairs it.
    function normalizeState(raw, today, periodId) {
        let value = raw;
        if (isText(raw)) {
            try {
                value = JSON.parse(raw);
            }
            catch {
                value = null;
            }
        }
        const base = emptyState(today, periodId);
        if (!isRecord(value))
            return base;
        const clients = listOf(value.clients, validClient);
        const highest = clients.reduce((max, c) => Math.max(max, Number(c.num.slice(1)) || 0), 0);
        const periods = listOf(value.periods, validPeriod);
        return {
            schemaVersion: 1,
            navSlot: value.navSlot === 'requests' || value.navSlot === 'comida' ? value.navSlot : null,
            withPrices: value.withPrices !== false,
            lastClientNumber: Math.max(highest, isAmount(value.lastClientNumber) ? value.lastClientNumber : 0),
            clients,
            pausedPersonIds: [...new Set(listOf(value.pausedPersonIds, id => isText(id) && id.trim() !== ''))],
            dishes: listOf(value.dishes, validDish),
            categories: listOf(value.categories, validCategory),
            orders: listOf(value.orders, validOrder),
            notes: textMap(value.notes),
            payments: listOf(value.payments, validPayment),
            purchases: listOf(value.purchases, validPurchase),
            periods: ledger().ensureOpenPeriod(periods, today, periodId),
            sent: textMap(value.sent)
        };
    }
    function requireName(name, what) {
        const clean = String(name || '').trim();
        if (!clean)
            throw new Error(`Escribe el nombre ${what}.`);
        return clean;
    }
    function requireOpenDay(state, day) {
        if (ledger().isDayLocked(state.periods, day))
            throw new Error('Ese día pertenece a un período cerrado.');
    }
    function addOrder(state, input) {
        requireOpenDay(state, input.day);
        if (state.pausedPersonIds.includes(input.personId))
            throw new Error('Reactiva a esta persona en Comida para anotar su pedido.');
        const dish = state.dishes.find(d => d.id === input.dishId);
        if (!dish)
            throw new Error('Ese plato ya no existe.');
        const order = {
            id: input.id, personId: input.personId, dishId: dish.id, dishName: dish.name, dishEmoji: dish.emoji,
            price: dish.price, cost: dish.cost, day: input.day
        };
        const open = state.periods.find(period => period.end === null);
        const periods = open && input.day < open.start
            ? state.periods.map(period => period === open ? { ...period, start: input.day } : period)
            : state.periods;
        return { ...state, periods, orders: [...state.orders, order] };
    }
    function removeLastOrder(state, personId, day, dishId) {
        requireOpenDay(state, day);
        let index = -1;
        state.orders.forEach((o, i) => { if (o.personId === personId && o.day === day && (!dishId || o.dishId === dishId))
            index = i; });
        if (index < 0)
            return state;
        return { ...state, orders: state.orders.filter((_, i) => i !== index) };
    }
    function setHistoricPrices(state, personId, day, today, prices) {
        requireOpenDay(state, day);
        if (day >= today)
            throw new Error('Elige una fecha anterior para corregir el precio histórico.');
        const updates = new Map();
        for (const entry of prices) {
            if (!Number.isSafeInteger(entry.price) || entry.price < 0)
                throw new Error('Escribe un precio entero de cero o más.');
            const order = state.orders.find(item => item.id === entry.id && item.day === day && item.personId === personId);
            if (!order || order.price !== entry.previous)
                throw new Error('El pedido cambió. Vuelve a abrirlo para revisar sus precios.');
            if (order.price !== entry.price)
                updates.set(order.id, entry.price);
        }
        if (!updates.size)
            return state;
        return { ...state, orders: state.orders.map(order => {
                const price = updates.get(order.id);
                return order.day === day && order.personId === personId && price !== undefined ? { ...order, price } : order;
            }) };
    }
    function repeatLastOrder(state, personId, day, newId) {
        const previous = state.orders.filter(o => o.personId === personId && o.day < day).map(o => o.day).sort().pop();
        if (!previous)
            throw new Error('No hay un pedido anterior para repetir.');
        return state.orders.filter(o => o.personId === personId && o.day === previous)
            .reduce((next, o) => addOrder(next, { id: newId(), personId, dishId: o.dishId, day }), state);
    }
    function setNote(state, personId, day, text) {
        requireOpenDay(state, day);
        const notes = { ...state.notes };
        const clean = String(text || '').trim();
        if ((notes[personId + '@' + day] || '') === clean)
            return state;
        if (clean)
            notes[personId + '@' + day] = clean;
        else
            delete notes[personId + '@' + day];
        return { ...state, notes };
    }
    function addClient(state, input) {
        const name = requireName(input.name, 'del cliente');
        const next = state.lastClientNumber + 1;
        const client = { id: input.id, num: 'C' + String(next).padStart(2, '0'), name, ref: String(input.ref || '').trim() };
        return { ...state, lastClientNumber: next, clients: [...state.clients, client] };
    }
    function setPersonPaused(state, personId, paused) {
        if (state.pausedPersonIds.includes(personId) === paused)
            return state;
        const pausedPersonIds = paused
            ? [...state.pausedPersonIds, personId]
            : state.pausedPersonIds.filter(id => id !== personId);
        return { ...state, pausedPersonIds };
    }
    function saveDish(state, input) {
        const name = requireName(input.name, 'del plato');
        if (!Number.isInteger(input.price) || input.price <= 0)
            throw new Error('Escribe un precio mayor que cero, sin decimales.');
        if (!Number.isInteger(input.cost) || input.cost < 0 || input.cost >= input.price)
            throw new Error('El costo debe ser menor que el precio.');
        const existing = state.dishes.find(d => d.id === input.id);
        const dish = { id: input.id, name, emoji: input.emoji || '🍽️', price: input.price, cost: input.cost, onMenu: existing ? existing.onMenu : true };
        return { ...state, dishes: existing ? state.dishes.map(d => (d.id === input.id ? dish : d)) : [...state.dishes, dish] };
    }
    function setDishOnMenu(state, dishId, onMenu) {
        return { ...state, dishes: state.dishes.map(d => (d.id === dishId ? { ...d, onMenu } : d)) };
    }
    function addCategory(state, input) {
        const name = requireName(input.name, 'del insumo');
        if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase()))
            throw new Error(`Ya existe «${name}».`);
        return { ...state, categories: [...state.categories, { id: input.id, name, emoji: input.emoji || '📦' }] };
    }
    function removeCategory(state, categoryId) {
        return { ...state, categories: state.categories.filter(c => c.id !== categoryId) };
    }
    function savePurchase(state, input) {
        if (!Number.isInteger(input.amount) || input.amount <= 0)
            throw new Error('Escribe un monto mayor que cero.');
        const existing = state.purchases.find(p => p.id === input.id);
        const category = state.categories.find(c => c.id === input.categoryId)
            || (existing && existing.categoryId === input.categoryId ? { id: existing.categoryId, name: existing.categoryName, emoji: existing.categoryEmoji } : null);
        if (!category)
            throw new Error('Elige un insumo.');
        const purchase = {
            id: input.id, categoryId: category.id, categoryName: category.name, categoryEmoji: category.emoji,
            amount: input.amount, day: input.day, time: input.time || ''
        };
        return { ...state, purchases: existing ? state.purchases.map(p => (p.id === input.id ? purchase : p)) : [...state.purchases, purchase] };
    }
    function removePurchase(state, purchaseId) {
        return { ...state, purchases: state.purchases.filter(p => p.id !== purchaseId) };
    }
    function addPayment(state, input) {
        if (!Number.isInteger(input.amount) || input.amount <= 0)
            throw new Error('Escribe un monto mayor que cero.');
        const debt = ledger().balance(state.orders, state.payments, input.personId);
        if (input.amount > debt)
            throw new Error('El pago no puede pasar de lo que debe.');
        return { ...state, payments: [...state.payments, { id: input.id, personId: input.personId, amount: input.amount, day: input.day }] };
    }
    function markSent(state, day, signature = ledger().orderSignature(state.orders, day)) {
        requireOpenDay(state, day);
        return { ...state, sent: { ...state.sent, [day]: signature } };
    }
    function closePeriod(state, today, nextId) {
        return { ...state, periods: ledger().closePeriod(state.periods, today, nextId) };
    }
    function setNavSlot(state, slot) {
        if (slot !== 'requests' && slot !== 'comida')
            throw new Error('Esa opción no puede ir en la barra.');
        return { ...state, navSlot: slot };
    }
    function setWithPrices(state, withPrices) {
        return { ...state, withPrices: !!withPrices };
    }
    function hasDebt(state, personId) {
        return ledger().balance(state.orders, state.payments, personId) > 0;
    }
    return {
        emptyState, normalizeState, addOrder, removeLastOrder, setHistoricPrices, repeatLastOrder, setNote, addClient, setPersonPaused, saveDish, setDishOnMenu,
        addCategory, removeCategory, savePurchase, removePurchase, addPayment, markSent, closePeriod, setNavSlot,
        setWithPrices, hasDebt
    };
});
