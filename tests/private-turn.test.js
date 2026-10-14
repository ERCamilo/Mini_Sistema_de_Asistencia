const test = require('node:test');
const assert = require('node:assert/strict');
const Turn = require('../private-turn.js');
const contract = { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(overrides = {}) {
  let time = 1700000000000, user = { uid: 'one', getIdToken: async () => 'synthetic-token' }, calls = 0;
  const payload = () => ({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: time + 300000,
    iceServers: [{ urls: 'stun:turn.test.invalid:3478' }, { urls: ['turn:turn.test.invalid:3478?transport=udp', 'turns:turn.test.invalid:5349?transport=tcp'], username: 'synthetic-user', credential: 'synthetic-password' }] });
  const options = { enabled: true, origin: 'https://127.0.0.1:9443', contract, getUser: () => user, now: () => time,
    fetcher: async () => { calls++; return Response.json(payload()); }, ...overrides };
  const provider = Turn.createProvider(options);
  return { provider, options, payload, calls: () => calls, setUser: value => { user = value; }, advance: value => { time += value; }, time: () => time };
}
test('guest and disabled provider do not acquire credentials', async () => {
  const f = fixture(); f.setUser(null); assert.equal(await f.provider.getConfiguration(), null); assert.equal(f.calls(), 0);
  const disabled = fixture({ enabled: false }); assert.equal(await disabled.provider.getConfiguration(), null); assert.equal(disabled.calls(), 0);
});
test('requires explicit units and trusted HTTPS loopback when enabled', () => {
  for (const change of [{ contract: undefined }, { contract: { expiresAtFormat: 'unix-milliseconds' } }, { contract: { ttlUnit: 'milliseconds', expiresAtFormat: 'unix-milliseconds' } }, { origin: 'http://127.0.0.1' }, { origin: 'https://remote.invalid' }]) {
    assert.throws(() => fixture(change), /TURN_CONFIGURATION_INVALID/);
  }
});
test('uses fixed same-origin POST without cookies or redirects', async () => {
  const f = fixture({ fetcher: async (url, init) => {
    assert.equal(url, '/api/turn-creds'); assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.deepEqual(JSON.parse(init.body), { idToken: 'synthetic-token' });
    return Response.json(f.payload());
  } });
  const result = await f.provider.getConfiguration(); assert.equal(result.iceTransportPolicy, 'all'); assert.equal(result.iceServers.length, 2);
});
test('deduplicates in flight and returns isolated cached configurations', async () => {
  const pending = deferred(); let calls = 0;
  const f = fixture({ fetcher: () => { calls++; return pending.promise; } });
  const one = f.provider.getConfiguration(), two = f.provider.getConfiguration();
  await Promise.resolve(); pending.resolve(Response.json(f.payload()));
  const [a, b] = await Promise.all([one, two]); assert.equal(calls, 1); assert.notEqual(a, b);
  a.iceServers[1].urls[0] = 'turn:mutated.invalid'; a.iceServers[1].credential = 'changed';
  const c = await f.provider.getConfiguration(); assert.equal(c.iceServers[1].credential, 'synthetic-password'); assert.equal(b.iceServers[1].urls[0], f.payload().iceServers[1].urls[0]);
});
test('renews before a new session near expiry and after expiry', async () => {
  const f = fixture(); await f.provider.getConfiguration(); f.advance(284999); await f.provider.getConfiguration(); assert.equal(f.calls(), 1);
  f.advance(1); await f.provider.getConfiguration(); assert.equal(f.calls(), 2); f.advance(300001); await f.provider.getConfiguration(); assert.equal(f.calls(), 3);
});
for (const boundary of ['token', 'fetch', 'body']) {
  for (const change of ['different account', 'logout', 'same UID new generation']) {
    test(`rejects stale ${change} during ${boundary}`, async () => {
      const gate = deferred(), entered = deferred();
      const f = fixture({ fetcher: async () => {
        if (boundary === 'fetch') { entered.resolve(); return gate.promise; }
        if (boundary === 'body') return new Response(new ReadableStream({ start(controller) { entered.resolve(); gate.promise.then(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify(f.payload()))); controller.close(); }); } }), { headers: { 'Content-Type': 'application/json' } });
        return Response.json(f.payload());
      } });
      if (boundary === 'token') f.setUser({ uid: 'one', getIdToken: () => { entered.resolve(); return gate.promise; } });
      const pending = f.provider.getConfiguration(); const rejected = assert.rejects(pending, /TURN_ACCOUNT_CHANGED/); await entered.promise;
      if (change === 'logout') f.setUser(null);
      else if (change === 'different account') f.setUser({ uid: 'two', getIdToken: async () => 'synthetic-second-token' });
      else f.provider.invalidate();
      gate.resolve(boundary === 'token' ? 'synthetic-token' : boundary === 'fetch' ? Response.json(f.payload()) : undefined); await rejected;
    });
  }
}
test('old request finalizer cannot clear a new generation request', async () => {
  const old = deferred(), fresh = deferred(), oldEntered = deferred(), freshEntered = deferred(); let calls = 0;
  const f = fixture({ fetcher: () => { if (++calls === 1) { oldEntered.resolve(); return old.promise; } freshEntered.resolve(); return fresh.promise; } });
  const first = f.provider.getConfiguration(); const rejected = assert.rejects(first, /TURN_ACCOUNT_CHANGED/); await oldEntered.promise;
  f.provider.invalidate(); const second = f.provider.getConfiguration(); await freshEntered.promise; old.resolve(Response.json(f.payload())); await rejected;
  const third = f.provider.getConfiguration(); fresh.resolve(Response.json(f.payload())); await Promise.all([second, third]); assert.equal(calls, 2);
});
for (const expiresAtFormat of ['unix-seconds', 'unix-milliseconds', 'iso8601']) {
  test(`decodes declared ${expiresAtFormat} without guessing`, async () => {
    const f = fixture({ contract: { ttlUnit: 'seconds', expiresAtFormat }, fetcher: async () => {
      const body = f.payload(); body.expiresAt = expiresAtFormat === 'unix-seconds' ? body.expiresAt / 1000 : expiresAtFormat === 'iso8601' ? new Date(body.expiresAt).toISOString() : body.expiresAt;
      return Response.json(body);
    } }); assert.ok(await f.provider.getConfiguration());
  });
}
for (const [label, mutate] of [
  ['wrong units', body => { body.expiresAt /= 1000; }], ['expired', body => { body.expiresAt -= 400000; }],
  ['excess TTL', body => { body.ttl = 301; }], ['missing credentials', body => { delete body.credential; }],
  ['unsafe URI', body => { body.iceServers[1].urls = 'https://unsafe.invalid'; }],
  ['credential mismatch', body => { body.iceServers[1].username = 'wrong'; }],
  ['invalid port', body => { body.iceServers[1].urls = 'turn:host.invalid:65536'; }],
  ['no TURN', body => { body.iceServers = [body.iceServers[0]]; }]
]) test(`rejects ${label}`, async () => { const f = fixture({ fetcher: async () => { const body = f.payload(); mutate(body); return Response.json(body); } }); await assert.rejects(f.provider.getConfiguration(), /TURN_INVALID_RESPONSE/); });
for (const [label, response] of [
  ['malformed JSON', () => new Response('synthetic-secret-not-json', { headers: { 'Content-Type': 'application/json' } })],
  ['server error', () => Response.json({ error: 'synthetic-secret-message' }, { status: 403 })],
  ['oversized body', () => new Response('x'.repeat(32769), { headers: { 'Content-Type': 'application/json' } })]
]) test(`redacts ${label}`, async () => { const f = fixture({ fetcher: async () => response() }); await assert.rejects(f.provider.getConfiguration(), error => /^TURN_(UNAVAILABLE|INVALID_RESPONSE)$/.test(error.message)); });
test('token failures are redacted and observed after account change', async () => {
  const f = fixture(); f.setUser({ uid: 'one', getIdToken: async () => { f.setUser(null); throw new Error('synthetic-secret-token-error'); } });
  await assert.rejects(f.provider.getConfiguration(), /TURN_ACCOUNT_CHANGED/);
});
test('token and fetch timeouts fail closed without retaining in-flight work', async () => {
  const f = fixture({ timeoutMs: 15, fetcher: () => new Promise(() => {}) });
  await assert.rejects(f.provider.getConfiguration(), /TURN_UNAVAILABLE/);
  const g = fixture({ timeoutMs: 15 }); g.setUser({ uid: 'one', getIdToken: () => new Promise(() => {}) });
  await assert.rejects(g.provider.getConfiguration(), /TURN_UNAVAILABLE/);
});

