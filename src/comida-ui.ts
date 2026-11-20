// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ComidaUI` (browser global consumed by index.html).
// Screens of the optional "Comida" section: Pedidos, Cocina and Facturación,
// plus its sheets. index.html only wires the host callbacks; state changes go
// through ComidaStore and money rules through ComidaLedger.

interface ComidaUiEmployee {
  id: string;
  number?: string | number;
  name: string;
  position?: string;
  paused?: boolean;
}

interface ComidaUiHost {
  root: HTMLElement;
  sheet: HTMLElement;
  storage: Storage;
  today(): string;
  getEmployees(all?: boolean): ComidaUiEmployee[];
  isPresent(employeeId: string, day: string): boolean;
  showToast(message: string): void;
  confirm(message: string, options: { title: string; confirmText: string; danger?: boolean }): Promise<boolean>;
  openSheet(): void;
  closeSheet(): void;
  isSheetOpen(): boolean;
  openDatePicker(day: string, onPick: (day: string) => void): void;
  applyIcons(container: HTMLElement): void;
  addEmployee(): void;
  onNavSlotChange(): void;
  openView(view: 'requests' | 'comida'): void;
}

interface ComidaUiPerson {
  id: string;
  num: string;
  name: string;
  role: string;
  employee: boolean;
  paused: boolean;
  attendancePaused: boolean;
}

type ComidaUiChild = Node | string | number | null | undefined | false | ComidaUiChild[];
type ComidaUiMutation = (current: ComidaStoreState) => ComidaStoreState;
type ComidaUiMessage = { body: string; signature?: string };

