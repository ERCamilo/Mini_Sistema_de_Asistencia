const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../p2p-core.js');
const Consent = require('../p2p-backup-consent.js');

class LinkedChannel {
  constructor() { this.readyState = 'open'; this.listeners = new Set(); this.peer = null; this.sent = []; this.terminal=new Map([['close',new Set()],['error',new Set()]]); }
  addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn);else this.terminal.get(type)?.add(fn); }
  removeEventListener(type, fn) { if (type === 'message') this.listeners.delete(fn);else this.terminal.get(type)?.delete(fn); }
  send(data) {
    this.sent.push(data);
    const peer = this.peer;
    queueMicrotask(() => { for (const fn of [...peer.listeners]) fn({ data }); });
  }
  close() { this.readyState = 'closed';for(const fn of [...this.terminal.get('close')])fn(); }
}
function linkedPair() { const a = new LinkedChannel(); const b = new LinkedChannel(); a.peer = b; b.peer = a; return [a, b]; }

const offer = { offerId: 'offer-1', schema: 'mini-backup/v1', size: 2048, senderName: 'Mini Obra Norte' };

test('core validates backup-offer and backup-offer-reply control frames', () => {
  const [a] = linkedPair();
  Core.sendControl(a, 'backup-offer', offer);
  const parsed = Core.parseControl(a.sent[0]);
  assert.deepEqual(parsed.data, offer);
  Core.sendControl(a, 'backup-offer-reply', { offerId: 'offer-1', accepted: false });
  assert.equal(Core.parseControl(a.sent[1]).data.accepted, false);
});

test('core rejects oversized, foreign-schema or malformed offers', () => {
  const bad = [
    { ...offer, size: Core.MAX_BACKUP_BYTES + 1 },
    { ...offer, size: 0 },
    { ...offer, schema: 'sa-roster/v1' },
    { ...offer, extra: true },
    { offerId: 'x', accepted: 'yes' }
  ];
  for (const data of bad) {
    const [a] = linkedPair();
    assert.throws(() => Core.sendControl(a, data.accepted !== undefined ? 'backup-offer-reply' : 'backup-offer', data));
  }
});

test('requestConsent resolves accepted when the receiver accepts', async () => {
  const [sender, receiver] = linkedPair();
  let seen = null;
  const detach = Consent.listenForOffers(receiver, Core, (incoming, respond) => { seen = incoming; respond(true); });
  const result = await Consent.requestConsent(sender, Core, offer, { timeoutMs: 1000 });
  assert.equal(result, 'accepted');
  assert.deepEqual(seen, offer);
  detach();
});

test('requestConsent resolves declined and ignores replies for other offers', async () => {
  const [sender, receiver] = linkedPair();
  Consent.listenForOffers(receiver, Core, (_incoming, respond) => {
    Core.sendControl(receiver, 'backup-offer-reply', { offerId: 'other-offer', accepted: true });
    respond(false);
  });
  assert.equal(await Consent.requestConsent(sender, Core, offer, { timeoutMs: 1000 }), 'declined');
});

test('requestConsent times out when nobody answers', async () => {
  const [sender] = linkedPair();
  assert.equal(await Consent.requestConsent(sender, Core, offer, { timeoutMs: 20 }), 'timeout');
});

test('respond is single-use so a notice cannot answer twice', async () => {
  const [sender, receiver] = linkedPair();
  Consent.listenForOffers(receiver, Core, (_incoming, respond) => { respond(true); respond(false); });
  assert.equal(await Consent.requestConsent(sender, Core, offer, { timeoutMs: 1000 }), 'accepted');
  const replies = receiver.sent.map(frame => Core.parseControl(frame)).filter(Boolean);
  assert.equal(replies.length, 1);
});

test('matchesOffer only admits the transfer that was offered', () => {
  assert.equal(Consent.matchesOffer(offer, { schema: 'mini-backup/v1', size: 2048 }), true);
  assert.equal(Consent.matchesOffer(offer, { schema: 'mini-backup/v1', size: 4096 }), false);
  assert.equal(Consent.matchesOffer(offer, { schema: 'sa-backup/v1', size: 2048 }), false);
  assert.equal(Consent.matchesOffer(null, { schema: 'mini-backup/v1', size: 2048 }), false);
});

test('createOfferId returns a bounded random id', () => {
  const a = Consent.createOfferId();
  assert.match(a, /^[a-z0-9-]{8,64}$/);
  assert.notEqual(a, Consent.createOfferId());
});

test('bufferOffers keeps offers that arrive before authentication and delivers them once', async () => {
  const [sender, receiver] = linkedPair();
  const inbox = Consent.bufferOffers(receiver, Core);
  Core.sendControl(sender, 'backup-offer', offer);
  Core.sendControl(sender, 'backup-offer', offer); // resend of the same offer
  await new Promise(resolve => setTimeout(resolve, 5));
  const seen = [];
  inbox.release((incoming, respond) => { seen.push(incoming.offerId); respond(true); });
  await new Promise(resolve => setTimeout(resolve, 5));
  Core.sendControl(sender, 'backup-offer', { ...offer, offerId: 'offer-2' });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(seen, ['offer-1', 'offer-2']);
  inbox.detach();
});

