const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../p2p-demand-negotiation.js');
function fixture(polite) {
  const sent = [], ice = [], errors = []; let prepared = 0, discarded = 0;
  const pc = { signalingState: 'stable', remoteDescription: null, localDescription: null,
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:local\r\n' }; },
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:answer\r\n' }; },
    async setLocalDescription(d) { this.localDescription = d; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable'; },
    async setRemoteDescription(d) { this.remoteDescription = d; this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; },
    async addIceCandidate(d) { ice.push(d); }
  };
  const negotiation = api.create({ pc, polite, send(type, data) { sent.push({ type, data }); }, prepareChannel() { prepared++; }, discardProvisionalChannel() { discarded++; }, onError(e) { errors.push(e); } });
  return { pc, negotiation, sent, ice, errors, get prepared() { return prepared; }, get discarded() { return discarded; } };
}
const offer = { type: 'offer', data: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:remote\r\n' } };
const candidate = fragment => ({ type: 'ice', data: { candidate: 'candidate:1', usernameFragment: fragment } });
test('polite collision rolls back and discards provisional channel before answering', async () => {
  const f = fixture(true); await f.negotiation.start(); await f.negotiation.receive(offer);
  assert.equal(f.prepared, 1); assert.equal(f.discarded, 1); assert.deepEqual(f.sent.map(x => x.type), ['offer', 'answer']);
});
test('impolite collision ignores losing SDP and only admits winning ICE generation', async () => {
  const f = fixture(false); await f.negotiation.start(); await f.negotiation.receive(offer);
  await f.negotiation.receive(candidate('remote'));
  await f.negotiation.receive({ type: 'answer', data: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winner\r\n' } });
  await f.negotiation.receive(candidate('winner')); await f.negotiation.receive(candidate('expired'));
  assert.deepEqual(f.ice.map(x => x.usernameFragment), ['winner']); assert.equal(f.discarded, 0);
});
test('pending ICE is bounded and closed negotiation cannot apply queued work', async () => {
  const f = fixture(true); for (let i = 0; i < 64; i++) await f.negotiation.receive(candidate('remote'));
  await assert.rejects(f.negotiation.receive(candidate('remote')));
  f.negotiation.close(); await f.negotiation.receive(offer); assert.equal(f.pc.remoteDescription, null);
});
test('duplicate start is serialized into one offer and stale answer is ignored', async () => {
  const f = fixture(true); await Promise.all([f.negotiation.start(), f.negotiation.start()]); assert.equal(f.sent.length, 1);
  await f.negotiation.receive({ type: 'answer', data: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:answer\r\n' } });
  await f.negotiation.receive({ type: 'answer', data: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:stale\r\n' } });
  assert.ok(f.pc.remoteDescription.sdp.includes('answer'));
});
