const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { iconMarkup } = require('../icon-set.js');
const { createRequest, createTemplateFromRequest } = require('../field-requests.js');
const { normalizeSnapshot } = require('../local-db.js');

test('index.html contains complete markup for Solicitudes module', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  // Views & navigation
  assert.match(html, /id="requests-view"/);
  assert.match(html, /id="nav-requests"/);
  assert.match(html, /data-icon="requests"/);
  assert.match(html, /id="btn-req-tab-open"/);
  assert.match(html, /id="btn-req-tab-completed"/);
  assert.match(html, /id="btn-req-tab-closed"/);
  assert.match(html, /id="btn-req-tab-templates"/);

  // Modals
  assert.match(html, /id="modal-request-create"/);
  assert.match(html, /id="modal-request-answering"/);
  assert.match(html, /id="modal-request-review"/);

  // Scripts
  assert.match(html, /src="\.\/field-requests\.js"/);
  assert.match(html, /NAV_VIEWS\s*=\s*\[[^\]]*'requests'[^\]]*\]/);
  assert.match(html, /VIEW_TITLES\s*=\s*\{[^}]*requests:\s*'Solicitudes'[^}]*\}/);
});

test('IconSet provides all Solicitudes icons in both modern and emoji styles', () => {
  const reqIcons = ['requests', 'star', 'starFilled', 'copy', 'share', 'package', 'wrench', 'filter'];
  reqIcons.forEach(name => {
    const modern = iconMarkup(name, 'lucide');
    const emoji = iconMarkup(name, 'emoji');
    assert.ok(modern.length > 0, `Modern icon for ${name} should not be empty`);
    assert.ok(emoji.length > 0, `Emoji icon for ${name} should not be empty`);
  });
});

test('LocalDb captures and restores requests and templates', () => {
  const sampleRequest = createRequest({
    title: 'Horas extra hoy',
    category: 'personal',
    priority: 'urgent',
    targetType: 'all',
    fields: [{ id: 'f1', label: '¿Se queda?', type: 'boolean' }],
    allEmployees: [{ id: 'emp-1', name: 'Juan', number: '1', position: 'Albañil' }]
  });

  const sampleTemplate = createTemplateFromRequest(sampleRequest);

  const snapshot = {
    schemaVersion: 1,
    users: [{ id: 'emp-1', name: 'Juan', number: '1', position: 'Albañil' }],
    attendance: {},
    settings: { appTheme: 'ocean' },
    requests: [sampleRequest],
    templates: [sampleTemplate],
    lastUpdateTimestamp: '10:00 AM'
  };

  const normalized = normalizeSnapshot(snapshot);
  assert.equal(normalized.requests.length, 1);
  assert.equal(normalized.requests[0].title, 'Horas extra hoy');
  assert.equal(normalized.templates.length, 1);
  assert.equal(normalized.templates[0].title, 'Horas extra hoy');
});

test('every built-in template creates a valid request cleanly', () => {
  const { getDefaultTemplates } = require('../field-requests.js');
  const defaults = getDefaultTemplates();
  const mockUsers = [
    { id: 'u1', name: 'Carlos Gomez', number: '1', position: 'Albañil' },
    { id: 'u2', name: 'Luis Pérez', number: '2', position: 'Fierrero' }
  ];

  assert.equal(defaults.length, 9);
  defaults.forEach(tpl => {
    const req = createRequest({
      title: tpl.title || tpl.name,
      category: tpl.category,
      priority: tpl.priority,
      targetType: tpl.targetType,
      targetPosition: tpl.targetPosition,
      fields: tpl.fields,
      templateId: tpl.id,
      allEmployees: mockUsers
    });

    assert.ok(req.id, `Template ${tpl.id} should generate a valid request id`);
    assert.equal(req.title, tpl.title || tpl.name);
    assert.equal(req.category, tpl.category);
    assert.ok(req.fields.length > 0, `Template ${tpl.id} should have at least 1 field`);
    if (tpl.targetType === 'all') {
      assert.equal(req.targets.length, 2, `Template ${tpl.id} with targetType all should snapshot the 2 target employees`);
    } else {
      assert.equal(req.targets.length, 0, `Template ${tpl.id} without targetType all should have 0 target employees`);
    }
  });
});

test('answer text, number and comment controls commit on blur before reload', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /type="number"[^>]+onblur="\$\{action\}/);
  assert.match(html, /<textarea[^>]+onblur="\$\{action\}/);
  assert.match(html, /type="text" class="search-input"[^>]+onblur="\$\{action\}/);
  assert.match(html, /placeholder="Detalle opcional"[^>]+onblur="updateEmployeeCommentEncoded/);
  assert.match(html, /placeholder="Nota o comentario adicional"[^>]+onblur="setGeneralCommentEncoded/);
});

test('custom template UI supports edit, duplicate and confirmed delete', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /function openEditRequestTemplate\(templateId\)/);
  assert.match(html, /function duplicateRequestTemplate\(templateId\)/);
  assert.match(html, /function deleteRequestTemplate\(templateId\)/);
  assert.match(html, /showConfirm\('¿Eliminar esta plantilla/);
  assert.match(html, /FieldRequests\.updateTemplate/);
  assert.match(html, /FieldRequests\.duplicateTemplate/);
});

test('Solicitudes keeps bottom navigation geometry stable across scrollbar changes', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /html\s*\{[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(html, /\.bottom-nav\s*\{[^}]*box-sizing:\s*border-box/s);
});

test('center FAB opens Nueva solicitud contextually and still closes a big modal first', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const handler = html.slice(html.indexOf('function handleNavFab()'), html.indexOf('function topmostModal'));
  assert.match(handler, /if \(activeBigModal\) \{ closeModal\(activeBigModal\); return; \}/);
  assert.match(handler, /if \(currentView === 'requests'\) \{ openNewRequestModal\(\); return; \}/);
});

test('request cards are compact and expose confirmed non-bubbling delete', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /class="req-card-delete"[^>]+event\.stopPropagation\(\); deleteRequestFromCard/);
  assert.match(html, /class="req-card-delete"[\s\S]+?data-icon="trash"/);
  assert.match(html, /function deleteRequestFromCard\(requestId\)[\s\S]+showConfirm[\s\S]+if \(!confirmed\) return;[\s\S]+requests = requests\.filter[\s\S]+saveData\(\)/);
  assert.match(html, /\.req-card\s*\{[^}]*padding:\s*12px[^}]*margin-bottom:\s*8px[^}]*gap:\s*6px/s);
  assert.match(html, /\.req-card-delete\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s);
});

test('service worker cache version advances for Solicitudes UI release', () => {
  const sw = readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');
  assert.match(sw, /asistencia-v2\.(?:1[2-9]|[2-9]\d)\.0/);
});
