"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaLedger` (browser global consumed by index.html).
// Pure money rules for the optional "Comida" section: balances, the pending
// account (payments settle the oldest orders first), the kitchen message,
// changes since the order was sent, and billing periods. No DOM, no storage.
(function exposeComidaLedger(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.ComidaLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaLedgerModule() {
    const REMIND_AFTER_DAYS = 21;
    const DAY_MS = 86400000;
    function checkAmount(value) {
        if (!Number.isInteger(value) || value < 0)
            throw new Error('El importe debe ser un número entero positivo.');
        return value;
    }
    function sumOf(items, pick) {
        return items.reduce((total, item) => total + checkAmount(pick(item)), 0);
    }
    function balance(orders, payments, personId) {
        const bought = sumOf(orders.filter(o => o.personId === personId), o => o.price);
        const paid = sumOf(payments.filter(p => p.personId === personId), p => p.amount);
        return bought - paid;
    }
    function accountBalances(orders, payments) {
        const balances = new Map();
        for (const order of orders)
            balances.set(order.personId, (balances.get(order.personId) || 0) + checkAmount(order.price));
        for (const payment of payments)
            balances.set(payment.personId, (balances.get(payment.personId) || 0) - checkAmount(payment.amount));
        return balances;
    }
    // Oldest day first; orders of the same day keep the order they were entered in.
    function oldestFirst(orders) {
        return orders.map((order, index) => ({ order, index }))
            .sort((a, b) => (a.order.day < b.order.day ? -1 : a.order.day > b.order.day ? 1 : a.index - b.index))
            .map(entry => entry.order);
    }
    function pendingAccount(orders, payments, personId) {
        let credit = sumOf(payments.filter(p => p.personId === personId), p => p.amount);
        const items = [];
        for (const order of oldestFirst(orders.filter(o => o.personId === personId))) {
            const price = checkAmount(order.price);
            const covered = Math.min(credit, price);
            credit -= covered;
            if (price - covered > 0)
                items.push({ order, remaining: price - covered });
        }
        return { items, total: items.reduce((total, item) => total + item.remaining, 0) };
    }
    function kitchenLines(orders, day) {
        const lines = new Map();
        for (const order of orders) {
            if (order.day !== day)
                continue;
            const price = checkAmount(order.price);
            const key = order.dishId + '@' + price;
            const line = lines.get(key) || { dishId: order.dishId, name: order.dishName, price, qty: 0, total: 0 };
            line.qty += 1;
            line.total += price;
            lines.set(key, line);
        }
        return [...lines.values()];
    }
    function formatMoney(amount) {
        const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (amount < 0 ? '-' : '') + 'RD$' + digits;
    }
    function formatKitchenOrder(orders, day, options) {
        const lines = kitchenLines(orders, day);
        const plates = lines.reduce((total, line) => total + line.qty, 0);
        const amount = lines.reduce((total, line) => total + line.total, 0);
        const body = lines.length
            ? lines.map((line, i) => options.withPrices
                ? `${i + 1}- ${line.name}  ${formatMoney(line.price)} x ${line.qty} = ${formatMoney(line.total)}`
                : `${i + 1}- ${line.name} x ${line.qty}`).join('\n')
            : '(sin pedidos)';
        const notes = options.notes.length ? '\n\nNotas:\n' + options.notes.map(n => `- ${n.name}: ${n.text}`).join('\n') : '';
        const total = `*Total: ${plates} platos${options.withPrices ? ' = ' + formatMoney(amount) : ''}*`;
        return `*Pedido de comida*\n${options.dateLabel}\n\n${body}${notes}\n\n${total}`;
    }
    // Canonical text of what the kitchen received: one "dish@price" entry per plate, sorted.
    function orderSignature(orders, day) {
        return orders.filter(o => o.day === day).map(o => o.dishId + '@' + checkAmount(o.price)).sort().join('|');
    }
    function countEntries(signature) {
        const counts = new Map();
        for (const entry of signature ? signature.split('|') : [])
            counts.set(entry, (counts.get(entry) || 0) + 1);
        return counts;
    }
    function kitchenSignature(orders, day, notes) {
        return JSON.stringify([orderSignature(orders, day), notes.map(({ name, text }) => JSON.stringify([name, text])).sort()]);
    }
    function changesSinceSent(sentSignature, orders, day, notes) {
        let previousOrders = sentSignature;
        let previousNotes = [];
        if (sentSignature.startsWith('[')) {
            try {
                const [savedOrders, savedNotes] = JSON.parse(sentSignature);
                if (typeof savedOrders === 'string' && Array.isArray(savedNotes)) {
                    previousOrders = savedOrders;
                    previousNotes = savedNotes;
                }
            }
            catch { /* legacy signatures are not JSON */ }
        }
        const before = countEntries(previousOrders);
        const now = countEntries(orderSignature(orders, day));
        let added = 0;
        let removed = 0;
        for (const key of new Set([...before.keys(), ...now.keys()])) {
            const delta = (now.get(key) || 0) - (before.get(key) || 0);
            if (delta > 0)
                added += delta;
            else
                removed -= delta;
        }
        const currentNotes = notes === null || notes === void 0 ? void 0 : notes.map(({ name, text }) => JSON.stringify([name, text])).sort();
        const notesChanged = currentNotes && JSON.stringify(previousNotes) !== JSON.stringify(currentNotes);
        return { changed: added + removed > 0 || !!notesChanged, added, removed, ...(notesChanged ? { notesChanged } : {}) };
    }
    function addDays(day, amount) {
        const [year, month, date] = day.split('-').map(Number);
        const next = new Date(year, month - 1, date + amount, 12);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }
    function openPeriod(periods) {
        return periods.find(p => p.end === null) || null;
    }
    function ensureOpenPeriod(periods, firstDay, id) {
        return openPeriod(periods) ? periods : [...periods, { id, start: firstDay, end: null }];
    }
    // The close includes today; the next period starts tomorrow.
    function closePeriod(periods, today, nextId) {
        const open = openPeriod(periods);
        if (!open)
            throw new Error('No hay un período abierto para cerrar.');
        if (open.start > today)
            throw new Error('El período de hoy ya se cerró.');
        return [
            ...periods.map(p => (p === open ? { ...p, end: today } : p)),
            { id: nextId, start: addDays(today, 1), end: null }
        ];
    }
    function isDayLocked(periods, day) {
        const open = openPeriod(periods);
        return !!open && day < open.start && periods.some(period => period.end !== null);
    }
    function periodDay(period, today) {
        const [y1, m1, d1] = period.start.split('-').map(Number);
        const [y2, m2, d2] = today.split('-').map(Number);
        return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS) + 1;
    }
    function shouldRemindClose(period, today) {
        return period.end === null && periodDay(period, today) >= REMIND_AFTER_DAYS;
    }
    function periodSummary(orders, payments, purchases, period) {
        const inside = (day) => day >= period.start && (period.end === null || day <= period.end);
        const sold = sumOf(orders.filter(o => inside(o.day)), o => o.price);
        const collected = sumOf(payments.filter(p => inside(p.day)), p => p.amount);
        const spent = sumOf(purchases.filter(p => inside(p.day)), p => p.amount);
        return { sold, collected, purchases: spent, profit: sold - spent };
    }
    function dailySales(orders, clientIds, firstDay, lastDay) {
        const byDay = new Map();
        for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
            byDay.set(day, { day, clients: 0, staff: 0 });
        }
        for (const order of orders) {
            const sale = byDay.get(order.day);
            if (!sale)
                continue;
            const group = clientIds.has(order.personId) ? 'clients' : 'staff';
            sale[group] += checkAmount(order.price);
        }
        return [...byDay.values()];
    }
    function weeklySales(days) {
        const weeks = [];
        for (const day of days) {
            const week = weeks[weeks.length - 1];
            if (!week || new Date(day.day + 'T12:00:00Z').getUTCDay() === 1) {
                weeks.push({ ...day, end: day.day });
            }
            else {
                week.end = day.day;
                week.clients += day.clients;
                week.staff += day.staff;
            }
        }
        return weeks;
    }
    return {
        REMIND_AFTER_DAYS, balance, accountBalances, pendingAccount, kitchenLines, formatMoney, formatKitchenOrder,
        orderSignature, kitchenSignature, changesSinceSent, ensureOpenPeriod, closePeriod, isDayLocked, periodDay,
        shouldRemindClose, periodSummary, dailySales, weeklySales
    };
});
