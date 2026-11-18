const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../comida-ledger.js');
const Store = require('../comida-store.js');

const base = () => {
  let s = Store.emptyState('2026-11-01', 'per1');
  s = Store.saveDish(s, { id: 'd1', name: 'Pollo guisado', emoji: '🍗', price: 250, cost: 140 });
  s = Store.saveDish(s, { id: 'd2', name: 'Res guisada', emoji: '🥩', price: 300, cost: 180 });
  return s;
};

test('empty state has one open period and nothing else', () => {
  const s = Store.emptyState('2026-11-01', 'per1');
  assert.equal(s.schemaVersion, 1);
  assert.deepEqual(s.periods, [{ id: 'per1', start: '2026-11-01', end: null }]);
  assert.deepEqual([s.clients, s.dishes, s.categories, s.orders, s.payments, s.purchases], [[], [], [], [], [], []]);
  assert.equal(s.navSlot, null);
  assert.equal(s.withPrices, true);
});

test('normalize repairs missing or broken data without throwing', () => {
  const fixed = Store.normalizeState({ orders: 'x', dishes: [{ id: 'd1', name: 'Pollo', emoji: '🍗', price: 250, cost: 100, onMenu: true }, { bad: true }], navSlot: 'nope' }, '2026-11-16', 'p9');
  assert.equal(fixed.dishes.length, 1);
  assert.deepEqual(fixed.orders, []);
  assert.equal(fixed.navSlot, null);
  assert.deepEqual(fixed.periods, [{ id: 'p9', start: '2026-11-16', end: null }]);
  assert.equal(Store.normalizeState(null, '2026-11-16', 'p9').schemaVersion, 1);
  assert.equal(Store.normalizeState('{bad json', '2026-11-16', 'p9').orders.length, 0);
});

test('normalize keeps valid data as it is', () => {
  const s = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  assert.deepEqual(Store.normalizeState(JSON.parse(JSON.stringify(s)), '2026-11-16', 'x'), s);
});

test('food pauses survive normalization and keep orders and balances', () => {
  const previous = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  assert.deepEqual(Store.normalizeState({ ...previous, pausedPersonIds: undefined }, '2026-11-16', 'x').pausedPersonIds, []);
  const paused = Store.setPersonPaused(previous, 'e1', true);
  assert.deepEqual(previous.pausedPersonIds, []);
  assert.equal(Store.setPersonPaused(paused, 'e1', true), paused);
  const restored = Store.normalizeState({ ...paused, pausedPersonIds: ['e1', null, 'e1', '', 'c1'] }, '2026-11-16', 'x');
  assert.deepEqual(restored.pausedPersonIds, ['e1', 'c1']);
  assert.deepEqual(restored.orders, previous.orders);
  assert.equal(Store.hasDebt(restored, 'e1'), true);
  assert.deepEqual(Store.setPersonPaused(restored, 'e1', false).pausedPersonIds, ['c1']);
});

