// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaStore` (browser global consumed by index.html).
// State of the optional "Comida" section and the pure actions that change it.
// Every action returns a new state (never mutates its input) and throws a
// Spanish message the UI can show as is. Money rules live in ComidaLedger.

interface ComidaStoreOrder extends ComidaOrder {
  dishEmoji: string;
  cost: number;
}

interface ComidaStoreClient {
  id: string;
  num: string;
  name: string;
  ref: string;
}

interface ComidaStoreDish {
  id: string;
  name: string;
  emoji: string;
  price: number;
  cost: number;
  onMenu: boolean;
}

interface ComidaStoreCategory {
  id: string;
  name: string;
  emoji: string;
}

interface ComidaStorePurchase {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  amount: number;
  day: string;
  time: string;
}

type ComidaStoreNavSlot = 'requests' | 'comida' | null;

interface ComidaStoreState {
  schemaVersion: 1;
  navSlot: ComidaStoreNavSlot;
  withPrices: boolean;
  lastClientNumber: number;
  clients: ComidaStoreClient[];
  pausedPersonIds: string[];
  dishes: ComidaStoreDish[];
  categories: ComidaStoreCategory[];
  orders: ComidaStoreOrder[];
  notes: { [personDay: string]: string };
  payments: ComidaPayment[];
  purchases: ComidaStorePurchase[];
  periods: ComidaPeriod[];
  sent: { [day: string]: string };
}

interface ComidaStoreLedger {
  balance(orders: ComidaOrder[], payments: ComidaPayment[], personId: string): number;
  orderSignature(orders: ComidaOrder[], day: string): string;
  ensureOpenPeriod(periods: ComidaPeriod[], firstDay: string, id: string): ComidaPeriod[];
  closePeriod(periods: ComidaPeriod[], today: string, nextId: string): ComidaPeriod[];
  isDayLocked(periods: ComidaPeriod[], day: string): boolean;
}

