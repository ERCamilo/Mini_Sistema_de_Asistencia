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

test('stop before factory microtask prevents credential acquisition', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return { close() {} }; });
  await f.owner.start(); const pending = f.owner.demand(); f.owner.stop();
  await assert.rejects(pending); assert.equal(calls, 0);
});
test('retirement promptly rejects callers during delayed negotiation', async () => {
  let finish, entered; const ready = new Promise(r => { entered = r; });
  const f = fixture(async () => ({ close() {}, startNegotiation() { entered(); return new Promise(r => { finish = r; }); } }));
  await f.owner.start(); const pending = f.owner.demand(); await ready; f.owner.retire();
  const result = await Promise.race([pending.then(() => 'resolved', () => 'rejected'), new Promise(r => setTimeout(() => r('hung'), 20))]);
  assert.equal(result, 'rejected'); finish(); f.owner.stop();
});

test('account watcher checkpoints invalidate older account, stopped peer and disposed work', () => {
 let changed; const epochs=[]; const auth={currentUser:null,onAuthStateChanged(fn){changed=fn;return ()=>{};}};
 const watch=api.watchAccount(auth,epoch=>epochs.push(epoch)); const boot=watch.capture();
 changed({uid:'A'}); assert.equal(boot.current(),false); const current=epochs[0];assert.equal(current.current('p'),true);
 watch.invalidatePeer('p'); assert.equal(current.current('p'),false); assert.equal(current.current('other'),true);
 changed({uid:'B'}); assert.equal(current.current(),false); assert.equal(epochs[1].current('p'),true);
 watch(); assert.equal(epochs[1].current(),false);
});

test('completed unanswered negotiation expires while standby remains available', async () => {
  let closes = 0;
  const f = fixture(async () => ({ close() { closes++; }, startNegotiation: async () => {} }), { setupTimeoutMs: 5 });
  await f.owner.start(); await f.owner.demand();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.owner.getSession(), null); assert.equal(closes, 1); assert.equal(f.closes, 0); f.owner.stop();
});
test('trusted current readiness cancels only its generation deadline including early readiness', async () => {
  let ready, closes = 0;
  const f = fixture(async options => { ready = options.onReady; assert.equal(ready(), true); return { close() { closes++; } }; }, { setupTimeoutMs: 5 });
  await f.owner.start(); await f.owner.demand(); await new Promise(resolve => setTimeout(resolve, 15));
  assert.ok(f.owner.getSession()); assert.equal(closes, 0);
  f.owner.retire(); assert.equal(ready(), false); f.owner.stop();
});
test('cancelled but already queued ready timer cannot retire its current session', async () => {
  const vm = require('node:vm'), fs = require('node:fs'); let deadline;
  const context = { module: { exports: {} }, setTimeout(fn) { deadline = fn; return {}; }, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../mini-peer-availability.js'), 'utf8'), context);
  const session = { close() { throw new Error('ready session must remain owned'); } };
  let ready; const owner = context.module.exports.create({localPeerId:'a',remotePeerId:'b',signaling:{connect:async()=>{},onEvent:()=>()=>{},close(){},send(){}},validateFrame:v=>v,createSession:async options=>{ready=options.onReady;return session;}});
  await owner.start(); await owner.demand(); assert.equal(ready(),true); deadline(); assert.equal(owner.getSession(),session); owner.stop();
});

test('availability info is non-mutating, uses the fixed clock and classifies explicit retirements', async () => {
 let now=10,ready;const f=fixture(async opts=>{ready=opts.onReady;return {close(){}};},{now:()=>now,setupTimeoutMs:10000});await f.owner.start();
 try {
 assert.equal(typeof f.owner.getInfo,'function');assert.equal(f.owner.getInfo().preparationRemainingMs,null);
 await f.owner.demand();assert.equal(f.owner.getInfo().preparationRemainingMs,10000);now=6010;assert.equal(f.owner.getInfo().preparationRemainingMs,4000);assert.equal(f.owner.getInfo().preparationRemainingMs,4000);
 ready();assert.equal(f.owner.getInfo().preparationRemainingMs,null);f.owner.retire('manual');assert.equal(f.owner.getInfo().lastCloseReason,'manual');
 await f.owner.demand();f.owner.retire('secret-error');assert.equal(f.owner.getInfo().lastCloseReason,'unknown');
 } finally {f.owner.stop();}
});
test('timeout and socket errors have explicit observations while stale readiness cannot rewrite them', async () => {
 let ready;const f=fixture(async opts=>{ready=opts.onReady;return {close(){}};},{setupTimeoutMs:2});await f.owner.start();await f.owner.demand();await new Promise(r=>setTimeout(r,10));
 try {assert.equal(f.owner.getInfo().lastCloseReason,'preparation-timeout');assert.equal(ready(),false);f.emit({type:'socket-error'});assert.equal(f.owner.getInfo().lastCloseReason,'signaling-error');f.emit({type:'peer-left'});assert.equal(f.owner.getInfo().lastCloseReason,'signaling-loss');}finally{f.owner.stop();}
});

test('a queued stale preparation timer cannot overwrite replacement observations', async () => {
 const vm=require('node:vm'),fs=require('node:fs');const timers=[];
 const context={module:{exports:{}},setTimeout(fn){timers.push(fn);return {};},clearTimeout(){}};vm.runInNewContext(fs.readFileSync(require.resolve('../mini-peer-availability.js'),'utf8'),context);
 const owner=context.module.exports.create({localPeerId:'a',remotePeerId:'b',now:()=>0,signaling:{connect:async()=>{},onEvent:()=>()=>{},close(){},send(){}},validateFrame:v=>v,createSession:async()=>({close(){}})});
 await owner.start();await owner.demand();try {owner.retire('manual');await owner.demand();timers[0]();assert.equal(owner.getInfo().lastCloseReason,'manual');assert.equal(owner.getInfo().preparationRemainingMs,10000);}finally{owner.stop();}
});
