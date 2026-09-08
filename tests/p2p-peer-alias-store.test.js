const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PEER_ALIAS_MAX_LENGTH,
  normalizePeerAlias,
  normalizePeerAliasPeerId,
  createPeerAliasStore
} = require('../p2p-peer-alias-store.js');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    dump(key) { return map.get(key); }
  };
}

test('peer alias normalizes controls/space and limits to 64 Unicode characters', () => {
  assert.equal(PEER_ALIAS_MAX_LENGTH, 64);
  assert.equal(normalizePeerAlias('  SA\n oficina\t norte  '), 'SA oficina norte');
  assert.equal(Array.from(normalizePeerAlias('😀'.repeat(70))).length, 64);
});

test('peer alias validates peerId without object-key semantics', () => {
  assert.equal(normalizePeerAliasPeerId(' peer-1 '), 'peer-1');
  assert.equal(normalizePeerAliasPeerId('peer 1'), null);
  assert.equal(normalizePeerAliasPeerId(''), null);
});

test('peer alias persists versioned entries, supports __proto__, and empty clears', () => {
  const storage = memoryStorage();
  const store = createPeerAliasStore({ storage, storageKey: 't' });
  assert.equal(store.setAlias('__proto__', '  SA oficina  '), 'SA oficina');
  assert.equal(store.getAlias('__proto__'), 'SA oficina');
  assert.deepEqual(JSON.parse(storage.dump('t')), { version: 1, entries: [{ peerId: '__proto__', alias: 'SA oficina' }] });
  assert.equal(({}).alias, undefined);
  assert.equal(store.setAlias('__proto__', '   '), '');
  assert.equal(storage.dump('t'), undefined);
});

test('peer name resolves alias then original displayName then app label', () => {
  const store = createPeerAliasStore({ storage: memoryStorage(), storageKey: 't' });
  const peer = { peerId: 'p1', peerApp: 'sa', displayName: 'SA - Oficina' };
  assert.equal(store.resolveName(peer), 'SA - Oficina');
  store.setAlias('p1', 'SA principal');
  assert.equal(store.resolveName(peer), 'SA principal');
  store.removeAlias('p1');
  assert.equal(store.resolveName({ peerId: 'p1', peerApp: 'sa', displayName: '' }), 'SA');
});

test('corrupt or blocked storage fails safe and keeps in-memory alias', () => {
  const corrupt = memoryStorage({ t: '{bad json' });
  const a = createPeerAliasStore({ storage: corrupt, storageKey: 't' });
  assert.equal(a.getAlias('p1'), '');
  assert.equal(a.setAlias('p1', 'Obra este'), 'Obra este');
  assert.equal(a.getAlias('p1'), 'Obra este');

  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const b = createPeerAliasStore({ storage: blocked, storageKey: 't' });
  assert.equal(b.setAlias('p2', 'SA obra'), 'SA obra');
  assert.equal(b.getAlias('p2'), 'SA obra');
});

test('invalid peerId cannot mutate alias storage', () => {
  const store = createPeerAliasStore({ storage: memoryStorage(), storageKey: 't' });
  assert.throws(() => store.setAlias('peer con espacio', 'X'), /Identidad P2P inválida/);
  assert.equal(store.removeAlias('peer con espacio'), false);
  assert.equal(store.getAlias('peer con espacio'), '');
});
