const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Mini backup restore accepts canonical workContexts snapshot including empty contexts', () => {
  const summary = require('../mini-backup-summary.js');
  assert.equal(summary.validate({ users: [{ id: 'u1' }], workContexts: { contexts: [], activeContextId: null } }).workContexts, 0);
  assert.match(html, /workContexts: workContextsSnapshot/);
  assert.match(html, /window\.workContextManager\?\.importSnapshot\(state\.workContexts\)/);
});

test('Mini backup restore keeps legacy workContexts array compatibility by normalizing it', () => {
  assert.match(html, /Array\.isArray\(parsed\.workContexts\)\s*\? \{ schemaVersion: 1, contexts: parsed\.workContexts, activeContextId: null \}/);
});

test('backup preview counts contexts from canonical snapshot instead of requiring a root array', () => {
  assert.match(html, /count\(summary\.workContexts, 'obra'\)/);
});
