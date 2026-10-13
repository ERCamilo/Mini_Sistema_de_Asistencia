const test = require('node:test');
const assert = require('node:assert/strict');
const Manager = require('../mini-peer-session-manager.js');
function fixture(remaining = 300000, eligibility = {}) {
  let now = 0, closed = 0, retired = 0;
  const timers = [];
  const manager = Manager.create({ now: () => now, schedule: (fn, delay) => { const t = { fn, delay }; timers.push(t); return t; }, cancel: t => { t.cancelled = true; } });
  const session = { close() { closed++; }, getLeaseRemainingMs: () => remaining };
  const lease = manager.lease(session, 0, () => retired++, eligibility);
  return { manager, lease, session, timers, time: n => now = n, counts: () => ({ closed, retired }) };
}
test('six queued operations reuse the exact authenticated channel and session', async () => {
  const h = fixture(), channel = { readyState: 'open' }; h.lease.ready(channel);
  const order = [];
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => h.lease.run(async c => { assert.equal(c, channel); assert.equal(h.lease.session, h.session); order.push(i); return i; })));
  assert.deepEqual(order, [0,1,2,3,4,5]); assert.deepEqual(results, order); assert.deepEqual(h.counts(), { closed: 0, retired: 0 });
});
test('deadline is fixed and credential remaining time caps it', async () => {
  const h = fixture(70000); h.time(60000); h.lease.ready({ readyState: 'open' });
  await h.lease.run(async () => {}); h.time(70000); assert.equal(h.lease.valid(), false);
  assert.deepEqual(h.counts(), { closed: 1, retired: 1 }); h.lease.retire(); assert.equal(h.counts().closed, 1);
});
test('guest five-minute deadline subtracts setup elapsed and never slides', async () => {
  const h = fixture(); h.time(299999); h.lease.ready({ readyState: 'open' }); await h.lease.run(async () => {});
  h.time(300000); assert.equal(h.lease.valid(), false); await assert.rejects(h.lease.run(async () => {}));
});
test('retirement rejects pending readiness and account invalidation closes lease', async () => {
  const h = fixture(); const waiting = h.lease.run(async () => {}); h.lease.retire(); await assert.rejects(waiting);
  assert.equal(h.lease.ready({ readyState: 'open' }), false);
  const x = fixture(0); assert.equal(x.lease.valid(), false); assert.equal(x.counts().closed, 1);
});
test('failed operation releases queue while retirement rejects queued operations', async () => {
  const h = fixture(); h.lease.ready({ readyState: 'open' });
  await assert.rejects(h.lease.run(async () => { throw Error('test'); }));
  await h.lease.run(async () => {}); assert.equal(h.lease.busy(), false);
  h.lease.retire(); await assert.rejects(h.lease.run(async () => {}));
});

test('retirement promptly rejects running and queued callers even when work hangs', async () => {
  const h = fixture(); h.lease.ready({ readyState: 'open' }); let entered;
  const ready = new Promise(r => { entered = r; });
  const first = h.lease.run(() => { entered(); return new Promise(() => {}); });
  const second = h.lease.run(async () => 2); await ready; h.lease.retire();
  const results = await Promise.race([Promise.all([first, second].map(p => p.then(() => 'resolved', () => 'rejected'))), new Promise(r => setTimeout(() => r('hung'), 20))]);
  assert.deepEqual(results, ['rejected', 'rejected']);
});

test('metadata-free sessions require explicit guest eligibility', () => {
  const manager = Manager.create({ now: () => 0, schedule: () => ({}), cancel() {} });
  const frozen = Object.freeze({ close() {} });
  assert.equal(manager.lease(frozen, 0, () => {}).valid(), false);
  assert.equal(manager.lease(frozen, 0, () => {}, { guest: true }).valid(), true);
});

test('a retired hung lease promptly rejects future operations too', async () => {
  const h = fixture(); h.lease.ready({ readyState: 'open' }); let entered;
  const ready = new Promise(r => { entered = r; }); const first = h.lease.run(() => { entered(); return new Promise(() => {}); });
  await ready; h.lease.retire(); await assert.rejects(first);
  const late = h.lease.run(async () => 1);
  assert.equal(await Promise.race([late.then(() => 'resolved', () => 'rejected'), new Promise(r => setTimeout(() => r('hung'), 20))]), 'rejected');
});

