const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../firebase-field-config.js'), 'utf8');

test('field configuration is disabled without a browser hostname', () => {
    const root = {};
    vm.runInNewContext(source, root);
    assert.equal(root.MiniFirebaseFieldConfig, null);
});

test('field configuration is disabled outside the explicit preview hostname', () => {
    const root = { location: { hostname: 'mini.example.test' } };
    vm.runInNewContext(source, root);
    assert.equal(root.MiniFirebaseFieldConfig, null);
});

test('field configuration exposes existing public metadata only on the preview hostname', () => {
    const root = { location: { hostname: 'firebase-circuit-test.mini-sistema-asistencia-preview.pages.dev' } };
    vm.runInNewContext(source, root);
    assert.equal(root.MiniFirebaseFieldConfig.endpoint, 'https://firebase-bridge-test.erlin.do');
    assert.equal(root.MiniFirebaseFieldConfig.firebase.projectId, 'phoenix-asistencia-ab641');
});

test('field configuration preserves an explicitly supplied deployment configuration', () => {
    const injected = { endpoint: 'https://fixture.example.test' };
    const root = { location: { hostname: 'firebase-circuit-test.mini-sistema-asistencia-preview.pages.dev' }, MiniFirebaseFieldConfig: injected };
    vm.runInNewContext(source, root);
    assert.equal(root.MiniFirebaseFieldConfig, injected);
});
