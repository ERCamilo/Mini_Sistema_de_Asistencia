const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../comida-ledger.js');

const order = (id, personId, dishId, dishName, price, day) => ({ id, personId, dishId, dishName, price, day });
const pay = (id, personId, amount, day) => ({ id, personId, amount, day });

const orders = [
  order('o1', 'e1', 'd1', 'Pollo guisado', 250, '2026-11-02'),
  order('o2', 'e1', 'd4', 'Refresco', 50, '2026-11-02'),
  order('o3', 'e1', 'd2', 'Res guisada', 300, '2026-11-03'),
  order('o4', 'e2', 'd1', 'Pollo guisado', 250, '2026-11-03'),
  order('o5', 'e1', 'd1', 'Pollo guisado', 250, '2026-11-04')
];

test('balance is orders minus payments for one person', () => {
  assert.equal(Ledger.balance(orders, [], 'e1'), 850);
  assert.equal(Ledger.balance(orders, [pay('p1', 'e1', 300, '2026-11-05')], 'e1'), 550);
  assert.equal(Ledger.balance(orders, [pay('p1', 'e1', 300, '2026-11-05')], 'e2'), 250);
  assert.equal(Ledger.balance(orders, [], 'nobody'), 0);
});

test('pending account applies payments to the oldest orders first', () => {
  const account = Ledger.pendingAccount(orders, [pay('p1', 'e1', 400, '2026-11-05')], 'e1');
  // 400 covers o1 (250) and o2 (50), and 100 of o3 (300).
  assert.deepEqual(account.items.map(i => [i.order.id, i.remaining]), [['o3', 200], ['o5', 250]]);
  assert.equal(account.total, 450);
});

test('pending account is empty when everything is paid, and payments over the debt are ignored', () => {
  assert.deepEqual(Ledger.pendingAccount(orders, [pay('p1', 'e1', 850, '2026-11-05')], 'e1').items, []);
  assert.equal(Ledger.pendingAccount(orders, [pay('p1', 'e1', 900, '2026-11-05')], 'e1').total, 0);
});

test('pending account orders by day and then by insertion, not by id text', () => {
  const mixed = [order('b', 'e3', 'd1', 'Pollo', 100, '2026-11-05'), order('a', 'e3', 'd1', 'Pollo', 100, '2026-11-04')];
  assert.deepEqual(Ledger.pendingAccount(mixed, [pay('p', 'e3', 100, '2026-11-06')], 'e3').items.map(i => i.order.id), ['b']);
});

test('kitchen lines group the day by dish and price, in first-seen order', () => {
  const day = [
    order('a', 'e1', 'd1', 'Pollo guisado', 250, '2026-11-16'),
    order('b', 'e2', 'd2', 'Res guisada', 300, '2026-11-16'),
    order('c', 'e3', 'd1', 'Pollo guisado', 250, '2026-11-16'),
    order('d', 'e4', 'd1', 'Pollo guisado', 275, '2026-11-16'),
    order('e', 'e1', 'd1', 'Pollo guisado', 250, '2026-11-15')
  ];
  assert.deepEqual(Ledger.kitchenLines(day, '2026-11-16').map(l => [l.name, l.price, l.qty, l.total]), [
    ['Pollo guisado', 250, 2, 500],
    ['Res guisada', 300, 1, 300],
    ['Pollo guisado', 275, 1, 275]
  ]);
});

test('kitchen message lists numbered lines, notes and the total, with or without prices', () => {
  const day = [
    order('a', 'e1', 'd1', 'Pollo guisado', 250, '2026-11-16'),
    order('b', 'e2', 'd1', 'Pollo guisado', 250, '2026-11-16'),
    order('c', 'e2', 'd2', 'Res guisada', 300, '2026-11-16')
  ];
  const notes = [{ name: 'Juan Pérez', text: 'sin ensalada' }];
  assert.equal(
    Ledger.formatKitchenOrder(day, '2026-11-16', { dateLabel: 'Lunes 16 de noviembre de 2026', notes, withPrices: true }),
    '*Pedido de comida*\nLunes 16 de noviembre de 2026\n\n' +
    '1- Pollo guisado  RD$250 x 2 = RD$500\n2- Res guisada  RD$300 x 1 = RD$300\n\n' +
    'Notas:\n- Juan Pérez: sin ensalada\n\n*Total: 3 platos = RD$800*'
  );
  assert.equal(
    Ledger.formatKitchenOrder(day, '2026-11-16', { dateLabel: 'Lunes 16', notes: [], withPrices: false }),
    '*Pedido de comida*\nLunes 16\n\n1- Pollo guisado x 2\n2- Res guisada x 1\n\n*Total: 3 platos*'
  );
});

test('kitchen message says when the day has no orders', () => {
  assert.equal(
    Ledger.formatKitchenOrder([], '2026-11-16', { dateLabel: 'Lunes 16', notes: [], withPrices: true }),
    '*Pedido de comida*\nLunes 16\n\n(sin pedidos)\n\n*Total: 0 platos = RD$0*'
  );
});

