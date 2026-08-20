const test = require('node:test');
const assert = require('node:assert/strict');
const FieldRequests = require('../field-requests.js');

const mockEmployees = [
  { id: 'emp1', name: 'Juan Pérez', number: '1', position: 'Albañil' },
  { id: 'emp2', name: 'Pedro López', number: '2', position: 'Albañil' },
  { id: 'emp3', name: 'Carlos Díaz', number: '3', position: 'Electricista' },
  { id: 'emp4', name: 'Mario Rossi', number: '4', position: 'Ayudante' }
];

test('createRequest captures an immutable snapshot of all target employees', () => {
  const req = FieldRequests.createRequest({
    title: 'Horas extra hoy',
    category: 'personal',
    targetType: 'all',
    priority: 'normal'
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  assert.equal(req.title, 'Horas extra hoy');
  assert.equal(req.category, 'personal');
  assert.equal(req.status, 'open');
  assert.equal(req.targets.length, 4);
  assert.equal(req.targets[0].name, 'Juan Pérez');
  assert.equal(req.targets[0].id, 'emp1');

  // Verify immutability: mutating mockEmployees does not affect existing request targets
  mockEmployees[0].position = 'Capataz General';
  assert.equal(req.targets[0].position, 'Albañil');
  // restore
  mockEmployees[0].position = 'Albañil';
});

test('createRequest filters snapshot by position (e.g. Albañil)', () => {
  const req = FieldRequests.createRequest({
    title: 'Herramientas Albañilería',
    category: 'personal',
    targetType: 'position',
    targetPosition: 'Albañil'
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  assert.equal(req.targets.length, 2);
  assert.deepEqual(req.targets.map(t => t.id), ['emp1', 'emp2']);
});

test('createRequest for materials sets targets to empty and targetType to none', () => {
  const req = FieldRequests.createRequest({
    title: 'Pedido de cemento',
    category: 'materials',
    priority: 'urgent',
    fields: [
      { id: 'fld_cemento', label: 'Cemento', type: 'number_unit', unit: 'sacos' }
    ]
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  assert.equal(req.category, 'materials');
  assert.equal(req.targetType, 'none');
  assert.equal(req.targets.length, 0);
  assert.equal(req.fields.length, 1);
  assert.equal(req.fields[0].unit, 'sacos');
});

test('recordResponse records partial answers without closing the request', () => {
  let req = FieldRequests.createRequest({
    title: 'Horas extra',
    category: 'personal',
    targetType: 'all',
    fields: [{ id: 'f1', label: '¿Horas extra?', type: 'boolean_comment' }]
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  // Answer only Juan and Pedro
  req = FieldRequests.recordResponse(req, {
    fieldId: 'f1',
    employeeId: 'emp1',
    value: true,
    comment: 'Hasta las 7 PM'
  }, () => '2026-08-20T10:05:00.000Z');

  req = FieldRequests.recordResponse(req, {
    fieldId: 'f1',
    employeeId: 'emp2',
    value: false,
    comment: 'Tiene turno médico'
  }, () => '2026-08-20T10:06:00.000Z');

  assert.equal(req.status, 'open');
  const summary = FieldRequests.summarizeResults(req);
  assert.equal(summary.totalTargets, 4);
  assert.equal(summary.respondedTargets, 2);
  assert.equal(summary.pendingTargets, 2);
  assert.equal(summary.completionPercentage, 50);

  const booleanSummary = summary.fieldSummaries[0].booleanCounts;
  assert.deepEqual(booleanSummary, { yes: 1, no: 1, pending: 2 });
});

test('status transitions: open -> completed -> closed -> reopen', () => {
  let req = FieldRequests.createRequest({
    title: 'Inventario',
    category: 'materials'
  }, [], () => '2026-08-20T10:00:00.000Z');

  assert.equal(req.status, 'open');
  assert.equal(req.completedAt, null);

  req = FieldRequests.changeStatus(req, 'completed', () => '2026-08-20T11:00:00.000Z');
  assert.equal(req.status, 'completed');
  assert.equal(req.completedAt, '2026-08-20T11:00:00.000Z');

  req = FieldRequests.changeStatus(req, 'closed', () => '2026-08-20T12:00:00.000Z');
  assert.equal(req.status, 'closed');
  assert.equal(req.closedAt, '2026-08-20T12:00:00.000Z');

  // Reopen
  req = FieldRequests.changeStatus(req, 'open', () => '2026-08-20T12:30:00.000Z');
  assert.equal(req.status, 'open');
  assert.equal(req.closedAt, null);
});

test('duplicateRequest copies structure, fields, targets, resets responses and status', () => {
  let req = FieldRequests.createRequest({
    title: 'Horas extra viernes',
    category: 'personal',
    targetType: 'all',
    fields: [{ id: 'f1', label: 'Disponibilidad', type: 'boolean' }]
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  req = FieldRequests.recordResponse(req, {
    fieldId: 'f1',
    employeeId: 'emp1',
    value: true
  });
  req = FieldRequests.changeStatus(req, 'completed');
  req = FieldRequests.recordShare(req);

  const duplicate = FieldRequests.duplicateRequest(req, () => '2026-08-21T08:00:00.000Z', 'Horas extra sábado');

  assert.notEqual(duplicate.id, req.id);
  assert.equal(duplicate.title, 'Horas extra sábado');
  assert.equal(duplicate.status, 'open');
  assert.deepEqual(duplicate.responses, {});
  assert.equal(duplicate.completedAt, null);
  assert.equal(duplicate.lastSharedAt, null);
  assert.equal(duplicate.shareCount, 0);
  assert.equal(duplicate.targets.length, 4);
  assert.equal(duplicate.fields.length, 1);
});

test('recordShare updates lastSharedAt and shareCount without altering status', () => {
  let req = FieldRequests.createRequest({
    title: 'Compra de agua',
    category: 'general'
  }, [], () => '2026-08-20T10:00:00.000Z');

  assert.equal(req.lastSharedAt, null);
  assert.equal(req.shareCount, 0);

  req = FieldRequests.recordShare(req, () => '2026-08-20T10:15:00.000Z');
  assert.equal(req.status, 'open');
  assert.equal(req.shareCount, 1);
  assert.equal(req.lastSharedAt, '2026-08-20T10:15:00.000Z');
});

test('formatWhatsAppSummary creates human-readable text for personal survey', () => {
  let req = FieldRequests.createRequest({
    title: 'Horas extra mañana',
    category: 'personal',
    priority: 'urgent',
    targetType: 'all',
    fields: [{ id: 'f1', label: '¿Puede?', type: 'boolean' }]
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  req = FieldRequests.recordResponse(req, { fieldId: 'f1', employeeId: 'emp1', value: true });
  req = FieldRequests.recordResponse(req, { fieldId: 'f1', employeeId: 'emp2', value: true });
  req = FieldRequests.recordResponse(req, { fieldId: 'f1', employeeId: 'emp3', value: false });

  const summaryText = FieldRequests.formatWhatsAppSummary(req);
  assert.match(summaryText, /\*Horas extra mañana\*/);
  assert.match(summaryText, /Prioridad: 🔴 Urgente/);
  assert.match(summaryText, /4 trabajadores/);
  assert.match(summaryText, /✅ Sí: 2/);
  assert.match(summaryText, /❌ No: 1/);
  assert.match(summaryText, /⏳ Pendientes: 1/);
  assert.match(summaryText, /_Mini Asistencia_/);
});

test('formatWhatsAppDetail creates full breakdown with employee names, numbers and notes', () => {
  let req = FieldRequests.createRequest({
    title: 'Horas extra mañana',
    category: 'personal',
    targetType: 'all',
    fields: [{ id: 'f1', label: '¿Puede?', type: 'boolean_comment' }]
  }, mockEmployees, () => '2026-08-20T10:00:00.000Z');

  req = FieldRequests.recordResponse(req, {
    fieldId: 'f1',
    employeeId: 'emp1',
    value: true,
    comment: 'Hasta las 7 PM'
  });
  req = FieldRequests.recordResponse(req, {
    fieldId: 'f1',
    employeeId: 'emp2',
    value: false
  });

  const detailText = FieldRequests.formatWhatsAppDetail(req);
  assert.match(detailText, /1\. Juan Pérez — ✅ Sí/);
  assert.match(detailText, /2\. Pedro López — ❌ No/);
  assert.match(detailText, /3\. Carlos Díaz — ⏳ Pendiente/);
  assert.match(detailText, /Juan Pérez: _Hasta las 7 PM_/);
});

test('formatWhatsAppSummary for material purchase request', () => {
  let req = FieldRequests.createRequest({
    title: 'Compra de material',
    category: 'materials',
    priority: 'urgent',
    fields: [
      { id: 'f_mat', label: 'Material', type: 'text_short' },
      { id: 'f_qty', label: 'Cantidad', type: 'number_unit', unit: 'sacos' }
    ],
    notes: 'Para el vaciado de mañana a primera hora.'
  }, [], () => '2026-08-20T10:00:00.000Z');

  req = FieldRequests.recordResponse(req, { fieldId: 'f_mat', value: 'Cemento Portland' });
  req = FieldRequests.recordResponse(req, { fieldId: 'f_qty', value: 25 });

  const summary = FieldRequests.formatWhatsAppSummary(req);
  assert.match(summary, /\*Compra de material\*/);
  assert.match(summary, /Prioridad: 🔴 Urgente/);
  assert.match(summary, /Material:\* Cemento Portland/);
  assert.match(summary, /Cantidad:\* 25 sacos/);
  assert.match(summary, /Para el vaciado de mañana/);
});

test('default templates provide the 9 expected built-in templates', () => {
  const tpls = FieldRequests.getDefaultTemplates();
  assert.equal(tpls.length, 9);
  assert.equal(tpls[0].id, 'tpl_horas_extra');
  assert.equal(tpls[0].isFavorite, true);

  const tplPurchase = tpls.find(t => t.id === 'tpl_compra_material');
  assert(tplPurchase);
  assert.equal(tplPurchase.category, 'materials');
  assert.equal(tplPurchase.priority, 'urgent');
});

test('createTemplateFromRequest saves custom template', () => {
  const req = FieldRequests.createRequest({
    title: 'Revisión de generador',
    category: 'equipment',
    priority: 'important',
    fields: [{ id: 'f1', label: 'Nivel aceite', type: 'single_choice', options: ['Bien', 'Bajo'] }]
  });

  const customTpl = FieldRequests.createTemplateFromRequest(req, 'Plantilla Generador', true);
  assert.equal(customTpl.name, 'Plantilla Generador');
  assert.equal(customTpl.isFavorite, true);
  assert.equal(customTpl.isSystem, false);
  assert.equal(customTpl.category, 'equipment');
  assert.equal(customTpl.fields.length, 1);
});

test('filterRequests filters by search query, category, and status', () => {
  const req1 = FieldRequests.createRequest({ title: 'Horas extra sábado', category: 'personal', status: 'open' });
  const req2 = FieldRequests.createRequest({ title: 'Compra de arena', category: 'materials', status: 'completed' });
  const req3 = FieldRequests.createRequest({ title: 'Reparación taladro', category: 'equipment', status: 'closed' });
  const all = [req1, req2, req3];

  const personalOnly = FieldRequests.filterRequests(all, '', 'personal', 'all');
  assert.deepEqual(personalOnly, [req1]);

  const completedOnly = FieldRequests.filterRequests(all, '', 'all', 'completed');
  assert.deepEqual(completedOnly, [req2]);

  const searchArena = FieldRequests.filterRequests(all, 'arena', 'all', 'all');
  assert.deepEqual(searchArena, [req2]);
});

test('normalizeRequest migrates legacy array responses and recipientId safely', () => {
  const legacy = {
    ...FieldRequests.createRequest({ title: 'Legacy', fields: [{ id: 'f1', label: 'OK', type: 'boolean' }] }),
    responses: [{ fieldId: 'f1', recipientId: 'e1', value: true, updatedAt: '2026-01-01T00:00:00.000Z' }]
  };
  const normalized = FieldRequests.normalizeRequest(legacy);
  assert.deepEqual(normalized.responses['f1:e1'], {
    fieldId: 'f1', employeeId: 'e1', value: true, comment: null, updatedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(FieldRequests.getResponse(normalized, 'f1', 'e1').value, true);
});

test('request completion validates every required field for every snapshot employee', () => {
  const employees = [
    { id: 'e1', name: 'Ana', number: '1', position: 'A' },
    { id: 'e2', name: 'Luis', number: '2', position: 'B' }
  ];
  const request = FieldRequests.createRequest({
    title: 'Mixed survey', targetType: 'all',
    fields: [
      { id: 'ok', label: 'OK', type: 'boolean', required: true },
      { id: 'tools', label: 'Tools', type: 'multiple_choice', options: ['A', 'B'], required: true },
      { id: 'note', label: 'Note', type: 'text_long' }
    ]
  }, employees);
  let updated = FieldRequests.recordResponse(request, { fieldId: 'ok', employeeId: 'e1', value: false });
  updated = FieldRequests.recordResponse(updated, { fieldId: 'tools', employeeId: 'e1', value: ['A'] });
  assert.equal(FieldRequests.isRequestComplete(updated), false);
  updated = FieldRequests.recordResponse(updated, { fieldId: 'ok', employeeId: 'e2', value: true });
  updated = FieldRequests.recordResponse(updated, { fieldId: 'tools', employeeId: 'e2', value: ['A', 'B'] });
  assert.equal(FieldRequests.isRequestComplete(updated), true);
});

test('validated backup import rejects malformed data and normalizes requests', () => {
  assert.throws(() => FieldRequests.importRequestBackup('{"schemaVersion":99}'), /compatible/);
  const request = FieldRequests.createRequest({ title: 'Backup' });
  const json = FieldRequests.exportRequestBackup([request], []);
  const restored = FieldRequests.importRequestBackup(json);
  assert.equal(restored.requests[0].title, 'Backup');
  assert.deepEqual(restored.requests[0].responses, {});
});

test('WhatsApp output lists only selected choices and preserves multiple choices', () => {
  let request = FieldRequests.createRequest({
    title: 'Tools', category: 'general',
    fields: [{ id: 'tools', label: 'Tools', type: 'multiple_choice', options: ['Hammer', 'Saw', 'Drill'] }]
  });
  request = FieldRequests.recordResponse(request, { fieldId: 'tools', value: ['Saw', 'Drill'] });
  const text = FieldRequests.formatWhatsAppSummary(request);
  assert.match(text, /Saw/);
  assert.match(text, /Drill/);
  assert.doesNotMatch(text, /Hammer/);
});

test('required date is formatted as a calendar date in WhatsApp', () => {
  const request = FieldRequests.createRequest({ title: 'Order', requiredDate: '2026-08-20' });
  assert.match(FieldRequests.formatWhatsAppSummary(request), /Necesaria para:\* 20\/08\/2026/);
});

test('request model carries audit, sync, requiredAt and timestamp metadata', () => {
  const request = FieldRequests.createRequest({
    title: 'Audit', createdBy: 'foreman-7', requiredAt: '2026-09-01'
  }, [], () => '2026-08-20T12:00:00.000Z');
  assert.equal(request.schemaVersion, 1);
  assert.equal(request.source, 'mini');
  assert.equal(request.createdBy, 'foreman-7');
  assert.equal(request.syncStatus, 'local');
  assert.equal(request.requiredAt, '2026-09-01');
  assert.equal(request.createdAt, '2026-08-20T12:00:00.000Z');
  assert.equal(request.updatedAt, request.createdAt);
});

test('custom templates can be fully updated and duplicated without shared state', () => {
  const request = FieldRequests.createRequest({ title: 'Original', fields: [{ id: 'f', label: 'Old', type: 'text_short' }] });
  const template = FieldRequests.createTemplateFromRequest(request);
  const updated = FieldRequests.updateTemplate(template, {
    name: 'Renamed', description: 'New description', category: 'materials', priority: 'urgent',
    targetType: 'none', fields: [{ id: 'n', label: 'Quantity', type: 'number_unit', unit: 'kg', required: true }]
  });
  const duplicate = FieldRequests.duplicateTemplate(updated);
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.fields[0].unit, 'kg');
  assert.notEqual(duplicate.id, updated.id);
  assert.equal(duplicate.isSystem, false);
  duplicate.fields[0].label = 'Changed copy';
  assert.equal(updated.fields[0].label, 'Quantity');
  const instance = FieldRequests.createRequest({ ...updated, title: updated.name, fields: updated.fields });
  assert.deepEqual(instance.responses, {});
  instance.fields[0].label = 'Instance only';
  assert.equal(updated.fields[0].label, 'Quantity');
});

test('backup import rejects handler-breaking request, field and target ids', () => {
  const base = FieldRequests.createRequest({ title: 'Safe', targetType: 'all' }, [{ id: 'e1', name: 'Ana', number: '1' }]);
  for (const mutate of [r => { r.id = "x')"; }, r => { r.fields[0].id = 'f(1)'; }, r => { r.targets[0].id = "e'1"; }]) {
    const request = structuredClone(base); mutate(request);
    assert.throws(() => FieldRequests.importRequestBackup(JSON.stringify({ schemaVersion: 1, requests: [request], templates: [] })), /identificador/i);
  }
});

test('equipment request with employee targets reports target progress', () => {
  let request = FieldRequests.createRequest({ title: 'EPP', category: 'equipment', targetType: 'all', fields: [{ id: 'epp', label: 'EPP', type: 'multiple_choice', options: ['Casco'] }] }, [{ id: 'e1', name: 'Ana', number: '1' }, { id: 'e2', name: 'Luis', number: '2' }]);
  request = FieldRequests.recordResponse(request, { fieldId: 'epp', employeeId: 'e1', value: ['Casco'] });
  assert.equal(FieldRequests.summarizeResults(request).completionPercentage, 50);
});
