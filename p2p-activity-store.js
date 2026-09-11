(function exposeP2PActivity(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SaMiniP2PActivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createP2PActivity(root) {
  'use strict';
  const STORE_VERSION = 1;
  const STAGED_STORE_VERSION = 2;
  const MAX_ENTRIES = 50;
  const PEER_NAME_MAX_LENGTH = 80;
  const DETAIL_MAX_LENGTH = 280;
  const ACTIVITY_STORAGE_KEY = 'mini_p2p_activity_v1';
  const STAGED_STORAGE_KEY = 'mini_p2p_staged_roster_v1';
  const ACTIVITY_TYPES = ['roster-staged', 'roster-applied', 'attendance-sent', 'peer-linked'];

  function normalizePeerId(value) {
    const peerId = String(value ?? '').trim();
    if (!peerId || peerId.length > 128 || /[\s\u0000-\u001f\u007f]/.test(peerId)) return null;
    return peerId;
  }

  function normalizePeerName(value, fallback) {
    const clean = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const bounded = Array.from(clean).slice(0, PEER_NAME_MAX_LENGTH).join('');
    if (bounded) return bounded;
    const safeFallback = String(fallback ?? 'SA')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(safeFallback).slice(0, PEER_NAME_MAX_LENGTH).join('') || 'SA';
  }

  function normalizeDetail(value) {
    const clean = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(clean).slice(0, DETAIL_MAX_LENGTH).join('');
  }

  function normalizeSha256(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) return null;
    return value.toLowerCase();
  }

  function makeId() {
    try {
      if (root && root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    } catch (_) {}
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) {}
    return 'a' + String(Date.now().toString(36)) + String(Math.floor(Math.random() * 0xffffff).toString(36));
  }

  function resolveStorage(supplied) {
    if (supplied !== undefined) return supplied;
    try {
      const candidate = root && root.localStorage ? root.localStorage : null;
      if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') return candidate;
    } catch (_) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') return localStorage;
    } catch (_) {}
    return null;
  }

  function readJson(storage, key) {
    try {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function createActivityStore(options = {}) {
    const storageKey = String(options.storageKey || ACTIVITY_STORAGE_KEY);
    const storage = resolveStorage(Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : undefined);
    const memory = [];
    let loaded = false;

    function load() {
      if (loaded) return;
      loaded = true;
      const parsed = readJson(storage, storageKey);
      if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(0, MAX_ENTRIES)) {
        const normalized = normalizeEntry(entry);
        if (normalized) memory.push(normalized);
      }
    }

    function normalizeEntry(entry) {
      if (!entry || typeof entry !== 'object') return null;
      if (!ACTIVITY_TYPES.includes(entry.type)) return null;
      const peerId = entry.peerId === undefined || entry.peerId === null ? '' : normalizePeerId(entry.peerId);
      if (entry.peerId !== undefined && entry.peerId !== null && entry.peerId !== '' && !peerId) return null;
      const peerName = normalizePeerName(entry.peerName, 'SA');
      const detail = normalizeDetail(entry.detail);
      const createdAt = String(entry.createdAt || '');
      const parsedAt = Date.parse(createdAt);
      const safeAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : new Date().toISOString();
      const id = String(entry.id || '').trim() || makeId();
      return {
        id: Array.from(id).slice(0, 64).join(''),
        type: entry.type,
        peerId: peerId || '',
        peerName,
        detail,
        createdAt: safeAt,
        pending: entry.type === 'roster-staged' ? entry.pending !== false : false
      };
    }

    function persist() {
      if (!storage) return;
      try {
        if (memory.length === 0) {
          try { storage.removeItem?.(storageKey); } catch (_) {}
          return;
        }
        writeJson(storage, storageKey, { version: STORE_VERSION, entries: memory.slice(0, MAX_ENTRIES) });
      } catch (_) {}
    }

    function list() {
      load();
      return memory.slice();
    }

    function getPendingCount() {
      load();
      let count = 0;
      for (const entry of memory) {
        if (entry.pending === true) count += 1;
      }
      return count;
    }

    function record(entry) {
      if (!entry || typeof entry !== 'object') throw new Error('Actividad P2P inválida.');
      if (!ACTIVITY_TYPES.includes(entry.type)) throw new Error('Tipo de actividad P2P inválido.');
      load();
      const normalized = normalizeEntry({
        ...entry,
        id: entry.id || makeId(),
        createdAt: entry.createdAt || new Date().toISOString()
      });
      if (!normalized) throw new Error('Actividad P2P inválida.');
      const existingIndex = memory.findIndex(item => item.id === normalized.id);
      if (existingIndex >= 0) memory.splice(existingIndex, 1);
      memory.unshift(normalized);
      while (memory.length > MAX_ENTRIES) memory.pop();
      persist();
      return { ...normalized };
    }

    function markStagedReviewed(peerId) {
      load();
      const target = peerId === undefined || peerId === null ? null : normalizePeerId(peerId);
      let changed = false;
      for (const entry of memory) {
        if (entry.type !== 'roster-staged' || entry.pending !== true) continue;
        if (target && entry.peerId && entry.peerId !== target) continue;
        entry.pending = false;
        changed = true;
      }
      if (changed) persist();
      return changed;
    }

    function clear() {
      load();
      memory.length = 0;
      persist();
    }

    return { list, record, clear, getPendingCount, markStagedReviewed };
  }

  function createStagedRosterStore(options = {}) {
    const storageKey = String(options.storageKey || STAGED_STORAGE_KEY);
    const storage = resolveStorage(Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : undefined);
    const memory = new Map();
    let loaded = false;

    function normalizeStaged(entry) {
      if (!entry || typeof entry !== 'object') return null;
      if (typeof entry.text !== 'string' || !entry.text) return null;
      const sha256 = normalizeSha256(entry.sha256);
      if (!sha256) return null;
      const peerId = normalizePeerId(entry.peerId);
      if (!peerId) return null;
      const peerName = normalizePeerName(entry.peerName, 'SA');
      const transferId = String(entry.transferId || '').trim().slice(0, 128);
      const employeeCount = Number.isSafeInteger(entry.employeeCount) && entry.employeeCount >= 0 ? entry.employeeCount : 0;
      const receivedAt = String(entry.receivedAt || entry.createdAt || '');
      const parsedAt = Date.parse(receivedAt);
      const safeAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : new Date().toISOString();
      return { text: entry.text, sha256, transferId, peerId, peerName, employeeCount, receivedAt: safeAt };
    }

    function load() {
      if (loaded) return;
      loaded = true;
      const parsed = readJson(storage, storageKey);
      if (!parsed || typeof parsed !== 'object') return;
      const source = parsed.version === STAGED_STORE_VERSION && Array.isArray(parsed.entries)
        ? parsed.entries
        : (parsed.version === STORE_VERSION && parsed.staged ? [parsed.staged] : []);
      for (const raw of source.slice(0, 20)) {
        const normalized = normalizeStaged(raw);
        if (normalized) memory.set(normalized.peerId, normalized);
      }
    }

    function ordered() {
      load();
      return [...memory.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.peerId.localeCompare(b.peerId));
    }

    function persist() {
      if (!storage) return;
      if (memory.size === 0) {
        try { storage.removeItem?.(storageKey); } catch (_) {}
        return;
      }
      writeJson(storage, storageKey, { version: STAGED_STORE_VERSION, entries: ordered() });
    }

    function save(entry) {
      const normalized = normalizeStaged(entry);
      if (!normalized) throw new Error('Roster por revisar inválido.');
      load();
      memory.set(normalized.peerId, normalized);
      persist();
      return { ...normalized };
    }

    function list() { return ordered().map(entry => ({ ...entry })); }

    function loadStaged(peerId = null) {
      load();
      if (peerId !== null && peerId !== undefined && String(peerId).trim()) {
        const target = normalizePeerId(peerId);
        const found = target ? memory.get(target) : null;
        return found ? { ...found } : null;
      }
      const first = ordered()[0] || null;
      return first ? { ...first } : null;
    }

    function hasStaged(peerId = null) {
      load();
      if (peerId !== null && peerId !== undefined && String(peerId).trim()) {
        const target = normalizePeerId(peerId);
        return Boolean(target && memory.has(target));
      }
      return memory.size > 0;
    }

    function clear(peerId = null) {
      load();
      if (peerId !== null && peerId !== undefined && String(peerId).trim()) {
        const target = normalizePeerId(peerId);
        if (!target) return false;
        const removed = memory.delete(target);
        if (removed) persist();
        return removed;
      }
      const had = memory.size > 0;
      memory.clear();
      persist();
      return had;
    }

    return { save, list, load: loadStaged, loadStaged, has: hasStaged, hasStaged, clear };
  }

  return {
    STORE_VERSION,
    STAGED_STORE_VERSION,
    MAX_ENTRIES,
    ACTIVITY_STORAGE_KEY,
    STAGED_STORAGE_KEY,
    ACTIVITY_TYPES,
    normalizePeerId,
    normalizePeerName,
    createActivityStore,
    createStagedRosterStore
  };
});