test('money uses thousands separators and a minus sign for negatives', () => {
  assert.equal(Ledger.formatMoney(0), 'RD$0');
  assert.equal(Ledger.formatMoney(1250), 'RD$1,250');
  assert.equal(Ledger.formatMoney(1234567), 'RD$1,234,567');
  assert.equal(Ledger.formatMoney(-300), '-RD$300');
});

test('changes since sent compare composition, not only the plate count', () => {
  const sent = Ledger.orderSignature([order('a', 'e1', 'd1', 'Pollo', 250, 'D'), order('b', 'e2', 'd1', 'Pollo', 250, 'D')], 'D');
  const swapped = [order('a', 'e1', 'd1', 'Pollo', 250, 'D'), order('c', 'e2', 'd2', 'Res', 300, 'D')];
  const diff = Ledger.changesSinceSent(sent, swapped, 'D');
  assert.equal(diff.changed, true);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  const same = [order('x', 'e9', 'd1', 'Pollo', 250, 'D'), order('y', 'e8', 'd1', 'Pollo', 250, 'D')];
  assert.deepEqual(Ledger.changesSinceSent(sent, same, 'D'), { changed: false, added: 0, removed: 0 });
});

test('a price change for the same dish counts as a change', () => {
  const sent = Ledger.orderSignature([order('a', 'e1', 'd1', 'Pollo', 250, 'D')], 'D');
  assert.equal(Ledger.changesSinceSent(sent, [order('a', 'e1', 'd1', 'Pollo', 275, 'D')], 'D').changed, true);
});

test('closing a period includes today and opens the next one tomorrow', () => {
  const periods = [{ id: 'p1', start: '2026-10-27', end: null }];
  const next = Ledger.closePeriod(periods, '2026-11-16', 'p2');
  assert.deepEqual(next, [
    { id: 'p1', start: '2026-10-27', end: '2026-11-16' },
    { id: 'p2', start: '2026-11-17', end: null }
  ]);
  assert.deepEqual(periods[0].end, null, 'input is not mutated');
});

test('a period cannot be closed twice on the same day', () => {
  const periods = [{ id: 'p1', start: '2026-10-27', end: '2026-11-16' }, { id: 'p2', start: '2026-11-17', end: null }];
  assert.throws(() => Ledger.closePeriod(periods, '2026-11-16', 'p3'), /ya se cerró/);
});

test('the first period starts at the earliest day, and an existing open period is kept', () => {
  assert.deepEqual(Ledger.ensureOpenPeriod([], '2026-11-01', 'p1'), [{ id: 'p1', start: '2026-11-01', end: null }]);
  const periods = [{ id: 'p1', start: '2026-10-27', end: null }];
  assert.equal(Ledger.ensureOpenPeriod(periods, '2026-11-01', 'p2'), periods);
});

test('closing needs an open period', () => {
  assert.throws(() => Ledger.closePeriod([], '2026-11-16', 'p1'), /No hay un período abierto/);
});

test('days before the open period are locked', () => {
  const periods = [{ id: 'p1', start: '2026-10-27', end: '2026-11-16' }, { id: 'p2', start: '2026-11-17', end: null }];
  assert.equal(Ledger.isDayLocked(periods, '2026-11-16'), true);
  assert.equal(Ledger.isDayLocked(periods, '2026-11-17'), false);
  assert.equal(Ledger.isDayLocked([], '2020-01-01'), false);
});

test('period day count and reminder at 21 days', () => {
  const open = { id: 'p1', start: '2026-10-27', end: null };
  assert.equal(Ledger.periodDay(open, '2026-10-27'), 1);
  assert.equal(Ledger.periodDay(open, '2026-11-16'), 21);
  assert.equal(Ledger.shouldRemindClose(open, '2026-11-15'), false);
  assert.equal(Ledger.shouldRemindClose(open, '2026-11-16'), true);
});

test('period summary: sold, collected, purchases and profit = sold minus purchases', () => {
  const period = { id: 'p1', start: '2026-11-02', end: '2026-11-03' };
  const payments = [pay('p1', 'e1', 200, '2026-11-03'), pay('p2', 'e1', 100, '2026-11-05')];
  const purchases = [{ id: 'g1', amount: 400, day: '2026-11-02' }, { id: 'g2', amount: 999, day: '2026-11-04' }];
  assert.deepEqual(Ledger.periodSummary(orders, payments, purchases, period), { sold: 850, collected: 200, purchases: 400, profit: 450 });
});

test('rejects amounts that are not whole non-negative numbers', () => {
  assert.throws(() => Ledger.balance([order('x', 'e1', 'd1', 'P', 12.5, 'D')], [], 'e1'), /importe/);
  assert.throws(() => Ledger.balance([], [pay('x', 'e1', -1, 'D')], 'e1'), /importe/);
});