test('copies the expiry contract and does not allow mutable options to enable an unsafe provider', async () => {
  const units = { ...contract }; const f = fixture({ contract: units }); units.expiresAtFormat = 'unix-seconds'; assert.ok(await f.provider.getConfiguration());
  const disabled = fixture({ enabled: false, origin: 'http://127.0.0.1' }); disabled.options.enabled = true;
  assert.equal(await disabled.provider.getConfiguration(), null); assert.equal(disabled.calls(), 0);
});
test('does not log credentials or raw token/server errors', async () => {
  const logs = [], originalLog = console.log, originalError = console.error;
  console.log = (...args) => logs.push(args); console.error = (...args) => logs.push(args);
  try {
    const f = fixture(); await f.provider.getConfiguration(); f.provider.invalidate();
    const failed = fixture({ fetcher: async () => { throw new Error('synthetic-secret-error'); } });
    await assert.rejects(failed.provider.getConfiguration(), /TURN_UNAVAILABLE/); assert.deepEqual(logs, []);
  } finally { console.log = originalLog; console.error = originalError; }
});

test('forced relay requires separate explicit test opt-in', async()=>{const f=fixture({forceRelay:true});assert.equal((await f.provider.getConfiguration()).iceTransportPolicy,'relay');});
test('private HTTPS origin must be explicitly allowlisted without wildcards',async()=>{const origin='https://a2.tail2a0a8e.ts.net:8443';assert.throws(()=>fixture({origin}),/TURN_CONFIGURATION_INVALID/);const f=fixture({origin,allowedOrigins:[origin]});assert.equal((await f.provider.getConfiguration()).iceTransportPolicy,'all');for(const value of ['https://foreign.invalid','https://*.ts.net','http://a2.tail2a0a8e.ts.net:8443'])assert.throws(()=>fixture({origin:value,allowedOrigins:[value]}),/TURN_CONFIGURATION_INVALID/);});

