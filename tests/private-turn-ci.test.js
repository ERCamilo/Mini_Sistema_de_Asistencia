const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const unit = workflow.match(/^  unit:\n([\s\S]*?)(?=^  \w+:|$(?![\s\S]))/m)[1];
const commands = [...unit.matchAll(/^      - run: (.+)$|^        run: (.+)$/gm)]
  .map(match => match[1] || match[2]);
const expectedNames = ['Install isolated private TURN tool typings', 'Compile private TURN test tool', 'Export private TURN test tool output'];

function requiredCommands() {
  assert.equal(commands.length, 5, 'unit job must install, compile and export the tool between npm ci and npm test');
  assert.equal(commands[0], 'npm ci');
  assert.equal(commands[4], 'npm test');
  return commands;
}

// Stubs exercise the extracted shell steps, not a real type install/compilation.
// Actual pinned-package compilation is a separate CI/local acceptance check.
function runUnit(t, fail = '') {
  const steps = requiredCommands();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-turn-ci-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const compilerDir = path.join(root, 'node_modules/.bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(compilerDir, { recursive: true });
  const recorder = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
const command = path.basename(process.argv[1]) === 'tsc' ? 'compile' : args[0];
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ command, args, output: process.env.PRIVATE_TURN_TOOL_OUTPUT || null }) + '\\n');
if (command === process.env.FAIL_STEP) process.exit(17);
if (command === 'compile') {
  const output = args[args.indexOf('--outDir') + 1];
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'dev-server.mjs'), '// synthetic compiler output');
}
if (command === 'test' && !fs.existsSync(path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT || '', 'dev-server.mjs'))) process.exit(18);
`;
  fs.writeFileSync(path.join(bin, 'npm'), recorder, { mode: 0o755 });
  fs.writeFileSync(path.join(compilerDir, 'tsc'), recorder, { mode: 0o755 });
  const envFile = path.join(root, 'github-env');
  fs.writeFileSync(envFile, 'RUNNER_MARKER=preserved\n');
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: path.join(root, 'runner temp'),
    GITHUB_ENV: envFile, CALL_LOG: path.join(root, 'calls.jsonl'), FAIL_STEP: fail };
  delete env.PRIVATE_TURN_TOOL_OUTPUT;
  let status;
  for (const command of steps) {
    // Each Actions run is a new fail-fast bash process; later steps require success.
    const result = spawnSync('bash', ['-e', '-c', command], { cwd: root, env, encoding: 'utf8' });
    status = result.status;
    if (status !== 0) break;
    for (const line of fs.readFileSync(envFile, 'utf8').trim().split('\n')) {
      const separator = line.indexOf('=');
      env[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
  const calls = fs.existsSync(env.CALL_LOG) ? fs.readFileSync(env.CALL_LOG, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { status, calls, env, exported: fs.readFileSync(envFile, 'utf8') };
}

test('unit CI prepares pinned isolated tool prerequisites before unchanged required tests', () => {
  const steps = requiredCommands();
  for (const name of expectedNames) assert.ok(unit.includes(`      - name: ${name}\n`));
  assert.match(unit, /node-version: 22\n/);
  assert.doesNotMatch(unit, /continue-on-error|(?:^|\n)\s*if:|\|\|\s*true/);
  assert.equal(steps[1], 'npm install --prefix "$RUNNER_TEMP/private-turn-types" --no-package-lock --ignore-scripts --no-audit --no-fund @types/node@22.10.2');
  assert.equal(steps[2], './node_modules/.bin/tsc -p scripts/private-turn/tsconfig.json --typeRoots "$RUNNER_TEMP/private-turn-types/node_modules/@types" --outDir "$RUNNER_TEMP/private-turn-tool"');
  assert.equal(steps[3], 'echo "PRIVATE_TURN_TOOL_OUTPUT=$RUNNER_TEMP/private-turn-tool" >> "$GITHUB_ENV"');
  const pkg = require('../package.json');
  assert.deepEqual(Object.keys(pkg.devDependencies), ['typescript']);
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  const lock = require('../package-lock.json');
  assert.deepEqual(Object.keys(lock.packages).sort(), ['', 'node_modules/typescript']);
});

test('executed unit steps append GITHUB_ENV and expose the output to a following test process', t => {
  const result = runUnit(t);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls.map(call => call.command), ['ci', 'install', 'compile', 'test']);
  assert.deepEqual(result.calls[1].args, ['install', '--prefix', `${result.env.RUNNER_TEMP}/private-turn-types`, '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', '@types/node@22.10.2']);
  assert.deepEqual(result.calls[2].args, ['-p', 'scripts/private-turn/tsconfig.json', '--typeRoots', `${result.env.RUNNER_TEMP}/private-turn-types/node_modules/@types`, '--outDir', `${result.env.RUNNER_TEMP}/private-turn-tool`]);
  assert.equal(result.calls[2].output, null, 'the export must not precede compilation');
  assert.equal(result.calls[3].output, `${result.env.RUNNER_TEMP}/private-turn-tool`);
  assert.equal(result.exported, `RUNNER_MARKER=preserved\nPRIVATE_TURN_TOOL_OUTPUT=${result.env.RUNNER_TEMP}/private-turn-tool\n`);
});

for (const [failure, expectedCalls] of [
  ['install', ['ci', 'install']], ['compile', ['ci', 'install', 'compile']]
]) test(`${failure} failure stops unit CI before environment export or npm test`, t => {
  const result = runUnit(t, failure);
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls.map(call => call.command), expectedCalls);
  assert.equal(result.exported, 'RUNNER_MARKER=preserved\n');
  assert.equal(result.env.PRIVATE_TURN_TOOL_OUTPUT, undefined);
});