(function exposeComidaUI(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ComidaUI = api;
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

  let host: ComidaUiHost | null = null;
  let repo: {
    load(fallback?: ComidaStoreState): ComidaStoreState;
    update(change: ComidaUiMutation): Promise<ComidaStoreState>;
  } | null = null;
  let state: ComidaStoreState | null = null;
  const view = { tab: 'pedidos', day: '', dishId: '', query: '', onlyMissing: false, billFilter: 'todos', supplyId: '', editPurchase: '', deleteSupplies: false, salesByWeek: false, salesDate: '' };
  let sheetRender: (() => void) | null = null;
  const rollMemory = new Map<string, string>();

  const g = globalThis as any;
  const Store = () => g.ComidaStore;
  const Ledger = () => g.ComidaLedger;

  /* ── small helpers ── */
  function h(tag: string, attrs: { [name: string]: unknown } = {}, ...kids: ComidaUiChild[]): HTMLElement {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (name === 'class') el.className = String(value);
      else if (name === 'text') el.textContent = String(value);
      else if (name.startsWith('on') && typeof value === 'function') el.addEventListener(name.slice(2), value as EventListener);
      else el.setAttribute(name, value === true ? '' : String(value));
    }
    const add = (child: ComidaUiChild): void => {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) child.forEach(add);
      else el.append(typeof child === 'object' ? child : String(child));
    };
    kids.forEach(add);
    return el;
  }
  const icon = (name: string) => h('span', { class: 'ic', 'data-icon': name, 'aria-hidden': 'true' });
  function waIcon(): HTMLElement {
    const span = h('span', { class: 'comida-wa', 'aria-hidden': 'true' });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="${WA_PATH}"/></svg>`;
    return span;
  }
  const money = (n: number) => Ledger().formatMoney(n);
  const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((t, i) => t + pick(i), 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  function parseDay(day: string): Date { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function addDays(day: string, n: number): string { const d = parseDay(day); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const shortDay = (day: string) => { const d = parseDay(day); return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const longDay = (day: string) => { const d = parseDay(day); return `${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`; };
  const newId = () => 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const motionOk = () => !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Digits roll from their last shown value to the new one (odometer).
  function roll(key: string, value: string | number): HTMLElement {
    const el = h('span', { class: 'comida-roll', 'data-comida-roll': key });
    paintRoll(el, key, value);
    return el;
  }

  function paintRoll(el: HTMLElement, key: string, value: string | number): void {
    const text = String(value);
    const displayed = el.getAttribute('aria-label');
    if (displayed === text) return;
    const previous = displayed ?? rollMemory.get(key);
    const from = previous && previous.replace(/\d/g, '0') === text.replace(/\d/g, '0') ? previous : text;
    rollMemory.set(key, text);
    el.setAttribute('aria-label', text);
    el.replaceChildren();
    const strips: [HTMLElement, number][] = [];
    [...text].forEach((ch, i) => {
      if (/\d/.test(ch)) {
        const strip = h('span', { class: 'comida-roll-strip' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => h('span', { text: n })));
        strip.style.transform = `translateY(${-Number(from[i]) * 1.15}em)`;
        strips.push([strip, Number(ch)]);
        el.append(h('span', { class: 'comida-roll-col', 'aria-hidden': 'true' }, strip));
      } else {
        el.append(h('span', { 'aria-hidden': 'true', text: ch }));
      }
    });
    const settle = () => strips.forEach(([strip, digit]) => { strip.style.transform = `translateY(${-digit * 1.15}em)`; });
    if (from !== text && motionOk()) requestAnimationFrame(() => requestAnimationFrame(settle)); else settle();
  }

  function updateRoll(container: Element, key: string, value: string | number): void {
    const el = container.querySelector<HTMLElement>(`[data-comida-roll="${CSS.escape(key)}"]`);
    if (el) paintRoll(el, key, value);
  }

  /* ── state ── */
  function s(): ComidaStoreState {
    if (!state) throw new Error('Comida no está iniciada.');
    return state;
  }
  async function attempt(action: ComidaUiMutation, message?: string, redraw = render, errorBox?: HTMLElement): Promise<boolean> {
    try {
      if (!repo) return false;
      const saved = await repo.update(action);
      state = repo.load(saved);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo guardar Comida. Intenta de nuevo.';
      if (errorBox?.isConnected) errorBox.textContent = text;
      else host?.showToast(text);
      return false;
    }
    if (message) host?.showToast(message);
    redraw();
    return true;
  }

  function people(all = false): ComidaUiPerson[] {
    const employees = host ? host.getEmployees(all) : [];
    const pausedIds = new Set(s().pausedPersonIds);
    return [
      ...employees.map(e => ({ id: String(e.id), num: String(e.number ?? ''), name: e.name, role: e.position || 'Sin cargo', employee: true, paused: pausedIds.has(String(e.id)), attendancePaused: !!e.paused })),
      ...s().clients.map(c => ({ id: c.id, num: c.num, name: c.name, role: c.ref || 'Cliente', employee: false, paused: pausedIds.has(c.id), attendancePaused: false }))
    ];
  }
  function comparePeople(a: ComidaUiPerson, b: ComidaUiPerson): number {
    return Number(b.employee) - Number(a.employee) || Number(!a.num) - Number(!b.num)
      || numberOrder.compare(a.num, b.num) || numberOrder.compare(a.name, b.name);
  }
  const personById = (id: string) => people(true).find(p => p.id === id);
  const ordersOf = (personId: string, day: string) => s().orders.filter(o => o.personId === personId && o.day === day);
  const debtOf = (personId: string) => Ledger().balance(s().orders, s().payments, personId);
  const balancesOf = (current: ComidaStoreState): Map<string, number> => Ledger().accountBalances(current.orders, current.payments);
  const balanceLabel = (balance: number) => balance > 0 ? 'Debe' : balance < 0 ? 'Saldo a favor' : 'Al día';
  const balanceText = (balance: number) => balance ? `${balanceLabel(balance)} ${money(Math.abs(balance))}` : balanceLabel(balance);
  const summary = (orders: ComidaStoreOrder[]) => {
    const counts = new Map<string, number>();
    orders.forEach(o => counts.set(o.dishEmoji, (counts.get(o.dishEmoji) || 0) + 1));
    return [...counts].map(([emoji, n]) => emoji + n).join(' ');
  };
  const openPeriod = () => s().periods.find(p => p.end === null) as ComidaPeriod;
  const periodNumber = (p: ComidaPeriod) => s().periods.indexOf(p) + 1;
  const isLocked = (day: string) => Ledger().isDayLocked(s().periods, day);

  /* ── sheet ── */
  function content(): HTMLElement {
    return (host as ComidaUiHost).sheet.querySelector('.modal-content') as HTMLElement;
  }
  function showSheet(build: () => ComidaUiChild[]): void {
    if (!host) return;
    const draw = () => {
      const box = content();
      const top = box.scrollTop;
      box.replaceChildren(h('div', { class: 'modal-handle' }), ...build().flat(3).filter(Boolean).map(c => (typeof c === 'object' ? c : document.createTextNode(String(c)))) as Node[]);
      box.scrollTop = top;
      (host as ComidaUiHost).applyIcons(box);
    };
    const wasOpen = host.isSheetOpen();
    sheetRender = draw;
    if (wasOpen) content().scrollTop = 0;
    draw();
    host.sheet.classList.remove('is-closing');
    if (!wasOpen) host.openSheet();
  }
  function closeSheet(): void {
    if (!host || !host.isSheetOpen()) return;
    sheetRender = null;
    const sheet = host.sheet;
    if (!motionOk()) { host.closeSheet(); return; }
    sheet.classList.add('is-closing');
    setTimeout(() => { sheet.classList.remove('is-closing'); host && host.closeSheet(); }, 260);
  }
  const sheetHead = (title: string, subtitle?: string) => h('div', { class: 'modal-header' }, h('div', { class: 'modal-title', text: title }), subtitle && h('div', { class: 'modal-subtitle', text: subtitle }));

  function messageSheet(title: string, subtitle: string, message: () => ComidaUiMessage, extra?: () => ComidaUiChild, onConfirm?: (signature: string) => Promise<boolean>): void {
    let shared: ComidaUiMessage | null = null;
    let copiedBody: string | null = null;
    showSheet(() => {
      const current = message();
      const { body } = current;
      const pre = h('pre', { class: 'comida-msg', text: body });
      const copy = h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: () => {
        const draw = sheetRender;
        const done = () => { if (draw !== sheetRender) return; shared = current; copiedBody = body; draw?.(); };
        const fallback = () => { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel && (sel.removeAllRanges(), sel.addRange(r)); copy.textContent = 'Texto seleccionado'; };
        try { (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject(new Error('sin portapapeles'))).then(done).catch(fallback); } catch { fallback(); }
      } }, copiedBody === body ? 'Copiado' : 'Copiar');
      const wa = h('a', { class: 'btn-full whatsapp-cta comida-wa-link', href: 'https://wa.me/?text=' + encodeURIComponent(body), target: '_blank', rel: 'noopener', onclick: () => { shared = current; setTimeout(() => sheetRender?.(), 0); } }, waIcon(), 'Abrir WhatsApp');
      return [sheetHead(title, subtitle), extra && extra(), pre, h('div', { class: 'comida-row' }, copy, wa),
        onConfirm && shared?.body === body && shared.signature === current.signature && h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async (event: Event) => {
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          if (await onConfirm(current.signature || '') && button.isConnected) closeSheet();
          else button.disabled = false;
        } }, 'Ya lo envié'),
        onConfirm && h('p', { class: 'comida-hint', text: 'Abrir WhatsApp no confirma el envío. Cuando lo mandes, toca «Ya lo envié».' })];
    });
  }

  function kitchenNotes(day: string): ComidaKitchenNote[] {
    const ordered = new Set(s().orders.filter(order => order.day === day).map(order => order.personId));
    return people(true).filter(p => ordered.has(p.id) && s().notes[p.id + '@' + day])
      .map(p => ({ name: p.name, text: s().notes[p.id + '@' + day] }));
  }

  function kitchenStatus(day: string, locked: boolean): HTMLElement | null {
    const sent = s().sent[day];
    if (locked || sent === undefined) return null;
    const changes: ComidaChanges = Ledger().changesSinceSent(sent, s().orders, day, kitchenNotes(day));
    const details = [
      changes.added && `${changes.added} ${changes.added > 1 ? 'platos nuevos' : 'plato nuevo'}`,
      changes.removed && `${changes.removed} ${changes.removed > 1 ? 'quitados' : 'quitado'}`,
      changes.notesChanged && 'notas actualizadas'
    ].filter(Boolean).join(', ');
    return h('div', { class: 'comida-note' + (changes.changed ? ' is-warn' : ' is-ok') }, icon(changes.changed ? 'warning' : 'check'),
      changes.changed ? 'Cambió desde el último envío: ' + details : 'Pedido enviado a la cocina');
  }

  function refreshKitchenStatus(): void {
    const region = host?.root.querySelector('.comida-kitchen-status');
    if (!region || view.tab !== 'pedidos') return;
    const status = kitchenStatus(view.day, isLocked(view.day));
    region.replaceChildren(...(status ? [status] : []));
    host?.applyIcons(region as HTMLElement);
  }

  /* ── Pedidos ── */
  function stepper(person: ComidaUiPerson, count: number, onMinus: () => void, onPlus: () => void, key: string, dishId?: string): HTMLElement {
    const digits = roll(key, count);
    digits.setAttribute('aria-hidden', 'true');
    return h('div', { class: 'comida-step' + (count > 0 ? ' has' : ''), 'data-comida-step': person.id, 'data-comida-dish': dishId },
      h('button', { type: 'button', class: 'comida-step-minus', 'aria-label': `Quitar un plato a ${person.name}`, disabled: count === 0, onclick: onMinus }, '−'),
      h('span', { class: 'comida-step-n' }, digits, h('span', { class: 'comida-step-status', role: 'status', text: count === 1 ? '1 plato' : `${count} platos` })),
      h('button', { type: 'button', class: 'comida-step-plus', 'data-person': person.id, 'aria-label': `Anotar un plato a ${person.name}`, onclick: onPlus }, '+'));
  }
  function floatPlus(personId: string, text: string): void {
    if (!host || !motionOk()) return;
    const button = host.root.querySelector(`[data-person="${CSS.escape(personId)}"]`) as HTMLElement | null;
    if (!button) return;
    const f = h('span', { class: 'comida-float', text });
    button.parentElement && button.parentElement.append(f);
    setTimeout(() => f.remove(), 900);
  }
  async function addPlate(person: ComidaUiPerson, dishId: string): Promise<void> {
    const dish = s().dishes.find(d => d.id === dishId);
    const day = view.day;
    if (await attempt(current => Store().addOrder(current, { id: newId(), personId: person.id, dishId, day }), undefined, () => refreshOrderView(person, day))) {
      if (dish && view.day === day) floatPlus(person.id, '+1 ' + dish.emoji);
    }
  }
  async function removePlate(person: ComidaUiPerson, dishId?: string): Promise<void> {
    const day = view.day;
    await attempt(current => Store().removeLastOrder(current, person.id, day, dishId), undefined, () => refreshOrderView(person, day));
  }

  function orderLine(personId: string, orders: ComidaStoreOrder[]): string {
    return orders.length ? `${summary(orders)} · ${money(sum(orders, o => o.price))}` : balanceText(debtOf(personId));
  }

  function missingEmployees(visible: ComidaUiPerson[], ordered: Set<string>, day: string): ComidaUiPerson[] {
    return visible.filter(p => p.employee && host?.isPresent(p.id, day) && !ordered.has(p.id));
  }

  function paintStepper(step: HTMLElement, orders: ComidaStoreOrder[]): void {
    const dishId = step.dataset.comidaDish;
    const count = dishId ? orders.filter(o => o.dishId === dishId).length : orders.length;
    const number = step.querySelector<HTMLElement>('[data-comida-roll]');
    if (number) paintRoll(number, number.dataset.comidaRoll || '', count);
    const status = step.querySelector('.comida-step-status');
    const text = count === 1 ? '1 plato' : `${count} platos`;
    if (status && status.textContent !== text) status.textContent = text;
    step.classList.toggle('has', count > 0);
    const minus = step.querySelector<HTMLButtonElement>('.comida-step-minus');
    if (!minus) return;
    if (!count && document.activeElement === minus) step.querySelector<HTMLButtonElement>('.comida-step-plus')?.focus({ preventScroll: true });
    minus.disabled = !count;
  }

  function refreshOrderView(person: ComidaUiPerson, day: string): void {
    if (!host || day !== view.day || view.tab !== 'pedidos') return;
    const { root, sheet } = host;
    const personKey = CSS.escape(person.id);
    const mine = ordersOf(person.id, day);
    const needsNewList = view.onlyMissing || (person.attendancePaused && !mine.length);
    if (needsNewList) {
      const returnToFilter = view.onlyMissing && !!root.contains(document.activeElement);
      render();
      if (returnToFilter) root.querySelector<HTMLButtonElement>('.comida-stats button')?.focus({ preventScroll: true });
    } else {
      const dayOrders = s().orders.filter(order => order.day === day);
      const orderedIds = new Set(dayOrders.map(order => order.personId));
      const active = people().filter(p => !p.paused && (!p.attendancePaused || orderedIds.has(p.id)));
      updateRoll(root, 'plates', dayOrders.length);
      updateRoll(root, 'total', money(sum(dayOrders, order => order.price)));
      updateRoll(root, 'missing', missingEmployees(active, orderedIds, day).length);
      const line = root.querySelector(`[data-comida-card="${personKey}"] .user-role`);
      if (line) {
        line.textContent = orderLine(person.id, mine);
        line.classList.toggle('comida-today', mine.length > 0);
      }
      root.querySelectorAll<HTMLElement>(`[data-comida-step="${personKey}"]`).forEach(step => paintStepper(step, mine));
      refreshKitchenStatus();
    }
    if (!host.isSheetOpen()) return;
    sheet.querySelectorAll<HTMLElement>(`[data-comida-step="${personKey}"]`).forEach(step => paintStepper(step, mine));
    updateRoll(sheet, 'ot' + person.id, money(sum(mine, order => order.price)));
    const repeat = sheet.querySelector<HTMLButtonElement>(`[data-comida-repeat="${personKey}"]`);
    if (repeat) repeat.disabled = mine.length > 0 || !s().orders.some(o => o.personId === person.id && o.day < day);
    const prices = sheet.querySelector(`[data-comida-historic="${personKey}"]`);
    if (prices) {
      const editor = historicPriceEditor(person.id, day, mine, prices.querySelector('details') ?? undefined);
      prices.replaceChildren(...(editor ? [editor] : []));
    }
  }

  function renderPedidos(): ComidaUiChild[] {
    const day = view.day;
    const locked = isLocked(day);
    const orders = s().orders.filter(o => o.day === day);
    const orderedIds = new Set(orders.map(order => order.personId));
    const all = people().sort(comparePeople);
    const pausedCount = all.filter(p => p.paused).length;
    const visible = all.filter(p => !p.paused && (!p.attendancePaused || orderedIds.has(p.id)));
    const missing = missingEmployees(visible, orderedIds, day);
    const menu = s().dishes.filter(d => d.onMenu);
    if (!menu.some(d => d.id === view.dishId)) view.dishId = menu[0] ? menu[0].id : '';
    const q = view.query.trim().toLowerCase();
    const match = (p: ComidaUiPerson) => p.name.toLowerCase().includes(q) || p.num.toLowerCase().includes(q);
    const employees = (view.onlyMissing ? missing : visible.filter(p => p.employee)).filter(match);
    const clients = view.onlyMissing ? [] : visible.filter(p => !p.employee).filter(match);
    const closed = locked ? s().periods.find(p => p.end !== null && day >= p.start && day <= (p.end as string)) : null;

    const card = (p: ComidaUiPerson) => {
      const mine = ordersOf(p.id, day);
      return h('div', { class: 'user-card comida-card' + (p.attendancePaused ? ' paused' : ''), 'data-comida-card': p.id },
        calendarButton(p),
        h('button', { type: 'button', class: 'comida-info', 'aria-label': 'Pedido de ' + p.name, onclick: () => (locked ? openAccount(p.id) : openOrder(p.id)) },
          h('span', { class: 'user-name', text: p.name }),
          h('span', { class: 'user-role' + (mine.length ? ' comida-today' : ''), text: orderLine(p.id, mine) })),
        locked ? h('span', { class: 'comida-lock' }, icon('lock'), String(mine.length))
          : view.dishId && stepper(p, mine.length, () => removePlate(p), () => addPlate(p, view.dishId), 'q' + p.id));
    };

    const searchInput = h('input', { class: 'search-input', id: 'comida-search', type: 'search', placeholder: 'Nombre o número', 'aria-label': 'Buscar persona', value: view.query, autocomplete: 'off' }) as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      view.query = searchInput.value;
      const { selectionStart, selectionEnd } = searchInput;
      render();
      const input = document.querySelector<HTMLInputElement>('#comida-search');
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(selectionStart, selectionEnd);
    });

    return [
      dateNav(day, locked),
      closed && h('div', { class: 'comida-band' }, icon('lock'), h('span', { text: `Período #${periodNumber(closed)} cerrado el ${shortDay(closed.end as string)}. Solo lectura.` }),
        h('button', { type: 'button', onclick: () => { view.day = host ? host.today() : view.day; render(); } }, 'Ir a hoy')),
      h('div', { class: 'stats-filters comida-stats' },
        h('div', { class: 'stat-card' }, h('div', { class: 'stat-value' }, roll('plates', orders.length)), h('div', { class: 'stat-label', text: 'Platos' })),
        h('div', { class: 'stat-card' }, h('div', { class: 'stat-value' }, roll('total', money(sum(orders, o => o.price)))), h('div', { class: 'stat-label', text: 'Total' })),
        h('button', { type: 'button', class: 'stat-card' + (view.onlyMissing ? ' active' : ''), 'aria-pressed': String(view.onlyMissing), 'aria-label': 'Ver presentes que no han pedido', onclick: () => { view.onlyMissing = !view.onlyMissing; render(); } },
          h('div', { class: 'stat-value', style: 'color: var(--warning-color)' }, roll('missing', missing.length)), h('div', { class: 'stat-label', text: 'Sin pedir' }))),
      h('div', { class: 'comida-kitchen-status' }, kitchenStatus(day, locked)),
      !locked && h('button', { type: 'button', class: 'whatsapp-cta comida-send', onclick: openKitchenMessage }, waIcon(), 'Enviar Pedido'),
      !locked && (menu.length
        ? h('div', { class: 'comida-dishbar' }, h('span', { class: 'comida-dishbar-label' }, icon('food'), 'Plato:'),
          h('div', { class: 'comida-chips' }, menu.map(d => h('button', { type: 'button', class: 'category-pill' + (view.dishId === d.id ? ' active' : ''), 'aria-pressed': String(view.dishId === d.id), onclick: () => { view.dishId = d.id; render(); } }, `${d.emoji} ${d.name} ${d.price}`))))
        : h('div', { class: 'comida-empty' }, h('b', { text: 'No hay platos en el menú' }), h('span', { text: 'Créalos en Cocina.' }), h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => { view.tab = 'cocina'; render(); } }, 'Ir a Cocina'))),
      h('div', { class: 'comida-list-tools' },
        h('div', { class: 'search-wrapper comida-search' }, h('span', { class: 'search-icon' }, icon('search')), searchInput),
        pausedCount > 0 && h('button', { type: 'button', class: 'category-pill', onclick: openPausedPeople }, `Pausados (${pausedCount})`)),
      h('div', { class: 'comida-kicker', text: view.onlyMissing ? `Presentes sin pedir (${employees.length})` : `Empleados (${employees.length})` }),
      employees.length ? h('div', { class: 'comida-list' }, employees.map(card)) : h('div', { class: 'comida-empty', text: q ? 'No hay empleados que coincidan.' : view.onlyMissing ? 'Todos los presentes ya pidieron.' : 'No hay empleados activos.' }),
      !view.onlyMissing && [h('div', { class: 'comida-kicker', text: `Clientes (${clients.length})` }),
        clients.length ? h('div', { class: 'comida-list' }, clients.map(card)) : h('div', { class: 'comida-empty', text: q ? 'No hay clientes que coincidan.' : s().clients.length ? 'No hay clientes activos.' : 'Agrega clientes con el botón + del centro.' })]
    ];
  }

  function dateNav(day: string, locked: boolean): HTMLElement {
    const today = host ? host.today() : day;
    return h('div', { class: 'date-nav' },
      h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Día anterior', onclick: () => { view.day = addDays(view.day, -1); render(); } }, icon('chevronLeft')),
      h('button', {
        type: 'button', class: 'current-date-wrapper', id: 'comida-date-jump-trigger', title: 'Ir a una fecha',
        'aria-label': `Elegir fecha de pedidos · ${longDay(day)}`, 'aria-haspopup': 'dialog',
        onclick: () => host?.openDatePicker(day, selected => {
          view.day = selected;
          render();
          host?.root.querySelector<HTMLButtonElement>('#comida-date-jump-trigger')?.focus({ preventScroll: true });
        })
      }, h('span', { class: 'current-date-display', text: (day === today ? 'Hoy · ' : '') + shortDay(day) + (locked ? ' · cerrado' : '') })),
      h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Día siguiente', disabled: day >= today, onclick: () => { view.day = addDays(view.day, 1); render(); } }, icon('chevronRight')));
  }

  function calendarButton(person: ComidaUiPerson, back?: () => void): HTMLElement {
    return h('button', {
      type: 'button', class: 'avatar-placeholder tap-calendar comida-avatar' + (person.employee ? '' : ' is-client'),
      'aria-label': 'Ver calendario de pedidos de ' + person.name, title: 'Ver calendario de pedidos',
      onclick: () => openFoodCalendar(person.id, view.day, back)
    }, person.num || icon('daily'));
  }

  function setPersonPaused(person: Pick<ComidaUiPerson, 'id' | 'name'>, paused: boolean): Promise<boolean> {
    return attempt(current => Store().setPersonPaused(current, person.id, paused),
      `${person.name} ${paused ? 'se ocultó de Pedidos' : 'se reactivó en Comida'}.`);
  }

  function openPausedPeople(): void {
    showSheet(() => {
      const paused = people().filter(person => person.paused).sort(comparePeople);
      return [sheetHead('Pausados en Comida', 'Reactiva a una persona para volver a anotar sus pedidos.'),
        h('div', { class: 'comida-list' }, paused.map(person => h('div', { class: 'user-card comida-card' },
          calendarButton(person, openPausedPeople),
          h('div', { class: 'comida-person-label' }, h('div', { class: 'user-name', text: person.name }), h('div', { class: 'user-role', text: person.role })),
          h('button', { type: 'button', class: 'category-pill', 'aria-label': `Reactivar a ${person.name} en Comida`, onclick: async () => {
            if (!await setPersonPaused(person, false)) return;
            if (paused.length === 1) closeSheet();
            else {
              sheetRender?.();
              content().querySelector<HTMLButtonElement>('.category-pill')?.focus({ preventScroll: true });
            }
          } }, 'Reactivar')))),
        h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: closeSheet }, 'Cerrar')];
    });
  }

  function openFoodCalendar(personId: string, initialDay: string, back?: () => void): void {
    let selectedDay = initialDay;
    const redraw = (focus: string) => {
      sheetRender?.();
      content().querySelector<HTMLButtonElement>(focus)?.focus({ preventScroll: true });
    };
    showSheet(() => {
      const person = personById(personId);
      if (!person || !host) return [sheetHead('Persona no encontrada')];
      const today = host.today();
      const date = parseDay(selectedDay);
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthKey = selectedDay.slice(0, 7);
      const atCurrentMonth = monthKey === today.slice(0, 7);
      const firstWeekday = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const ordersByDay = new Map<string, ComidaStoreOrder[]>();
      for (const order of s().orders) {
        if (order.personId !== personId || !order.day.startsWith(monthKey + '-')) continue;
        const orders = ordersByDay.get(order.day) || [];
        orders.push(order);
        ordersByDay.set(order.day, orders);
      }
      const moveMonth = (offset: number) => {
        selectedDay = addDays(monthKey + '-01', offset < 0 ? -1 : daysInMonth).slice(0, 7) + '-01';
        const focusNext = offset > 0 && selectedDay.slice(0, 7) !== today.slice(0, 7);
        redraw(focusNext ? '.comida-cal-next' : '.comida-cal-prev');
      };
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const dateKey = monthKey + '-' + pad(i + 1);
        if (dateKey > today) return h('span', { class: 'cal-day comida-cal-future' }, i + 1);
        const count = ordersByDay.get(dateKey)?.length || 0;
        return h('button', {
          type: 'button', class: 'cal-day' + (count ? ' has-data' : ''), 'aria-pressed': String(dateKey === selectedDay),
          'aria-label': `${longDay(dateKey)}, ${count === 1 ? '1 plato' : `${count} platos`}`,
          onclick: () => { selectedDay = dateKey; redraw('.cal-day[aria-pressed="true"]'); }
        }, i + 1, count > 0 && h('span', { class: 'cal-hours', 'aria-hidden': 'true' }, `×${count}`));
      });
      const selectedOrders = ordersByDay.get(selectedDay) || [];
      const dishes = new Map<string, { name: string; count: number; total: number }>();
      for (const order of selectedOrders) {
        const dish = `${order.dishEmoji} ${order.dishName}`;
        const item = dishes.get(dish) || { name: dish, count: 0, total: 0 };
        item.count++;
        item.total += order.price;
        dishes.set(dish, item);
      }
      return [sheetHead([person.name, person.num].filter(Boolean).join(' · '), 'Historial de pedidos'),
        h('div', { class: 'calendar-nav comida-calendar-nav' },
          h('button', { type: 'button', class: 'cal-nav-btn comida-cal-prev', 'aria-label': 'Mes anterior', onclick: () => moveMonth(-1) }, icon('chevronLeft')),
          h('strong', { class: 'comida-cal-month', 'aria-live': 'polite', text: monthLabel.format(date) }),
          h('button', { type: 'button', class: 'cal-nav-btn comida-cal-next', 'aria-label': 'Mes siguiente', disabled: atCurrentMonth, onclick: () => moveMonth(1) }, icon('chevronRight'))),
        h('div', { class: 'comida-calendar-scroll' }, h('div', { class: 'calendar-grid comida-calendar' },
          DOW.map(label => h('span', { class: 'cal-header', text: label.toUpperCase() })),
          Array.from({ length: firstWeekday }, () => h('span', { 'aria-hidden': 'true' })), days)),
        h('div', { class: 'comida-panel comida-calendar-detail' }, h('b', { text: longDay(selectedDay) }),
          dishes.size ? [...dishes.values()].map(dish => h('div', { class: 'comida-calendar-order' },
            h('span', { text: `${dish.name} ×${dish.count}` }), h('b', { text: money(dish.total) }))) : h('span', { class: 'comida-hint', text: 'Sin pedidos este día.' }),
          dishes.size > 0 && h('div', { class: 'comida-calendar-order' }, h('b', { text: 'Total del día' }), h('b', { text: money(sum(selectedOrders, order => order.price)) }))),
        h('div', { class: 'comida-row' },
          h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => openAccount(person.id, false, () => openFoodCalendar(personId, selectedDay, back)) }, 'Ver cuenta'),
          h('button', { type: 'button', class: 'btn-full btn-secondary comida-cal-pause', onclick: async () => {
            if (await setPersonPaused(person, !person.paused)) redraw('.comida-cal-pause');
          } }, person.paused ? 'Reactivar en Comida' : 'Pausar en Comida')),
        h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: back ? () => {
          if (people().some(p => p.paused)) back(); else closeSheet();
        } : closeSheet }, back ? 'Volver a Pausados' : 'Cerrar calendario')];
    });
  }

  function openKitchenMessage(): void {
    const day = view.day;
    messageSheet('Pedido para la cocina', shortDay(day),
      () => {
        const notes = kitchenNotes(day);
        return {
          body: Ledger().formatKitchenOrder(s().orders, day, { dateLabel: longDay(day), withPrices: s().withPrices, notes }),
          signature: Ledger().kitchenSignature(s().orders, day, notes)
        };
      },
      () => h('label', { class: 'comida-switch-row' }, h('span', {}, h('b', { text: 'Incluir precios' }), h('small', { text: 'Quítalos si la cocina no debe verlos' })),
        toggle('Incluir precios', s().withPrices, async value => { const draw = sheetRender; await attempt(current => Store().setWithPrices(current, value)); if (draw === sheetRender) draw?.(); })),
      signature => attempt(current => Store().markSent(current, day, signature), 'Pedido marcado como enviado'));
  }

  function toggle(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
    const input = h('input', { type: 'checkbox', 'aria-label': label }) as HTMLInputElement;
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('span', { class: 'toggle-switch' }, input, h('span', { class: 'toggle-slider' }));
  }

  function openOrder(personId: string): void {
    const day = view.day;
    const draw = (): ComidaUiChild[] => {
      const p = personById(personId);
      if (!p) return [sheetHead('Persona no encontrada')];
      const mine = ordersOf(p.id, day);
      const key = p.id + '@' + day;
      const note = h('textarea', { class: 'search-input comida-textarea', id: 'comida-note', rows: '2', placeholder: 'Ej.: sin ensalada' }) as HTMLTextAreaElement;
      note.value = s().notes[key] || '';
      const saveNote = (text: string) => attempt(current => Store().setNote(current, p.id, day, text), undefined, refreshKitchenStatus);
      note.addEventListener('change', () => { void saveNote(note.value); });
      const hasPrevious = s().orders.some(o => o.personId === p.id && o.day < day);
      return [sheetHead(`${p.name} · ${p.num}`, longDay(day)),
        s().dishes.filter(d => d.onMenu).map(d => h('div', { class: 'comida-dish' }, h('span', { class: 'comida-dish-icon', text: d.emoji }),
          h('span', { class: 'comida-dish-name' }, h('b', { text: d.name }), h('small', { text: money(d.price) })),
          stepper(p, mine.filter(o => o.dishId === d.id).length, () => removePlate(p, d.id), () => addPlate(p, d.id), 'o' + p.id + d.id, d.id))),
        h('label', { class: 'comida-label', for: 'comida-note', text: 'Nota para la cocina' }), note,
        h('div', { class: 'comida-total' }, h('span', { text: 'Total del día' }), h('b', {}, roll('ot' + p.id, money(sum(mine, o => o.price))))),
        h('div', { 'data-comida-historic': p.id }, historicPriceEditor(p.id, day, mine)),
        h('button', { type: 'button', class: 'btn-full btn-secondary', 'data-comida-repeat': p.id, disabled: !hasPrevious || mine.length > 0, onclick: async () => {
          await attempt(current => Store().repeatLastOrder(current, p.id, day, newId), 'Se repitió el último pedido', () => refreshOrderView(p, day));
        } }, 'Repetir último pedido'),
        h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async (event: Event) => {
          const button = event.currentTarget as HTMLButtonElement;
          if (await saveNote(note.value) && button.isConnected) closeSheet();
        } }, 'Listo')];
    };
    showSheet(draw);
  }

  function historicPriceEditor(personId: string, day: string, orders: ComidaStoreOrder[], previous?: HTMLDetailsElement): HTMLElement | null {
    if (!host || day >= host.today() || isLocked(day) || !orders.length) return null;
    const draft = new Map(Array.from(previous?.querySelectorAll<HTMLInputElement>('[data-price-order]') || [], input => [input.dataset.priceOrder, input.value]));
    const error = h('div', { class: 'comida-error', role: 'alert' });
    const rows = orders.map((order, index) => {
      const id = `comida-history-price-${index}`;
      const input = h('input', { id, class: 'search-input comida-field', inputmode: 'numeric', 'data-price-order': order.id, value: draft.get(order.id) ?? String(order.price) }) as HTMLInputElement;
      return { order, input, row: h('div', { class: 'comida-history-price-row' }, h('label', { for: id, text: `${index + 1}. ${order.dishName}` }), input) };
    });
    return h('details', { class: 'comida-history-prices', open: previous?.open },
      h('summary', { class: 'comida-sales-summary', text: 'Editar precios históricos' }),
      h('span', { class: 'comida-hint', text: 'Importes por plato en RD$.' }), rows.map(row => row.row), error,
      h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: async (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const updates = rows.map(({ order, input }) => ({ id: order.id, previous: order.price, price: input.value.trim() ? Number(input.value) : NaN }));
        const today = (host as ComidaUiHost).today();
        button.disabled = true;
        if (await attempt(current => Store().setHistoricPrices(current, personId, day, today, updates), 'Precios del pedido guardados', render, error) && button.isConnected) {
          sheetRender?.();
          content().querySelector<HTMLElement>('.comida-history-prices summary')?.focus({ preventScroll: true });
        } else button.disabled = false;
      } }, 'Guardar precios'));
  }

  /* ── Cocina ── */
  function renderCocina(): ComidaUiChild[] {
    return [
      h('div', { class: 'comida-kicker', text: 'Platos' }),
      s().dishes.length ? h('div', { class: 'comida-panel' }, s().dishes.map(d => h('div', { class: 'comida-dish' }, h('span', { class: 'comida-dish-icon', text: d.emoji }),
        h('button', { type: 'button', class: 'comida-dish-name', 'aria-label': 'Editar ' + d.name, onclick: () => openDish(d.id) }, h('b', { text: d.name }), h('small', { text: `${money(d.price)} · costo ${money(d.cost)} · deja ${money(d.price - d.cost)}` })),
        toggle(d.name + ' en el menú', d.onMenu, value => attempt(current => Store().setDishOnMenu(current, d.id, value))))))
        : h('div', { class: 'comida-empty', text: 'Todavía no hay platos. Crea el primero.' }),
      h('button', { type: 'button', class: 'btn-full btn-primary', onclick: () => openDish('') }, icon('add'), ' Nuevo plato'),
      h('div', { class: 'comida-kicker', text: 'Compras' }),
      purchaseBlocks(false)
    ];
  }

  function openDish(dishId: string, draft?: { name: string; price: string; cost: string; emoji: string }): void {
    showSheet(() => {
      const d = s().dishes.find(x => x.id === dishId);
      const st = draft || { name: d ? d.name : '', price: d ? String(d.price) : '', cost: d ? String(d.cost) : '', emoji: d ? d.emoji : DISH_ICONS[0] };
      const name = h('input', { class: 'search-input comida-field', id: 'comida-dish-name', value: st.name, autocomplete: 'off' }) as HTMLInputElement;
      const price = h('input', { class: 'search-input comida-field', id: 'comida-dish-price', inputmode: 'numeric', value: st.price }) as HTMLInputElement;
      const cost = h('input', { class: 'search-input comida-field', id: 'comida-dish-cost', inputmode: 'numeric', value: st.cost }) as HTMLInputElement;
      const keep = () => ({ name: name.value, price: price.value, cost: cost.value, emoji: st.emoji });
      return [sheetHead(d ? 'Editar plato' : 'Nuevo plato', d ? 'El precio nuevo vale desde ahora. Lo ya anotado no cambia.' : undefined),
        h('label', { class: 'comida-label', for: 'comida-dish-name', text: 'Nombre' }), name,
        h('div', { class: 'comida-row' }, h('div', {}, h('label', { class: 'comida-label', for: 'comida-dish-price', text: 'Precio de venta' }), price), h('div', {}, h('label', { class: 'comida-label', for: 'comida-dish-cost', text: 'Costo estimado' }), cost)),
        h('div', { class: 'comida-label', text: 'Icono' }),
        h('div', { class: 'comida-emoji-grid' }, DISH_ICONS.map(e => h('button', { type: 'button', 'aria-pressed': String(e === st.emoji), 'aria-label': 'Icono ' + e, text: e, onclick: () => openDish(dishId, { ...keep(), emoji: e }) }))),
        h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async () => {
          const dish = { id: d ? d.id : newId(), name: name.value, emoji: st.emoji, price: Number(price.value), cost: Number(cost.value || 0) };
          if (await attempt(current => Store().saveDish(current, dish), 'Plato guardado')) closeSheet();
        } }, 'Guardar plato')];
    });
  }

  function purchaseBlocks(inSheet: boolean): HTMLElement {
    const period = openPeriod();
    const inside = (day: string) => day >= period.start;
    const sold = sum(s().orders.filter(o => inside(o.day)), o => o.price);
    const purchases = s().purchases.filter(p => inside(p.day));
    const spent = sum(purchases, p => p.amount);
    const ratio = sold > 0 ? Math.min(100, Math.round((spent / sold) * 100)) : 0;
    const editing = s().purchases.find(p => p.id === view.editPurchase);
    if (!s().categories.some(c => c.id === view.supplyId) && !(editing && editing.categoryId === view.supplyId)) view.supplyId = s().categories[0] ? s().categories[0].id : '';
    const category = s().categories.find(c => c.id === view.supplyId) || (editing && editing.categoryId === view.supplyId ? { id: editing.categoryId, name: editing.categoryName, emoji: editing.categoryEmoji } : null);
    const amount = h('input', { class: 'comida-amount-input', id: 'comida-amount', inputmode: 'numeric', 'aria-label': 'Monto gastado', value: editing ? String(editing.amount) : '0' }) as HTMLInputElement;
    amount.addEventListener('focus', () => { if (amount.value === '0') amount.value = ''; });
    const error = h('div', { class: 'comida-error', role: 'alert' });
    const keepAmount = (change: () => void) => { const value = amount.value; change(); const again = document.getElementById('comida-amount') as HTMLInputElement | null; if (again && !editing) again.value = value; };
    const back = inSheet ? () => openPurchases() : null;
    const save = async () => {
      if (!category) { error.textContent = s().categories.length ? 'Elige un insumo.' : 'Primero crea un insumo con el botón +.'; return; }
      const value = Number(amount.value);
      const purchase = { id: editing ? editing.id : newId(), categoryId: category.id, amount: value, day: editing ? editing.day : (host as ComidaUiHost).today(), time: editing ? editing.time : nowTime() };
      const ok = await attempt(current => Store().savePurchase(current, purchase),
        editing ? `Compra actualizada · ${category.name} ${money(value)}` : `Compra de ${category.name} por ${money(value)}`);
      if (ok) { view.editPurchase = ''; render(); sheetRender?.(); }
    };
    const tile = (c: ComidaStoreCategory) => h('button', { type: 'button', class: 'comida-supply' + (view.deleteSupplies ? ' is-delete' : ''), 'aria-pressed': String(!view.deleteSupplies && view.supplyId === c.id), 'aria-label': view.deleteSupplies ? 'Eliminar insumo ' + c.name : c.name,
      onclick: () => {
        if (!view.deleteSupplies) { keepAmount(() => { view.supplyId = c.id; render(); sheetRender && sheetRender(); }); return; }
        (host as ComidaUiHost).confirm(`¿Eliminar el insumo «${c.name}»? Sus compras se conservan en el historial.`, { title: 'Eliminar insumo', confirmText: 'Eliminar', danger: true }).then(async ok => {
          if (!ok) return;
          if (!await attempt(current => Store().removeCategory(current, c.id), 'Insumo eliminado')) return;
          if (!s().categories.length) view.deleteSupplies = false;
          render(); sheetRender?.();
        });
      } }, view.deleteSupplies && h('span', { class: 'comida-supply-x' }, icon('close')), h('span', { class: 'comida-supply-icon', text: c.emoji }), h('span', { class: 'comida-supply-name', text: c.name }));
    const when = (p: ComidaStorePurchase) => { const today = (host as ComidaUiHost).today(); return (p.day === today ? 'Hoy' : p.day === addDays(today, -1) ? 'Ayer' : shortDay(p.day)) + (p.time ? ' · ' + p.time : ''); };

    return h('div', { class: 'comida-stack' },
      h('div', { class: 'comida-panel' }, h('b', { text: `Ventas vs. compras del período #${periodNumber(period)}` }),
        h('span', { class: 'comida-hint', text: sold >= spent ? `Las compras son el ${ratio}% de lo vendido; queda el ${100 - ratio}%.` : `Las compras superan lo vendido por ${money(spent - sold)}.` }),
        meterRow('Ventas (cobrado + por cobrar)', sold, 100, 'var(--success-color)'),
        meterRow('Compras de mercado e insumos', spent, ratio, 'var(--danger-color)')),
      h('div', { class: 'comida-panel' },
        h('div', { class: 'comida-panel-head' }, h('b', { text: editing ? `Editando compra (${editing.categoryName})` : 'Registrar compra' }),
          editing ? h('button', { type: 'button', class: 'comida-link is-danger', onclick: () => { view.editPurchase = ''; render(); sheetRender && sheetRender(); } }, 'Cancelar edición')
            : s().categories.length > 0 && h('button', { type: 'button', class: 'comida-link', onclick: () => { view.deleteSupplies = !view.deleteSupplies; render(); sheetRender && sheetRender(); } }, view.deleteSupplies ? 'Listo' : 'Editar insumos')),
        h('span', { class: 'comida-hint', text: view.deleteSupplies ? 'Toca un insumo para eliminarlo. Las compras ya registradas no se borran.' : s().categories.length ? 'Elige el insumo y suma los billetes o escribe el monto.' : 'Todavía no hay insumos. Crea el primero con el botón +.' }),
        h('div', { class: 'comida-supply-grid' }, s().categories.map(tile),
          !view.deleteSupplies && h('button', { type: 'button', class: 'comida-supply is-add', 'aria-label': 'Agregar insumo', onclick: () => openSupply(back) }, h('span', { class: 'comida-slot' }, icon('add')), h('span', { class: 'comida-supply-name', text: 'Agregar' }))),
        h('div', { class: 'comida-amount' },
          h('div', { class: 'comida-amount-head' }, h('span', { text: 'Monto gastado (RD$)' }), h('button', { type: 'button', class: 'comida-link is-danger', onclick: () => { amount.value = '0'; } }, 'Limpiar')),
          h('div', { class: 'comida-amount-box' }, h('span', { class: 'comida-pill', text: category ? `${category.emoji} ${category.name}` : 'Sin insumo' }), amount),
          h('div', { class: 'comida-bills' }, [100, 200, 500, 1000].map(n => h('button', { type: 'button', onclick: () => { amount.value = String((Number(amount.value) || 0) + n); error.textContent = ''; } }, '+' + n.toLocaleString('en-US')))),
          error,
          h('button', { type: 'button', class: 'btn-full comida-ink', onclick: save }, editing ? 'Actualizar compra' : 'Guardar compra'))),
      h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Historial de compras' }),
        purchases.length ? [...purchases].reverse().slice(0, 30).map(p => h('div', { class: 'comida-hist' },
          h('span', { class: 'comida-hist-main' }, h('b', { text: `${p.categoryEmoji} ${p.categoryName}` }), h('small', { text: when(p) })),
          h('b', { class: 'comida-neg', text: '-' + money(p.amount) }),
          h('button', { type: 'button', class: 'comida-link', onclick: () => { view.editPurchase = p.id; view.supplyId = p.categoryId; view.deleteSupplies = false; render(); sheetRender && sheetRender(); } }, 'Editar'),
          h('button', { type: 'button', class: 'comida-icon-btn', 'aria-label': `Eliminar compra de ${p.categoryName}`, onclick: () => {
            (host as ComidaUiHost).confirm(`¿Eliminar la compra de ${p.categoryName} por ${money(p.amount)}?`, { title: 'Eliminar compra', confirmText: 'Eliminar', danger: true }).then(async ok => {
              if (!ok) return;
              if (!await attempt(current => Store().removePurchase(current, p.id), 'Compra eliminada')) return;
              if (view.editPurchase === p.id) { view.editPurchase = ''; render(); }
              sheetRender?.();
            });
          } }, icon('close'))))
          : h('div', { class: 'comida-empty', text: 'Sin compras en este período.' })));
  }

  function meterRow(label: string, value: number, percent: number, color: string): HTMLElement {
    const bar = h('b');
    bar.style.width = percent + '%';
    bar.style.background = color;
    return h('div', { class: 'comida-meter' }, h('div', { class: 'comida-meter-head' }, h('span', { style: 'color:' + color, text: label }), h('span', { text: money(value) })), h('i', {}, bar));
  }

  function openPurchases(): void {
    showSheet(() => [sheetHead('Compras e insumos', shortDay((host as ComidaUiHost).today())), purchaseBlocks(true)]);
  }

  function openSupply(back: (() => void) | null, draft?: { name: string; emoji: string }): void {
    showSheet(() => {
      const st = draft || { name: '', emoji: SUPPLY_ICONS[0] };
      const name = h('input', { class: 'search-input comida-field', id: 'comida-supply-name', value: st.name, placeholder: 'Ej.: Carnes, Gas, Envases', autocomplete: 'off' }) as HTMLInputElement;
      const done = () => (back ? back() : closeSheet());
      return [sheetHead('Nuevo insumo', 'Aparecerá en la cuadrícula de compras.'),
        h('label', { class: 'comida-label', for: 'comida-supply-name', text: 'Nombre' }), name,
        h('div', { class: 'comida-label', text: 'Icono' }),
        h('div', { class: 'comida-emoji-grid' }, SUPPLY_ICONS.map(e => h('button', { type: 'button', 'aria-pressed': String(e === st.emoji), 'aria-label': 'Icono ' + e, text: e, onclick: () => openSupply(back, { name: name.value, emoji: e }) }))),
        h('div', { class: 'comida-row' },
          h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: done }, 'Cancelar'),
          h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async () => {
            const supply = { id: newId(), name: name.value, emoji: st.emoji };
            if (await attempt(current => Store().addCategory(current, supply), `Insumo ${st.emoji} ${supply.name.trim()} creado`)) { view.supplyId = supply.id; view.deleteSupplies = false; done(); render(); }
          } }, 'Guardar insumo'))];
    });
  }

  /* ── Facturación ── */
  function periodStats(p: ComidaPeriod) {
    return Ledger().periodSummary(s().orders, s().payments, s().purchases, p);
  }

  function dailySalesChart(sales: ComidaDailySale[]): HTMLElement {
    const chart = h('div', { class: 'comida-bars', role: 'slider', tabindex: '0', 'aria-label': 'Ventas por día del período', 'aria-valuemin': '0' });
    const details = h('div', { class: 'comida-sale-values', 'aria-live': 'polite' });
    let buckets: ComidaSaleRange[] = [];
    let bars: HTMLElement[] = [];
    let selected = -1;
    const previous = h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Venta anterior' }, icon('chevronLeft')) as HTMLButtonElement;
    const next = h('button', { type: 'button', class: 'nav-arrow', 'aria-label': 'Venta siguiente' }, icon('chevronRight')) as HTMLButtonElement;
    const dayMode = h('button', { type: 'button', class: 'category-pill', onclick: () => setGrouping(false) }, 'Días');
    const weekMode = h('button', { type: 'button', class: 'category-pill', onclick: () => setGrouping(true) }, 'Semanas');
    const dateLabel = ({ day, end }: ComidaSaleRange) => day === end ? shortDay(day) : `${shortDay(day)} – ${shortDay(end)}`;

    function select(index: number, scroll = false): void {
      const value = Math.max(0, Math.min(index, buckets.length - 1));
      const sale = buckets[value];
      if (!sale) return;
      bars[selected]?.classList.remove('is-selected');
      selected = value;
      const bar = bars[selected];
      bar.classList.add('is-selected');
      const label = dateLabel(sale);
      const total = money(sale.clients + sale.staff);
      chart.setAttribute('aria-valuenow', String(value));
      chart.setAttribute('aria-valuetext', `${label}. Clientes ${money(sale.clients)}. Personal ${money(sale.staff)}. Total ${total}.`);
      previous.disabled = value === 0;
      next.disabled = value === buckets.length - 1;
      details.replaceChildren(h('strong', { class: 'comida-sale-date', text: label }),
        h('span', { text: `Clientes ${money(sale.clients)}` }), h('span', { text: `Personal ${money(sale.staff)}` }),
        h('b', { text: `Total ${total}` }));
      if (scroll) revealSelection();
    }

    function revealSelection(): void {
      const windowBounds = chart.getBoundingClientRect();
      const barBounds = bars[selected].getBoundingClientRect();
      if (barBounds.left < windowBounds.left) chart.scrollLeft -= windowBounds.left - barBounds.left;
      else if (barBounds.right > windowBounds.right) chart.scrollLeft += barBounds.right - windowBounds.right;
    }

    function setGrouping(weekly: boolean): void {
      view.salesByWeek = weekly;
      buckets = weekly ? Ledger().weeklySales(sales) : sales.map(sale => ({ ...sale, end: sale.day }));
      const peak = buckets.reduce((max, sale) => Math.max(max, sale.clients + sale.staff), 1);
      bars = buckets.map((sale, index) => {
        const { day, clients, staff } = sale;
        const total = clients + staff;
        const bar = h('div', {
          class: 'comida-sale-bar' + (total ? '' : ' is-zero'), 'data-day': day, 'data-sale-index': index,
          title: `${dateLabel(sale)} · Clientes ${money(clients)} · Personal ${money(staff)} · Total ${money(total)}`,
          'aria-hidden': 'true'
        }, clients > 0 && h('span', { class: 'comida-sales-client', style: `flex-grow: ${clients}` }),
        staff > 0 && h('span', { class: 'comida-sales-staff', style: `flex-grow: ${staff}` }));
        bar.style.height = total ? `${total / peak * 100}%` : '2px';
        bar.style.animationDelay = `${Math.min(index * 12, 250)}ms`;
        return bar;
      });
      chart.replaceChildren(...bars);
      chart.setAttribute('aria-label', weekly ? 'Ventas por semana del período' : 'Ventas por día del período');
      chart.setAttribute('aria-valuemax', String(buckets.length - 1));
      dayMode.setAttribute('aria-pressed', String(!weekly));
      weekMode.setAttribute('aria-pressed', String(weekly));
      dayMode.classList.toggle('active', !weekly);
      weekMode.classList.toggle('active', weekly);
      const matching = buckets.findIndex(sale => sale.day <= view.salesDate && view.salesDate <= sale.end);
      select(matching >= 0 ? matching : buckets.length - 1, true);
    }

    function choose(index: number): void {
      select(index, true);
      view.salesDate = buckets[selected]?.day || '';
    }

    previous.onclick = () => choose(selected - 1);
    next.onclick = () => choose(selected + 1);
    chart.addEventListener('click', event => {
      const hit = (event.target as Element).closest<HTMLElement>('[data-sale-index]');
      const position = event.clientX - chart.getBoundingClientRect().left + chart.scrollLeft;
      choose(hit ? Number(hit.dataset.saleIndex) : Math.floor(position * buckets.length / chart.scrollWidth));
    });
    chart.addEventListener('keydown', event => {
      const keys: Record<string, number> = { ArrowLeft: selected - 1, ArrowDown: selected - 1, ArrowRight: selected + 1, ArrowUp: selected + 1, Home: 0, End: buckets.length - 1 };
      const target = keys[event.key];
      if (target === undefined) return;
      event.preventDefault();
      choose(target);
    });
    setGrouping(view.salesByWeek);
    requestAnimationFrame(() => { if (chart.isConnected) revealSelection(); });

    return h('div', { class: 'comida-panel comida-sales' },
      h('div', { class: 'comida-kicker', text: 'Ventas del período' }),
      h('div', { class: 'comida-chips comida-chart-modes', role: 'group', 'aria-label': 'Agrupar ventas' }, dayMode, weekMode),
      h('div', { class: 'comida-sales-legend' },
        h('span', {}, h('i', { class: 'comida-sales-client', 'aria-hidden': 'true' }), 'Clientes'),
        h('span', {}, h('i', { class: 'comida-sales-staff', 'aria-hidden': 'true' }), 'Personal')),
      chart,
      h('div', { class: 'comida-sale-selection' }, previous, details, next),
      h('details', {}, h('summary', { class: 'comida-sales-summary', text: 'Importes por día' }),
        h('table', { class: 'comida-sales-table', 'aria-label': 'Ventas por fecha y grupo' },
          h('thead', {}, h('tr', {}, ['Fecha', 'Clientes', 'Personal'].map(label => h('th', { scope: 'col', text: label })))),
          h('tbody', {}, sales.map(({ day, clients, staff }) => h('tr', {},
            h('th', { scope: 'row', text: shortDay(day) }), h('td', { text: money(clients) }), h('td', { text: money(staff) })))))),
      h('span', { class: 'comida-hint', text: 'Ganancia = vendido − compras del período' }));
  }

  function renderFacturacion(): ComidaUiChild[] {
    const today = (host as ComidaUiHost).today();
    const p = openPeriod();
    const stats = periodStats(p);
    const dayN = Math.max(0, Ledger().periodDay(p, today));
    const remind = Ledger().shouldRemindClose(p, today);
    const balances = balancesOf(s());
    const named = new Map(people(true).map(person => [person.id, person]));
    const due = [...balances.values()].filter(balance => balance > 0);
    const shown = [...balances].filter(([, balance]) => balance !== 0)
      .map(([id, balance]) => ({ person: named.get(id) || archivedPerson(id), balance }))
      .filter(({ person }) => view.billFilter === 'todos' || (view.billFilter === 'emp') === person.employee)
      .sort((a, b) => b.balance - a.balance);
    const past = s().periods.filter(x => x.end !== null).reverse();
    const sales: ComidaDailySale[] = Ledger().dailySales(s().orders, new Set(s().clients.map(c => c.id)), p.start, today);
    const progress = h('b');
    progress.style.width = Math.min(100, (dayN / Ledger().REMIND_AFTER_DAYS) * 100) + '%';
    progress.style.background = remind ? 'var(--warning-color)' : 'var(--accent-color)';

    return [
      h('div', { class: 'comida-panel' },
        h('div', { class: 'comida-panel-head' }, h('b', { text: `Período #${periodNumber(p)}` }), h('span', { class: 'comida-hint', text: p.start > today ? `Empieza ${shortDay(p.start)}` : `Desde ${shortDay(p.start)} · día ${dayN} de ${Ledger().REMIND_AFTER_DAYS}` })),
        h('div', { class: 'comida-meter' }, h('i', {}, progress)),
        remind && h('div', { class: 'comida-note is-warn' }, icon('warning'), 'Ya pasaron 21 días. Cierra el período cuando termines de cobrar.'),
        h('button', { type: 'button', class: 'btn-full comida-ink', onclick: openClosePeriod }, icon('lock'), ' Cerrar período')),
      h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Por cobrar' }), h('div', { class: 'comida-big' }, roll('due', money(sum(due, amount => amount)))),
        h('span', { class: 'comida-hint', text: `${due.length} ${due.length === 1 ? 'persona' : 'personas'} con saldo pendiente` })),
      h('div', { class: 'stats-filters comida-stats' },
        statCard('Vendido', money(stats.sold)), statCard('Cobrado', money(stats.collected)), statCard('Ganancia', money(stats.profit), stats.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)')),
      sales.length > 0 && dailySalesChart(sales),
      past.length > 0 && h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Períodos anteriores' }),
        h('div', { class: 'comida-mrow is-head' }, h('span'), h('span', { text: 'Vendido' }), h('span', { text: 'Compras' }), h('span', { text: 'Ganancia' })),
        past.map(x => { const st = periodStats(x); return h('div', { class: 'comida-mrow', title: `${shortDay(x.start)} – ${shortDay(x.end as string)}` }, h('b', { text: '#' + periodNumber(x) }), h('span', { text: money(st.sold) }), h('span', { text: money(st.purchases) }), h('b', { style: `color: var(${st.profit >= 0 ? '--success-color' : '--danger-color'})`, text: money(st.profit) })); })),
      h('div', { class: 'comida-chips' }, [['todos', 'Todos'], ['emp', 'Empleados'], ['cli', 'Clientes']].map(([k, l]) => h('button', { type: 'button', class: 'category-pill' + (view.billFilter === k ? ' active' : ''), 'aria-pressed': String(view.billFilter === k), onclick: () => { view.billFilter = k; render(); } }, l))),
      shown.length ? h('div', { class: 'comida-list' }, shown.map(({ person: x, balance }) => h('button', { type: 'button', class: 'user-card comida-card comida-debtor', onclick: () => openAccount(x.id) },
        h('span', { class: 'avatar-placeholder comida-avatar' + (x.employee ? '' : ' is-client'), text: x.num }),
        h('span', { class: 'comida-info' }, h('span', { class: 'user-name', text: x.name }), h('span', { class: 'user-role', text: balance < 0 ? balanceLabel(balance) : x.employee ? x.role : 'Cliente' })),
        h('b', { class: 'comida-money', text: money(Math.abs(balance)) }))))
        : h('div', { class: 'comida-empty', text: 'Sin saldos en este grupo.' })
    ];
  }

  function statCard(label: string, value: string, color?: string): HTMLElement {
    return h('div', { class: 'stat-card' }, h('div', { class: 'stat-value', style: color ? 'color:' + color : null, text: value }), h('div', { class: 'stat-label', text: label }));
  }

  function openClosePeriod(): void {
    showSheet(() => {
      const today = (host as ComidaUiHost).today();
      const p = openPeriod();
      const st = periodStats(p);
      const pending = sum([...balancesOf(s()).values()], balance => Math.max(0, balance));
      const already = p.start > today;
      return [sheetHead(`Cerrar período #${periodNumber(p)}`, already ? 'Ya cerraste un período hoy.' : `Del ${shortDay(p.start)} a hoy · ${Ledger().periodDay(p, today)} días`),
        h('div', { class: 'stats-filters comida-stats' }, statCard('Vendido', money(st.sold)), statCard('Cobrado', money(st.collected)), statCard('Ganancia', money(st.profit), st.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)')),
        h('div', { class: 'comida-note ' + (pending ? 'is-warn' : 'is-ok') }, icon(pending ? 'warning' : 'check'), pending ? `Quedan ${money(pending)} por cobrar. Esa deuda pasa al período siguiente.` : 'Todos pagaron.'),
        h('p', { class: 'comida-hint', text: 'El cierre incluye hoy. Desde mañana empieza un período nuevo, y los días cerrados quedan de solo lectura.' }),
        h('button', { type: 'button', class: 'btn-full comida-ink', disabled: already, onclick: async () => {
          const saved = await attempt(current => {
            const live = current.periods.find(period => period.end === null);
            const sales = live && Ledger().periodSummary(current.orders, current.payments, current.purchases, live);
            const remaining = sum([...balancesOf(current).values()], balance => Math.max(0, balance));
            if (live?.id !== p.id || live.start !== p.start || remaining !== pending || sales.sold !== st.sold || sales.collected !== st.collected || sales.purchases !== st.purchases) {
              throw new Error('Los importes del período cambiaron. Revisa el cierre actualizado.');
            }
            return Store().closePeriod(current, today, newId());
          }, `Período #${periodNumber(p)} cerrado. El siguiente empieza mañana.`);
          if (saved) closeSheet();
          else { if (repo) state = repo.load(); render(); sheetRender?.(); }
        } }, already ? 'Ya cerraste hoy' : 'Cerrar período'),
        h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: closeSheet }, 'Cancelar')];
    });
  }

  function accountText(p: ComidaUiPerson): string {
    const account = Ledger().pendingAccount(s().orders, s().payments, p.id);
    const byDay = new Map<string, ComidaPendingItem[]>();
    account.items.forEach((it: ComidaPendingItem) => byDay.set(it.order.day, [...(byDay.get(it.order.day) || []), it]));
    const lines = [...byDay].map(([day, items]) => {
      const partial = items.some(it => it.remaining < it.order.price);
      return `${shortDay(day)}: ${summary(items.map(it => it.order as ComidaStoreOrder))} = ${money(sum(items, it => it.remaining))}${partial ? ' (resto)' : ''}`;
    });
    const balance = debtOf(p.id);
    const closing = balance < 0 ? `Saldo a favor: ${money(-balance)}` : `Debes: ${money(account.total)}`;
    return `*Tu cuenta de comida*\n${p.name}${p.num ? ` (${p.num})` : ''}\n\n${lines.join('\n') || '(nada pendiente)'}\n\n*${closing}*`;
  }

  function archivedPerson(id: string): ComidaUiPerson {
    return { id, name: 'Personal sin ficha', num: '', role: 'Historial de Comida', employee: true, paused: false, attendancePaused: false };
  }

  function openAccount(personId: string, paying = false, back?: () => void): void {
    showSheet(() => {
      const p = personById(personId) || archivedPerson(personId);
      const debt = debtOf(p.id);
      const mine = s().orders.filter(o => o.personId === p.id);
      const paid = s().payments.filter(x => x.personId === p.id);
      const counts = new Map<string, { label: string; n: number }>();
      mine.forEach(o => { const c = counts.get(o.dishId) || { label: `${o.dishEmoji} ${o.dishName}`, n: 0 }; c.n += 1; counts.set(o.dishId, c); });
      const days = new Map<string, { bought: ComidaStoreOrder[]; paid: number }>();
      mine.forEach(o => { const d = days.get(o.day) || { bought: [], paid: 0 }; d.bought.push(o); days.set(o.day, d); });
      paid.forEach(x => { const d = days.get(x.day) || { bought: [], paid: 0 }; d.paid += x.amount; days.set(x.day, d); });
      let payBox: HTMLElement | null = null;
      if (paying && debt > 0) {
        const input = h('input', { class: 'search-input comida-field', id: 'comida-pay', inputmode: 'numeric', value: String(debt) }) as HTMLInputElement;
        const error = h('div', { class: 'comida-error', role: 'alert' });
        payBox = h('div', { class: 'comida-panel' }, h('div', { class: 'comida-kicker', text: 'Pago en efectivo' }), h('label', { class: 'comida-label', for: 'comida-pay', text: 'Monto' }), input,
          h('div', { class: 'comida-chips' }, h('button', { type: 'button', class: 'category-pill', onclick: () => { input.value = String(debt); } }, 'Todo ' + money(debt)), h('button', { type: 'button', class: 'category-pill', onclick: () => { input.value = String(Math.round(debt / 2)); } }, 'Mitad ' + money(Math.round(debt / 2)))),
          error,
          h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async (event: Event) => {
            const value = Number(input.value);
            const button = event.currentTarget as HTMLButtonElement;
            const payment = { id: newId(), personId: p.id, amount: value, day: (host as ComidaUiHost).today() };
            button.disabled = true;
            if (await attempt(current => Store().addPayment(current, payment), `Pago de ${money(value)} · ${p.name}`, render, error) && button.isConnected) openAccount(p.id, false, back);
            else button.disabled = false;
          } }, 'Guardar pago'));
      }
      return [sheetHead([p.name, p.num].filter(Boolean).join(' · '), p.employee ? p.role : 'Cliente · ' + p.role),
        h('div', { class: 'comida-total' }, h('span', { text: balanceLabel(debt) }), h('b', { style: debt > 0 ? null : 'color: var(--success-color)' }, roll('acc' + p.id, money(Math.abs(debt))))),
        h('div', { class: 'stats-filters comida-stats' }, statCard('Comprado', money(sum(mine, o => o.price))), statCard('Pagado', money(sum(paid, x => x.amount))), statCard('Platos', String(mine.length))),
        counts.size > 0 && [h('div', { class: 'comida-kicker', text: 'Lo que ha comprado' }), h('div', { class: 'comida-chips' }, [...counts.values()].sort((a, b) => b.n - a.n).map(c => h('span', { class: 'category-pill', text: `${c.label} × ${c.n}` })))],
        payBox,
        h('div', { class: 'comida-row' },
          h('button', { type: 'button', class: 'btn-full btn-primary', disabled: debt <= 0, onclick: () => openAccount(p.id, !paying, back) }, paying ? 'Cancelar pago' : 'Registrar pago'),
          h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: () => messageSheet('Cuenta de ' + p.name, 'Resumen de movimientos y saldo', () => ({ body: accountText(p) })) }, 'Enviar cuenta')),
        h('div', { class: 'comida-kicker', text: 'Movimientos' }),
        days.size ? h('div', { class: 'comida-panel' }, [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 40).map(([day, d]) => h('div', { class: 'comida-mrow' },
          h('span', { text: shortDay(day) }), h('span', { text: d.bought.length ? summary(d.bought) : '' }), h('b', { text: d.bought.length ? money(sum(d.bought, o => o.price)) : '' }),
          h('b', { style: 'color: var(--success-color)', text: d.paid ? '-' + money(d.paid) : '' }))))
          : h('div', { class: 'comida-empty', text: 'Sin movimientos.' }),
        back && h('button', { type: 'button', class: 'btn-full btn-secondary', onclick: back }, 'Volver al calendario')];
    });
  }

  /* ── add (central + button inside Comida) ── */
  function openAdd(): void {
    const option = (iconName: string, title: string, text: string, run: () => void) => h('button', { type: 'button', class: 'export-option comida-option', onclick: run },
      h('span', { class: 'comida-option-icon' }, icon(iconName)), h('span', {}, h('b', { text: title }), h('small', { text })));
    showSheet(() => [sheetHead('Agregar'),
      option('employees', 'Empleado', 'Se le toma asistencia. Igual que siempre en Mini.', () => { closeSheet(); setTimeout(() => host && host.addEmployee(), 280); }),
      option('food', 'Cliente', 'Compra comida y no se le toma asistencia', openNewClient),
      option('receipt', 'Compra de insumos', 'Registra lo que compras para la cocina', openPurchases)]);
  }

  function openNewClient(): void {
    showSheet(() => {
      const name = h('input', { class: 'search-input comida-field', id: 'comida-client-name', autocomplete: 'off' }) as HTMLInputElement;
      const ref = h('input', { class: 'search-input comida-field', id: 'comida-client-ref', autocomplete: 'off', placeholder: 'Ej.: almacén, vecino, teléfono' }) as HTMLInputElement;
      const next = 'C' + String(s().lastClientNumber + 1).padStart(2, '0');
      return [sheetHead('Nuevo cliente', `Recibirá el número ${next}. No se le toma asistencia.`),
        h('label', { class: 'comida-label', for: 'comida-client-name', text: 'Nombre' }), name,
        h('label', { class: 'comida-label', for: 'comida-client-ref', text: 'Referencia' }), ref,
        h('button', { type: 'button', class: 'btn-full btn-primary', onclick: async () => {
          const client = { id: newId(), name: name.value, ref: ref.value };
          if (await attempt(current => Store().addClient(current, client), `${client.name.trim()} agregado`)) closeSheet();
        } }, 'Agregar cliente')];
    });
  }

  /* ── public API ── */
  function render(): void {
    if (!host || !state) return;
    const tabs = h('div', { class: 'view-selector' }, h('div', { class: 'view-mode-pills' }, [['pedidos', 'Pedidos'], ['cocina', 'Cocina'], ['facturacion', 'Facturación']].map(([k, l]) =>
      h('button', { type: 'button', class: 'view-btn' + (view.tab === k ? ' active' : ''), 'aria-pressed': String(view.tab === k), onclick: () => { view.tab = k; view.query = ''; render(); window.scrollTo(0, 0); } }, l))));
    const body = view.tab === 'cocina' ? renderCocina() : view.tab === 'facturacion' ? renderFacturacion() : renderPedidos();
    host.root.replaceChildren(tabs, h('div', { class: 'dashboard-panel comida-panel-wrap' }, body));
    host.applyIcons(host.root);
  }

  function init(options: ComidaUiHost): void {
    host = options;
    repo = g.ComidaRepository.createComidaRepository({ storage: options.storage, today: options.today, newId, locks: navigator.locks, indexedDB: globalThis.indexedDB });
    state = (repo as { load(): ComidaStoreState }).load();
    view.day = options.today();
    window.addEventListener('storage', event => {
      if (event.storageArea !== options.storage || (event.key !== g.ComidaRepository.STORAGE_KEY && event.key !== null) || !repo) return;
      state = repo.load(s());
      options.onNavSlotChange();
      if (!options.root.classList.contains('hidden')) render();
      document.querySelectorAll<HTMLElement>('[data-comida-employee]').forEach(button => paintEmployeeFoodButton(button, button.dataset.comidaEmployee || ''));
    });
  }

  function enter(): void {
    if (!host) return;
    if (view.day > host.today()) view.day = host.today();
    render();
  }

  function navSlot(): ComidaStoreNavSlot {
    return state ? state.navSlot : null;
  }

  async function setNavSlot(slot: 'requests' | 'comida'): Promise<boolean> {
    const saved = await attempt(current => Store().setNavSlot(current, slot));
    host?.onNavSlotChange();
    return saved;
  }

  function hasDebt(personId: string): boolean {
    return !!repo && Store().hasDebt(repo.load(state ?? undefined), String(personId));
  }

  function paintEmployeeFoodButton(button: HTMLElement, personId: string): void {
    const paused = s().pausedPersonIds.includes(personId);
    button.setAttribute('aria-pressed', String(!paused));
    button.title = paused ? 'Reactivar en Comida' : 'Pausar en Comida';
  }

  function employeeFoodButton(employee: ComidaUiEmployee): HTMLElement | null {
    if (!state) return null;
    const person = { id: String(employee.id), name: employee.name };
    const button = h('button', { type: 'button', class: 'export-btn comida-employee-toggle', 'aria-label': `Comida para ${person.name}`, 'data-comida-employee': person.id },
      h('span', { class: 'ic comida-employee-icon', 'data-icon': 'food', 'data-icon-vector': true, 'aria-hidden': 'true' }));
    button.addEventListener('click', async () => {
      if (await setPersonPaused(person, !s().pausedPersonIds.includes(person.id))) paintEmployeeFoodButton(button, person.id);
    });
    paintEmployeeFoodButton(button, person.id);
    return button;
  }

  function exportBackup(): ComidaStoreState | null {
    return repo?.load(state ?? undefined) || state;
  }

  async function importBackup(section: unknown): Promise<void> {
    if (!host || !repo) throw new Error('Comida todavía no está lista para restaurarse.');
    const next = g.ComidaRepository.parseBackup(section, host.today(), newId());
    const restored = await repo.update(() => next);
    state = repo.load(restored);
  }

  // The bar space that used to hold Reportes shows an empty slot until the user picks.
  function chooseNavSlot(): void {
    const option = (slot: 'requests' | 'comida', iconName: string, title: string, text: string) => h('button', { type: 'button', class: 'export-option comida-option', onclick: async () => { if (await setNavSlot(slot)) host?.openView(slot); } },
      h('span', { class: 'comida-option-icon' }, icon(iconName)), h('span', {}, h('b', { text: title }), h('small', { text })));
    showSheet(() => [sheetHead('¿Qué quieres en este espacio?', 'Lo eliges una vez. Después se cambia desde Más.'),
      option('comida', 'food', 'Comida', 'Pedidos del día, cocina y facturación'),
      option('requests', 'requests', 'Reportes y Solicitudes', 'Lo que antes estaba en este lugar')]);
  }

  return { init, enter, render, openAdd, closeSheet, navSlot, setNavSlot, chooseNavSlot, hasDebt, employeeFoodButton, exportBackup, importBackup };
});