test('diagnostic stages identify HTTP failure without response or token contents', async () => {
  const events = [];
  const f = fixture({ fetcher: async () => Response.json({ error: 'synthetic-secret-error' }, { status: 403 }) });
  await assert.rejects(f.provider.getConfiguration(e => events.push(e)), /TURN_UNAVAILABLE/);
  assert.deepEqual(events.map(e => e.stage), ['token', 'request', 'response', 'response']);
  assert.equal(events.at(-1).code, 'HTTP_ERROR'); assert.equal(events.at(-1).httpStatus, 403);
  assert.doesNotMatch(JSON.stringify(events), /synthetic|credential|idToken|one/);
  assert.ok(events.every(e => Number.isInteger(e.elapsedMs) && e.elapsedMs >= 0 && e.elapsedMs <= 30000));
});
test('diagnostics distinguish token error, deadline and invalid response', async () => {
  for (const [kind, expected] of [['token', 'TOKEN_FAILED'], ['timeout', 'DEADLINE_REACHED'], ['body', 'RESPONSE_INVALID']]) {
    const events = []; const f = fixture({ timeoutMs: 10 });
    if (kind === 'token') f.setUser({ uid: 'one', getIdToken: async () => { throw new Error('secret'); } });
    if (kind === 'timeout') f.setUser({ uid: 'one', getIdToken: () => new Promise(() => {}) });
    const target = kind === 'body' ? fixture({ fetcher: async () => new Response('secret', { headers: { 'content-type': 'application/json' } }) }) : f;
    await assert.rejects(target.provider.getConfiguration(e => events.push(e)));
    assert.equal(events.at(-1).code, expected); assert.doesNotMatch(JSON.stringify(events), /secret/);
  }
});
test('diagnostics identify cache and shared requests and isolate observer failures', async () => {
  const gate = deferred(); const f = fixture({ fetcher: () => gate.promise }); const a = [], b = [];
  const first = f.provider.getConfiguration(e => a.push(e));
  const second = f.provider.getConfiguration(e => b.push(e));
  gate.resolve(Response.json(f.payload())); await Promise.all([first, second]);
  assert.equal(b[0].stage, 'shared'); assert.equal(a.at(-1).code, 'READY'); assert.equal(b.at(-1).code, 'READY');
  const cached = []; await f.provider.getConfiguration(e => cached.push(e)); assert.equal(cached[0].stage, 'cache');
  await f.provider.getConfiguration(() => { throw new Error('observer'); });
});

