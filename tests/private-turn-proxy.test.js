const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
let startDevServer;
before(async () => {
  assert.ok(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'compile the tool and set PRIVATE_TURN_TOOL_OUTPUT; this check must not silently skip');
  ({ startDevServer } = await import(pathToFileURL(path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'dev-server.mjs')).href));
});
const payload = () => ({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: 1700000300000, iceServers: [{ urls: 'turn:turn.test.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] });
async function fixture(t, handler = (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload())); }, extra = {}) {
  const upstream = http.createServer(handler); await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => { upstream.closeAllConnections(); return new Promise(resolve => upstream.close(resolve)); });
  const dev = await startDevServer({ forwardPort: upstream.address().port, port: 0, httpForTests: true, ...extra });
  t.after(() => dev.close()); return dev;
}
function request(origin, changes = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin); const body = changes.body ?? JSON.stringify({ idToken: 'synthetic-token' });
    const req = http.request({ hostname: '127.0.0.1', port: Number(url.port), path: changes.path ?? '/api/turn-creds', method: changes.method ?? 'POST',
      headers: { Host: url.host, Origin: origin, 'Content-Type': 'application/json', ...changes.headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end(body);
  });
}
test('forwards fixed loopback POST without credentials headers and returns no-store', async t => {
  let calls = 0;
  const dev = await fixture(t, (req, res) => {
    calls++; assert.equal(req.url, '/turn-creds'); assert.equal(req.method, 'POST'); assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { assert.deepEqual(JSON.parse(body), { idToken: 'synthetic-token' }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload())); });
  });
  const result = await request(dev.origin); assert.equal(result.status, 200); assert.deepEqual(JSON.parse(result.body), payload()); assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(calls, 1);
});
for (const [label, changes, status] of [
  ['wrong host', { headers: { Host: 'external.invalid' } }, 403], ['wrong origin', { headers: { Origin: 'https://external.invalid' } }, 403],
  ['missing origin', { headers: { Origin: '' } }, 403], ['GET', { method: 'GET' }, 405],
  ['wrong content type', { headers: { 'Content-Type': 'text/plain' } }, 415], ['malformed JSON', { body: 'synthetic-secret-not-json' }, 400],
  ['empty token', { body: '{"idToken":""}' }, 400], ['extra fields', { body: '{"idToken":"synthetic","destination":"external.invalid"}' }, 400],
  ['ambient cookie', { headers: { Cookie: 'synthetic-secret-cookie' } }, 400], ['query route', { path: '/api/turn-creds?destination=external.invalid' }, 400]
]) test(`rejects ${label} without contacting upstream`, async t => {
  let calls = 0; const dev = await fixture(t, () => { calls++; }); const result = await request(dev.origin, changes);
  assert.equal(result.status, status); assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(calls, 0); assert.doesNotMatch(result.body, /synthetic-secret/);
});
test('caps request body before upstream', async t => { let calls = 0; const dev = await fixture(t, () => { calls++; }, { maxRequestBytes: 64 }); const result = await request(dev.origin, { body: JSON.stringify({ idToken: 'x'.repeat(100) }) }); assert.equal(result.status, 413); assert.equal(calls, 0); });
for (const [label, handler, expected] of [
  ['redirect', (_req, res) => { res.writeHead(302, { Location: 'https://external.invalid/synthetic-secret' }); res.end(); }, 502],
  ['upstream error', (_req, res) => { res.writeHead(403); res.end('synthetic-secret-upstream'); }, 502],
  ['malformed response', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('synthetic-secret-not-json'); }, 502],
  ['oversized response', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('x'.repeat(32769)); }, 502],
  ['timeout', () => {}, 504]
]) test(`redacts ${label} and does not redirect`, async t => { const dev = await fixture(t, handler, { timeoutMs: 40 }); const result = await request(dev.origin); assert.equal(result.status, expected); assert.doesNotMatch(result.body, /synthetic-secret|stack|Location/); assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.headers['access-control-allow-origin'], undefined); });
test('static allowlist rejects traversal, unlisted assets and symlink escape', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-static-')); const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-outside-'));
  t.after(() => Promise.all([fs.rm(root, { recursive: true }), fs.rm(outside, { recursive: true })]));
  await fs.writeFile(path.join(root, 'index.html'), '<h1>synthetic app</h1>'); await fs.writeFile(path.join(outside, 'escape.js'), 'synthetic-secret'); await fs.symlink(path.join(outside, 'escape.js'), path.join(root, 'escape.js'));
  const dev = await fixture(t, undefined, { appRoot: root, assets: ['index.html', 'escape.js'] });
  assert.equal((await request(dev.origin, { method: 'GET', path: '/', body: '' })).status, 200);
  for (const target of ['/unlisted.json', '/%2e%2e/escape.js', '/escape.js', '/.git/config']) { const result = await request(dev.origin, { method: 'GET', path: target, body: '' }); assert.notEqual(result.status, 200); assert.doesNotMatch(result.body, /synthetic-secret/); }
});
test('factory rejects missing TLS outside explicit HTTP fixture mode and invalid ports', async () => {
  await assert.rejects(startDevServer({ forwardPort: 12345, port: 0 }), /TURN_DEV_CONFIGURATION_INVALID/);
  await assert.rejects(startDevServer({ forwardPort: 0, port: 0, httpForTests: true }), /TURN_DEV_CONFIGURATION_INVALID/);
});

test('bounds chunked upstream responses without relying on Content-Length', async t => {
  const dev = await fixture(t, (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.write('x'.repeat(20000)); res.end('x'.repeat(20000)); });
  assert.equal((await request(dev.origin)).status, 502);
});
test('request timeout does not wait indefinitely for a partial body', async t => {
  let calls = 0; const dev = await fixture(t, () => { calls++; }, { timeoutMs: 40 });
  const result = await new Promise((resolve, reject) => {
    const url = new URL(dev.origin); const req = http.request({ hostname: '127.0.0.1', port: Number(url.port), path: '/api/turn-creds', method: 'POST', headers: { Host: url.host, Origin: dev.origin, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
      res.resume(); res.on('end', () => { resolve(res.statusCode); req.destroy(); });
    }); req.on('error', reject); req.write('{"idToken":"');
  }); assert.equal(result, 408); assert.equal(calls, 0);
});
test('proxy never logs known synthetic credentials or upstream errors', async t => {
  const logs = [], originalLog = console.log, originalError = console.error;
  console.log = (...args) => logs.push(args); console.error = (...args) => logs.push(args);
  try {
    const dev = await fixture(t); assert.equal((await request(dev.origin)).status, 200);
    await request(dev.origin, { body: 'synthetic-secret-error' }); assert.deepEqual(logs, []);
  } finally { console.log = originalLog; console.error = originalError; }
});
