(function exposeEmployeeNumberRules(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.EmployeeNumberRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmployeeNumberRules() {
  function normalizeEmployeeNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
  function findEmployeeNumberConflict(users, candidateNumber, excludedEmployeeId) {
    const normalizedCandidate = normalizeEmployeeNumber(candidateNumber);
    if (normalizedCandidate === null) return null;
    return users.find(employee => (
      employee.id !== excludedEmployeeId
      && normalizeEmployeeNumber(employee.number) === normalizedCandidate
    )) || null;
  }
  function getNextEmployeeNumber(users) {
    const validNumbers = users
      .map(employee => normalizeEmployeeNumber(employee.number))
      .filter(number => number !== null);
    return validNumbers.length === 0 ? 1 : Math.max(...validNumbers) + 1;
  }
  function swapEmployeeNumbers(users, firstEmployeeId, secondEmployeeId) {
    const firstEmployee = users.find(employee => employee.id === firstEmployeeId);
    const secondEmployee = users.find(employee => employee.id === secondEmployeeId);
    if (!firstEmployee || !secondEmployee || firstEmployeeId === secondEmployeeId) return [...users];
    return users.map(employee => {
      if (employee.id === firstEmployeeId) return { ...employee, number: secondEmployee.number };
      if (employee.id === secondEmployeeId) return { ...employee, number: firstEmployee.number };
      return employee;
    });
  }
  function initializeEmployeeNumberState(users) {
    return { users, pendingConflict: null };
  }
  function createConflict(users, draft, employee) {
    const operation = draft.id ? 'edit' : 'create';
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
  function saveEmployeeDraft(users, draft, newEmployeeId) {
    const employee = findEmployeeNumberConflict(users, draft.number, draft.id || undefined);
    if (employee) return { status: 'conflict', users, conflict: createConflict(users, draft, employee) };
    const savedEmployee = { ...draft, id: draft.id || newEmployeeId };
    const nextUsers = draft.id
      ? users.map(current => current.id === draft.id ? savedEmployee : current)
      : [...users, savedEmployee];
    return { status: 'saved', users: nextUsers, conflict: null };
  }
  function resolveEmployeeNumberConflict(users, conflict, action) {
    const result = { users, draft: conflict.draft, committed: false, pendingConflict: null };
    if (action === 'suggest' && conflict.operation === 'create') {
      return { ...result, draft: { ...conflict.draft, number: String(conflict.suggestedNumber) } };
    }
    if (action === 'edit-existing' && conflict.operation === 'create') {
      return { ...result, editEmployeeId: conflict.conflictingEmployeeId };
    }
    if (action === 'swap' && conflict.operation === 'edit') {
      const swapped = swapEmployeeNumbers(users, conflict.editedEmployeeId, conflict.conflictingEmployeeId)
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
