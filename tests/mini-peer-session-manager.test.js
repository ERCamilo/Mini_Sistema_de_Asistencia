const test = require('node:test');
const assert = require('node:assert/strict');
const Manager = require('../mini-peer-session-manager.js');
function fixture(remaining = 300000) {
  let now = 0, closed = 0, retired = 0;
  const timers = [];
  const manager = Manager.create({ now: () => now, schedule: (fn, delay) => { const t = { fn, delay }; timers.push(t); return t; }, cancel: t => { t.cancelled = true; } });
  const session = { close() { closed++; }, getLeaseRemainingMs: () => remaining };
  const lease = manager.lease(session, 0, () => retired++);
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
