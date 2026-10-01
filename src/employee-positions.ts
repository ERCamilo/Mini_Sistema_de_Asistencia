// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.EmployeePositions` (browser global consumed by index.html).
// Up to 3 positions per employee. The principal stays in `position` (so every
// existing screen keeps working); `positionSaId` is its SA id and
// `extraPositions` holds up to 2 more. Each day's attendance record may carry
// `position` when the employee has more than one.

interface EmpPosEntry { name: string; saPositionId?: string; }

interface EmpPosEmployee {
  position?: unknown;
  positionSaId?: unknown;
  extraPositions?: unknown;
  [extra: string]: unknown;
}

interface EmpPosRecord { position?: unknown; [extra: string]: unknown; }

interface EmpPosFields { position: string; positionSaId?: string; extraPositions: EmpPosEntry[]; }

(function exposeEmployeePositions(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EmployeePositions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeePositionsModule() {
  const MAX_POSITIONS = 3;

  const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const key = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function entry(name: string, saPositionId?: unknown): EmpPosEntry {
    const id = clean(saPositionId);
    return id ? { name, saPositionId: id } : { name };
  }

  function dedupe(list: EmpPosEntry[]): EmpPosEntry[] {
    const seen = new Set<string>();
    const out: EmpPosEntry[] = [];
    for (const item of list) {
      if (!item.name || seen.has(key(item.name))) continue;
      seen.add(key(item.name));
      out.push(item);
      if (out.length === MAX_POSITIONS) break;
    }
    return out;
  }

  function positionsOf(employee: EmpPosEmployee | null | undefined): EmpPosEntry[] {
    if (!employee) return [];
    const list: EmpPosEntry[] = [];
    const principal = clean(employee.position);
    if (principal) list.push(entry(principal, employee.positionSaId));
    if (Array.isArray(employee.extraPositions)) {
      for (const extra of employee.extraPositions) {
        if (extra && typeof extra === 'object') list.push(entry(clean((extra as any).name), (extra as any).saPositionId));
      }
    }
    return dedupe(list);
  }

  const hasMultiple = (employee: EmpPosEmployee | null | undefined) => positionsOf(employee).length > 1;

  // The day's position: the chosen one if it is still one of the employee's, else the principal.
  function dayPosition(employee: EmpPosEmployee, record: EmpPosRecord | null | undefined): EmpPosEntry | null {
    const positions = positionsOf(employee);
    if (positions.length < 2) return null;
    const chosen = clean(record && record.position);
    return (chosen && positions.find(p => key(p.name) === key(chosen))) || positions[0];
  }

  // WhatsApp markup characters would break the imported format.
  const forWhatsApp = (name: string) => name.replace(/[_*~`]/g, ' ').replace(/\s+/g, ' ').trim();

  function whatsappSuffix(employee: EmpPosEmployee, record: EmpPosRecord | null | undefined): string {
    const day = dayPosition(employee, record);
    const name = day ? forWhatsApp(day.name) : '';
    return name ? ` _${name}_` : '';
  }

  function submissionFields(employee: EmpPosEmployee, record: EmpPosRecord | null | undefined): { positionName?: string; saPositionId?: string } {
    const day = dayPosition(employee, record);
    if (!day) return {};
    return day.saPositionId ? { positionName: day.name, saPositionId: day.saPositionId } : { positionName: day.name };
  }

  function toFields(list: EmpPosEntry[]): EmpPosFields {
    const [principal, ...extras] = dedupe(list);
    const fields: EmpPosFields = { position: principal ? principal.name : '', extraPositions: extras };
    if (principal && principal.saPositionId) fields.positionSaId = principal.saPositionId;
    return fields;
  }

  // Form names (principal first); SA ids are kept for names that did not change.
  function fromNames(names: unknown[], previous?: EmpPosEmployee | null): EmpPosFields {
    const known = positionsOf(previous);
    return toFields(names.map(clean).filter(Boolean).map(name => {
      const match = known.find(p => key(p.name) === key(name));
      return entry(name, match && match.saPositionId);
    }));
  }

  // `positions` from an SA roster: [{ id?, name }], principal first.
  function fromSaPositions(raw: unknown): EmpPosFields {
    if (!Array.isArray(raw)) throw new Error('positions must be an array');
    if (raw.length > MAX_POSITIONS) throw new Error(`positions allows at most ${MAX_POSITIONS} items`);
    return toFields(raw.map((item, index) => {
      const name = item && typeof item === 'object' ? clean((item as any).name) : '';
      if (!name) throw new Error(`positions[${index}].name is required`);
      return entry(name, (item as any).id);
    }));
  }

  const label = (employee: EmpPosEmployee | null | undefined) => positionsOf(employee).map(p => p.name).join(' · ');

  return { MAX_POSITIONS, positionsOf, hasMultiple, dayPosition, whatsappSuffix, submissionFields, fromNames, fromSaPositions, label };
});
