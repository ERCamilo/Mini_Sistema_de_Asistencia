const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('all inline script tags in index.html have valid JavaScript syntax', () => {
  const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptCount = 0;

  while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1].trim();
    if (!code) continue;
    scriptCount++;
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: `index.html#script-${scriptCount}` });
    }, `Syntax error in inline script #${scriptCount} of index.html`);
  }

  assert.ok(scriptCount > 0, 'At least one inline script should be present in index.html');
});