test('intent cancellation promptly settles a suspended caller and guards late continuations', async () => {
  const intents = Manager.createIntents(); let resume, observed;
  const action = intents.run('peer', async token => { observed = token; await new Promise(r => { resume = r; }); token.check(); });
  const duplicate = intents.run('peer', async () => { throw new Error('duplicate ran'); });
  assert.equal(action, duplicate); intents.invalidate('peer'); await assert.rejects(action);
  const fresh = intents.run('peer', async token => { token.check(); return 'fresh'; });
  resume(); assert.throws(() => observed.check()); assert.equal(await fresh, 'fresh');
});

test('invalidateAll cancels intents even when no transport entry exists', async () => {
  const intents = Manager.createIntents(); const action = intents.run('peer', async () => new Promise(() => {}));
  intents.invalidateAll(); await assert.rejects(action);
});

test('lease expiry reason is set before retirement callback and observation never slides or retires a lease', () => {
 const h=fixture();assert.equal(typeof h.lease.getRetirementReason,'function');assert.equal(h.lease.getRetirementReason(),null);h.time(300000);assert.equal(h.lease.getRetirementReason(),null);assert.deepEqual(h.counts(),{closed:0,retired:0});h.lease.valid();assert.equal(h.lease.getRetirementReason(),'lease-expired');
 const manual=fixture();manual.lease.retire();assert.equal(manual.lease.getRetirementReason(),'unknown');
 let reason;const manager=Manager.create({now:()=>0,schedule:()=>({}),cancel(){}});manager.lease({close(){},getLeaseRemainingMs:()=>0},0,value=>{reason=value;});assert.equal(reason,'lease-expired');
});


for (const state of ['closing', 'closed']) {
  for (const externallyOwned of [false, true]) {
    test(`already-ready ${state} channel settles queued sends once (${externallyOwned ? 'external' : 'local'} cleanup owner)`, async () => {
      const h = fixture(300000, { transportOwnedExternally: externallyOwned });
      const channel = { readyState: 'open' }, deadline = h.lease.deadline;
      let executions = 0;
      assert.equal(h.lease.ready(channel), true);
      channel.readyState = state;
      const sends = Array.from({ length: 3 }, () => h.lease.run(async () => { executions++; }));
      const outcomes = sends.map(send => send.then(() => 'resolved', error => {
        assert.match(error.message, /Reintenta|Reconecta/);
        assert.doesNotMatch(error.message, /expir/);
        return 'rejected';
      }));
      try {
        const observed = await Promise.race([
          Promise.all(outcomes),
          new Promise(resolve => setImmediate(() => resolve('pending-after-event-turn')))
        ]);
        assert.deepEqual(observed, ['rejected', 'rejected', 'rejected']);
        assert.equal(executions, 0);
        assert.deepEqual(h.counts(), { closed: externallyOwned ? 0 : 1, retired: 1 });
        assert.equal(h.lease.valid(), false);
        assert.equal(h.lease.busy(), false);
        assert.equal(h.lease.deadline, deadline);
        assert.equal(h.lease.getRetirementReason(), 'unknown');
        h.lease.retire();
        assert.equal(h.counts().retired, 1);
      } finally {
        h.lease.retire();
        await Promise.all(outcomes);
      }
    });
  }
}

test('initial unsupplied channel still waits for authentication and then uses the exact open channel', async () => {
  const h = fixture(); let executions = 0, settled = false;
  const channel = { readyState: 'open' };
  const sending = h.lease.run(async value => { executions++; assert.equal(value, channel); });
  const observed = sending.then(() => { settled = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false); assert.equal(executions, 0);
    assert.deepEqual(h.counts(), { closed: 0, retired: 0 });
    assert.equal(h.lease.ready(channel), true);
    await observed;
    assert.equal(executions, 1); assert.equal(settled, true);
  } finally { h.lease.retire(); }
});
