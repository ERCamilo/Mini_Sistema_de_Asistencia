const test = require('node:test');
const assert = require('node:assert/strict');
const WorkContextManager = require('../work-context.js');
const EmployeeRepository = require('../employee-repository.js');

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

test('saveContext creates new context and updates existing context', () => {
  const storage = createMemoryStorage();
  const contextManager = WorkContextManager.createWorkContextManager({ storage });

  const created = contextManager.saveContext({
    name: 'Obra Torre Norte',
    type: 'project',
    color: '#3b82f6'
  });

  assert.ok(created.id);
  assert.equal(created.name, 'Obra Torre Norte');
  assert.equal(created.type, 'project');
  assert.equal(created.color, '#3b82f6');
  assert.equal(created.schemaVersion, 1);

  const updated = contextManager.saveContext({
    id: created.id,
    name: 'Obra Torre Norte - Fase 2',
    color: '#10b981'
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Obra Torre Norte - Fase 2');
  assert.equal(updated.color, '#10b981');
  assert.equal(contextManager.getAll().length, 1);
});

test('active context selection and retrieval', () => {
  const storage = createMemoryStorage();
  const contextManager = WorkContextManager.createWorkContextManager({ storage });

  const c1 = contextManager.saveContext({ name: 'Cuadrilla Estructuras', type: 'squad' });
  const c2 = contextManager.saveContext({ name: 'Cuadrilla Terminaciones', type: 'squad' });

  assert.equal(contextManager.getActive(), null);
  assert.equal(contextManager.getActiveId(), null);

  contextManager.setActive(c1.id);
  assert.equal(contextManager.getActiveId(), c1.id);
  assert.equal(contextManager.getActive().name, 'Cuadrilla Estructuras');

  contextManager.setActive(null);
  assert.equal(contextManager.getActive(), null);

  contextManager.setActive(c2.id);
  assert.equal(contextManager.getActiveId(), c2.id);
});

test('assignEmployeeContext and bulkAssignContext update employee records', () => {
  const storage = createMemoryStorage();
  const empRepo = EmployeeRepository.createEmployeeRepository({ storage });
  const contextManager = WorkContextManager.createWorkContextManager({ storage });

  const ctx = contextManager.saveContext({ name: 'Obra Central', type: 'project' });

  empRepo.save({ name: 'Juan Perez', number: '10' });
  empRepo.save({ name: 'Maria Gomez', number: '11' });
  empRepo.save({ name: 'Pedro Soto', number: '12' });

  const emps = empRepo.getAll();
  const u1 = emps.find(e => e.name === 'Juan Perez');
  const u2 = emps.find(e => e.name === 'Maria Gomez');
  const u3 = emps.find(e => e.name === 'Pedro Soto');

  // Single assignment
  contextManager.assignEmployeeContext(u1.id, ctx.id, empRepo);
  assert.equal(empRepo.getById(u1.id).workContextId, ctx.id);

  // Bulk assignment
  const bulkRes = contextManager.bulkAssignContext([u2.id, u3.id], ctx.id, empRepo);
  assert.equal(bulkRes.assignedCount, 2);
  assert.equal(empRepo.getById(u2.id).workContextId, ctx.id);
  assert.equal(empRepo.getById(u3.id).workContextId, ctx.id);

  // Unassign
  contextManager.assignEmployeeContext(u1.id, null, empRepo);
  assert.equal(empRepo.getById(u1.id).workContextId, undefined);
});

test('filterEmployees filters list by active context or all', () => {
  const storage = createMemoryStorage();
  const contextManager = WorkContextManager.createWorkContextManager({ storage });

  const c1 = contextManager.saveContext({ name: 'Obra A', type: 'project' });
  const c2 = contextManager.saveContext({ name: 'Obra B', type: 'project' });

  const list = [
    { id: 'u1', name: 'Ana', workContextId: c1.id },
    { id: 'u2', name: 'Carlos', workContextId: c2.id },
    { id: 'u3', name: 'Elena' }
  ];

  // No active context -> returns all
  assert.equal(contextManager.filterEmployees(list).length, 3);

  // Set active to c1
  contextManager.setActive(c1.id);
  const filteredC1 = contextManager.filterEmployees(list);
  assert.equal(filteredC1.length, 1);
  assert.equal(filteredC1[0].name, 'Ana');

  // Specific context argument override
  const filteredC2 = contextManager.filterEmployees(list, c2.id);
  assert.equal(filteredC2.length, 1);
  assert.equal(filteredC2[0].name, 'Carlos');
});

test('removeContext cleans active context and unassigns from employees', () => {
  const storage = createMemoryStorage();
  const empRepo = EmployeeRepository.createEmployeeRepository({ storage });
  const contextManager = WorkContextManager.createWorkContextManager({ storage });

  const ctx = contextManager.saveContext({ name: 'Proyecto Temporal', type: 'project' });
  empRepo.save({ name: 'Luis', number: '1', workContextId: ctx.id });
  contextManager.setActive(ctx.id);

  const empBefore = empRepo.getAll()[0];
  assert.equal(empBefore.workContextId, ctx.id);
  assert.equal(contextManager.getActiveId(), ctx.id);

  contextManager.removeContext(ctx.id, { employeeRepository: empRepo });

  assert.equal(contextManager.getAll().length, 0);
  assert.equal(contextManager.getActiveId(), null);

  const empAfter = empRepo.getAll()[0];
  assert.equal(empAfter.workContextId, undefined);
});

test('index.html contains full work-context markup, script and window binding', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  // Script inclusion
  assert.match(html, /src="\.\/work-context\.js"/);

  // Global window assignment so UI functions can access it
  assert.match(html, /window\.workContextManager\s*=\s*workContextManager/);

  // Modal and creation elements
  assert.match(html, /id="modal-work-contexts"/);
  assert.match(html, /id="new-context-name"/);
  assert.match(html, /id="new-context-type"/);
  assert.match(html, /createWorkContextFromUI\(\)/);

  // Filter bar pills
  assert.match(html, /id="work-context-pills"/);
  assert.match(html, /id="work-context-pills-emp"/);
});
