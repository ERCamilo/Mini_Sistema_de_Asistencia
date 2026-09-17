const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Mini backup restore accepts canonical workContexts snapshot including empty contexts', () => {
  assert.match(html, /parsed\.workContexts && typeof parsed\.workContexts === 'object'/);
  assert.match(html, /Array\.isArray\(parsed\.workContexts\.contexts\)/);
  assert.match(html, /workContextsSnapshot = \{/);
  assert.match(html, /window\.workContextManager\.importSnapshot\(workContextsSnapshot\)/);
});

test('Mini backup restore keeps legacy workContexts array compatibility by normalizing it', () => {
  assert.match(html, /Array\.isArray\(parsed\.workContexts\)[\s\S]*?workContextsSnapshot = \{ schemaVersion: 1, contexts: parsed\.workContexts, activeContextId: null \}/);
});

test('backup preview counts contexts from canonical snapshot instead of requiring a root array', () => {
  assert.match(html, /parsed\.workContexts && Array\.isArray\(parsed\.workContexts\.contexts\) \? parsed\.workContexts\.contexts : \[\]/);
  assert.match(html, /workContextList\.length/);
});