test('diagnostic SDK codes are allowlisted and parsing details never expose bodies', async () => {
  for (const code of ['auth/network-request-failed', 'synthetic-secret-code']) {
    const f = fixture(), events = [];
    f.setUser({ uid: 'one', getIdToken: async () => { throw { code, message: 'synthetic-secret' }; } });
    await assert.rejects(f.provider.getConfiguration(e => events.push(e)));
    assert.equal(events.at(-1).sdkCode, code.startsWith('auth/') ? code : undefined);
    assert.doesNotMatch(JSON.stringify(events), /synthetic/);
  }
  const f = fixture({ fetcher: async () => new Response('synthetic-secret', { headers: { 'content-type': 'application/json' } }) }), events = [];
  await assert.rejects(f.provider.getConfiguration(e => events.push(e)));
  assert.equal(events.at(-1).detail, 'JSON_INVALID'); assert.doesNotMatch(JSON.stringify(events), /synthetic/);
});

for (const [label, mutate, detail] of [
  ['root shape', () => [], 'ROOT_INVALID'],
  ['username shape', b => ({ ...b, username: '' }), 'USERNAME_INVALID'],
  ['credential shape', b => ({ ...b, credential: '' }), 'CREDENTIAL_INVALID'],
  ['TTL shape', b => ({ ...b, ttl: '300' }), 'TTL_INVALID'],
  ['TTL range', b => ({ ...b, ttl: 301 }), 'TTL_INVALID'],
  ['expiry format', b => ({ ...b, expiresAt: 'not-a-number' }), 'EXPIRY_FORMAT_INVALID'],
  ['expiry unsafe', b => ({ ...b, expiresAt: Number.MAX_SAFE_INTEGER }), 'EXPIRY_BEYOND_TTL'],
  ['near stale expiry', b => ({ ...b, expiresAt: b.expiresAt - 285000 }), 'EXPIRY_TOO_EARLY'],
  ['expired', b => ({ ...b, expiresAt: b.expiresAt - 400000 }), 'EXPIRY_TOO_EARLY'],
  ['skew beyond five seconds', b => ({ ...b, expiresAt: b.expiresAt + 5001 }), 'EXPIRY_BEYOND_TTL'],
  ['ICE array', b => ({ ...b, iceServers: [] }), 'ICE_SERVERS_INVALID'],
  ['ICE record', b => ({ ...b, iceServers: [null] }), 'ICE_SERVER_INVALID'],
  ['ICE fields', b => ({ ...b, iceServers: [{ ...b.iceServers[1], secret: 'synthetic-secret' }] }), 'ICE_FIELDS_INVALID'],
  ['ICE URL array', b => ({ ...b, iceServers: [{ ...b.iceServers[1], urls: [] }] }), 'ICE_URLS_INVALID'],
  ['ICE URI', b => ({ ...b, iceServers: [{ ...b.iceServers[1], urls: 'https://synthetic-secret.invalid' }] }), 'ICE_URI_INVALID'],
  ['credential type', b => ({ ...b, iceServers: [{ ...b.iceServers[1], credentialType: 'oauth' }] }), 'ICE_CREDENTIAL_TYPE_INVALID'],
  ['TURN credentials mismatch', b => ({ ...b, iceServers: [{ ...b.iceServers[1], username: 'synthetic-secret' }] }), 'ICE_CREDENTIAL_MISMATCH'],
  ['STUN credentials', b => ({ ...b, iceServers: [{ ...b.iceServers[0], username: 'synthetic-secret' }] }), 'ICE_STUN_CREDENTIALS_INVALID'],
  ['missing TURN', b => ({ ...b, iceServers: [b.iceServers[0]] }), 'TURN_SERVER_MISSING']
]) test(`diagnostic contract branch: ${label}`, async () => {
  const events = [], f = fixture({ fetcher: async () => Response.json(mutate(f.payload())) });
  await assert.rejects(f.provider.getConfiguration(e => events.push(e)), error => error.message === 'TURN_INVALID_RESPONSE' && !error.detail);
  assert.equal(events.at(-1).stage, 'validation'); assert.equal(events.at(-1).code, 'RESPONSE_INVALID');
  assert.equal(events.at(-1).detail, detail); assert.equal(events.at(-1).httpStatus, 200);
  assert.doesNotMatch(JSON.stringify(events), /synthetic|expiresAt|iceServers|idToken/);
  await assert.rejects(f.provider.getConfiguration(() => { throw new Error('observer'); }), /TURN_INVALID_RESPONSE/);
});
test('aligned expiry emits READY without a failure detail', async () => {
  const events = [], f = fixture(); await f.provider.getConfiguration(e => events.push(e));
  assert.equal(events.at(-1).code, 'READY'); assert.equal(events.at(-1).detail, undefined);
});
test('unix seconds multiplication overflow and invalid ISO use distinct expiry diagnostics', async () => {
  for (const [format, value, detail] of [['unix-seconds', Number.MAX_SAFE_INTEGER, 'EXPIRY_UNSAFE'], ['iso8601', '2023-11-14T22:18:20Z', 'EXPIRY_FORMAT_INVALID']]) {
    const events = [], f = fixture({ contract: { ttlUnit: 'seconds', expiresAtFormat: format }, fetcher: async () => Response.json({ ...f.payload(), expiresAt: value }) });
    await assert.rejects(f.provider.getConfiguration(e => events.push(e)), /TURN_INVALID_RESPONSE/);
    assert.equal(events.at(-1).detail, detail);
  }
});