test('a paused person must be reactivated before receiving new orders', () => {
  const order = { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' };
  const previous = Store.addOrder(base(), order);
  const paused = Store.setPersonPaused(previous, 'e1', true);
  assert.throws(() => Store.addOrder(paused, { ...order, id: 'o2' }), /reactiva/i);
  assert.throws(() => Store.repeatLastOrder(paused, 'e1', '2026-11-03', () => 'o2'), /reactiva/i);
  assert.equal(Store.removeLastOrder(paused, 'e1', order.day).orders.length, 0);
  assert.equal(Store.addOrder(Store.setPersonPaused(paused, 'e1', false), { ...order, id: 'o2' }).orders.length, 2);
});

test('an order freezes the dish name, icon, price and cost of that moment', () => {
  let s = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  s = Store.saveDish(s, { id: 'd1', name: 'Pollo al horno', emoji: '🍗', price: 275, cost: 150 });
  assert.deepEqual(s.orders[0], { id: 'o1', personId: 'e1', dishId: 'd1', dishName: 'Pollo guisado', dishEmoji: '🍗', price: 250, cost: 140, day: '2026-11-02' });
  assert.equal(s.dishes[0].price, 275);
});

test('removeLastOrder takes away the most recent plate of that person and day', () => {
  let s = base();
  s = Store.addOrder(s, { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  s = Store.addOrder(s, { id: 'o2', personId: 'e1', dishId: 'd2', day: '2026-11-02' });
  s = Store.addOrder(s, { id: 'o3', personId: 'e1', dishId: 'd1', day: '2026-11-03' });
  assert.deepEqual(Store.removeLastOrder(s, 'e1', '2026-11-02').orders.map(o => o.id), ['o1', 'o3']);
  assert.deepEqual(Store.removeLastOrder(s, 'e1', '2026-11-02', 'd1').orders.map(o => o.id), ['o2', 'o3']);
  assert.equal(Store.removeLastOrder(s, 'e9', '2026-11-02'), s, 'nothing to remove keeps the same state');
});

test('orders on days of a closed period are refused', () => {
  let s = Store.closePeriod(base(), '2026-11-10', 'per2');
  assert.throws(() => Store.addOrder(s, { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-10' }), /cerrado/);
  assert.throws(() => Store.removeLastOrder(s, 'e1', '2026-11-10'), /cerrado/);
  s = Store.addOrder(s, { id: 'o2', personId: 'e1', dishId: 'd1', day: '2026-11-11' });
  assert.equal(s.orders.length, 1);
});

test('a backdated order extends the first period and is included in its sales', () => {
  const previous = base();
  const earlier = { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-10-28' };
  const backfilled = Store.addOrder(previous, earlier);
  assert.equal(backfilled.periods[0].start, earlier.day);
  assert.equal(previous.periods[0].start, '2026-11-01');
  assert.equal(Ledger.periodSummary(backfilled.orders, [], [], backfilled.periods[0]).sold, 250);
  const restored = Store.normalizeState(JSON.stringify(backfilled), '2026-11-03', 'ignored');
  assert.deepEqual(restored, backfilled);
  const closed = Store.closePeriod(restored, '2026-11-03', 'next');
  assert.throws(() => Store.addOrder(closed, { ...earlier, id: 'o2' }), /cerrado/);
  assert.throws(() => Store.addOrder(closed, { ...earlier, id: 'o2', day: '2026-10-27' }), /cerrado/);
});

test('an order needs a dish that exists', () => {
  assert.throws(() => Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'dX', day: '2026-11-02' }), /plato/);
});

test('repeatLastOrder copies the previous day the person ordered, at today prices', () => {
  let s = base();
  s = Store.addOrder(s, { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  s = Store.addOrder(s, { id: 'o2', personId: 'e1', dishId: 'd2', day: '2026-11-02' });
  s = Store.saveDish(s, { id: 'd1', name: 'Pollo guisado', emoji: '🍗', price: 260, cost: 140 });
  let n = 0;
  s = Store.repeatLastOrder(s, 'e1', '2026-11-04', () => 'r' + (++n));
  assert.deepEqual(s.orders.filter(o => o.day === '2026-11-04').map(o => [o.id, o.dishId, o.price]), [['r1', 'd1', 260], ['r2', 'd2', 300]]);
  assert.throws(() => Store.repeatLastOrder(Store.emptyState('2026-11-01', 'p'), 'e1', '2026-11-04', () => 'x'), /pedido anterior/);
});

test('notes are kept per person and day, and an empty note is removed', () => {
  let s = Store.setNote(base(), 'e1', '2026-11-02', '  sin ensalada ');
  assert.equal(s.notes['e1@2026-11-02'], 'sin ensalada');
  s = Store.setNote(s, 'e1', '2026-11-02', '   ');
  assert.equal('e1@2026-11-02' in s.notes, false);
});

test('clients get their own C01, C02 numbering', () => {
  let s = Store.addClient(base(), { id: 'c1', name: 'Pedro Almonte', ref: 'Almacén' });
  s = Store.addClient(s, { id: 'c2', name: 'Rosa', ref: '' });
  assert.deepEqual(s.clients.map(c => c.num), ['C01', 'C02']);
  assert.throws(() => Store.addClient(s, { id: 'c3', name: '  ', ref: '' }), /nombre/);
});

test('client numbers keep counting after one is removed', () => {
  let s = Store.addClient(base(), { id: 'c1', name: 'A', ref: '' });
  s = Store.addClient(s, { id: 'c2', name: 'B', ref: '' });
  s = { ...s, clients: s.clients.filter(c => c.id !== 'c2') };
  assert.equal(Store.addClient(s, { id: 'c3', name: 'C', ref: '' }).clients[1].num, 'C03');
});

test('dishes need a name, a whole price above zero and a cost below the price', () => {
  assert.throws(() => Store.saveDish(base(), { id: 'd3', name: '', emoji: '🍚', price: 100, cost: 0 }), /nombre/);
  assert.throws(() => Store.saveDish(base(), { id: 'd3', name: 'Arroz', emoji: '🍚', price: 0, cost: 0 }), /precio/);
  assert.throws(() => Store.saveDish(base(), { id: 'd3', name: 'Arroz', emoji: '🍚', price: 100, cost: 100 }), /costo/);
  const s = Store.saveDish(base(), { id: 'd3', name: 'Arroz', emoji: '🍚', price: 100, cost: 40 });
  assert.equal(s.dishes[2].onMenu, true);
  assert.equal(Store.setDishOnMenu(s, 'd3', false).dishes[2].onMenu, false);
});

test('insumos are created by the user, unique by name, and can be deleted', () => {
  let s = Store.addCategory(base(), { id: 'k1', name: 'Carnes', emoji: '🥩' });
  assert.throws(() => Store.addCategory(s, { id: 'k2', name: ' carnes ', emoji: '🍗' }), /Ya existe/);
  assert.throws(() => Store.addCategory(s, { id: 'k2', name: '', emoji: '🍗' }), /nombre/);
  s = Store.addCategory(s, { id: 'k2', name: 'Gas', emoji: '🔥' });
  assert.deepEqual(Store.removeCategory(s, 'k1').categories.map(c => c.id), ['k2']);
});

test('a purchase keeps the insumo name and icon, so deleting the insumo keeps the history', () => {
  let s = Store.addCategory(base(), { id: 'k1', name: 'Carnes', emoji: '🥩' });
  s = Store.savePurchase(s, { id: 'g1', categoryId: 'k1', amount: 1200, day: '2026-11-02', time: '09:15' });
  s = Store.removeCategory(s, 'k1');
  assert.deepEqual(s.purchases[0], { id: 'g1', categoryId: 'k1', categoryName: 'Carnes', categoryEmoji: '🥩', amount: 1200, day: '2026-11-02', time: '09:15' });
});

test('editing a purchase changes amount and insumo, and purchases can be removed', () => {
  let s = Store.addCategory(base(), { id: 'k1', name: 'Carnes', emoji: '🥩' });
  s = Store.addCategory(s, { id: 'k2', name: 'Gas', emoji: '🔥' });
  s = Store.savePurchase(s, { id: 'g1', categoryId: 'k1', amount: 1200, day: '2026-11-02', time: '09:15' });
  s = Store.savePurchase(s, { id: 'g1', categoryId: 'k2', amount: 950, day: '2026-11-02', time: '09:15' });
  assert.deepEqual([s.purchases.length, s.purchases[0].categoryName, s.purchases[0].amount], [1, 'Gas', 950]);
  assert.throws(() => Store.savePurchase(s, { id: 'g2', categoryId: 'k2', amount: 0, day: '2026-11-02', time: '' }), /monto/);
  assert.throws(() => Store.savePurchase(s, { id: 'g2', categoryId: 'kX', amount: 10, day: '2026-11-02', time: '' }), /insumo/);
  assert.equal(Store.removePurchase(s, 'g1').purchases.length, 0);
});

test('editing a purchase whose insumo was deleted keeps its stored name', () => {
  let s = Store.addCategory(base(), { id: 'k1', name: 'Carnes', emoji: '🥩' });
  s = Store.savePurchase(s, { id: 'g1', categoryId: 'k1', amount: 1200, day: '2026-11-02', time: '' });
  s = Store.removeCategory(s, 'k1');
  s = Store.savePurchase(s, { id: 'g1', categoryId: 'k1', amount: 1000, day: '2026-11-02', time: '' });
  assert.deepEqual([s.purchases[0].categoryName, s.purchases[0].amount], ['Carnes', 1000]);
});

test('payments are cash, whole, above zero and never more than the debt', () => {
  let s = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  assert.throws(() => Store.addPayment(s, { id: 'p1', personId: 'e1', amount: 300, day: '2026-11-03' }), /debe/);
  assert.throws(() => Store.addPayment(s, { id: 'p1', personId: 'e1', amount: 0, day: '2026-11-03' }), /monto/);
  s = Store.addPayment(s, { id: 'p1', personId: 'e1', amount: 100, day: '2026-11-03' });
  assert.equal(s.payments.length, 1);
});

test('marking the order as sent stores what the kitchen received', () => {
  let s = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  s = Store.markSent(s, '2026-11-02');
  assert.equal(s.sent['2026-11-02'], 'd1@250');
});

test('closing a period goes through the ledger rules', () => {
  const s = Store.closePeriod(base(), '2026-11-10', 'per2');
  assert.deepEqual(s.periods.map(p => [p.start, p.end]), [['2026-11-01', '2026-11-10'], ['2026-11-11', null]]);
  assert.throws(() => Store.closePeriod(s, '2026-11-10', 'per3'), /ya se cerró/);
});

test('nav slot accepts only requests or comida, and withPrices is a boolean', () => {
  assert.equal(Store.setNavSlot(base(), 'comida').navSlot, 'comida');
  assert.equal(Store.setNavSlot(base(), 'requests').navSlot, 'requests');
  assert.throws(() => Store.setNavSlot(base(), 'otro'), /barra/);
  assert.equal(Store.setWithPrices(base(), false).withPrices, false);
});

test('a person with pending debt is reported, so the employee cannot be deleted', () => {
  const s = Store.addOrder(base(), { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  assert.equal(Store.hasDebt(s, 'e1'), true);
  assert.equal(Store.hasDebt(s, 'e2'), false);
});

test('actions never mutate the state they receive', () => {
  const s = base();
  const frozen = JSON.stringify(s);
  Store.addOrder(s, { id: 'o1', personId: 'e1', dishId: 'd1', day: '2026-11-02' });
  Store.addClient(s, { id: 'c1', name: 'A', ref: '' });
  Store.addCategory(s, { id: 'k1', name: 'Carnes', emoji: '🥩' });
  Store.closePeriod(s, '2026-11-10', 'per2');
  assert.equal(JSON.stringify(s), frozen);
});
