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

test('stable Mini review preview enables the same existing public configuration', () => {
    const previous = { location: { hostname: 'firebase-circuit-test.mini-sistema-asistencia-preview.pages.dev' } };
    const current = { location: { hostname: 'mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev' } };
    vm.runInNewContext(source, previous);
    vm.runInNewContext(source, current);
    assert.ok(current.MiniFirebaseFieldConfig);
    assert.equal(JSON.stringify(current.MiniFirebaseFieldConfig), JSON.stringify(previous.MiniFirebaseFieldConfig));
});

test('production, immutable previews, lookalikes and absent hostname stay disabled', () => {
    for (const hostname of [undefined, '', 'mini-sistema-asistencia-preview.pages.dev', 'db15e8a7.mini-sistema-asistencia-preview.pages.dev', 'mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev.attacker.test', 'other.mini-sistema-asistencia-preview.pages.dev', 'localhost']) {
        const root = { location: { hostname } };
        vm.runInNewContext(source, root);
        assert.equal(root.MiniFirebaseFieldConfig, null);
    }
});

test('explicit injected configuration is preserved on the new preview and denied hosts', () => {
    for (const hostname of ['mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev', 'mini.example.test']) {
        const injected = { endpoint: 'https://fixture.example.test' };
        const root = { location: { hostname }, MiniFirebaseFieldConfig: injected };
        vm.runInNewContext(source, root);
        assert.equal(root.MiniFirebaseFieldConfig, injected);
    }
});
