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
test('accepts documented nested unix-seconds expiry and strips it from RTC servers', async t => {
  const expected = payload();
  expected.expiresAt = 1700000300;
  expected.iceServers.unshift({ urls: 'stun:turn.test.invalid:3478' });
  const upstream = structuredClone(expected);
  upstream.iceServers[1].expiresAt = expected.expiresAt;
  const dev = await fixture(t, (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(upstream));
  });
  const result = await request(dev.origin);
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), expected);
  assert.equal(result.headers['cache-control'], 'no-store');
});
for (const [label, metadata] of [
  ['string expiry', { expiresAt: '1700000300' }],
  ['mismatched expiry', { expiresAt: 1700000301 }],
  ['fractional expiry', { expiresAt: 1700000300.5 }],
  ['null expiry', { expiresAt: null }],
  ['zero expiry', { expiresAt: 0 }],
  ['negative expiry', { expiresAt: -1 }],
  ['unsafe expiry', { expiresAt: Number.MAX_SAFE_INTEGER + 1 }],
  ['unrelated metadata', { expiresAt: 1700000300, unrelated: 'synthetic-secret' }]
]) test(`rejects nested ${label} without leaking upstream response`, async t => {
  const upstream = payload();
  upstream.expiresAt = 1700000300;
  Object.assign(upstream.iceServers[0], metadata);
  const dev = await fixture(t, (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(upstream));
  });
  const result = await request(dev.origin);
  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(result.body), { error: 'TURN_UPSTREAM_UNAVAILABLE' });
  assert.doesNotMatch(result.body, /synthetic-secret|synthetic-password/);
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

async function tlsFixture(t, extra = {}) {
  const https = require('node:https'), { execFileSync } = require('node:child_process');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-tls-unit-'));
  t.after(() => fs.rm(root, { recursive: true }));
  const keyPath = path.join(root, 'test.key'), certPath = path.join(root, 'test.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const cert = await fs.readFile(certPath), key = await fs.readFile(keyPath);
  const dev = await startDevServer({ forwardPort: 12345, port: 0, tls: { cert, key }, ...extra });
  t.after(() => dev.close());
  const get = target => new Promise((resolve, reject) => {
    const req = https.get(dev.origin + target, { ca: cert, agent: false }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() })); }); req.on('error', reject);
  }); return { dev, get, root };
}
test('HTTPS opt-in injects immediately after the known core without changing source HTML', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-html-')); t.after(() => fs.rm(root, { recursive: true }));
  const html = '<html><body><script src="./firebase-field-config.js"></script><script src="./p2p-core.js"></script><script>window.caller=true</script></body></html>';
  await fs.writeFile(path.join(root, 'index.html'), html);
  const f = await tlsFixture(t, { appRoot: root, assets: ['index.html'], bootstrap: { enabled: true, appIdentity: 'mini', contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' }, canonicalRoot: path.resolve(__dirname, '..') } });
  const result = await f.get('/'); assert.equal(result.status, 200); assert.match(result.body, /PrivateTurnBootstrap\.install/); assert.match(result.body, /"diagnostics":true/);
  assert.ok(result.body.indexOf('/__private-turn/bootstrap.js') < result.body.indexOf('window.caller')); assert.ok(result.body.indexOf('window.MiniFirebaseFieldConfig=') < result.body.indexOf('./firebase-field-config.js')); assert.equal(await fs.readFile(path.join(root, 'index.html'), 'utf8'), html);
});
test('no opt-in serves byte-identical HTML and exposes no implicit shared scripts', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-html-')); t.after(() => fs.rm(root, { recursive: true }));
  const html = '<html>  unchanged\n<script src="js/p2p/P2PCore.js"></script></html>'; await fs.writeFile(path.join(root, 'index.html'), html);
  const f = await tlsFixture(t, { appRoot: root, assets: ['index.html'] }); assert.equal((await f.get('/')).body, html); assert.equal((await f.get('/__private-turn/bootstrap.js')).status, 404);
});
test('SA opt-in uses fixed modular Auth import and canonical shared assets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-sa-html-')); t.after(() => fs.rm(root, { recursive: true }));
  await fs.writeFile(path.join(root, 'index.html'), '<html><script src="js/p2p/P2PCore.js"></script><script type="module" src="js/app.js"></script></html>');
  const f = await tlsFixture(t, { appRoot: root, assets: ['index.html'], bootstrap: { enabled: true, appIdentity: 'sa', contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' }, canonicalRoot: path.resolve(__dirname, '..') } });
  const result = await f.get('/'); assert.match(result.body, /import\("\/js\/modules\/data\/firebase\.js"\)/); assert.doesNotMatch(result.body, /sa-field-only|initializeApp/);
  assert.equal((await f.get('/__private-turn/provider.js')).body, await fs.readFile(path.resolve(__dirname, '../private-turn.js'), 'utf8'));
  assert.equal((await f.get('/__private-turn/bootstrap.js')).body, await fs.readFile(path.resolve(__dirname, '../private-turn-bootstrap.js'), 'utf8'));
});
test('opt-in rejects HTTP and invalid serialization before exposing HTML', async () => {
  await assert.rejects(startDevServer({ forwardPort: 12345, port: 0, httpForTests: true, bootstrap: { enabled: true, appIdentity: 'mini', contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' }, canonicalRoot: path.resolve(__dirname, '..') } }), /TURN_DEV_CONFIGURATION_INVALID/);
});

test('private reverse proxy requires exact explicit HTTPS origin and ignores forwarded headers',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'private-turn-reverse-'));t.after(()=>fs.rm(root,{recursive:true}));await fs.writeFile(path.join(root,'index.html'),'<html>unchanged</html>');const origin='https://a2.tail2a0a8e.ts.net:8443';const dev=await startDevServer({forwardPort:12345,port:0,reverseProxy:true,publicOrigin:origin,appRoot:root,assets:['index.html']});t.after(()=>dev.close());const raw=async headers=>new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:dev.port,path:'/',headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});assert.equal(await raw({Host:new URL(origin).host}),200);assert.equal(await raw({Host:'evil.invalid','X-Forwarded-Host':new URL(origin).host,'X-Forwarded-Proto':'https'}),403);for(const change of [{reverseProxy:true},{reverseProxy:true,publicOrigin:'https://foreign.invalid'},{reverseProxy:true,publicOrigin:'http://a2.tail2a0a8e.ts.net:8443'}])await assert.rejects(startDevServer({forwardPort:12345,port:0,...change}),/TURN_DEV_CONFIGURATION_INVALID/);});
test('missing Mini Auth initialization anchor fails closed without changing source',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'private-turn-anchor-'));t.after(()=>fs.rm(root,{recursive:true}));const html='<html><script src="./p2p-core.js"></script></html>';await fs.writeFile(path.join(root,'index.html'),html);const f=await tlsFixture(t,{appRoot:root,assets:['index.html'],bootstrap:{enabled:true,appIdentity:'mini',contract:{ttlUnit:'seconds',expiresAtFormat:'unix-milliseconds'},canonicalRoot:path.resolve(__dirname,'..')}});assert.equal((await f.get('/')).status,404);assert.equal(await fs.readFile(path.join(root,'index.html'),'utf8'),html);});

