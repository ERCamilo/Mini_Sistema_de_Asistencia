const test = require('node:test');
const assert = require('node:assert/strict');
let api;
try { api = require('../mini-peer-availability.js'); } catch {}
function fixture(factory, options = {}) {
  const listeners = new Set(); let closes = 0;
  const signaling = { onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }, connect: async () => {}, send() {}, close() { closes++; } };
  const emit = event => [...listeners].forEach(fn => fn(event));
  const owner = api.create({ signaling, localPeerId: 'a', remotePeerId: 'b', validateFrame: value => value, createSession: factory, ...options });
  return { owner, emit, get closes() { return closes; } };
}
const offer = id => ({ type: 'signal', frame: { type: 'offer', data: { type: 'offer', sdp: `v=0\r\no=- ${id} 1 IN IP4 0.0.0.0\r\na=ice-ufrag:u${id}\r\n` } } });
test('idle availability opens signaling without credentials or RTC', async () => {
  assert.ok(api, 'availability module missing'); let calls = 0;
  const f = fixture(async () => { calls++; }); await f.owner.start();
  assert.equal(calls, 0); f.owner.stop(); assert.equal(f.closes, 1);
});
test('either peer demand uses one factory and retirement preserves availability', async () => {
  assert.ok(api); let calls = 0, starts = 0, closes = 0;
  const session = { close() { closes++; }, startNegotiation: async () => { starts++; }, pc: {} };
  const f = fixture(async () => { calls++; return session; }); await f.owner.start();
  const [a, b] = await Promise.all([f.owner.demand(), f.owner.demand()]);
  assert.equal(a, b); assert.equal(calls, 1); assert.equal(starts, 1);
  f.owner.retire(); assert.equal(closes, 1); assert.equal(f.closes, 0);
  await f.owner.demand(); assert.equal(calls, 2); f.owner.stop();
});
test('remote offer wakes delayed factory and preserves ordered initial signals', async () => {
  assert.ok(api); let resolve, borrowed, calls = 0; const seen = [];
  const f = fixture(options => { calls++; borrowed = options.signaling; return new Promise(r => { resolve = r; }); });
  await f.owner.start(); f.emit(offer('100'));
  f.emit({ type: 'signal', frame: { type: 'ice', data: { candidate: 'x', usernameFragment: 'u100' } } });
  await Promise.resolve(); assert.equal(calls, 1);
  borrowed.onEvent(e => seen.push(e.frame.type)); resolve({ close() {}, pc: {} });
  await new Promise(r => setImmediate(r)); assert.deepEqual(seen, ['offer', 'ice']); f.owner.stop();
});
test('retired offer and ICE cannot wake or mutate a replacement generation', async () => {
  assert.ok(api); let calls = 0;
  const f = fixture(async () => { calls++; return { close() {}, pc: {} }; });
  await f.owner.start(); f.emit(offer('100')); await new Promise(r => setImmediate(r));
  f.owner.retire(); f.emit(offer('100')); await new Promise(r => setImmediate(r)); assert.equal(calls, 1);
  f.emit(offer('200')); await new Promise(r => setImmediate(r)); assert.equal(calls, 2); f.owner.stop();
});
test('stop invalidates a delayed factory and never adopts its session', async () => {
  assert.ok(api); let resolve, closed = 0;
  const f = fixture(() => new Promise(r => { resolve = r; })); await f.owner.start();
  const pending = f.owner.demand(); await Promise.resolve(); f.owner.stop();
  resolve({ close() { closed++; }, pc: {} }); await assert.rejects(pending); assert.equal(closed, 1);
});

test('buffer overflow cancels a blocked factory and late RTC is disposed', async () => {
  let resolve, closes = 0;
  const f = fixture(() => new Promise(r => { resolve = r; })); await f.owner.start();
  const pending = f.owner.demand(); await Promise.resolve();
  for (let i = 0; i < 65; i++) f.emit({ type: 'signal', frame: { type: 'ice', data: { candidate: 'x', usernameFragment: 'u' } } });
  await assert.rejects(pending); resolve({ close() { closes++; }, pc: {} });
  await new Promise(r => setImmediate(r)); assert.equal(closes, 1); f.owner.stop();
});

test('setup deadline settles callers before a delayed factory resolves', async () => {
  let resolve, closes = 0;
  const f = fixture(() => new Promise(r => { resolve = r; }), { setupTimeoutMs: 2 }); await f.owner.start();
  const pending = f.owner.demand(); await assert.rejects(pending); assert.equal(f.closes, 0);
  resolve({ close() { closes++; }, pc: {} }); await new Promise(r => setImmediate(r));
  assert.equal(closes, 1); f.owner.stop();
});

test('a fresh remote offer replaces only that peer transport while availability remains', async () => {
  let calls = 0, closes = 0;
  const f = fixture(async () => { calls++; return { close() { closes++; }, pc: {} }; });
  await f.owner.start(); f.emit(offer('100')); await new Promise(r => setImmediate(r));
  f.emit(offer('200')); await new Promise(r => setImmediate(r));
  assert.equal(calls, 2); assert.equal(closes, 1); assert.equal(f.closes, 0); f.owner.stop();
});