for (const skew of [2000, 5000]) test(`bounded expiry skew ${skew}ms does not extend local cache TTL`, async () => {
  let calls = 0;
  const f = fixture({ fetcher: async () => { calls++; return Response.json({ ...f.payload(), expiresAt: f.time() + 300000 + skew }); } });
  await f.provider.getConfiguration(); f.advance(284999); await f.provider.getConfiguration(); assert.equal(calls, 1);
  f.advance(1); await f.provider.getConfiguration(); assert.equal(calls, 2);
  f.provider.invalidate(); await f.provider.getConfiguration(); assert.equal(calls, 3);
});

test('bounded skew allowance preserves the earlier issuer expiry as the cache deadline', async () => {
  let calls = 0;
  const f = fixture({ fetcher: async () => { calls++; return Response.json({ ...f.payload(), expiresAt: f.time() + 20000 }); } });
  await f.provider.getConfiguration(); f.advance(4999); await f.provider.getConfiguration(); assert.equal(calls, 1);
  f.advance(1); await f.provider.getConfiguration(); assert.equal(calls, 2);
});

function issuerFixture(offset = 0, change = {}) {
  let wall = 1700000000000 + offset, mono = 100, requests = 0;
  const issued = 1700000000000;
  const body = { username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: issued + 300000,
    iceServers: [{ urls: 'turn:turn.test.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] };
  const options = { enabled: true, origin: 'https://127.0.0.1:9443', contract: { ...contract, clockSource: 'issuer' },
    getUser: () => ({ uid: 'one', getIdToken: async () => 'synthetic-token' }), now: () => wall, monotonicNow: () => mono,
    fetcher: async () => { requests++; return Response.json(body, { headers: { 'X-Turn-Issued-Date': new Date(issued).toUTCString() } }); }, ...change };
  const provider = Turn.createProvider(options);
  return { provider, body, requests: () => requests, wall: v => { wall += v; }, advance: v => { mono += v; } };
}
for (const offset of [-1800000, 1800000]) test(`issuer clock accepts fresh credentials at offset ${offset} without extending lease`, async () => {
  const f = issuerFixture(offset); assert.ok(await f.provider.getConfiguration()); assert.equal(f.provider.getLeaseRemainingMs(), 299000);
  f.wall(-3600000); f.advance(299000); assert.equal(f.provider.getLeaseRemainingMs(), 0);
});
for (const offset of [-1800001, 1800001]) test(`issuer clock rejects offset ${offset}`, async () => {
  const f = issuerFixture(offset), events = []; await assert.rejects(f.provider.getConfiguration(e => events.push(e)), /TURN_INVALID_RESPONSE/);
  assert.equal(events.at(-1).detail, 'CLOCK_SKEW_EXCEEDED');
});
for (const header of [null, 'invalid', 'Mon, 12 Oct 2026 00:00:00 GMT, Mon, 12 Oct 2026 00:00:00 GMT']) test(`issuer requires a single canonical Date: ${header}`, async () => {
  let f; f = issuerFixture(0, { fetcher: async () => Response.json(f.body, { headers: header ? { 'X-Turn-Issued-Date': header } : {} }) });
  await assert.rejects(f.provider.getConfiguration(), /TURN_INVALID_RESPONSE/);
});
test('issuer-expired response is rejected even when client is thirty minutes behind', async () => {
  const f = issuerFixture(-1800000); f.body.expiresAt -= 301000; await assert.rejects(f.provider.getConfiguration(), /TURN_INVALID_RESPONSE/);
});
test('issuer monotonic cache ignores wall clock jumps and expires with elapsed time', async () => {
  const f = issuerFixture(); await f.provider.getConfiguration(); f.wall(86400000); await f.provider.getConfiguration(); assert.equal(f.requests(), 1);
  f.wall(-172800000); f.advance(299000); assert.equal(f.provider.getLeaseRemainingMs(), 0);
});
test('issuer request delay reduces remaining lease', async () => {
  let f; f = issuerFixture(0, { fetcher: async () => { f.advance(4000); return Response.json(f.body, { headers: { 'X-Turn-Issued-Date': new Date(1700000000000).toUTCString() } }); } });
  await f.provider.getConfiguration(); assert.equal(f.provider.getLeaseRemainingMs(), 295000);
  f.provider.invalidate(); assert.equal(f.provider.getLeaseRemainingMs(), 0);
});
test('lease getter returns zero without credentials and guest never requests auth', async () => {
  const f = issuerFixture(0, { getUser: () => null }); assert.equal(f.provider.getLeaseRemainingMs(), 0); assert.equal(await f.provider.getConfiguration(), null); assert.equal(f.requests(), 0);
});

test('issuer Date precision allowance does not increase advertised TTL reuse', async () => {
  const f = issuerFixture(); f.body.expiresAt += 1000; await f.provider.getConfiguration(); assert.equal(f.provider.getLeaseRemainingMs(), 299000);
  const invalid = issuerFixture(); invalid.body.expiresAt += 1001; await assert.rejects(invalid.provider.getConfiguration(), /TURN_INVALID_RESPONSE/);
});
test('issuer mode still rejects TTL above five minutes', async () => {
  const f = issuerFixture(); f.body.ttl = 301; await assert.rejects(f.provider.getConfiguration(), /TURN_INVALID_RESPONSE/);
});
test('issuer body-reading delay is reserved before accepting near-expiry credentials', async () => {
  let f;
  f = issuerFixture(0, { fetcher: async () => new Response(new ReadableStream({ start(controller) {
    f.advance(6000); controller.enqueue(new TextEncoder().encode(JSON.stringify(f.body))); controller.close();
  } }), { headers: { 'Content-Type': 'application/json', 'X-Turn-Issued-Date': new Date(1700000000000).toUTCString() } }) });
  f.body.expiresAt = 1700000020000;
  await assert.rejects(f.provider.getConfiguration(), /TURN_INVALID_RESPONSE/);
});
test('issuer observer exceptions cannot change credential or lease acquisition', async () => {
  const f = issuerFixture(); assert.ok(await f.provider.getConfiguration(() => { throw new Error('synthetic-secret'); })); assert.equal(f.provider.getLeaseRemainingMs(), 299000);
});

test('named public preview uses fixed endpoint and issuer Date without token diagnostics', async () => {
  const seen = [], events = [];
  const f = fixture({ profile: 'mini-pages-turn-test', origin: 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev', forceRelay: true,
    contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' },
    fetcher: async (url, options) => { seen.push({ url, options }); return Response.json({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: 1700000300, iceServers: [{ urls: 'turn:turn.test.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] }, { headers: { Date: new Date(1700000000000).toUTCString() } }); } });
  assert.equal((await f.provider.getConfiguration(event => events.push(event))).iceTransportPolicy, 'relay');
  assert.equal(seen[0].url, 'https://turn-api.erlin.do/turn-creds');
  assert.equal(seen[0].options.credentials, 'omit');
  assert.equal(seen[0].options.redirect, 'error');
  assert.ok(f.provider.getLeaseRemainingMs() > 0 && f.provider.getLeaseRemainingMs() <= 300000);
  assert.doesNotMatch(JSON.stringify(events), /synthetic-token|synthetic-password/);
});
test('public profile rejects foreign/private origins, missing relay and wrong clock contracts', () => {
  const options = { profile: 'mini-pages-turn-test', origin: 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev', forceRelay: true, contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' } };
  for (const change of [{origin:'https://foreign.invalid'}, {origin:'https://127.0.0.1:9443'}, {forceRelay:false}, {contract}, {profile:'unknown'}]) assert.throws(() => fixture({...options,...change}), /TURN_CONFIGURATION_INVALID/);
});
test('public guest never fetches and public Date does not fall back to private header', async () => {
  const options={profile:'mini-pages-turn-test',origin:'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev',forceRelay:true,contract:{ttlUnit:'seconds',expiresAtFormat:'unix-seconds',clockSource:'issuer'}};
  const guest=fixture(options);guest.setUser(null);assert.equal(await guest.provider.getConfiguration(),null);assert.equal(guest.calls(),0);
  const events=[];const f=fixture({...options,fetcher:async()=>Response.json({username:'synthetic-user',credential:'synthetic-password',ttl:300,expiresAt:1700000300,iceServers:[{urls:'turn:turn.test.invalid:3478',username:'synthetic-user',credential:'synthetic-password'}]},{headers:{'X-Turn-Issued-Date':new Date(1700000000000).toUTCString()}})});
  await assert.rejects(f.provider.getConfiguration(event=>events.push(event)));assert.ok(events.some(event=>event.detail==='CLOCK_MISSING'));
});
