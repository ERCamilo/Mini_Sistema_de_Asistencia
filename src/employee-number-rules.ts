// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.EmployeeNumberRules` (browser global consumed by index.html).
// `module: "none"` in tsconfig means tsc performs no module transform here —
// these declarations only describe the ambient CommonJS shape so the
// boilerplate below type-checks without pulling in @types/node.
declare const module: { exports: unknown } | undefined;

type EmployeeId = string;

interface Employee {
  id: EmployeeId;
  name: string;
  /** Employee number is a STRING at runtime (preserves leading zeros, DOM round-trip). */
  number: string;
  position?: string;
  [extra: string]: unknown;
}

interface EmployeeDraft {
  id?: EmployeeId | '';
  name: string;
  number: string;
  position: string;
}

type ConflictOperation = 'create' | 'edit';
type CreateAction = 'suggest' | 'edit-existing' | 'return';
type EditAction = 'swap' | 'return';
type ConflictAction = CreateAction | EditAction;

interface EmployeeNumberConflict {
  operation: ConflictOperation;
  draft: EmployeeDraft;
  conflictingEmployeeId: EmployeeId;
  editedEmployeeId: EmployeeId | null;
  message: string;
  suggestedNumber: number;
  actions: readonly ConflictAction[];
}

type SaveResult =
  | { status: 'saved'; users: Employee[]; conflict: null }
  | { status: 'conflict'; users: Employee[]; conflict: EmployeeNumberConflict };

interface ResolveResult {
  users: Employee[];
  draft: EmployeeDraft;
  committed: boolean;
  pendingConflict: null;
  editEmployeeId?: EmployeeId;
}

interface EmployeeNumberState {
  users: Employee[];
  pendingConflict: EmployeeNumberConflict | null;
}

(function exposeEmployeeNumberRules(root: any, factory: () => unknown) {
  const rules = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = rules;
  if (root) root.EmployeeNumberRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeeNumberRules() {
  function normalizeEmployeeNumber(value: unknown): number | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  function findEmployeeNumberConflict(
    users: Employee[],
    candidateNumber: unknown,
    excludedEmployeeId?: EmployeeId
  ): Employee | null {
    const normalizedCandidate = normalizeEmployeeNumber(candidateNumber);
    if (normalizedCandidate === null) return null;
    return users.find(employee => (
      employee.id !== excludedEmployeeId
      && normalizeEmployeeNumber(employee.number) === normalizedCandidate
    )) || null;
  }

  function getNextEmployeeNumber(users: Employee[]): number {
    const validNumbers = users
      .map(employee => normalizeEmployeeNumber(employee.number))
      .filter((number): number is number => number !== null);
    return validNumbers.length === 0 ? 1 : Math.max(...validNumbers) + 1;
  }

  function swapEmployeeNumbers(
    users: Employee[],
    firstEmployeeId: EmployeeId,
    secondEmployeeId: EmployeeId
  ): Employee[] {
    const firstEmployee = users.find(employee => employee.id === firstEmployeeId);
    const secondEmployee = users.find(employee => employee.id === secondEmployeeId);
    if (!firstEmployee || !secondEmployee || firstEmployeeId === secondEmployeeId) return [...users];
    return users.map(employee => {
      if (employee.id === firstEmployeeId) return { ...employee, number: secondEmployee.number };
      if (employee.id === secondEmployeeId) return { ...employee, number: firstEmployee.number };
      return employee;
    });
  }

  function initializeEmployeeNumberState(users: Employee[]): EmployeeNumberState {
    return { users, pendingConflict: null };
  }

  function createConflict(
    users: Employee[],
    draft: EmployeeDraft,
    employee: Employee
  ): EmployeeNumberConflict {
    const operation: ConflictOperation = draft.id ? 'edit' : 'create';
    return {
      operation,
      draft,
      conflictingEmployeeId: employee.id,
      editedEmployeeId: draft.id || null,
      message: `${employee.name} ya usa el número ${employee.number}.`,
      suggestedNumber: getNextEmployeeNumber(users),
      actions: operation === 'create' ? ['suggest', 'edit-existing', 'return'] : ['swap', 'return']
    };
  }

  function saveEmployeeDraft(
    users: Employee[],
    draft: EmployeeDraft,
    newEmployeeId?: EmployeeId
  ): SaveResult {
    const employee = findEmployeeNumberConflict(users, draft.number, draft.id || undefined);
    if (employee) return { status: 'conflict', users, conflict: createConflict(users, draft, employee) };
    // LATENT INVARIANT (surfaced by types, not fixed): when draft.id is falsy
    // (create path), the caller MUST supply `newEmployeeId`, otherwise
    // `savedEmployee.id` becomes `undefined` at runtime despite the `Employee`
    // type promising `id: EmployeeId` (string). The original JS had the same
    // gap; this cast preserves existing behavior rather than silently
    // changing it. All current call sites do pass newEmployeeId on create.
    const savedEmployee: Employee = { ...draft, id: (draft.id || newEmployeeId) as EmployeeId };
    const nextUsers = draft.id
      ? users.map(current => current.id === draft.id ? savedEmployee : current)
      : [...users, savedEmployee];
    return { status: 'saved', users: nextUsers, conflict: null };
  }

  function resolveEmployeeNumberConflict(
    users: Employee[],
    conflict: EmployeeNumberConflict,
    action: ConflictAction
  ): ResolveResult {
    const result: ResolveResult = { users, draft: conflict.draft, committed: false, pendingConflict: null };
    if (action === 'suggest' && conflict.operation === 'create') {
      return { ...result, draft: { ...conflict.draft, number: String(conflict.suggestedNumber) } };
    }
    if (action === 'edit-existing' && conflict.operation === 'create') {
      return { ...result, editEmployeeId: conflict.conflictingEmployeeId };
    }
    if (action === 'swap' && conflict.operation === 'edit') {
      // `editedEmployeeId` is `EmployeeId | null`, but `createConflict` only
      // produces `operation: 'edit'` when `draft.id` was truthy, which is the
      // same condition that sets `editedEmployeeId` (non-null) in the first
      // place. TS cannot see that cross-field invariant, hence the cast.
      const swapped = swapEmployeeNumbers(users, conflict.editedEmployeeId as EmployeeId, conflict.conflictingEmployeeId)
        .map(employee => employee.id === conflict.editedEmployeeId
          ? { ...employee, name: conflict.draft.name, position: conflict.draft.position }
          : employee);
      return { ...result, users: swapped, committed: true };
    }
    return result;
  }

  return {
    findEmployeeNumberConflict,
    getNextEmployeeNumber,
    initializeEmployeeNumberState,
    normalizeEmployeeNumber,
    resolveEmployeeNumberConflict,
    saveEmployeeDraft,
    swapEmployeeNumbers
  };
});