test('forwards validated issuer Date rather than proxy-generated Date', async t => {
  const issued = 'Tue, 14 Nov 2023 22:13:20 GMT';
  const dev = await fixture(t, (_req, res) => { res.setHeader('Date', issued); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload())); });
  const result = await request(dev.origin); assert.equal(result.status, 200); assert.equal(result.headers['x-turn-issued-date'], issued);
});
for (const date of [undefined, 'invalid', ['Tue, 14 Nov 2023 22:13:20 GMT', 'Tue, 14 Nov 2023 22:13:20 GMT']]) test(`does not substitute proxy date for invalid issuer date ${JSON.stringify(date)}`, async t => {
  const dev = await fixture(t, (_req, res) => { res.sendDate = false; if (date !== undefined) res.setHeader('Date', date); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload())); });
  const result = await request(dev.origin); assert.equal(result.headers['x-turn-issued-date'], undefined);
});

test('private HTML carries explicit loaded beta identity and validates bounded metadata', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-turn-release-')); t.after(() => fs.rm(root, { recursive: true }));
  const html = '<html><script src="./firebase-field-config.js"></script><script src="./p2p-core.js"></script></html>';
  await fs.writeFile(path.join(root, 'index.html'), html);
  const bootstrap = { enabled: true, appIdentity: 'mini', contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds' }, canonicalRoot: path.resolve(__dirname, '..'), previewRelease: { label: 'beta 1.0', revision: 'abcdef123456' } };
  const f = await tlsFixture(t, { appRoot: root, assets: ['index.html'], bootstrap });
  assert.match((await f.get('/')).body, /"previewRelease":\{"label":"beta 1\.0","revision":"abcdef123456"\}/);
  assert.equal(await fs.readFile(path.join(root, 'index.html'), 'utf8'), html);
  for (const previewRelease of [{ label: 'private@example.com', revision: 'abcdef1' }, { label: 'beta 1.0', revision: 'not-a-commit' }, { label: 'beta 1.0' }, { label: 'beta ' + '1'.repeat(40), revision: 'abcdef1' }]) {
    await assert.rejects(startDevServer({ forwardPort: 12345, port: 0, reverseProxy: true, publicOrigin: 'https://a2.tail2a0a8e.ts.net:8443', bootstrap: { ...bootstrap, previewRelease } }), /TURN_DEV_CONFIGURATION_INVALID/);
  }
});
test('operator CLI accepts paired release identity and refuses unpaired or unsafe metadata', async t => {
  const { spawn } = require('node:child_process');
  const tool = path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'dev-server.mjs');
  const root = path.resolve(__dirname, '..');
  const base = ['--forward-port', '19753', '--port', '0', '--reverse-proxy', '--public-origin', 'https://a2.tail2a0a8e.ts.net:8443', '--app', 'mini', '--root', root, '--canonical-root', root, '--expiry-format', 'unix-seconds'];
  async function run(args, expected) {
    const child = spawn(process.execPath, [tool, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => child.kill());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI deadline')); }, 5000);
      let ready = false;
      child.stdout.on('data', data => { if (String(data).includes('private-turn-dev:ready')) { ready = true; child.kill(); } });
      child.on('error', reject); child.on('exit', code => { clearTimeout(timer); try { assert.equal(ready, expected); if (!expected) assert.equal(code, 1); resolve(); } catch (error) { reject(error); } });
    });
  }
  await run([...base, '--preview-release', 'beta 1.0', '--preview-revision', 'abcdef123456'], true);
  for (const args of [['--preview-release', 'beta 1.0'], ['--preview-revision', 'abcdef1'], ['--preview-release', 'beta 1.0', '--preview-revision', 'invalid'], ['--preview-release', 'account@example.com', '--preview-revision', 'abcdef1']]) await run([...base, ...args], false);
  await run(['--forward-port', '19753', '--reverse-proxy', '--public-origin', 'https://a2.tail2a0a8e.ts.net:8443', '--preview-release', 'beta 1.0', '--preview-revision', 'abcdef1'], false);
});
