const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const scripts = require('../package.json').scripts;
const workflow = readFileSync(require.resolve('../.github/workflows/ci.yml'), 'utf8');
const fullCommand = 'tsc && node --test tests/e2e/app-updates.e2e.mjs tests/e2e/storage-v2.e2e.mjs tests/e2e/theme.e2e.mjs tests/e2e/whatsapp.e2e.mjs tests/e2e/employee-report.e2e.mjs tests/e2e/positions.e2e.mjs tests/e2e/sheet-import.e2e.mjs tests/e2e/tutorials.e2e.mjs';

test('local replay includes update checks and CI excludes only tutorial replay', () => {
  assert.equal(scripts['test:e2e'], fullCommand);
  assert.equal(scripts['test:e2e:ci'], fullCommand.replace(' tests/e2e/tutorials.e2e.mjs', ''));
});

test('manual tutorial opt-in is typed, defaults off, and retains automatic triggers', () => {
  assert.match(workflow, /\n  pull_request:\n  push:\n    branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      run_tutorials:\n        description: [^\n]+\n        type: boolean\n        default: false/);
  assert.match(workflow, /RUN_TUTORIALS: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.run_tutorials == true \}\}/);
});

test('unit checks, browser job identity, prerequisites, and hard failures remain', () => {
  assert.match(workflow, /  unit:\n    name: npm test\n/);
  assert.match(workflow, /      - run: npm test\n/);
  assert.match(workflow, /  tutorials:\n    name: Tutoriales \(modo prueba\)\n/);
  assert.equal((workflow.match(/      - run: npm ci\n/g) || []).length, 2);
  assert.match(workflow, /npm install -g playwright@1\.56\.1 axe-core@4\.14\.0/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /export AXE_PATH="\$\(npm root -g\)\/axe-core\/axe\.min\.js"/);
  assert.doesNotMatch(workflow, /continue-on-error|\|\|\s*true|\n    if:/);
});

test('browser shell selects CI by default, full replay only for true, and propagates failure', () => {
  const block = workflow.match(/        run: \|\n((?:          [^\n]*\n?)+)/);
  assert.ok(block, 'browser routing must be an inspectable shell block');
  const shell = block[1].replace(/^          /gm, '');
  assert.doesNotMatch(shell, /\$\{\{/);
  const stub = 'npm() { if [ "$1" = root ]; then printf /tools; else printf "%s\\n" "$*"; return "${STUB_EXIT:-0}"; fi; };\n';
  for (const value of ['', 'false', 'true']) {
    const result = spawnSync('bash', ['-e', '-c', stub + shell], {
      env: { ...process.env, RUN_TUTORIALS: value, STUB_EXIT: '0' }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), value === 'true' ? 'run test:e2e' : 'run test:e2e:ci');
  }
  const failed = spawnSync('bash', ['-e', '-c', stub + shell], {
    env: { ...process.env, RUN_TUTORIALS: 'false', STUB_EXIT: '7' }, encoding: 'utf8'
  });
  assert.equal(failed.status, 7, failed.stderr);
});

test('connections browser regression has its own executable CI step and global Playwright', () => {
  const step = workflow.match(/      - name: Connections browser regressions\n((?:        [^\n]*\n|          [^\n]*\n?)+)/);
  assert.ok(step, 'connections checks must run in a dedicated browser-job step');
  assert.doesNotMatch(step[1], /^        if:/m, 'connections checks cannot depend on tutorial opt-in');
  const block = step[1].match(/        run: \|\n((?:          [^\n]*\n?)+)/);
  assert.ok(block, 'dedicated step has an executable shell body');
  const shell = block[1].replace(/^          /gm, '');
  const stub = 'npm() { if [ "$1" = root ]; then printf /tools; else printf "%s:%s\\n" "$*" "$PLAYWRIGHT_MODULE"; return "${STUB_EXIT:-0}"; fi; };\n';
  const result = spawnSync('bash', ['-e', '-c', stub + shell], { env: { ...process.env, STUB_EXIT: '0' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'run test:e2e:connections:/tools/playwright/index.mjs', 'a commented command does not execute the regression');
  const failed = spawnSync('bash', ['-e', '-c', stub + shell], { env: { ...process.env, STUB_EXIT: '9' }, encoding: 'utf8' });
  assert.equal(failed.status, 9, 'connections failures fail CI');
});