(function exposeComidaStore(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ComidaStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createComidaStoreModule() {
  const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

  function ledger(): ComidaStoreLedger {
    const found = (globalThis as any).ComidaLedger;
    if (!found) throw new Error('ComidaLedger no está cargado.');
    return found;
  }

  function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  const isText = (v: unknown): v is string => typeof v === 'string';
  const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  const isDay = (v: unknown): v is string => isText(v) && DAY_KEY.test(v);
  const listOf = <T>(value: unknown, valid: (item: any) => boolean): T[] => (Array.isArray(value) ? value.filter(valid) : []);

  function emptyState(today: string, periodId: string): ComidaStoreState {
    return {
      schemaVersion: 1, navSlot: null, withPrices: true, lastClientNumber: 0,
      clients: [], pausedPersonIds: [], dishes: [], categories: [], orders: [], notes: {}, payments: [], purchases: [],
      periods: [{ id: periodId, start: today, end: null }], sent: {}
    };
  }

  const validOrder = (o: any) => isRecord(o) && isText(o.id) && isText(o.personId) && isText(o.dishId) && isText(o.dishName)
    && isText(o.dishEmoji) && isAmount(o.price) && isAmount(o.cost) && isDay(o.day);
  const validClient = (c: any) => isRecord(c) && isText(c.id) && isText(c.num) && isText(c.name) && isText(c.ref);
  const validDish = (d: any) => isRecord(d) && isText(d.id) && isText(d.name) && isText(d.emoji) && isAmount(d.price) && isAmount(d.cost) && typeof d.onMenu === 'boolean';
  const validCategory = (c: any) => isRecord(c) && isText(c.id) && isText(c.name) && isText(c.emoji);
  const validPayment = (p: any) => isRecord(p) && isText(p.id) && isText(p.personId) && isAmount(p.amount) && isDay(p.day);
  const validPurchase = (p: any) => isRecord(p) && isText(p.id) && isText(p.categoryId) && isText(p.categoryName) && isText(p.categoryEmoji)
    && isAmount(p.amount) && isDay(p.day) && isText(p.time);
  const validPeriod = (p: any) => isRecord(p) && isText(p.id) && isDay(p.start) && (p.end === null || isDay(p.end));

  function textMap(value: unknown): { [key: string]: string } {
    const out: { [key: string]: string } = {};
    if (isRecord(value)) for (const [k, v] of Object.entries(value)) if (isText(v)) out[k] = v;
    return out;
  }

  // Accepts whatever storage returned (object, JSON text, null) and repairs it.
  function normalizeState(raw: unknown, today: string, periodId: string): ComidaStoreState {
    let value: unknown = raw;
    if (isText(raw)) {
      try { value = JSON.parse(raw); } catch { value = null; }
    }
    const base = emptyState(today, periodId);
    if (!isRecord(value)) return base;
    const clients = listOf<ComidaStoreClient>(value.clients, validClient);
    const highest = clients.reduce((max, c) => Math.max(max, Number(c.num.slice(1)) || 0), 0);
    const periods = listOf<ComidaPeriod>(value.periods, validPeriod);
    return {
      schemaVersion: 1,
      navSlot: value.navSlot === 'requests' || value.navSlot === 'comida' ? value.navSlot : null,
      withPrices: value.withPrices !== false,
      lastClientNumber: Math.max(highest, isAmount(value.lastClientNumber) ? value.lastClientNumber : 0),
      clients,
      pausedPersonIds: [...new Set(listOf<string>(value.pausedPersonIds, id => isText(id) && id.trim() !== ''))],
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

  function requireName(name: string, what: string): string {
    const clean = String(name || '').trim();
    if (!clean) throw new Error(`Escribe el nombre ${what}.`);
    return clean;
  }

  function requireOpenDay(state: ComidaStoreState, day: string): void {
    if (ledger().isDayLocked(state.periods, day)) throw new Error('Ese día pertenece a un período cerrado.');
  }

  function addOrder(state: ComidaStoreState, input: { id: string; personId: string; dishId: string; day: string }): ComidaStoreState {
    requireOpenDay(state, input.day);
    if (state.pausedPersonIds.includes(input.personId)) throw new Error('Reactiva a esta persona en Comida para anotar su pedido.');
    const dish = state.dishes.find(d => d.id === input.dishId);
    if (!dish) throw new Error('Ese plato ya no existe.');
    const order: ComidaStoreOrder = {
      id: input.id, personId: input.personId, dishId: dish.id, dishName: dish.name, dishEmoji: dish.emoji,
      price: dish.price, cost: dish.cost, day: input.day
    };
    return { ...state, orders: [...state.orders, order] };
  }

  function removeLastOrder(state: ComidaStoreState, personId: string, day: string, dishId?: string): ComidaStoreState {
    requireOpenDay(state, day);
    let index = -1;
    state.orders.forEach((o, i) => { if (o.personId === personId && o.day === day && (!dishId || o.dishId === dishId)) index = i; });
    if (index < 0) return state;
    return { ...state, orders: state.orders.filter((_, i) => i !== index) };
  }

  function repeatLastOrder(state: ComidaStoreState, personId: string, day: string, newId: () => string): ComidaStoreState {
    const previous = state.orders.filter(o => o.personId === personId && o.day < day).map(o => o.day).sort().pop();
    if (!previous) throw new Error('No hay un pedido anterior para repetir.');
    return state.orders.filter(o => o.personId === personId && o.day === previous)
      .reduce((next, o) => addOrder(next, { id: newId(), personId, dishId: o.dishId, day }), state);
  }

  function setNote(state: ComidaStoreState, personId: string, day: string, text: string): ComidaStoreState {
    const notes = { ...state.notes };
    const clean = String(text || '').trim();
    if (clean) notes[personId + '@' + day] = clean;
    else delete notes[personId + '@' + day];
    return { ...state, notes };
  }

  function addClient(state: ComidaStoreState, input: { id: string; name: string; ref: string }): ComidaStoreState {
    const name = requireName(input.name, 'del cliente');
    const next = state.lastClientNumber + 1;
    const client: ComidaStoreClient = { id: input.id, num: 'C' + String(next).padStart(2, '0'), name, ref: String(input.ref || '').trim() };
    return { ...state, lastClientNumber: next, clients: [...state.clients, client] };
  }

  function setPersonPaused(state: ComidaStoreState, personId: string, paused: boolean): ComidaStoreState {
    if (state.pausedPersonIds.includes(personId) === paused) return state;
    const pausedPersonIds = paused
      ? [...state.pausedPersonIds, personId]
      : state.pausedPersonIds.filter(id => id !== personId);
    return { ...state, pausedPersonIds };
  }

  function saveDish(state: ComidaStoreState, input: { id: string; name: string; emoji: string; price: number; cost: number }): ComidaStoreState {
    const name = requireName(input.name, 'del plato');
    if (!Number.isInteger(input.price) || input.price <= 0) throw new Error('Escribe un precio mayor que cero, sin decimales.');
    if (!Number.isInteger(input.cost) || input.cost < 0 || input.cost >= input.price) throw new Error('El costo debe ser menor que el precio.');
    const existing = state.dishes.find(d => d.id === input.id);
    const dish: ComidaStoreDish = { id: input.id, name, emoji: input.emoji || '🍽️', price: input.price, cost: input.cost, onMenu: existing ? existing.onMenu : true };
    return { ...state, dishes: existing ? state.dishes.map(d => (d.id === input.id ? dish : d)) : [...state.dishes, dish] };
  }

  function setDishOnMenu(state: ComidaStoreState, dishId: string, onMenu: boolean): ComidaStoreState {
    return { ...state, dishes: state.dishes.map(d => (d.id === dishId ? { ...d, onMenu } : d)) };
  }

  function addCategory(state: ComidaStoreState, input: { id: string; name: string; emoji: string }): ComidaStoreState {
    const name = requireName(input.name, 'del insumo');
    if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error(`Ya existe «${name}».`);
    return { ...state, categories: [...state.categories, { id: input.id, name, emoji: input.emoji || '📦' }] };
  }

  function removeCategory(state: ComidaStoreState, categoryId: string): ComidaStoreState {
    return { ...state, categories: state.categories.filter(c => c.id !== categoryId) };
  }

  function savePurchase(state: ComidaStoreState, input: { id: string; categoryId: string; amount: number; day: string; time: string }): ComidaStoreState {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Escribe un monto mayor que cero.');
    const existing = state.purchases.find(p => p.id === input.id);
    const category = state.categories.find(c => c.id === input.categoryId)
      || (existing && existing.categoryId === input.categoryId ? { id: existing.categoryId, name: existing.categoryName, emoji: existing.categoryEmoji } : null);
    if (!category) throw new Error('Elige un insumo.');
    const purchase: ComidaStorePurchase = {
      id: input.id, categoryId: category.id, categoryName: category.name, categoryEmoji: category.emoji,
      amount: input.amount, day: input.day, time: input.time || ''
    };
    return { ...state, purchases: existing ? state.purchases.map(p => (p.id === input.id ? purchase : p)) : [...state.purchases, purchase] };
  }

  function removePurchase(state: ComidaStoreState, purchaseId: string): ComidaStoreState {
    return { ...state, purchases: state.purchases.filter(p => p.id !== purchaseId) };
  }

  function addPayment(state: ComidaStoreState, input: { id: string; personId: string; amount: number; day: string }): ComidaStoreState {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Escribe un monto mayor que cero.');
    const debt = ledger().balance(state.orders, state.payments, input.personId);
    if (input.amount > debt) throw new Error('El pago no puede pasar de lo que debe.');
    return { ...state, payments: [...state.payments, { id: input.id, personId: input.personId, amount: input.amount, day: input.day }] };
  }

  function markSent(state: ComidaStoreState, day: string): ComidaStoreState {
    return { ...state, sent: { ...state.sent, [day]: ledger().orderSignature(state.orders, day) } };
  }

  function closePeriod(state: ComidaStoreState, today: string, nextId: string): ComidaStoreState {
    return { ...state, periods: ledger().closePeriod(state.periods, today, nextId) };
  }

  function setNavSlot(state: ComidaStoreState, slot: string): ComidaStoreState {
    if (slot !== 'requests' && slot !== 'comida') throw new Error('Esa opción no puede ir en la barra.');
    return { ...state, navSlot: slot };
  }

  function setWithPrices(state: ComidaStoreState, withPrices: boolean): ComidaStoreState {
    return { ...state, withPrices: !!withPrices };
  }

  function hasDebt(state: ComidaStoreState, personId: string): boolean {
    return ledger().balance(state.orders, state.payments, personId) > 0;
  }

  return {
    emptyState, normalizeState, addOrder, removeLastOrder, repeatLastOrder, setNote, addClient, setPersonPaused, saveDish, setDishOnMenu,
    addCategory, removeCategory, savePurchase, removePurchase, addPayment, markSent, closePeriod, setNavSlot,
    setWithPrices, hasDebt
  };
});