test('requestConsent resends the offer until the receiver answers (slow handshake side)', async () => {
  const [sender, receiver] = linkedPair();
  const inbox = Consent.bufferOffers(receiver, Core);
  // The receiver only finishes its handshake later, like a slow phone writing IndexedDB.
  setTimeout(() => inbox.release((_incoming, respond) => respond(true)), 60);
  const result = await Consent.requestConsent(sender, Core, offer, { timeoutMs: 1000, resendMs: 20 });
  assert.equal(result, 'accepted');
  const offersSent = sender.sent.map(frame => Core.parseControl(frame)).filter(frame => frame && frame.type === 'backup-offer');
  assert.ok(offersSent.length >= 2, 'offer was resent');
});

test('persistent offer inbox bounds unanswered offers and retired responses cannot send', async () => {
  const [sender, receiver] = linkedPair();
  const inbox = Consent.bufferOffers(receiver, Core);
  for (let i = 0; i < 80; i++) Core.sendControl(sender, 'backup-offer', { ...offer, offerId: 'bounded-' + i });
  await new Promise(resolve => setImmediate(resolve));
  let delivered = 0, respond;
  inbox.release((_offer, reply) => { delivered++; respond = reply; });
  assert.ok(delivered <= 64);
  const before = receiver.sent.length; inbox.detach(); respond(true);
  assert.equal(receiver.sent.length, before);
});

function clockedConsent() {
  const vm=require('node:vm'),fs=require('node:fs'),timers=[];
  const schedule=(fn,delay)=>{const timer={fn,delay,active:true};timers.push(timer);return timer;};
  const cancel=timer=>{if(timer)timer.active=false;};
  const context={module:{exports:{}},setTimeout:schedule,clearTimeout:cancel,setInterval:schedule,clearInterval:cancel};
  vm.runInNewContext(fs.readFileSync(require.resolve('../p2p-backup-consent.js'),'utf8'),context);
  return {api:context.module.exports,timers};
}
test('abort promptly settles pending consent, clears resends/listeners and ignores late acceptance',async()=>{
 const h=clockedConsent(),[sender,receiver]=linkedPair(),controller=new AbortController();
 const pending=h.api.requestConsent(sender,Core,offer,{signal:controller.signal});const outcome=pending.then(value=>value);
 try {controller.abort();assert.equal(await Promise.race([outcome,new Promise(r=>setImmediate(()=>r('pending')))]),'closed');
 const before=sender.sent.length;for(const timer of h.timers)timer.fn();Core.sendControl(receiver,'backup-offer-reply',{offerId:offer.offerId,accepted:true});await new Promise(r=>setImmediate(r));
 assert.equal(sender.sent.length,before);assert.equal(sender.listeners.size,0);assert.ok(h.timers.every(timer=>!timer.active));assert.equal(await pending,'closed');
 }finally{h.timers.find(timer=>timer.delay===90000)?.fn();await pending;}
});
test('already-aborted consent emits no first offer and creates no timers/listeners',async()=>{
 const h=clockedConsent(),[sender]=linkedPair(),controller=new AbortController();controller.abort();
 const pending=h.api.requestConsent(sender,Core,offer,{signal:controller.signal});
 try {assert.equal(sender.sent.length,0);assert.equal(h.timers.length,0);assert.equal(sender.listeners.size,0);assert.equal(await pending,'closed');}
 finally{h.timers.find(timer=>timer.delay===90000)?.fn();await pending;}
});


for(const result of ['accepted','declined','timeout','close','error','abort'])test('consent terminal '+result+' removes every channel/abort listener and timer',async()=>{
 const h=clockedConsent(),[sender,receiver]=linkedPair(),controller=new AbortController(),signal=controller.signal,abortListeners=new Set();
 const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
 signal.addEventListener=(type,fn,options)=>{if(type==='abort')abortListeners.add(fn);add(type,fn,options);};signal.removeEventListener=(type,fn)=>{if(type==='abort')abortListeners.delete(fn);remove(type,fn);};
 const pending=h.api.requestConsent(sender,Core,offer,{signal});
 if(result==='accepted'||result==='declined')Core.sendControl(receiver,'backup-offer-reply',{offerId:offer.offerId,accepted:result==='accepted'});
 else if(result==='timeout')h.timers.find(timer=>timer.delay===90000).fn();else if(result==='abort')controller.abort();else for(const fn of [...sender.terminal.get(result)])fn();
 assert.equal(await pending,['close','error','abort'].includes(result)?'closed':result);assert.equal(sender.listeners.size,0);assert.ok([...sender.terminal.values()].every(set=>set.size===0));assert.equal(abortListeners.size,0);assert.ok(h.timers.every(timer=>!timer.active));
});
