(function (root) {
  'use strict';
  const core = root.SaMiniP2P;
  const pairing = root.SaMiniP2PPairing;
  const aliases = root.SaMiniP2PPeerAliases;
  const activityApi = root.SaMiniP2PActivity || null;
  if (!core || !pairing || !aliases) throw new Error('P2P core/pairing/alias store must load before P2P roster UI.');

  const MODAL_ID = 'mini-p2p-transfer-modal';
  let connectionsMenu = null;
  let homeRenderEpoch = 0;
  const identityStore = core.makeIdentityStore('mini', 'Mini - Dispositivo');
  const aliasStore = aliases.createPeerAliasStore({ storageKey: 'mini_p2p_peer_aliases_v1' });
  let activityStore = null;
  let stagedStore = null;
  try {
    if (activityApi && typeof activityApi.createActivityStore === 'function') activityStore = activityApi.createActivityStore({ storageKey: 'mini_p2p_activity_v1' });
    if (activityApi && typeof activityApi.createStagedRosterStore === 'function') stagedStore = activityApi.createStagedRosterStore({ storageKey: 'mini_p2p_staged_roster_v1' });
  } catch (_) { activityStore = null; stagedStore = null; }
  const versionGuardApi = root.SaRosterVersionGuard || null;
  let cachedVersionGuard = null;
  function getVersionGuard() {
    try {
      if (!versionGuardApi || typeof versionGuardApi.createSaRosterVersionGuard !== 'function') return null;
      if (cachedVersionGuard) return cachedVersionGuard;
      let storage = null;
      try { storage = root.localStorage || null; } catch (_) { storage = null; }
      if (storage && (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')) storage = null;
      cachedVersionGuard = storage
        ? versionGuardApi.createSaRosterVersionGuard({ storage })
        : versionGuardApi.createSaRosterVersionGuard();
      return cachedVersionGuard;
    } catch (_) { return null; }
  }
  const ROSTER_VERSION_LABELS = { first: 'Primera versión', newer: 'Más reciente', equal: 'Ya aplicada', older: 'Versión anterior', ambiguous: 'Versión dudosa' };
  const ROSTER_VERSION_ICONS = { first: 'add', newer: 'refresh', equal: 'check', older: 'clock', ambiguous: 'warning' };
  function versionLabel(outcome) { return ROSTER_VERSION_LABELS[outcome] || ROSTER_VERSION_LABELS.ambiguous; }
  function versionIcon(outcome) { return ROSTER_VERSION_ICONS[outcome] || 'warning'; }
  function versionDetail(outcome) {
    if (outcome === 'first') return 'Primera vez que Mini recibe este proyecto. Revisa los detalles y aplica.';
    if (outcome === 'newer') return 'Hay cambios más recientes desde SA. Revisa los detalles y aplica.';
    if (outcome === 'equal') return 'Esta lista de personal ya está guardada en Mini.';
    if (outcome === 'older') return 'Es una versión anterior a la ya aplicada. Se bloqueó para proteger tus datos.';
    return 'No se pudo verificar que sea la versión vigente. Se bloqueó por seguridad.';
  }
  function versionBlockedMessage(outcome) {
    if (outcome === 'equal') return 'Este roster ya fue aplicado en Mini (Ya aplicada).';
    if (outcome === 'older') return 'Este roster es una Versión anterior a la ya aplicada y no se puede aplicar.';
    return 'Este roster es una Versión dudosa y no se puede aplicar por seguridad.';
  }
  function classifyReviewedRosterForUi(rosterLike) {
    try {
      const guard = getVersionGuard();
      if (!guard) return { outcome: 'ambiguous', reason: 'version-guard-unavailable' };
      return guard.classifyIncoming(rosterLike, typeof root.getLocalRosterEmployeeCount === 'function' ? root.getLocalRosterEmployeeCount() : undefined);
    } catch (_) {
      return { outcome: 'ambiguous', reason: 'version-guard-unavailable' };
    }
  }
  const MINI_GENERIC_ALIASES = ['mini', 'dispositivo', 'mini dispositivo'];
  let pendingPairIntent = null;
  function normalizeMiniAliasForCheck(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function canonicalMiniAlias(value) {
    return String(value ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function isValidChosenMiniAlias(value) {
    const clean = normalizeMiniAliasForCheck(value);
    if (!clean || Array.from(clean).length < 2) return false;
    if (MINI_GENERIC_ALIASES.includes(canonicalMiniAlias(clean))) return false;
    return true;
  }
  function miniAliasIssue(value) {
    const clean = normalizeMiniAliasForCheck(value);
    if (!clean) return 'Escribe un nombre para este Mini.';
    if (Array.from(clean).length < 2) return 'El nombre debe tener al menos 2 caracteres.';
    if (MINI_GENERIC_ALIASES.includes(canonicalMiniAlias(clean))) return 'Elige un nombre propio para este Mini, no el valor genérico.';
    return '';
  }
  function shortHeaderLabel(name) {
    const clean = String(name ?? '').trim();
    if (!clean) return 'SA vinculado';
    if (['SA', 'Mini', 'Dispositivo'].includes(clean)) return 'SA vinculado';
    if (Array.from(clean).length > 22) return 'SA vinculado';
    return clean;
  }
  const passivePeerListeners = new Map();
  const peerPresenceTracker = new Map();
  const peerRecentLastSeen = new Map();
  let activeTransferPeerId = null;
  let passiveInboxStarted = false;
  let activeManualPeerId = null;
  const PASSIVE_BACKOFF_SCHEDULE_MS = [5000, 15000, 30000, 60000];

  function passiveBackoffDelayMs(attempt) {
    const safe = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : 0;
    if (safe >= PASSIVE_BACKOFF_SCHEDULE_MS.length) {
      return PASSIVE_BACKOFF_SCHEDULE_MS[PASSIVE_BACKOFF_SCHEDULE_MS.length - 1];
    }
    return PASSIVE_BACKOFF_SCHEDULE_MS[safe];
  }

  function isNetworkOnline() {
    try {
      const nav = (typeof root !== 'undefined' && root.navigator) || (typeof navigator !== 'undefined' ? navigator : null);
      if (nav && nav.onLine === false) {
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function getPeerPresence(peerId) {
    const key = String(peerId || '').trim();
    if (!key) return null;
    return peerPresenceTracker.get(key) || null;
  }

  function isPeerOnline(peerId) {
    if (!isNetworkOnline()) return false;
    const key = String(peerId || '').trim();
    if (!key) return false;
    const record = peerPresenceTracker.get(key);
    if (!record || !record.isOnline) return false;
    if (!record.channel || record.channel.readyState !== 'open') return false;
    if (typeof core.isChannelAuthenticated === 'function' && !core.isChannelAuthenticated(record.channel)) return false;
    const ttlMs = core.PRESENCE_TTL_MS || 60000;
    if (!record.lastPongAt || Date.now() - record.lastPongAt >= ttlMs) {
      return false;
    }
    return true;
  }

  function getPeerVisualState(peerId) {
    const key = String(peerId || '').trim();
    if (!key) return 'unlinked';
    if (activeTransferPeerId === key) return 'transferring';
    if (isPeerOnline(key)) return 'online';
    const entry = passivePeerListeners.get(key);
    if (entry && !entry.stopped && entry.session && !entry.channel) return 'connecting';
    return 'offline';
  }

  function detachPresence(peerId, { persist = true } = {}) {
    const key = String(peerId || '').trim();
    if (!key) return;
    const record = peerPresenceTracker.get(key);
    if (!record) return;
    if (record.heartbeatTimer) {
      try { root.clearInterval?.(record.heartbeatTimer); } catch (_) {}
      record.heartbeatTimer = null;
    }
    if (record.ttlTimer) {
      try { root.clearTimeout?.(record.ttlTimer); } catch (_) {}
      record.ttlTimer = null;
    }
    if (record.channel) {
      if (record.messageHandler) {
        try { record.channel.removeEventListener('message', record.messageHandler); } catch (_) {}
        record.messageHandler = null;
      }
      if (record.closeHandler) {
        try { record.channel.removeEventListener('close', record.closeHandler); } catch (_) {}
        record.closeHandler = null;
      }
    }
    try { record.pendingProbes?.clear?.(); } catch (_) {}
    record.isOnline = false;
    if (persist && record.hasUnsavedPong && record.lastPongAt && record.peer) {
      record.hasUnsavedPong = false;
      try {
        const lastSeenAt = new Date(record.lastPongAt).toISOString();
        record.peer.lastSeenAt = lastSeenAt;
        if (typeof identityStore.getPeer === 'function') {
          identityStore.getPeer(key).then(existing => {
            if (existing) {
              identityStore.savePeer({ ...record.peer, lastSeenAt }).catch(() => {});
            }
          }).catch(() => {});
        } else {
          identityStore.savePeer({ ...record.peer, lastSeenAt }).catch(() => {});
        }
      } catch (_) {}
    }
    peerPresenceTracker.delete(key);
  }

  function attachPresence(channel, peer, liveEntry = null) {
    const peerId = String(peer?.peerId || '').trim();
    if (!peerId || !channel) return;
    detachPresence(peerId);

    const record = {
      peerId,
      peer,
      channel,
      lastPongAt: 0,
      isOnline: false,
      hasUnsavedPong: false,
      pendingProbes: new Map(),
      heartbeatTimer: null,
      ttlTimer: null,
      messageHandler: null,
      closeHandler: null,
      sendProbe: null
    };
    peerPresenceTracker.set(peerId, record);

    const onPresenceSuccess = (timestamp) => {
      record.lastPongAt = timestamp || Date.now();
      record.isOnline = true;
      record.hasUnsavedPong = true;
      peerRecentLastSeen.set(peerId, record.lastPongAt);
      if (liveEntry) liveEntry.retryCount = 0;
      if (record.peer) {
        record.peer.lastSeenAt = new Date(record.lastPongAt).toISOString();
      }
      if (record.ttlTimer) {
        try { root.clearTimeout?.(record.ttlTimer); } catch (_) {}
      }
      try {
        const ttlMs = core.PRESENCE_TTL_MS || 60000;
        record.ttlTimer = root.setTimeout(() => {
          record.isOnline = false;
          refreshMiniP2PHeader().catch(() => {});
          if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
            renderHome().catch(() => {});
          }
        }, ttlMs);
      } catch (_) {}
      refreshMiniP2PHeader().catch(() => {});
      if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
        renderHome().catch(() => {});
      }
    };

    const sendProbe = () => {
      if (!isNetworkOnline()) return;
      if (!channel || channel.readyState !== 'open') return;
      if (typeof core.isChannelAuthenticated === 'function' && !core.isChannelAuthenticated(channel)) return;
      try {
        const probeId = typeof core.randomToken === 'function' ? core.randomToken(16) : String(Date.now());
        const sentAt = Date.now();
        const ping = core.makePresencePing ? core.makePresencePing(probeId, sentAt) : { type: 'presence-ping/v1', probeId, sentAt };
        if (record.pendingProbes.size > 5) {
          const oldest = record.pendingProbes.keys().next().value;
          record.pendingProbes.delete(oldest);
        }
        record.pendingProbes.set(probeId, { sentAt });
        channel.send(JSON.stringify(ping));
      } catch (_) {}
    };
    record.sendProbe = sendProbe;

    const messageHandler = (event) => {
      if (typeof event.data !== 'string') return;
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.type !== 'presence-ping/v1' && parsed.type !== 'presence-pong/v1') return;

      // Gate: Only authenticated trusted channels may affect online state.
      // Never let pre-auth/untrusted frames mark SA online.
      if (typeof core.isChannelAuthenticated === 'function' && !core.isChannelAuthenticated(channel)) {
        return;
      }

      let frame;
      try {
        frame = core.validatePresenceFrame ? core.validatePresenceFrame(parsed) : parsed;
      } catch (_) {
        return;
      }

      if (frame.type === 'presence-ping/v1') {
        try {
          const pong = core.makePresencePong ? core.makePresencePong(frame.probeId, frame.sentAt) : { type: 'presence-pong/v1', probeId: frame.probeId, sentAt: frame.sentAt };
          channel.send(JSON.stringify(pong));
        } catch (_) {}
        // Ping alone MUST NOT mark online, MUST NOT refresh lastPongAt, MUST NOT renew TTL.
        return;
      } else if (frame.type === 'presence-pong/v1') {
        const pending = record.pendingProbes.get(frame.probeId);
        if (!pending || pending.sentAt !== frame.sentAt) {
          return;
        }
        record.pendingProbes.delete(frame.probeId);
        onPresenceSuccess(Date.now());
      }
    };

    record.messageHandler = messageHandler;
    channel.addEventListener('message', messageHandler);

    const closeHandler = () => {
      detachPresence(peerId);
      refreshMiniP2PHeader().catch(() => {});
      if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
        renderHome().catch(() => {});
      }
    };
    record.closeHandler = closeHandler;
    try { channel.addEventListener('close', closeHandler); } catch (_) {}

    sendProbe();

    try {
      const hbMs = core.PRESENCE_HEARTBEAT_MS || 25000;
      record.heartbeatTimer = root.setInterval(() => {
        if (!isNetworkOnline()) return;
        const ttlMs = core.PRESENCE_TTL_MS || 60000;
        if (record.lastPongAt && Date.now() - record.lastPongAt >= ttlMs) {
          record.isOnline = false;
          refreshMiniP2PHeader().catch(() => {});
          if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
            renderHome().catch(() => {});
          }
        }
        sendProbe();
      }, hbMs);
    } catch (_) {}
  }

  function expireStalePresence() {
    const now = Date.now();
    let changed = false;
    const ttlMs = core.PRESENCE_TTL_MS || 60000;
    for (const [, record] of peerPresenceTracker.entries()) {
      if (record.isOnline) {
        if (!record.lastPongAt || now - record.lastPongAt >= ttlMs) {
          record.isOnline = false;
          changed = true;
        }
      }
    }
    if (changed) {
      refreshMiniP2PHeader().catch(() => {});
      if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
        renderHome().catch(() => {});
      }
    }
  }

  function handleNetworkOffline() {
    // Drop closed sessions as well as timers so online can open a fresh listener.
    for (const [peerId] of passivePeerListeners.entries()) stopPeerListener(peerId);
    for (const [, record] of peerPresenceTracker.entries()) {
      record.isOnline = false;
      if (record.heartbeatTimer) {
        try { root.clearInterval?.(record.heartbeatTimer); } catch (_) {}
        record.heartbeatTimer = null;
      }
      if (record.ttlTimer) {
        try { root.clearTimeout?.(record.ttlTimer); } catch (_) {}
        record.ttlTimer = null;
      }
    }
    refreshMiniP2PHeader().catch(() => {});
    if (isTransferModalOpen() && body()?.querySelector('.mini-p2p-peer-list')) {
      renderHome().catch(() => {});
    }
  }

  function handleNetworkOnline() {
    expireStalePresence();
    startMiniBackupInbox().catch(() => {});
    if (passiveInboxStarted) {
      identityStore.listPeers().then(peers => {
        const saPeers = (peers || []).filter(p => p.peerApp === 'sa');
        for (const peer of saPeers) {
          ensurePeerListener(peer, 0).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  try {
    root.addEventListener?.('offline', handleNetworkOffline);
    root.addEventListener?.('online', handleNetworkOnline);
    const onVisibilityChange = () => {
      try {
        if (root.document?.visibilityState === 'visible') {
          expireStalePresence();
          if (isNetworkOnline()) handleNetworkOnline();
          else handleNetworkOffline();
        }
      } catch (_) {}
    };
    root.addEventListener?.('visibilitychange', onVisibilityChange);
    root.document?.addEventListener?.('visibilitychange', onVisibilityChange);
    root.addEventListener?.('focus', () => {
      expireStalePresence();
      if (isNetworkOnline()) handleNetworkOnline();
      else handleNetworkOffline();
    });
    root.addEventListener?.('pageshow', () => {
      expireStalePresence();
      if (isNetworkOnline()) handleNetworkOnline();
      else handleNetworkOffline();
    });
  } catch (_) {}

  function headerLinkEl() {
    try { return document.getElementById('btn-attendance-link'); } catch (_) { return null; }
  }

  function isPassivePeerLive(peerId) {
    try {
      if (isPeerOnline(peerId)) return true;
      const entry = passivePeerListeners.get(String(peerId || '').trim());
      const channel = entry?.channel;
      return Boolean(channel && channel.readyState === 'open' && core.isChannelAuthenticated?.(channel) === true && isPeerOnline(peerId));
    } catch (_) { return false; }
  }

  async function refreshMiniP2PHeader() {
    try {
      const btn = headerLinkEl();
      if (!btn) return 'missing';
      const peers = sortPeersByRecentActivity((await identityStore.listPeers()).filter(p => p.peerApp === 'sa'));
      const labelEl = btn.querySelector ? btn.querySelector('.header-p2p-link-label') : null;
      const pendingCount = getStagedPendingCount();
      const pendingBadge = btn.querySelector ? btn.querySelector('[data-p2p-header-pending]') : null;
      if (pendingBadge) {
        if (pendingCount > 0) {
          pendingBadge.hidden = false;
          pendingBadge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
          pendingBadge.setAttribute('aria-label', pendingCount + ' pendiente' + (pendingCount === 1 ? '' : 's') + ' por revisar');
        } else {
          pendingBadge.hidden = true;
          pendingBadge.textContent = '';
          pendingBadge.removeAttribute('aria-label');
        }
      }

      const onlinePeers = peers.filter(p => isPeerOnline(p.peerId));
      const onlineCount = onlinePeers.length;
      let onlineBadge = btn.querySelector ? btn.querySelector('[data-p2p-header-online]') : null;
      if (!onlineBadge && btn.querySelector) {
        const ring = btn.querySelector('.header-p2p-ring');
        if (ring) {
          onlineBadge = document.createElement('span');
          onlineBadge.className = 'header-p2p-online-badge';
          onlineBadge.setAttribute('data-p2p-header-online', '');
          onlineBadge.hidden = true;
          ring.appendChild(onlineBadge);
        }
      }
      if (onlineBadge) {
        if (onlineCount > 1) {
          onlineBadge.hidden = false;
          onlineBadge.textContent = String(onlineCount);
          onlineBadge.setAttribute('aria-label', onlineCount + ' SA conectados');
        } else {
          onlineBadge.hidden = true;
          onlineBadge.textContent = '';
          onlineBadge.removeAttribute('aria-label');
        }
      }

      if (!peers.length) {
        if (labelEl) labelEl.textContent = 'Conexión directa sin vincular';
        try { btn.setAttribute('aria-label', 'Conexión directa sin vincular. Abrir Conexiones para vincular SA u otro Mini'); } catch (_) {}
        try { btn.setAttribute('title', 'Conexión directa sin vincular'); } catch (_) {}
        // Open Transferencias (SA or another Mini), never straight to the camera.
        try { btn.onclick = openP2PTransferModal; } catch (_) {}
        try { btn.setAttribute('data-p2p-header-state', 'unlinked'); } catch (_) {}
        try { btn.setAttribute('data-p2p-state', 'unlinked'); } catch (_) {}
        return 'unlinked';
      }

      const isTransferring = Boolean(activeTransferPeerId);
      const isLive = onlineCount > 0 || isTransferring;
      const connectionState = isTransferring ? 'transferring' : (isLive ? 'connected' : 'disconnected');
      if (labelEl) labelEl.textContent = 'SA ' + connectionState;

      const peer = onlinePeers[0] || peers[0];
      const primary = peerName(peer);
      const original = peerOriginalName(peer);
      let alias = '';
      try { alias = aliasStore.getAlias(peer.peerId); } catch (_) {}
      const pendingSuffix = pendingCount > 0 ? '. ' + pendingCount + ' pendiente' + (pendingCount === 1 ? '' : 's') + ' por revisar' : '';
      const onlineSuffix = onlineCount > 1 ? ' (' + onlineCount + ' conectados)' : '';
      const stateText = isTransferring
        ? 'en transferencia'
        : (isLive ? 'conectado' : 'vinculado, sin conexión activa');
      const audit = (alias && alias !== original)
        ? ('SA ' + stateText + onlineSuffix + ': ' + alias + ', proyecto ' + original + pendingSuffix + '. Abrir Conexiones')
        : ('SA ' + stateText + onlineSuffix + ': ' + primary + pendingSuffix + '. Abrir Conexiones');
      try { btn.setAttribute('aria-label', audit); } catch (_) {}
      try { btn.setAttribute('title', audit); } catch (_) {}
      try { btn.onclick = openP2PTransferModal; } catch (_) {}
      try { btn.setAttribute('data-p2p-header-state', 'linked'); } catch (_) {}
      try { btn.setAttribute('data-p2p-state', connectionState); } catch (_) {}
      return 'linked';
    } catch (_) {
      return 'error';
    }
  }
  async function ensureMiniAliasChosen(intent) {
    let self = null;
    try { self = await identityStore.getSelf(); } catch (_) { self = null; }
    if (self && isValidChosenMiniAlias(self.displayName)) return true;
    await renderMiniAliasSetup(intent);
    return false;
  }
  async function renderMiniAliasSetup(intent) {
    pendingPairIntent = intent || null;
    let self = null;
    try { self = await identityStore.getSelf(); } catch (_) { self = null; }
    const currentName = String(self?.displayName || '');
    const isGenericCurrent = !normalizeMiniAliasForCheck(currentName) || MINI_GENERIC_ALIASES.includes(canonicalMiniAlias(currentName));
    const prefill = isGenericCurrent ? '' : currentName;
    shell();
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>Elige el nombre de este Mini</h3><p>Para vincularte con SA, primero elige cómo se llamará este Mini. SA verá este nombre al emparejarse y en futuras conexiones.</p></div>
        <div class="mini-p2p-field"><label for="mini-p2p-mini-alias">Nombre de este Mini</label><input id="mini-p2p-mini-alias" data-mini-alias maxlength="80" value="${esc(prefill)}" placeholder="Ej: Mini almacén norte" autocomplete="off"></div>
        <div class="mini-p2p-status" data-alias-status hidden role="status" aria-live="polite"></div>
        <div class="mini-p2p-actions">${primary('Guardar y continuar', 'data-save-mini-alias', 'check')}</div>
        <p class="mini-p2p-footnote">Se guarda en este Mini y se presenta a SA en futuros emparejamientos. No cambia vínculos ni claves existentes.</p>
      </div>`; });
    const input = body().querySelector('[data-mini-alias]');
    try { input?.focus(); } catch (_) {}
    try { input?.select?.(); } catch (_) {}
    body().querySelector('[data-back]').addEventListener('click', () => {
      pendingPairIntent = null;
      renderHome();
    });
    body().querySelector('[data-save-mini-alias]').addEventListener('click', async () => {
      const nextName = normalizeMiniAliasForCheck(input?.value);
      const issue = miniAliasIssue(nextName);
      const status = body()?.querySelector('[data-alias-status]');
      if (issue) {
        if (status) { status.hidden = false; status.textContent = issue; }
        else toast(issue);
        try { input?.focus(); } catch (_) {}
        return;
      }
      try {
        await identityStore.renameSelf(nextName);
      } catch (error) {
        const message = error?.message || 'No se pudo guardar el nombre.';
        if (status) { status.hidden = false; status.textContent = message; }
        else toast(message);
        return;
      }
      try { await refreshMiniP2PHeader(); } catch (_) {}
      const nextIntent = pendingPairIntent;
      pendingPairIntent = null;
      if (!nextIntent || nextIntent === 'home') return renderHome();
      if (typeof nextIntent === 'object') {
        if (nextIntent.type === 'scan') return renderQrScanner(nextIntent.options);
        if (nextIntent.type === 'manual') return renderManualPair(nextIntent.options);
        if (nextIntent.type === 'pair' && nextIntent.descriptor) return startPairing(nextIntent.descriptor, nextIntent.options);
      }
      if (nextIntent === 'scan') return renderQrScanner();
      if (nextIntent === 'manual') return renderManualPair();
      if (nextIntent && nextIntent.type === 'pair' && nextIntent.descriptor) return startPairing(nextIntent.descriptor);
      return renderHome();
    });
  }
  let activeSession = null;
  let activeChannel = null;
  let pendingRoster = null;
  let activeAttendanceResponderDetach = null;
  let activeBackupReceiverDetach = null;
  let activePairConfirmation = null;
  let activeQrStream = null;
  let activeQrScanTimer = null;
  let activeQrScanGeneration = 0;
  const ATTENDANCE_READY_SCHEMA = 'attendance-ready/v1';

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function peerName(peer) { return aliasStore.resolveName(peer); }
  function peerOriginalName(peer) {
    const original = String(peer?.displayName || '').trim();
    return original || (peer?.peerApp === 'sa' ? 'SA' : peer?.peerApp === 'mini' ? 'Mini' : 'Dispositivo');
  }
  function peerActivityMs(peer) {
    const id = String(peer?.peerId || '').trim();
    const rec = peerPresenceTracker.get(id);
    const inMem = rec?.lastPongAt || peerRecentLastSeen.get(id) || 0;
    const parsed = Date.parse(peer?.lastSeenAt || peer?.linkedAt || '');
    return Math.max(inMem, Number.isFinite(parsed) ? parsed : 0);
  }
  function sortPeersByRecentActivity(peers) {
    return [...(peers || [])].sort((a,b)=>peerActivityMs(b)-peerActivityMs(a)||String(a?.peerId||'').localeCompare(String(b?.peerId||'')));
  }
  function formatPeerDate(value) {
    const date = new Date(value || '');
    return Number.isFinite(date.getTime()) ? date.toLocaleString('es-DO') : 'Sin registro';
  }
  function modal() { return document.getElementById(MODAL_ID); }
  function body() { return modal()?.querySelector('[data-p2p-body]'); }
  function toast(message) { if (typeof root.showToast === 'function') root.showToast(message); }
  const MAX_REJECTION_REASON_BYTES = 256;

  function vectorIcon(name, size = 18) {
    let svg = '';
    try { svg = root.IconSet?.iconSvg?.(name) || ''; } catch (_) {}
    if (!svg) {
      svg = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
    }
    return `<span class="mini-p2p-icon" data-icon-vector="${esc(name)}" aria-hidden="true">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</span>`;
  }

  function uiButton(label, attrs = '', kind = 'primary', iconName = '') {
    const icon = iconName ? vectorIcon(iconName, 16) : '';
    return `<button type="button" class="mini-p2p-button mini-p2p-button-${kind}" ${attrs}>${icon}<span>${esc(label)}</span></button>`;
  }

  function backButton(label = 'Volver') {
    return `<button type="button" class="mini-p2p-back" data-back>${vectorIcon('chevronLeft', 17)}<span>${esc(label)}</span></button>`;
  }

  function statusMessage(iconName, text, detail = '') {
    const detailMarkup = detail ? `<small>${esc(detail)}</small>` : '';
    return `<span class="mini-p2p-inline-status">${vectorIcon(iconName, 16)}<span><strong>${esc(text)}</strong>${detailMarkup}</span></span>`;
  }

  function boundedUserSafeError(error) {
    const fallback = 'No se pudo validar el roster recibido.';
    const raw = error instanceof Error ? error.message : '';
    const normalized = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    let bounded = '';
    for (const character of normalized) {
      const candidate = bounded + character;
      if (new TextEncoder().encode(candidate).byteLength > MAX_REJECTION_REASON_BYTES) break;
      bounded = candidate;
    }
    return bounded || fallback;
  }

  const firedTerminalSuccessKeys = new Set();
  function resetTerminalSuccessSignals() {
    try { firedTerminalSuccessKeys.clear(); } catch (_) {}
    try {
      const shellEl = modal()?.querySelector?.('.mini-p2p-shell');
      if (shellEl && shellEl.classList) {
        shellEl.classList.remove('mini-p2p-success-pulse');
        shellEl.classList.remove('mini-p2p-success-done');
      }
    } catch (_) {}
  }
  function playSuccessChime() {
    try {
      const Ctor = root.AudioContext || root.webkitAudioContext;
      if (typeof Ctor !== 'function') return false;
      let ctx = null;
      try { ctx = new Ctor(); } catch (_) { return false; }
      if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function' || !ctx.destination) {
        try { if (ctx && typeof ctx.close === 'function') ctx.close(); } catch (_) {}
        return false;
      }
      try {
        const resumed = ctx.resume ? ctx.resume() : null;
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      } catch (_) {}
      const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
      let gain = null;
      try { gain = ctx.createGain(); } catch (_) { return false; }
      try { gain.connect(ctx.destination); } catch (_) {}
      try {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      } catch (_) {
        try { gain.gain.value = 0.05; } catch (_) {}
      }
      const notes = [{ freq: 660, at: 0, dur: 0.09 }, { freq: 880, at: 0.09, dur: 0.12 }];
      for (const note of notes) {
        try {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          try { osc.frequency.setValueAtTime(note.freq, now + note.at); } catch (_) {}
          try { osc.connect(gain); } catch (_) {}
          try { osc.start(now + note.at); } catch (_) { try { osc.start(); } catch (_) {} }
          try { osc.stop(now + note.at + note.dur); } catch (_) { try { osc.stop(); } catch (_) {} }
        } catch (_) {}
      }
      try {
        const closer = () => { try { if (typeof ctx.close === 'function') ctx.close(); } catch (_) {} };
        if (typeof root.setTimeout === 'function') root.setTimeout(closer, 500);
        else if (typeof setTimeout === 'function') setTimeout(closer, 500);
      } catch (_) {}
      return true;
    } catch (_) { return false; }
  }
  function signalTerminalSuccess(key, options = {}) {
    try {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || firedTerminalSuccessKeys.has(normalizedKey)) return false;
      firedTerminalSuccessKeys.add(normalizedKey);
      const title = String(options.title || 'Operación exitosa');
      const detail = String(options.detail || '');
      try {
        const shellEl = modal()?.querySelector?.('.mini-p2p-shell');
        if (shellEl && shellEl.classList) {
          try { shellEl.classList.add('mini-p2p-success-done'); } catch (_) {}
          if (!isReducedMotion()) {
            try { shellEl.classList.remove('mini-p2p-success-pulse'); } catch (_) {}
            try { void shellEl.offsetWidth; } catch (_) {}
            try { shellEl.classList.add('mini-p2p-success-pulse'); } catch (_) {}
          }
        }
      } catch (_) {}
      try {
        const nav = root.navigator;
        if (nav && typeof nav.vibrate === 'function') {
          try { nav.vibrate(15); } catch (_) {}
        }
      } catch (_) {}
      try { playSuccessChime(); } catch (_) {}
      try {
        const Notif = root.Notification;
        const doc = root.document;
        if (Notif && Notif.permission === 'granted' && doc && doc.hidden === true) {
          try { new Notif(title, { body: detail || title, tag: normalizedKey }); } catch (_) {}
        }
      } catch (_) {}
      return true;
    } catch (_) { return false; }
  }
  function countBadge(count, label = 'elementos') {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) return '';
    const rounded = Math.floor(n);
    if (rounded === 0) return '';
    return `<span class="mini-count-badge" role="status" aria-label="${esc(rounded)} ${esc(label)}">${esc(rounded)}</span>`;
  }

  function cleanupQrScanner() {
    activeQrScanGeneration += 1;
    if (activeQrScanTimer !== null) {
      try { root.clearTimeout(activeQrScanTimer); } catch (_) {}
      activeQrScanTimer = null;
    }
    if (activeQrStream) {
      try { activeQrStream.getTracks().forEach(track => track.stop()); } catch (_) {}
      activeQrStream = null;
    }
    const video = body()?.querySelector?.('[data-qr-video]');
    if (video) {
      try { video.pause?.(); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
    }
  }

  let inFlightSendNotice = null;
  let activeSendAttempt = null;
  function cleanupSession() {
    try { activeSendAttempt?.consentController?.abort(); } catch (_) {}
    activeSendAttempt = null;
    // An aborted send must not leave its "Conectando / Esperando" notice behind.
    try { inFlightSendNotice?.dismiss(); } catch (_) {}
    inFlightSendNotice = null;
    cleanupQrScanner();
    activePairConfirmation = null;
    activeManualPeerId = null;
    if (activeAttendanceResponderDetach) {
      try { activeAttendanceResponderDetach(); } catch (_) {}
      activeAttendanceResponderDetach = null;
    }
    if (activeBackupReceiverDetach) {
      try { activeBackupReceiverDetach(); } catch (_) {}
      activeBackupReceiverDetach = null;
    }
    try { activeSession?.close?.(); } catch (_) {}
    activeSession = null;
    activeChannel = null;
  }

  function closeTransferModal(options = {}) {
    if (connectionsMenu && !connectionsMenu.release()) return;
    connectionsMenu = null;
    root.miniConnectionsMenu = null;
    homeRenderEpoch++;
    if (activeMorphCleanup) activeMorphCleanup();
    if (!options.keepSession) cleanupSession();
    modal()?.remove();
    // Closing a manual transfer resumes both SA and Mini backup listeners.
    if (!options.keepSession) startPassiveInbox().catch(() => {});
  }

  function shell() {
    if (modal()) return;
    const el = document.createElement('div');
    el.id = MODAL_ID;
    el.className = 'mini-p2p-overlay';
    el.innerHTML = `
      <section class="mini-p2p-shell" role="dialog" aria-modal="true" aria-labelledby="mini-p2p-title">
        <header class="mini-p2p-topbar">
          <span class="mini-p2p-topbar-icon">${vectorIcon('link', 20)}</span>
          <div class="mini-p2p-title-wrap"><strong id="mini-p2p-title" class="mini-p2p-title">Compartir</strong><div class="mini-p2p-subtitle">Colabora con tu equipo</div></div>
          <button type="button" class="mini-p2p-icon-btn" data-p2p-close aria-label="Cerrar" title="Cerrar">${vectorIcon('close', 17)}</button>
        </header>
        <div class="mini-p2p-body" data-p2p-body></div>
      </section>`;
    el.querySelector('[data-p2p-close]').addEventListener('click', () => closeTransferModal());
    el.addEventListener('click', e => { if (e.target === el) closeTransferModal(); });
    document.body.appendChild(el);
    if (root.ConnectionMenu) connectionsMenu = root.ConnectionMenu.mount({
      app: 'mini', shell: el.querySelector('.mini-p2p-shell'), directBody: body(),
      internetAvailable: !!root.MiniFirebaseFieldConfig?.endpoint,
      getInternet: () => { const panel=document.querySelector('#firebase-link-modal .firebase-link-panel'); panel.querySelector('h2').hidden=true; return panel; },
      beforeLeaveInternet: () => !root.miniCloudFieldView?.isBusy() && root.miniFirebaseLinkView?.close?.() !== false,
      refreshInternet: () => root.miniCloudFieldView?.refresh(),
      prepareSend: () => root.miniCloudFieldView?.previewSend(),
      prepareMembers: () => root.miniCloudFieldView?.openMembers(),
      scanInvitation: () => { renderQrScanner({ invitation: true }).catch(error => toast(error?.message || 'No se pudo abrir la cámara.')); },
      canChange: () => !root.miniCloudFieldView?.isBusy() && !activeSession && !activeChannel && !body()?.querySelector('[data-review-roster],[data-apply-roster]'),
      getMiniPeers: miniBackupConnectionSnapshot, subscribeMiniPeers: subscribeMiniBackupConnections,
      closeMiniPeer: closeMiniBackupConnection,
      connectMiniPeer: reconnectMiniBackupPeer,
      notify: toast, close: () => closeTransferModal()
    });
    root.miniConnectionsMenu=connectionsMenu;
  }

  let activeMorphCleanup = null;

  function isReducedMotion() {
    try {
      return Boolean(
        typeof root.matchMedia === 'function' &&
        root.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      );
    } catch (_) {
      return false;
    }
  }

  function morphShell(renderViewFn) {
    shell();
    const dialog = modal()?.querySelector('section[role="dialog"]') || modal()?.querySelector('section');
    const bodyEl = body();

    if (activeMorphCleanup) {
      activeMorphCleanup();
    }

    const hasPreviousContent = Boolean(bodyEl && (bodyEl.childNodes?.length > 0 || (typeof bodyEl.innerHTML === 'string' && bodyEl.innerHTML.trim().length > 0)));

    if (!hasPreviousContent || !dialog || !bodyEl || isReducedMotion() || typeof dialog.getBoundingClientRect !== 'function') {
      if (typeof renderViewFn === 'function') renderViewFn();
      return;
    }

    const startRect = dialog.getBoundingClientRect();
    const startW = Math.round(startRect.width);
    const startH = Math.round(startRect.height);

    if (startW <= 0 || startH <= 0) {
      if (typeof renderViewFn === 'function') renderViewFn();
      return;
    }

    dialog.style.width = `${startW}px`;
    dialog.style.height = `${startH}px`;
    dialog.style.overflow = 'hidden';
    dialog.style.transition = 'none';

    if (typeof renderViewFn === 'function') renderViewFn();

    bodyEl.style.transition = 'opacity 180ms ease-out';
    bodyEl.style.opacity = '0.7';

    dialog.style.width = '';
    dialog.style.height = '';
    const targetRect = dialog.getBoundingClientRect();
    const targetW = Math.round(targetRect.width);
    const targetH = Math.round(targetRect.height);

    if (startW === targetW && startH === targetH) {
      bodyEl.style.opacity = '1';
      dialog.style.overflow = '';
      dialog.style.transition = '';
      bodyEl.style.transition = '';
      return;
    }

    dialog.style.width = `${startW}px`;
    dialog.style.height = `${startH}px`;
    void dialog.offsetHeight;

    const MORPH_DURATION_MS = 260;
    const MORPH_EASING = 'cubic-bezier(.2,.8,.2,1)';
    dialog.style.transition = `width ${MORPH_DURATION_MS}ms ${MORPH_EASING}, height ${MORPH_DURATION_MS}ms ${MORPH_EASING}`;
    dialog.style.width = `${targetW}px`;
    dialog.style.height = `${targetH}px`;

    if (typeof root.requestAnimationFrame === 'function') {
      root.requestAnimationFrame(() => {
        bodyEl.style.opacity = '1';
      });
    } else {
      bodyEl.style.opacity = '1';
    }

    let cleaned = false;
    let timerId = null;
    let onTransitionEnd = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timerId !== null) clearTimeout(timerId);
      if (onTransitionEnd && typeof dialog.removeEventListener === 'function') {
        dialog.removeEventListener('transitionend', onTransitionEnd);
      }
      activeMorphCleanup = null;
      dialog.style.width = '';
      dialog.style.height = '';
      dialog.style.transition = '';
      dialog.style.overflow = '';
      bodyEl.style.transition = '';
      bodyEl.style.opacity = '';
    };
    activeMorphCleanup = cleanup;

    timerId = setTimeout(cleanup, MORPH_DURATION_MS + 20);
    onTransitionEnd = (e) => {
      if (e && e.target === dialog && (e.propertyName === 'height' || e.propertyName === 'width')) {
        cleanup();
      }
    };
    if (typeof dialog.addEventListener === 'function') {
      dialog.addEventListener('transitionend', onTransitionEnd);
    }
  }

  function primary(label, attrs = '', iconName = '') {
    return uiButton(label, attrs, 'primary', iconName);
  }

  function secondary(label, attrs = '', iconName = '') {
    return uiButton(label, attrs, 'secondary', iconName);
  }

  function capability(iconName, title, detail, stateClass = '', extraAttrs = '') {
    const attrs = extraAttrs ? (' ' + extraAttrs) : '';
    const disabledAria = stateClass.includes('is-disabled') ? ' aria-disabled="true"' : '';
    return `<div class="mini-p2p-capability ${stateClass}"${attrs}${disabledAria}><span class="mini-p2p-capability-icon">${vectorIcon(iconName, 16)}</span><span class="mini-p2p-capability-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span></div>`;
  }

  function peerSortScore(peer) {
    const id = String(peer?.peerId || '').trim();
    const online = isPeerOnline(id);
    const pending = Boolean(getEffectiveStaged(id));
    if (online && pending) return 4;
    if (online) return 3;
    if (pending) return 2;
    return 1;
  }

  function sortPeersForDisplay(peers) {
    return [...(peers || [])].sort((a, b) => {
      const scoreDiff = peerSortScore(b) - peerSortScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return peerActivityMs(b) - peerActivityMs(a) || String(a?.peerId || '').localeCompare(String(b?.peerId || ''));
    });
  }

  async function renderHome() {
    const renderEpoch = ++homeRenderEpoch;
    shell();
    cleanupSession();
    const self = await identityStore.getSelf();
    const peers = sortPeersByRecentActivity((await identityStore.listPeers()).filter(p => p.peerApp === 'sa'));
    if (renderEpoch !== homeRenderEpoch || !modal()) return;
    const sortedPeers = sortPeersForDisplay(peers);
    const peerRows = sortedPeers.length ? sortedPeers.map(peer => {
      const alias = aliasStore.getAlias(peer.peerId);
      const original = peerOriginalName(peer);
      const rec = getPeerPresence(peer.peerId);
      const inMemPong = rec?.lastPongAt || peerRecentLastSeen.get(peer.peerId);
      const effectiveLastSeen = inMemPong ? new Date(inMemPong).toISOString() : (peer.lastSeenAt || peer.linkedAt);
      const lastSeen = formatPeerDate(effectiveLastSeen);
      const originalLine = alias ? ` · Original: ${esc(original)}` : '';
      const visualState = getPeerVisualState(peer.peerId);
      const isOnline = visualState === 'online';
      const isTransferring = visualState === 'transferring';
      const isConnecting = visualState === 'connecting';
      const statePillClass = isTransferring ? 'is-transferring' : (isOnline ? 'is-online' : (isConnecting ? 'is-connecting' : 'is-offline'));
      const stateLabel = isTransferring ? 'En transferencia' : (isOnline ? 'Conectado' : (isConnecting ? 'Conectando…' : 'Desconectado'));
      const avatarStateClass = isTransferring ? 'is-transferring' : (isOnline ? 'is-online' : '');
      const peerStaged = getEffectiveStaged(peer.peerId);
      const peerPendingBadge = `<span class="mini-count-badge" data-roster-pending-peer="${esc(peer.peerId)}" role="status" aria-label="${peerStaged ? '1 pendiente' : 'Sin pendientes'}"${peerStaged ? '' : ' hidden'}>${peerStaged ? '1' : ''}</span>`;
      const stateMeta = isOnline ? 'Conectado recientemente' : `Última conexión: ${esc(lastSeen)}`;
      return `
        <div class="mini-p2p-peer-row">
          <span class="mini-p2p-peer-avatar ${avatarStateClass}">${vectorIcon('hardHat', 17)}</span>
          <div class="mini-p2p-peer-copy">
            <div class="mini-p2p-peer-title-line">
              <strong>${esc(peerName(peer))}</strong>
              <span class="mini-p2p-peer-pill ${statePillClass}">${stateLabel}</span>
              ${peerPendingBadge}
            </div>
            <div class="mini-p2p-peer-meta">${stateMeta}${originalLine}</div>
          </div>
          <div class="mini-p2p-device-actions">
            <button type="button" class="mini-p2p-icon-btn" data-rename-peer="${esc(peer.peerId)}" aria-label="Cambiar nombre de ${esc(peerName(peer))}" title="Cambiar nombre">${vectorIcon('edit', 16)}</button>
            ${uiButton('Recibir personal', `data-wait-peer="${esc(peer.peerId)}" aria-label="Recibir personal de ${esc(peerName(peer))}"`, 'primary', 'users')}
            ${uiButton('Enviar personal', `data-send-employees="${esc(peer.peerId)}"`, 'secondary', 'users')}
            ${uiButton('Asistencia', `data-wait-attendance="${esc(peer.peerId)}" aria-label="Compartir asistencia con ${esc(peerName(peer))}"`, 'secondary', 'attendance')}
            <button type="button" class="mini-p2p-icon-btn is-danger" data-unlink="${esc(peer.peerId)}" aria-label="Desvincular ${esc(peerName(peer))}" title="Desvincular">${vectorIcon('unlink', 16)}</button>
          </div>
        </div>`;
    }).join('') : '<div class="mini-p2p-empty">Aún no hay dispositivos de la obra vinculados. Escanea su QR para agregar el primero.</div>';

    const stagedEntries = getAllStaged();
    const stagedBackups = root.SaMiniP2PBackup?.backupStagedStore?.listStaged() || [];
    const totalStagedCount = stagedEntries.length + stagedBackups.length;
    const rosterCards = stagedEntries.map(staged => {
      const stagedName = String(staged.peerName || (staged.peer ? peerName(staged.peer) : 'SA'));
      const stagedWhen = formatPeerDate(staged.receivedAt);
      const stagedEmployees = Number(staged.employeeCount || 0);
      const stagedPeerId = String(staged.peer?.peerId || staged.peerId || '');
      return `<div class="mini-p2p-staged-card" data-staged-peer="${esc(stagedPeerId)}"><span class="mini-p2p-staged-icon">${vectorIcon('users', 17)}</span><div class="mini-p2p-staged-copy"><strong>Roster de ${esc(stagedName)} listo para revisar</strong><span>${esc(stagedEmployees)} empleados · recibido ${esc(stagedWhen)}. Aún no se ha aplicado nada.</span></div><div class="mini-p2p-staged-actions">${uiButton('Revisar', 'data-review-staged="' + esc(stagedPeerId) + '" aria-label="Revisar roster de ' + esc(stagedName) + '"', 'primary', 'chevronRight')}${uiButton('Descartar', 'data-discard-staged="' + esc(stagedPeerId) + '" aria-label="Descartar roster de ' + esc(stagedName) + '"', 'secondary', 'close')}</div></div>`;
    });
    const backupCards = stagedBackups.map(staged => {
      const isMini = staged.schema === 'mini-backup/v1';
      const stagedWhen = formatPeerDate(staged.receivedAt);
      const stagedSize = root.SaMiniP2PBackup ? root.SaMiniP2PBackup.formatBackupSize(staged.size) : (staged.size + ' B');
      const actionBtn = isMini
        ? uiButton('Revisar', 'data-review-backup="' + esc(staged.transferId) + '" aria-label="Revisar respaldo de ' + esc(staged.sourcePeerName) + '"', 'primary', 'chevronRight')
        : uiButton('Descargar', 'data-download-backup="' + esc(staged.transferId) + '" aria-label="Descargar respaldo de ' + esc(staged.sourcePeerName) + '"', 'primary', 'restore');
      const note = isMini
        ? `${esc(stagedSize)} · recibido ${esc(stagedWhen)}. Aún no se ha aplicado nada.`
        : `${esc(stagedSize)} · recibido ${esc(stagedWhen)}. Sólo descarga; no se importa.`;
      return `<div class="mini-p2p-staged-card" data-staged-backup="${esc(staged.transferId)}"><span class="mini-p2p-staged-icon">${vectorIcon('backup', 17)}</span><div class="mini-p2p-staged-copy"><strong>Respaldo de ${esc(staged.sourcePeerName)} listo</strong><span>${note}</span></div><div class="mini-p2p-staged-actions">${actionBtn}${uiButton('Descartar', 'data-discard-backup="' + esc(staged.transferId) + '" aria-label="Descartar respaldo de ' + esc(staged.sourcePeerName) + '"', 'secondary', 'close')}</div></div>`;
    });
    const stagedCards = [...rosterCards, ...backupCards].join('');
    const pendingSection = totalStagedCount > 0 ? `
      <section class="mini-p2p-activity" aria-labelledby="mini-p2p-pending-title">
        <div class="mini-p2p-activity-head">
          <div><h3 id="mini-p2p-pending-title">Pendientes por revisar</h3><div class="mini-p2p-subtitle">Datos recibidos que requieren una decisión</div></div>
          ${countBadge(totalStagedCount, 'pendientes')}
        </div>
        ${stagedCards}
      </section>` : '';
    morphShell(() => { body().innerHTML = `
      ${pendingSection}
      <section class="mini-p2p-capabilities-wrap" aria-labelledby="mini-p2p-capabilities-title">
        <h3 id="mini-p2p-capabilities-title" class="mini-p2p-section-label">Capacidades</h3>
        <div class="mini-p2p-capabilities">
          ${capability('users', 'Personal', 'Enviar y recibir', 'is-ready')}
          ${capability('attendance', 'Asistencia', 'Responder a SA', 'is-ready')}
          ${capability('backup', 'Backup', 'Respaldos P2P', 'is-ready', 'data-open-backup-hub')}
          ${capability('restore', 'Archivos', 'Próximamente', 'is-disabled')}
        </div>
      </section>
      <section class="mini-p2p-devices" aria-labelledby="mini-p2p-devices-title">
        <div class="mini-p2p-devices-head">
          <div><h3 id="mini-p2p-devices-title">Dispositivos de la obra</h3><div class="mini-p2p-subtitle">${peers.length} dispositivo${peers.length === 1 ? '' : 's'} guardado${peers.length === 1 ? '' : 's'} en este equipo</div></div>
          <div class="mini-p2p-self">Este Mini: <strong>${esc(self.displayName)}</strong><button type="button" class="mini-p2p-icon-btn" data-rename-self aria-label="Cambiar nombre de este Mini" title="Cambiar nombre de este Mini">${vectorIcon('edit', 15)}</button></div>
        </div>
        <div class="mini-p2p-peer-list">${peerRows}</div>
      </section>
      <div class="mini-p2p-actions">
        ${uiButton('Escanear QR de SA', 'data-scan-pair', 'primary', 'camera')}
        ${uiButton('Usar código + clave', 'data-manual-pair', 'secondary', 'hash')}
        ${uiButton('Respaldos P2P', 'data-open-backup-hub-btn', 'secondary', 'backup')}
      </div>
      <p class="mini-p2p-footnote">El QR evita escribir código y clave. Vincular sólo crea una relación segura; recibir datos nunca los incorpora automáticamente.</p>`; });
    body().querySelector('[data-scan-pair]').addEventListener('click', () => renderQrScanner());
    body().querySelector('[data-manual-pair]').addEventListener('click', () => renderManualPair());
    body().querySelectorAll('[data-open-backup-hub]').forEach(el => el.addEventListener('click', () => renderBackupHub()));
    body().querySelector('[data-open-backup-hub-btn]')?.addEventListener('click', () => renderBackupHub());
    body().querySelector('[data-rename-self]')?.addEventListener('click', renderSelfNameEditor);
    body().querySelectorAll('[data-rename-peer]').forEach(btn => btn.addEventListener('click', () => renderPeerAliasEditor(btn.dataset.renamePeer)));
    body().querySelectorAll('[data-wait-peer]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitPeer, 'roster')));
    body().querySelectorAll('[data-send-employees]').forEach(btn => btn.addEventListener('click', async () => { try { const peer=await identityStore.getPeer(btn.dataset.sendEmployees); if(peer) await root.MiniEmployeeSender.openOffer(peer); } catch(error) { toast(error.message || 'No se pudo enviar el personal.'); } }));
    body().querySelectorAll('[data-wait-attendance]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitAttendance, 'attendance')));
    body().querySelectorAll('[data-review-staged]').forEach(btn => btn.addEventListener('click', () => reviewPersistedStagedRoster(btn.dataset.reviewStaged)));
    body().querySelectorAll('[data-discard-staged]').forEach(btn => btn.addEventListener('click', async () => {
      await discardPersistedStagedRoster(btn.dataset.discardStaged);
      renderHome();
    }));
    body().querySelectorAll('[data-review-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.reviewBackup;
      const staged = root.SaMiniP2PBackup?.backupStagedStore?.getStaged(transferId);
      if (!staged) return renderHome();
      renderBackupReview(transferId).catch(err => toast('Error al revisar respaldo: ' + err.message));
    }));
    body().querySelectorAll('[data-download-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.downloadBackup;
      const staged = root.SaMiniP2PBackup?.backupStagedStore?.getStaged(transferId);
      if (!staged) return renderHome();
      try {
        root.SaMiniP2PBackup.downloadBackupBytes(staged);
        root.SaMiniP2PBackup.backupStagedStore.removeStaged(transferId);
        await refreshMiniP2PHeader();
        toast('Respaldo descargado.');
        renderHome();
      } catch (err) {
        toast('Error al descargar respaldo: ' + err.message);
      }
    }));
    body().querySelectorAll('[data-discard-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.discardBackup;
      root.SaMiniP2PBackup?.backupStagedStore?.removeStaged(transferId);
      await refreshMiniP2PHeader();
      renderHome();
    }));
    body().querySelectorAll('[data-unlink]').forEach(btn => btn.addEventListener('click', async () => {
      const peerId = btn.dataset.unlink;
      const peer = await identityStore.getPeer(peerId);
      const name = peer ? peerName(peer) : 'este SA';
      if (typeof root.showConfirm !== 'function') { toast('Confirmación no disponible en este entorno.'); return; }
      const confirmed = await root.showConfirm(`¿Desvincular a ${name}?`, { title: 'Desvincular SA', confirmText: 'Desvincular', danger: true });
      if (!confirmed) return;
      peerRecentLastSeen.delete(peerId);
      detachPresence(peerId, { persist: false });
      await identityStore.removePeer(peerId);
      aliasStore.removeAlias(peerId);
      try { stopPeerListener(peerId); } catch (_) {}
      try { stagedStore?.clear?.(peerId); } catch (_) {}
      try { if (pendingRoster?.peer?.peerId === peerId) pendingRoster = null; } catch (_) {}
      try { activityStore?.markStagedReviewed?.(peerId); } catch (_) {}
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderHome();
    }));
    try { await refreshMiniP2PHeader(); } catch (_) {}
    if (renderEpoch !== homeRenderEpoch || !modal()) return;
    try { startPassiveInbox().catch(() => {}); } catch (_) {}
    connectionsMenu?.show();
  }

  async function renderSelfNameEditor() {
    const self = await identityStore.getSelf();
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>Nombre de este Mini</h3><p>Es el nombre que este dispositivo presenta en futuros emparejamientos.</p></div>
        <div class="mini-p2p-field"><label for="mini-p2p-self-name">Nombre del dispositivo</label><input id="mini-p2p-self-name" data-self-name maxlength="80" value="${esc(self.displayName)}" placeholder="Ej: Mini almacén"></div>
        <p class="mini-p2p-footnote">Cambiarlo no modifica deviceId, claves ni vínculos existentes. Los aliases personalizados guardados en otros dispositivos tampoco cambian.</p>
        <div class="mini-p2p-actions">${primary('Guardar nombre del Mini','data-save-self-name')}</div>
      </div>`; });
    const input = body().querySelector('[data-self-name]');
    input?.focus();
    input?.select();
    body().querySelector('[data-back]').addEventListener('click', renderHome);
    body().querySelector('[data-save-self-name]').addEventListener('click', async () => {
      const nextName = String(input.value || '').trim();
      if (!nextName) {
        toast('Escribe un nombre para este Mini.');
        return;
      }
      await identityStore.renameSelf(nextName);
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderHome();
    });
  }

  async function renderPeerAliasEditor(peerId) {
    const peer = await identityStore.getPeer(peerId);
    if (!peer || peer.peerApp !== 'sa') {
      toast('SA vinculado no encontrado.');
      return renderHome();
    }
    const currentAlias = aliasStore.getAlias(peer.peerId);
    const original = peerOriginalName(peer);
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>Nombre de esta conexión</h3><p>Nombre original: <strong>${esc(original)}</strong></p></div>
        <div class="mini-p2p-field"><label for="mini-p2p-peer-alias">Nombre personalizado</label><input id="mini-p2p-peer-alias" data-peer-alias maxlength="64" value="${esc(currentAlias)}" placeholder="Ej: SA oficina"></div>
        <p class="mini-p2p-footnote">Este nombre se guarda sólo en este Mini. No cambia el vínculo, la identidad del dispositivo ni sus claves de seguridad.</p>
        <div class="mini-p2p-actions">${primary('Guardar nombre','data-save-alias')}${secondary('Usar nombre original','data-clear-alias')}</div>
      </div>`; });
    const input = body().querySelector('[data-peer-alias]');
    input?.focus();
    input?.select();
    body().querySelector('[data-back]').addEventListener('click', renderHome);
    body().querySelector('[data-save-alias]').addEventListener('click', async () => {
      aliasStore.setAlias(peer.peerId, input.value);
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderHome();
    });
    body().querySelector('[data-clear-alias]').addEventListener('click', async () => {
      aliasStore.removeAlias(peer.peerId);
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderHome();
    });
  }

  async function descriptorFromScannedQr(rawValue, options = {}) {
    const raw = String(rawValue || '').trim();
    if (!raw) throw new Error('El QR no contiene datos de vinculación.');
    let encoded = null;
    try {
      const parsedUrl = new URL(raw, root.location?.href || 'https://mini.invalid/');
      encoded = core.parsePairHash(parsedUrl.hash);
    } catch (_) {}
    if (!encoded && raw.startsWith('#')) encoded = core.parsePairHash(raw);
    if (!encoded && /^[A-Za-z0-9_-]+$/.test(raw)) encoded = raw;
    if (!encoded) throw new Error(options.allowSameApp ? 'Este QR no es un vínculo válido de respaldo.' : 'Este QR no es un vínculo válido de SA.');
    return core.decodePairDescriptor(encoded, { allowSameApp: options.allowSameApp === true });
  }

  function renderQr(url) {
    try {
      const qrFn = root.qrcode || (typeof window !== 'undefined' ? window.qrcode : null);
      if (typeof qrFn !== 'function') {
        return '<div class="mini-p2p-qr-warning">QR no disponible. Usa código + clave.</div>';
      }
      const qr = qrFn(0, 'M');
      qr.addData(url);
      qr.make();
      if (typeof qr.createSvgTag === 'function') {
        const svg = qr.createSvgTag({
          cellSize: 4,
          margin: 16,
          scalable: true,
          alt: 'Código QR de vinculación para respaldo'
        });
        return `<div class="mini-p2p-qr-card" data-qr-card>${svg}</div>`;
      }
      if (typeof qr.createDataURL === 'function') {
        const dataUrl = qr.createDataURL(4, 2);
        return `<div class="mini-p2p-qr-card" data-qr-card><img class="mini-p2p-qr-image" src="${esc(dataUrl)}" width="240" height="240" alt="Código QR de vinculación para respaldo"></div>`;
      }
      return '<div class="mini-p2p-qr-warning">QR no disponible. Usa código + clave.</div>';
    } catch (_) {
      return '<div class="mini-p2p-qr-warning">No se pudo generar QR. Usa código + clave.</div>';
    }
  }

  async function renderQrScanner(options = {}) {
    const allowSameApp = options.allowSameApp === true;
    const invitationOnly = options.invitation === true && !allowSameApp;
    if (allowSameApp ? !(await ensureMiniAliasChosen({ type: 'scan', options })) : !(await ensureMiniAliasChosen('scan'))) return;
    cleanupSession();
    shell();
    const title = allowSameApp ? 'Escanear QR de respaldo' : 'Escanear QR de SA';
    const desc = allowSameApp
      ? 'Apunta la cámara al QR que muestra el otro dispositivo. Mini leerá el código y la clave automáticamente.'
      : 'Apunta la cámara al QR que aparece en SA.';
    const searchStatus = allowSameApp ? 'Cámara activa. Buscando QR de respaldo…' : 'Cámara activa. Buscando QR de SA…';
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>${title}</h3><p>${desc}</p></div>
        <div class="mini-p2p-scanner"><video data-qr-video playsinline muted></video><div class="mini-p2p-scanner-frame" aria-hidden="true"></div></div>
        <div class="mini-p2p-status" data-qr-status role="status" aria-live="polite">Preparando cámara…</div>
        <div class="mini-p2p-actions">${secondary(invitationOnly ? 'Pegar código de invitación' : 'Usar código + clave','data-manual-fallback','hash')}</div>
      </div>`; });

    const back = () => { cleanupQrScanner(); if (invitationOnly) connectionsMenu?.task('invitation'); else if (allowSameApp) renderBackupHub(); else renderHome(); };
    body().querySelector('[data-back]')?.addEventListener('click', back);
    body().querySelector('[data-manual-fallback]')?.addEventListener('click', () => { cleanupQrScanner(); if(invitationOnly) connectionsMenu?.task('invitation'); else renderManualPair({ allowSameApp }); });
    const status = body().querySelector('[data-qr-status]');
    const video = body().querySelector('[data-qr-video]');
    const mediaDevices = root.navigator?.mediaDevices;
    const Detector = root.BarcodeDetector;
    if (!mediaDevices?.getUserMedia || typeof Detector !== 'function') {
      if (status) status.textContent = invitationOnly ? 'La cámara no está disponible aquí. Puedes pegar el código de invitación.' : 'Este navegador no permite escanear QR directamente. Puedes usar código + clave.';
      return;
    }

    const generation = ++activeQrScanGeneration;
    try {
      if (typeof Detector.getSupportedFormats === 'function') {
        const formats = await Detector.getSupportedFormats();
        if (Array.isArray(formats) && !formats.includes('qr_code')) {
          throw new Error('Este navegador no admite lectura de códigos QR con la cámara.');
        }
      }
      const detector = new Detector({ formats: ['qr_code'] });
      const stream = await mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (generation !== activeQrScanGeneration || !body()?.contains?.(video)) {
        try { stream.getTracks().forEach(track => track.stop()); } catch (_) {}
        return;
      }
      activeQrStream = stream;
      video.srcObject = stream;
      await video.play?.();
      if (status) status.textContent = searchStatus;

      const scan = async () => {
        if (generation !== activeQrScanGeneration || !activeQrStream) return;
        try {
          const results = await detector.detect(video);
          const rawValue = results?.find(item => typeof item?.rawValue === 'string' && item.rawValue.trim())?.rawValue;
          if (rawValue) {
            if (status) status.textContent = 'QR detectado. Verificando vínculo…';
            const invitation = !allowSameApp && root.MiniFirebaseLink?.parseInvitationQr(rawValue);
            if (invitation) {
              cleanupQrScanner();
              await root.miniCloudFieldView?.whenIdle();
              if (!connectionsMenu?.task('invitation') || !root.miniFirebaseLinkView?.useInvitation(invitation)) throw new Error('No se pudo abrir esta invitación. Vuelve a escanear el QR.');
              return;
            }
            const descriptor = await descriptorFromScannedQr(rawValue, { allowSameApp });
            cleanupQrScanner();
            await startPairing(descriptor, { allowSameApp });
            return;
          }
        } catch (error) {
          if (generation !== activeQrScanGeneration) return;
          if (error?.message && /QR|vínculo|emparejamiento|expir/i.test(error.message)) {
            if (status) status.textContent = error.message;
          }
        }
        if (generation === activeQrScanGeneration) {
          activeQrScanTimer = root.setTimeout(scan, 180);
        }
      };
      scan();
    } catch (error) {
      cleanupQrScanner();
      if (status) status.textContent = error?.name === 'NotAllowedError'
        ? (invitationOnly ? 'No se concedió acceso a la cámara. Puedes habilitarla o pegar el código de invitación.' : 'No se concedió acceso a la cámara. Puedes permitirlo e intentar de nuevo o usar código + clave.')
        : (error?.message || 'No se pudo iniciar la cámara. Usa código + clave.');
    }
  }

  async function renderManualPair(options = {}) {
    const allowSameApp = options.allowSameApp === true;
    if (allowSameApp ? !(await ensureMiniAliasChosen({ type: 'manual', options })) : !(await ensureMiniAliasChosen('manual'))) return;
    cleanupSession();
    const title = allowSameApp ? 'Vincular para respaldo' : 'Vincular con SA';
    const desc = allowSameApp
      ? 'Escribe el código de 6 dígitos y la clave que muestra el otro dispositivo. Si escaneaste el QR, este paso se completa automáticamente.'
      : 'Escribe el código de 6 dígitos y la clave que muestra SA. Si escaneaste el QR, este paso se completa automáticamente.';
    const btnLabel = allowSameApp ? 'Conectar' : 'Conectar con SA';
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>${title}</h3><p>${desc}</p></div>
        <div class="mini-p2p-field"><label for="mini-p2p-manual-code">Código</label><input id="mini-p2p-manual-code" class="mini-p2p-code" data-code inputmode="numeric" maxlength="7" placeholder="583 214"></div>
        <div class="mini-p2p-field"><label for="mini-p2p-manual-key">Clave</label><input id="mini-p2p-manual-key" class="mini-p2p-code" data-key maxlength="11" placeholder="ABCDE-23456" autocapitalize="characters"></div>
        <div class="mini-p2p-actions">${primary(btnLabel,'data-connect','link')}</div>
        <div id="mini-p2p-manual-status" class="mini-p2p-status" data-pair-status role="status" aria-live="polite" aria-atomic="true" hidden></div>
      </div>`; });
    body().querySelector('[data-back]').addEventListener('click', async () => {
      try {
        if (allowSameApp) await renderBackupHub(); else await renderHome();
        (body()?.querySelector('[data-backup-pair-mini]') || modal()?.querySelector('[data-connections-device]'))?.focus();
      } catch (error) { toast(error.message || 'No se pudo volver.'); }
    });
    const feedback = root.MiniConnectionPresentation?.mountManualPairFeedback?.({
      code: body().querySelector('[data-code]'), key: body().querySelector('[data-key]'),
      status: body().querySelector('[data-pair-status]'), normalizers: core
    });
    const connectButton = body().querySelector('[data-connect]');
    connectButton.addEventListener('click', async () => {
      if (connectButton.disabled) return;
      if (feedback && !feedback.validate()) return;
      connectButton.disabled = true;
      connectButton.setAttribute('aria-busy', 'true');
      connectButton.textContent = 'Conectando…';
      try {
        const descriptor = await core.pairDescriptorFromManual(body().querySelector('[data-code]').value, body().querySelector('[data-key]').value);
        await startPairing(descriptor, { allowSameApp });
      } catch (error) {
        const box = body()?.querySelector('[data-pair-status]');
        if (feedback && box) feedback.showError(error.message);
        else if (box) { box.hidden = false; box.classList?.add?.('is-error'); box.textContent = error.message; }
        if (connectButton.isConnected) {
          connectButton.disabled = false;
          connectButton.removeAttribute('aria-busy');
          connectButton.textContent = btnLabel;
        }
      }
    });
  }

  async function startPairing(descriptor, options = {}) {
    const allowSameApp = options.allowSameApp === true;
    try {
      const gateSelf = await identityStore.getSelf();
      if (!isValidChosenMiniAlias(gateSelf?.displayName)) {
        await renderMiniAliasSetup({ type: 'pair', descriptor, options });
        return;
      }
    } catch (_) {
      await renderMiniAliasSetup({ type: 'pair', descriptor, options });
      return;
    }
    cleanupSession();
    shell();
    if (descriptor.expiresAt !== undefined && Number(descriptor.expiresAt) <= Date.now()) throw new Error('La sesión de emparejamiento expiró.');
    const partnerLabel = descriptor.issuerName || (allowSameApp ? 'dispositivo' : 'SA');
    const pairStatusBox = body().querySelector('[data-pair-status]');
    if (!pairStatusBox) {
      morphShell(() => { body().innerHTML = `<div class="mini-p2p-step"><div><h3>Vincular con ${esc(partnerLabel)}</h3><p>Conectando mediante el vínculo seguro.</p></div><div class="mini-p2p-status" data-pair-status>Buscando ${esc(partnerLabel)}…</div><div class="mini-p2p-actions">${secondary('Cancelar','data-cancel')}</div></div>`; });
      body().querySelector('[data-cancel]').addEventListener('click', () => { if (allowSameApp) renderBackupHub(); else renderHome(); });
    } else {
      pairStatusBox.hidden = false;
      pairStatusBox.classList?.remove?.('is-error');
      pairStatusBox.textContent = `Buscando ${partnerLabel}…`;
    }
    const self = await identityStore.getSelf();
    const signaling = new core.SignalingClient({
      room: descriptor.room,
      peerId: self.deviceId,
      proof: descriptor.proof,
      expiresAt: descriptor.expiresAt
    });
    activeSession = await core.createRtcSession({
      signaling, initiator: false,
      expiresAt: descriptor.expiresAt,
      onState: (status, error) => {
        const box = body()?.querySelector('[data-pair-status]');
        if (!box) return;
        box.hidden = false;
        if (error) {
          activePairConfirmation = null;
          box.removeAttribute('data-pair-state');
          box.classList?.add?.('is-error');
          box.textContent = 'Error: ' + error.message;
          const retry = body()?.querySelector('[data-connect]');
          if (retry) { retry.disabled = false; retry.removeAttribute('aria-busy'); retry.textContent = allowSameApp ? 'Conectar' : 'Conectar con SA'; }
          return;
        }
        if (activePairConfirmation || box.getAttribute('data-pair-state') || box.querySelector('[data-accept]')) {
          return;
        }
        if (status === 'connected') box.textContent = 'Canal conectado. Verificando identidad…';
        else if (status === 'connecting' || status === 'new') box.textContent = 'Negociando conexión…';
      },
      onChannel: channel => {
        activeChannel = channel;
        pairing.attachPairing(channel, {
          self, descriptor, initiator: false, store: identityStore,
          allowSameApp,
          onCandidate: ({ remote, sas, accept, reject }) => renderPairConfirmation(remote, sas, accept, reject),
          onLinked: peer => {
            if (peer.peerApp === 'sa') {
              armRosterReceiver(channel, peer);
              armAttendanceResponder(channel, peer, self);
            } else {
              activeBackupReceiverDetach = armBackupReceiver(channel, peer);
            }
            renderLinkedWaiting(peer, { allowSameApp });
          },
          onRejected: () => renderError((allowSameApp ? 'El dispositivo' : 'SA') + ' rechazó el vínculo.'),
          onError: renderError
        });
      }
    });
  }

  function renderPairConfirmation(remote, sas, accept, reject) {
    const box = body()?.querySelector('[data-pair-status]');
    if (!box) return;
    box.hidden = false;
    box.classList?.remove?.('is-error');
    if (
      activePairConfirmation
      && activePairConfirmation.sas === sas
      && activePairConfirmation.remote?.deviceId === remote?.deviceId
      && box.getAttribute('data-pair-state')
    ) {
      return;
    }
    activePairConfirmation = { remote, sas, accept, reject, accepted: false };
    box.setAttribute('data-pair-state', 'confirming');
    box.innerHTML = `<div class="mini-p2p-step"><div><strong>${esc(remote.displayName)}</strong> quiere vincularse.</div><span>Confirma que ambos dispositivos muestran el mismo código:</span><strong class="mini-p2p-sas">${esc(sas)}</strong><div class="mini-p2p-actions">${uiButton('Rechazar','data-reject','secondary')}${uiButton('Confirmar vínculo','data-accept','primary','link')}</div></div>`;
    box.querySelector('[data-reject]')?.addEventListener('click', () => {
      activePairConfirmation = null;
      box.removeAttribute('data-pair-state');
      reject();
    });
    box.querySelector('[data-accept]')?.addEventListener('click', async () => {
      if (activePairConfirmation) activePairConfirmation.accepted = true;
      box.setAttribute('data-pair-state', 'accepted');
      box.textContent = 'Esperando confirmación…';
      try {
        await accept();
      } catch (err) {
        renderError(err);
      }
    });
  }

  function renderLinkedWaiting(peer, options = {}) {
    activePairConfirmation = null;
    const isMini = peer?.peerApp === 'mini' || options.allowSameApp === true;
    const title = isMini ? 'Dispositivo vinculado para respaldos' : 'SA vinculado';
    const waitCopy = isMini ? 'Esperando transferencias en esta conexión…' : 'Esperando roster en esta conexión…';
    morphShell(() => { body().innerHTML = `<div class="mini-p2p-step"><div class="mini-p2p-result"><span class="mini-p2p-result-icon">${vectorIcon('check',18)}</span><div class="mini-p2p-result-copy"><h3>${title}</h3><p><strong>${esc(peerName(peer))}</strong> quedó reconocido por este Mini.</p></div></div><div class="mini-p2p-status" data-receive-state>${waitCopy}</div><div class="mini-p2p-actions">${secondary('Terminar','data-finish')}</div></div>`; });
    body().querySelector('[data-finish]').addEventListener('click', () => { if (isMini) renderBackupHub(); else renderHome(); });
    try { refreshMiniP2PHeader().catch(() => {}); } catch (_) {}
    try {
      const peerId = String(peer?.peerId || '').trim();
      signalTerminalSuccess(peerId ? ('pair-linked:' + peerId) : 'pair-linked', { title, detail: peerName(peer) + ' quedó vinculado.' });
      recordP2PActivity('peer-linked', peer, peerName(peer) + ' quedó vinculado a este Mini.', peerId ? ('peer-linked:' + peerId) : '');
    } catch (_) {}
  }

  function renderError(error) {
    activePairConfirmation = null;
    const message=error?.message || String(error || 'Error P2P');
    const box=body()?.querySelector('[data-pair-status]') || body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
    if (box) {
      box.hidden = false;
      box.removeAttribute?.('data-pair-state');
      box.classList?.add?.('is-error');
      box.innerHTML = `<strong>Error:</strong> ${esc(message)}`;
    }
    else toast('Error P2P: '+message);
  }

  function renderWaitError(error, peerId, mode) {
    const message = boundedUserSafeError(error);
    const box = body()?.querySelector('[data-wait-status]');
    if (!box) {
      toast('Error de conexión: ' + message);
      return;
    }
    const bottomCancel = body()?.querySelector('[data-cancel]');
    if (bottomCancel?.style) bottomCancel.style.display = 'none';
    box.classList?.add?.('is-error');
    box.innerHTML = `<div class="mini-p2p-step"><strong>Error de conexión</strong><span>${esc(message)}</span><div class="mini-p2p-actions">${uiButton('Reintentar','data-retry-wait','primary','refresh')}${uiButton('Cancelar','data-cancel-wait','secondary')}</div></div>`;
    box.querySelector('[data-retry-wait]')?.addEventListener('click', () => {
      cleanupSession();
      waitTrustedTransfer(peerId, mode);
    });
    box.querySelector('[data-cancel-wait]')?.addEventListener('click', () => {
      cleanupSession();
      renderHome();
    });
  }

  async function waitTrustedRoster(peerId) {
    return waitTrustedTransfer(peerId, 'roster');
  }

  async function waitTrustedAttendance(peerId) {
    return waitTrustedTransfer(peerId, 'attendance');
  }

  async function waitTrustedTransfer(peerId, mode = 'roster') {
    cleanupSession();
    activeManualPeerId = String(peerId || '').trim();
    try { stopPeerListener(peerId); } catch (_) {}
    shell();
    pendingRoster = null;
    const self=await identityStore.getSelf();
    const peer=await identityStore.getPeer(peerId);
    if (!peer || peer.peerApp !== 'sa') throw new Error('SA vinculado no encontrado.');
    const isAttendance = mode === 'attendance';
    let attendanceResponseSent = false;
    const title = isAttendance
      ? `Compartir asistencia con ${esc(peerName(peer))}`
      : `Recibir personal de ${esc(peerName(peer))}`;
    const subtitle = isAttendance
      ? 'Ahora en SA selecciona este Mini y solicita la asistencia.'
      : 'En SA selecciona este Mini y envía la lista de personal.';
    const modeBadge = `<div class="mini-p2p-mode-chip">${vectorIcon(isAttendance ? 'attendance' : 'users', 15)}<span>${isAttendance ? 'Asistencia' : 'Personal de la obra'}</span></div>`;
    const modeHelp = isAttendance
      ? '<p class="mini-p2p-footnote">En SA puedes elegir un día o un intervalo de fechas. Mini enviará la asistencia registrada para revisarla allí.</p>'
      : '<p class="mini-p2p-footnote">Recibirás la lista de personal para revisarla antes de guardar.</p>';

    morphShell(() => { body().innerHTML = `<div class="mini-p2p-step">${backButton()}${modeBadge}<div><h3>${title}</h3><p>${subtitle}</p></div>${modeHelp}<div class="mini-p2p-status" data-wait-status>Esperando conexión autenticada…</div><div class="mini-p2p-actions">${secondary('Cancelar espera','data-cancel')}</div></div>`; });
    const handleCancel = () => {
      cleanupSession();
      renderHome();
    };
    body().querySelector('[data-back]').addEventListener('click', handleCancel);
    body().querySelector('[data-cancel]').addEventListener('click', handleCancel);
    const route=await core.deriveTrustedRoute(peer.linkToken);
    const signaling=new core.SignalingClient({room:route.room,peerId:self.deviceId,proof:route.proof});
    activeSession=await core.createRtcSession({
      signaling,initiator:false,
      onState:(status,error)=>{
        const box=body()?.querySelector('[data-wait-status]');
        if(!box) return;
        if (isAttendance && attendanceResponseSent && (status === 'closed' || status === 'disconnected')) {
          box.classList?.add?.('is-success'); box.innerHTML=statusMessage('check','Respuesta de asistencia enviada','Conexión finalizada.');
        } else if(error) {
          renderWaitError(error, peerId, mode);
        } else if(status === 'connected') {
          box.textContent='Canal conectado. Verificando identidad…';
        } else if(status === 'connecting' || status === 'new') {
          box.textContent='Conectando con SA…';
        } else if(status === 'disconnected' || status === 'failed' || status === 'closed') {
          renderWaitError(new Error('La conexión P2P se interrumpió.'), peerId, mode);
        }
      },
      onChannel:channel=>{
        activeChannel=channel;
        pairing.attachTrusted(channel,{
          self,peer,store:identityStore,
          onAuthenticated:()=>{
            const box=body()?.querySelector('[data-wait-status]');
            try {
              if (isAttendance) {
                activeAttendanceResponderDetach = armAttendanceResponder(channel,peer,self,{
                  onResponseSent: (response) => {
                    attendanceResponseSent = true;
                    activeTransferPeerId = null;
                    refreshMiniP2PHeader().catch(() => {});
                    const liveBox=body()?.querySelector('[data-wait-status]');
                    if(liveBox) { liveBox.classList?.add?.('is-success'); liveBox.innerHTML=statusMessage('check','Respuesta de asistencia enviada','SA la validará antes de incorporarla.'); }
                  }
                });
                if (typeof activeAttendanceResponderDetach !== 'function') {
                  throw new Error('El módulo de asistencia no está disponible en este Mini.');
                }
                // The responder listener is armed before Mini announces readiness.
                sendAttendanceReady(channel);
                if(box) { box.classList?.remove?.('is-error'); box.innerHTML=statusMessage('check','SA autenticado','Listo para recibir la solicitud de asistencia…'); }
              } else {
                armRosterReceiver(channel,peer);
                if(box) { box.classList?.remove?.('is-error'); box.innerHTML=statusMessage('check','SA autenticado','Esperando la lista de personal…'); }
              }
            } catch (error) {
              renderWaitError(error, peerId, mode);
            }
          },
          onError:error=>renderWaitError(error, peerId, mode)
        });
      }
    });
  }

  function sendAttendanceReady(channel) {
    if (!channel || channel.readyState !== 'open') {
      throw new Error('Canal P2P no disponible para preparar asistencia.');
    }
    if (typeof core.isChannelAuthenticated === 'function' && core.isChannelAuthenticated(channel) !== true) {
      throw new Error('Canal P2P no autenticado para preparar asistencia.');
    }
    channel.send(JSON.stringify({ schema: ATTENDANCE_READY_SCHEMA }));
  }

  function recordP2PActivity(type, peer, detail, id = '') {
    try {
      if (!activityStore || typeof activityStore.record !== 'function') return null;
      const display = peer ? peerName(peer) : 'SA';
      return activityStore.record({ id: id || undefined, type, peerId: peer?.peerId || '', peerName: display, detail: String(detail || '') });
    } catch (_) { return null; }
  }
  function armAttendanceResponder(channel, peer, self, callbacks = {}) {
    root.MiniEmployeeSender?.attach(channel, peer);
    if (!root.AttendanceExport || typeof root.AttendanceExport.attachAttendanceResponder !== 'function') return null;
    const deviceId = self?.deviceId || undefined;
    const userSent = callbacks.onResponseSent;
    const wrappedSent = (response) => {
      try { if (typeof userSent === 'function') userSent(response); } catch (_) {}
      try {
        const reqId = String(response?.requestId || '').trim();
        signalTerminalSuccess(reqId ? ('attendance-sent:' + reqId) : ('attendance-sent:' + String(peer?.peerId || '')), { title: 'Respuesta de asistencia enviada', detail: 'SA la validará antes de incorporarla.' });
      } catch (_) {}
      try {
        const display = peer ? peerName(peer) : 'SA';
        const requestId = String(response?.requestId || '').trim();
        recordP2PActivity('attendance-sent', peer, 'Asistencia respondida a ' + display + '. SA la validará antes de incorporarla.', requestId ? ('attendance:' + requestId) : '');
      } catch (_) {}
    };
    return root.AttendanceExport.attachAttendanceResponder(channel, peer, {
      get repository() { return root.attendanceRepository; },
      get employeeRepository() { return root.employeeRepository; },
      get attendanceData() { return root.attendanceData; },
      get employees() { return root.users; },
      deviceId,
      // SA can create or link unknown employees from the salary and day position.
      includeEmployeeProfile: true,
      onResponseSent: wrappedSent
    });
  }

  function armRosterReceiver(channel, peer, options = {}) {
    root.MiniEmployeeSender?.attach(channel, peer);
    const background = options.background === true;
    const receiver=core.createTransferReceiver({
      channel,
      onProgress:progress=>{
        activeTransferPeerId = peer?.peerId || null;
        refreshMiniP2PHeader().catch(() => {});
        if (background) return;
        const box=body()?.querySelector('[data-receive-state]')||body()?.querySelector('[data-wait-status]');
        if(box)box.textContent='Recibiendo roster… '+Math.round(progress*100)+'%';
      },
      onError:error=>{
        activeTransferPeerId = null;
        refreshMiniP2PHeader().catch(() => {});
        if (!background) renderError(error);
      },
      onComplete:result=>{
        activeTransferPeerId = null;
        refreshMiniP2PHeader().catch(() => {});
        stageReceivedRoster(result, peer, channel, { background });
      }
    });
    channel.addEventListener('message',event=>{
      const control=core.parseControl(event.data);
      if(control)return;
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.type === 'presence-ping/v1' || parsed.type === 'presence-pong/v1')) {
            return;
          }
          if (parsed && parsed.protocol === core.TRANSFER_PROTOCOL && parsed.type === 'start') {
            activeTransferPeerId = peer?.peerId || null;
            refreshMiniP2PHeader().catch(() => {});
          }
        } catch (_) {}
      }
      receiver(event);
    });
  }

  const backupReceiverCleanups = new WeakMap();

  function armBackupReceiver(channel, peer, options = {}) {
    if (!channel) return () => {};
    if (backupReceiverCleanups.has(channel)) {
      try { backupReceiverCleanups.get(channel)(); } catch (_) {}
    }

    const background = options.background === true;
    const expectedOffer = options.expectedOffer || null;
    let detached = false, started = false;
    const receiver = core.createTransferReceiver({
      channel,
      onProgress: progress => {
        if (detached) return;
        activeTransferPeerId = peer?.peerId || null;
        refreshMiniP2PHeader().catch(() => {});
        try { options.onProgress?.(progress); } catch (_) {}
        if (background) return;
        const box = body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
        if (box) box.textContent = 'Recibiendo respaldo… ' + Math.round(progress * 100) + '%';
      },
      onError: error => {
        if (detached) return;
        activeTransferPeerId = null;
        refreshMiniP2PHeader().catch(() => {});
        try { options.onFailed?.(boundedUserSafeError(error)); } catch (_) {}
        if (!background) renderError(error);
      },
      onComplete: result => {
        if (detached) return;
        activeTransferPeerId = null;
        refreshMiniP2PHeader().catch(() => {});
        // A consented receiver admits exactly one transfer; the next needs a new offer.
        if (expectedOffer) detach();
        stageReceivedBackup(result, peer, channel, { background, onStaged: options.onStaged, onFailed: options.onFailed });
      }
    });

    function handleBackupMessage(event) {
      if (detached) return;
      const control = core.parseControl(event.data);
      if (control) return;
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.type === 'presence-ping/v1' || parsed.type === 'presence-pong/v1')) {
            return;
          }
          if (parsed && parsed.protocol === core.TRANSFER_PROTOCOL && parsed.type === 'start') {
            if (expectedOffer && !root.P2PBackupConsent.matchesOffer(expectedOffer, parsed)) {
              const mismatch = new Error('La transferencia no coincide con el respaldo aceptado.');
              try { options.onFailed?.(mismatch.message); } catch (_) {}
              detach();
              core.revokeChannel(channel, mismatch);
              return;
            }
            core.validateTransferStart(parsed);
            if (!started) { started = true; options.onStarted?.(); }
            activeTransferPeerId = peer?.peerId || null;
            refreshMiniP2PHeader().catch(() => {});
          }
        } catch (_) {}
      }
      receiver(event);
    }

    channel.addEventListener('message', handleBackupMessage);

    const detach = () => {
      if (detached) return;
      detached = true;
      try { options.onDetached?.(); } catch (_) {}
      try { channel.removeEventListener('message', handleBackupMessage); } catch (_) {}
      if (backupReceiverCleanups.get(channel) === detach) {
        backupReceiverCleanups.delete(channel);
      }
    };

    backupReceiverCleanups.set(channel, detach);
    return detach;
  }

  function isTransferModalOpen() {
    try { return Boolean(modal()); } catch (_) { return false; }
  }
  function getAllStaged() {
    let entries = [];
    try {
      if (typeof stagedStore?.list === 'function') entries = stagedStore.list();
      else { const one = stagedStore?.load?.() || stagedStore?.loadStaged?.(); if (one) entries = [one]; }
    } catch (_) { entries = []; }
    if (pendingRoster && typeof pendingRoster.text === 'string' && pendingRoster.text) {
      const peerId = String(pendingRoster.peer?.peerId || pendingRoster.peerId || '').trim();
      const sha = String(pendingRoster.sha256 || '').trim();
      const exists = entries.some(item => String(item.peerId || '') === peerId && String(item.sha256 || '') === sha);
      if (!exists && peerId) entries.unshift({ ...pendingRoster, peerId, peerName: pendingRoster.peer ? peerName(pendingRoster.peer) : (pendingRoster.peerName || 'SA'), receivedAt: pendingRoster.receivedAt || new Date().toISOString() });
    }
    return entries;
  }
  function getEffectiveStaged(peerId = null) {
    const key = String(peerId || '').trim();
    if (pendingRoster && typeof pendingRoster.text === 'string' && pendingRoster.text) {
      const pendingPeer = String(pendingRoster.peer?.peerId || pendingRoster.peerId || '').trim();
      if (!key || key === pendingPeer) return pendingRoster;
    }
    try {
      const stored = stagedStore?.load?.(key || null) || stagedStore?.loadStaged?.(key || null);
      return stored || null;
    } catch (_) { return null; }
  }
  function persistStagedEntry(entry) {
    try { stagedStore?.save?.(entry); } catch (_) {}
  }
  function getRecentP2PActivities(limit = 10) {
    try {
      const entries = activityStore?.list?.() || [];
      const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 20) : 10;
      return entries.slice(0, safeLimit);
    } catch (_) { return []; }
  }
  function getStagedPendingCount() {
    try {
      const rosterCount = getAllStaged().length;
      const backupCount = root.SaMiniP2PBackup?.backupStagedStore?.listStaged().length || 0;
      return rosterCount + backupCount;
    } catch (_) { return 0; }
  }
  function armPassiveChannel(channel, peer, self) {
    if (!peer || peer.peerApp !== 'sa') return () => {};
    armRosterReceiver(channel, peer);
    const detach = armAttendanceResponder(channel, peer, self, {});
    sendAttendanceReady(channel);
    return detach;
  }
  function schedulePassiveRetry(peer, attempt) {
    const peerId = String(peer?.peerId || '').trim();
    if (!peerId) return;
    if (!isNetworkOnline()) return;
    const existing = passivePeerListeners.get(peerId);
    if (!existing || existing.stopped) return;
    const currentCount = Number.isSafeInteger(existing.retryCount) ? existing.retryCount : (Number.isSafeInteger(attempt) ? attempt : 0);
    const delay = passiveBackoffDelayMs(currentCount);
    const nextAttempt = Math.min(currentCount + 1, PASSIVE_BACKOFF_SCHEDULE_MS.length - 1);
    try { if (existing.retryTimer) root.clearTimeout?.(existing.retryTimer); } catch (_) {}
    let timer = null;
    try {
      const schedule = typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : setTimeout;
      timer = schedule(() => {
        const current = passivePeerListeners.get(peerId);
        if (!current || current.stopped) return;
        current.retryTimer = null;
        try { current.attendanceDetach?.(); } catch (_) {}
        current.attendanceDetach = null;
        current.session = null;
        current.channel = null;
        detachPresence(peerId);
        ensurePeerListener(peer, nextAttempt).catch(() => {});
      }, delay);
    } catch (_) { return; }
    existing.retryTimer = timer;
    existing.retryCount = nextAttempt;
  }
  async function ensurePeerListener(peer, attempt = 0) {
    const peerId = String(peer?.peerId || '').trim();
    if (!peerId || peer?.peerApp !== 'sa' || !peer?.linkToken) throw new Error('SA vinculado no encontrado.');
    if (!isNetworkOnline()) return null;
    if (activeManualPeerId && activeManualPeerId === peerId) return null;
    const existing = passivePeerListeners.get(peerId);
    if (existing && !existing.stopped && (existing.session || existing.retryTimer)) return existing;
    if (existing?.retryTimer) { try { root.clearTimeout?.(existing.retryTimer); } catch (_) {} }
    const entry = { peer, session: null, channel: null, detach: null, attendanceDetach: null, retryTimer: null, retryCount: attempt, stopped: false };
    passivePeerListeners.set(peerId, entry);
    try {
      const self = await identityStore.getSelf();
      const route = await core.deriveTrustedRoute(peer.linkToken);
      const signaling = new core.SignalingClient({ room: route.room, peerId: self.deviceId, proof: route.proof });
      const session = await core.createRtcSession({
        signaling, initiator: false,
        onState: (status, error) => {
          const current = passivePeerListeners.get(peerId);
          if (!current || current.stopped) return;
          if (error || status === 'disconnected' || status === 'failed' || status === 'closed') {
            try { session?.close?.(); } catch (_) {}
            detachPresence(peerId);
            try { refreshMiniP2PHeader().catch(() => {}); } catch (_) {}
            schedulePassiveRetry(peer, current.retryCount || attempt);
          }
        },
        onChannel: channel => {
          const current = passivePeerListeners.get(peerId);
          if (!current || current.stopped) { try { channel?.close?.(); } catch (_) {} return; }
          current.channel = channel;
          pairing.attachTrusted(channel, {
            self, peer, store: identityStore,
            onAuthenticated: () => {
              const live = passivePeerListeners.get(peerId);
              if (!live || live.stopped) return;
              try {
                live.retryCount = 0;
                armRosterReceiver(channel, peer, { background: true });
                live.attendanceDetach = armAttendanceResponder(channel, peer, self, {});
                sendAttendanceReady(channel);
                attachPresence(channel, peer, live);
                refreshMiniP2PHeader().catch(() => {});
              } catch (_) {
                detachPresence(peerId);
                schedulePassiveRetry(peer, live.retryCount || 0);
              }
            },
            onError: () => {
              detachPresence(peerId);
              schedulePassiveRetry(peer, (passivePeerListeners.get(peerId)?.retryCount) || attempt);
            }
          });
        }
      });
      const live = passivePeerListeners.get(peerId);
      if (!live || live.stopped) { try { session?.close?.(); } catch (_) {} return live || entry; }
      live.session = session;
      live.detach = () => { try { session?.close?.(); } catch (_) {} };
      return live;
    } catch (_) {
      detachPresence(peerId);
      schedulePassiveRetry(peer, attempt);
      return passivePeerListeners.get(peerId) || entry;
    }
  }
  // ---- Passive Mini <-> Mini backup inbox (backup-only, consent first) ----
  // Linked Minis listen in the background for backup *offers*. Nothing is
  // transferred until this user accepts in a notice; roster/attendance are never
  // bound to same-app peers.
  const MINI_BACKUP_BACKOFF_MS = [1500, 5000, 15000, 30000, 60000];
  const OFFER_DECISION_MS = 85000;
  const miniBackupListeners = new Map();
  let miniPeerSessions = null;
  function peerSessionManager() {
    if (!miniPeerSessions) miniPeerSessions = root.MiniPeerSessionManager.create();
    return miniPeerSessions;
  }

  function isMiniBackupPeer(peer) {
    return !!peer && peer.peerApp === 'mini' && peer.purpose === 'backup' && !!peer.linkToken;
  }

  function notices() {
    return root.MiniNotice && typeof root.MiniNotice.show === 'function' ? root.MiniNotice : null;
  }

  function backupSizeLabel(size) {
    try { return root.SaMiniP2PBackup.formatBackupSize(size); } catch (_) { return Math.round(size / 1024) + ' KB'; }
  }

  function openStagedBackupReview(transferId) {
    const bridge = root.SaMiniP2PBackup;
    const staged = bridge?.backupStagedStore?.getStaged(transferId);
    if (!staged) { toast('El respaldo ya no está disponible.'); return; }
    renderBackupReview(transferId).catch(err => toast('Error al revisar respaldo: ' + err.message));
  }

  function receiveNoticeHooks(notice, senderLabel) {
    return {
      onProgress: progress => notice?.update({
        state: 'progress', title: 'Recibiendo respaldo', progress,
        description: Math.round(progress * 100) + '% · de ' + senderLabel, actions: []
      }),
      onStaged: record => notice?.update({
        state: 'success', title: 'Respaldo recibido', progress: 1,
        description: 'Verificado. Revisalo antes de restaurar; todavía no se aplicó nada.',
        actions: [{ label: 'Revisar', tone: 'primary', onSelect: () => { notice.dismiss(); openStagedBackupReview(record.transferId); } }]
      }),
      onFailed: reason => notice?.update({
        state: 'error', title: 'Respaldo no recibido', description: String(reason || 'La transferencia se interrumpió.'), actions: [], duration: 7000
      })
    };
  }

  function promptIncomingBackup(peer, offer, respond, channel, entry) {
    if (entry.busy || entry.lease?.busy()) { respond(false); return; }
    entry.busy = true;
    const transport = entry.transport;
    const center = notices();
    const senderLabel = offer.senderName || peerName(peer);
    if (!center) { entry.busy = false; respond(false); return; }
    let decided = false;
    const decide = accepted => {
      if (decided) return;
      decided = true;
      clearTimeout(expiry);
      if (entry.stopped || entry.transport !== transport || miniBackupListeners.get(String(peer.peerId).trim()) !== entry || entry.retryTimer) {
        notice.dismiss();
        return;
      }
      if (!accepted) {
        entry.busy = false;
        respond(false);
        notice.update({ state: 'info', title: 'Respaldo rechazado', description: 'No se recibió nada de ' + senderLabel + '.', actions: [], duration: 2500 });
        return;
      }
      const previousReceiver = entry.detachReceiver; entry.detachReceiver = null;
      try { previousReceiver?.(); } catch (_) {}
      const hooks = receiveNoticeHooks(notice, senderLabel);
      let receiver = null;
      const ownsReceiver = () => !entry.stopped && entry.transport === transport && miniBackupListeners.get(String(peer.peerId).trim()) === entry && entry.detachReceiver === receiver;
      const fail = reason => {
        if (!ownsReceiver()) return;
        entry.detachReceiver = null;
        try { receiver?.(); } catch (_) {}
        entry.busy = false; hooks.onFailed(reason);
      };
      const guard = root.P2PBackupConsent.guardAcceptedStart(channel, () => fail('No llegaron datos. Pide al otro Mini que reintente el envío.'));
      receiver = armBackupReceiver(channel, peer, { background: true, expectedOffer: offer, ...hooks,
        onStarted: () => guard.started(),
        onDetached: () => {
          const waiting = guard.waiting(); guard.dispose();
          if (waiting && ownsReceiver()) { entry.detachReceiver = null; entry.busy = false; notice.dismiss(); }
        },
        onStaged: record => { if (!ownsReceiver()) return; entry.detachReceiver = null; entry.busy = false; hooks.onStaged(record); },
        onFailed: fail });
      entry.detachReceiver = receiver;
      notice.update({ state: 'loading', title: 'Preparando recepción', description: 'Esperando datos de ' + senderLabel + '…', actions: [] });
      respond(true);
    };
    const notice = center.show({
      id: 'backup-offer-' + offer.offerId,
      state: 'action',
      title: 'Respaldo entrante',
      description: senderLabel + ' quiere enviarte un respaldo (' + backupSizeLabel(offer.size) + '). Lo revisás antes de restaurar.',
      actions: [
        { label: 'Rechazar', tone: 'secondary', onSelect: () => decide(false) },
        { label: 'Aceptar', tone: 'primary', onSelect: () => decide(true) }
      ]
    });
    const expiry = setTimeout(() => {
      if (decided) return;
      decided = true;
      if (entry.stopped || entry.transport !== transport || miniBackupListeners.get(String(peer.peerId).trim()) !== entry || entry.retryTimer) {
        notice.dismiss();
        return;
      }
      entry.busy = false;
      respond(false);
      notice.update({ state: 'info', title: 'Oferta vencida', description: 'No respondiste a tiempo; no se recibió nada.', actions: [], duration: 3000 });
    }, OFFER_DECISION_MS);
  }

  let miniBackupAccountWatch = null;
  let miniBackupIntents = null;
  function miniBackupIntentRegistry() {
    if (!miniBackupIntents) miniBackupIntents = root.MiniPeerSessionManager.createIntents();
    return miniBackupIntents;
  }
  const miniBackupKnownPeers = new Map(), miniBackupConnectionObservers = new Set();
  function publishMiniBackupConnections() {
    for (const callback of miniBackupConnectionObservers) { try { callback(); } catch (_) {} }
  }
  function subscribeMiniBackupConnections(callback) {
    miniBackupConnectionObservers.add(callback); return () => miniBackupConnectionObservers.delete(callback);
  }
  function miniBackupConnectionSnapshot() {
    return [...miniBackupKnownPeers.values()].map(peer => {
      const entry = miniBackupListeners.get(String(peer.peerId));
      // Read validity first: existing expiry cleanup may clear this owner's refs.
      const leaseValid = entry?.lease?.valid() === true, info = entry?.availability?.getInfo?.();
      const state = !isNetworkOnline() ? 'error' : entry?.state || 'available';
      const authenticated = entry?.authenticated === true, channelOpen = entry?.channel?.readyState === 'open';
      return { peerId: String(peer.peerId), name: peerName(peer), state, authenticated, channelOpen, leaseValid,
        busy: !!entry?.busy || entry?.lease?.busy() === true, linkFingerprint: entry?.linkFingerprintCurrent?.() ? entry.linkFingerprint || null : null,
        phase: root.MiniConnectionPresentation?.observePhase({ state, authenticated, channelOpen, leaseValid,
          preparing: info?.preparing, transportPresent: !!entry?.transport,
          localDescription: !!entry?.session?.pc?.localDescription, remoteDescription: !!entry?.session?.pc?.remoteDescription }) || 'standby',
        preparationRemainingMs: info?.preparationRemainingMs ?? null,
        channelRemainingMs: entry?.lease ? Math.max(0, entry.lease.deadline - peerSessionManager().now()) : null,
        lastCloseReason: entry?.lastCloseReason || null };
    });
  }
  function closeMiniBackupConnection(peerId) {
    const key = String(peerId || '').trim();
    miniBackupIntents?.invalidate(key);
    const entry = miniBackupListeners.get(key);
    return entry ? retireMiniBackupTransport(entry, null, true, 'manual') : false;
  }
  function reconnectMiniBackupPeer(peerId) {
    const key = String(peerId || '').trim();
    const initialEntry = miniBackupListeners.get(key), initialTransport = initialEntry?.transport, pendingRetry = initialEntry?.retryTimer;
    return miniBackupIntentRegistry().run(key, async intent => {
      let entry, ownedTransport;
      try {
        if (initialEntry?.busy || initialEntry?.lease?.busy()) throw new Error('El dispositivo está ocupado. Reintenta.');
        // A manual owner supersedes the armed backoff before any acquisition await.
        if (initialEntry?.retryTimer) { clearTimeout(initialEntry.retryTimer); initialEntry.retryTimer = null; }
        watchMiniBackupAccount();
        const peer = await identityStore.getPeer(key);
        intent.check();
        if (!isMiniBackupPeer(peer)) throw new Error('Dispositivo vinculado no encontrado.');
        entry = await ensureMiniBackupListener(peer);
        intent.check();
        if (!entry || entry.stopped || miniBackupListeners.get(key) !== entry) throw new Error('No se pudo abrir la disponibilidad.');
        // Acquired transport/transfer ownership must not be stolen by a suspended menu action.
        if (entry.busy || entry.lease?.busy() || (initialEntry && entry !== initialEntry) || entry.transport !== (initialTransport || null)) {
          throw new Error('La conexión cambió o está ocupada. Reintenta.');
        }
        // A closed socket can rearm during listener setup; revoke that timer too.
        if (entry.retryTimer) { clearTimeout(entry.retryTimer); entry.retryTimer = null; }
        retireMiniBackupTransport(entry, null, true, 'reconnect');
        intent.check();
        entry.reconnectIntent = intent;
        try { await entry.availability.demand(); }
        finally { if (entry.reconnectIntent === intent) entry.reconnectIntent = null; }
        intent.check();
        if (entry.stopped || miniBackupListeners.get(key) !== entry || !entry.lease) throw new Error('Conexión Mini retirada.');
        ownedTransport = entry.transport;
        const lease = entry.lease;
        await lease.run(async () => {});
        intent.check();
        if (entry.lease !== lease) throw new Error('Conexión Mini retirada.');
      } catch (error) {
        if (intent.current() && entry && !entry.stopped && miniBackupListeners.get(key) === entry && (entry.reconnectIntent === intent || (ownedTransport && entry.transport === ownedTransport))) {
          entry.state = 'error'; publishMiniBackupConnections();
        }
        const recoveryEntry = entry || initialEntry;
        if (intent.current() && recoveryEntry && (pendingRetry || recoveryEntry.signaling?.closed === true)) {
          scheduleMiniBackupRetry(recoveryEntry.peer, 0, recoveryEntry);
        }
        throw error;
      } finally { if (entry?.reconnectIntent === intent) entry.reconnectIntent = null; }
    });
  }

  function stopAllMiniBackupListeners() {
    miniBackupAccountWatch?.(); miniBackupAccountWatch = null;
    miniBackupIntents?.invalidateAll();
    for (const key of [...miniBackupListeners.keys()]) stopMiniBackupListener(key);
  }
  function watchMiniBackupAccount() {
    if (miniBackupAccountWatch) return;
    let auth = null;
    try { auth = root.firebase?.app('mini-field').auth() || null; }
    catch (_) { /* An unavailable Google SDK must not prevent guest P2P. */ }
    miniBackupAccountWatch = root.MiniPeerAvailability.watchAccount(auth, epoch => {
      miniBackupIntents?.invalidateAll();
      for (const key of [...miniBackupListeners.keys()]) stopMiniBackupListener(key, null, true);
      startMiniBackupInbox(epoch).catch(() => {});
    });
  }

  function retireMiniBackupTransport(entry, transport = null, retireAvailability = true, reason = 'unknown') {
    if (transport && entry.transport !== transport) return false;
    const lease = entry.lease, session = entry.session;
    if (entry.transport || lease || session || entry.availability?.getInfo?.()?.preparing || (reason !== 'unknown' && reason !== 'reconnect')) entry.lastCloseReason = reason;
    const detachOffers = entry.detachOffers, detachReceiver = entry.detachReceiver;
    entry.transport = null; entry.lease = null; entry.session = null;
    entry.channel = null; entry.authenticated = false; entry.busy = false; entry.state = 'available';
    entry.detachOffers = null; entry.detachReceiver = null;
    try { detachOffers?.(); } catch (_) {}
    try { detachReceiver?.(); } catch (_) {}
    try { if (lease) lease.retire(); else session?.close?.(); } catch (_) {}
    if (retireAvailability) entry.availability?.retire(reason);
    publishMiniBackupConnections();
    return true;
  }

  function stopMiniBackupListener(peerId, owner = null, accountTransition = false) {
    const key = String(peerId || '').trim(), entry = miniBackupListeners.get(key);
    if (owner && entry !== owner) return false;
    miniBackupIntents?.invalidate(key);
    if (!accountTransition) miniBackupAccountWatch?.invalidatePeer(key);
    if (!entry) return false;
    entry.stopped = true; miniBackupListeners.delete(key);
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
    retireMiniBackupTransport(entry, null, false);
    try { entry.availability?.stop(); } catch (_) {}
    try { if (!entry.availability) entry.signaling?.close?.(); } catch (_) {}
    return true;
  }

  function scheduleMiniBackupRetry(peer, attempt, entry) {
    const peerId = String(peer?.peerId || '').trim();
    if (!entry || entry.stopped || miniBackupListeners.get(peerId) !== entry || entry.retryTimer || !isNetworkOnline()) return;
    const index = Math.min(attempt, MINI_BACKUP_BACKOFF_MS.length - 1);
    const timer = setTimeout(async () => {
      if (entry.stopped || miniBackupListeners.get(peerId) !== entry || entry.retryTimer !== timer) return;
      entry.retryTimer = null;
      // A dead socket gets a fresh owner; late events from that socket cannot
      // contaminate a replacement. Startup still allocates no RTC or TURN.
      stopMiniBackupListener(peerId, entry);
      await ensureMiniBackupListener(peer, index + 1);
    }, MINI_BACKUP_BACKOFF_MS[index]);
    entry.retryTimer = timer;
  }

  async function ensureMiniBackupListener(peer, attempt = 0, epoch = null) {
    if (!isMiniBackupPeer(peer)) return null;
    miniBackupKnownPeers.set(String(peer.peerId), peer);
    if (!isNetworkOnline()) { publishMiniBackupConnections(); return null; }
    watchMiniBackupAccount();
    const accountEpoch = epoch || miniBackupAccountWatch.capture();
    if (!accountEpoch.current(String(peer.peerId).trim())) return null;
    const peerId = String(peer.peerId).trim(), existing = miniBackupListeners.get(peerId);
    if (existing && !existing.stopped) {
      await existing.setup;
      if (existing.signaling?.closed === true && !existing.retryTimer) scheduleMiniBackupRetry(peer, attempt, existing);
      return existing;
    }
    let finishSetup;
    const setup = new Promise(resolve => { finishSetup = resolve; });
    const entry = { setup, peer, state: 'available', linkFingerprint: null, lastCloseReason: null, reconnectIntent: null, availability: null, transport: null, session: null, signaling: null, lease: null, channel: null, busy: false, retryTimer: null, stopped: false, detachOffers: null, detachReceiver: null };
    miniBackupListeners.set(peerId, entry);
    const isCurrent = () => !entry.stopped && miniBackupListeners.get(peerId) === entry && accountEpoch.current(peerId);
    // Public display digest only; never delay standby on this optional observation.
    const fingerprintToken = peer.linkToken;
    entry.linkFingerprintCurrent = () => isCurrent() && miniBackupKnownPeers.get(peerId)?.linkToken === fingerprintToken;
    root.MiniConnectionPresentation?.createLinkFingerprint?.(core, fingerprintToken)?.then(value => {
      if (!entry.linkFingerprintCurrent()) return;
      entry.linkFingerprint = value; publishMiniBackupConnections();
    }).catch(() => {});
    try {
      const self = await identityStore.getSelf();
      if (!isCurrent()) return entry;
      const route = await core.deriveTrustedRoute(peer.linkToken);
      if (!isCurrent()) return entry;
      entry.signaling = new core.SignalingClient({ room: route.room, peerId: self.deviceId, proof: route.proof });
      entry.availability = root.MiniPeerAvailability.create({
        signaling: entry.signaling, localPeerId: String(self.deviceId), remotePeerId: peerId, now: () => peerSessionManager().now(),
        validateFrame: core.validateSignalFrameObject,
        onState: status => {
          if (!isCurrent()) return;
          entry.state = ['error', 'signaling-error'].includes(status) ? 'error' : status;
          if (status === 'available') retireMiniBackupTransport(entry, null, false, entry.availability?.getInfo?.()?.lastCloseReason || 'unknown');
          if (status === 'signaling-error') scheduleMiniBackupRetry(peer, attempt++, entry);
          publishMiniBackupConnections();
        },
        createSession: async options => {
          if (!isCurrent()) throw new Error('Conexión Mini retirada.');
          if (!entry.reconnectIntent?.current()) miniBackupIntents?.invalidate(peerId);
          const transport = {}, startedAt = peerSessionManager().now();
          entry.transport = transport; entry.state = 'connecting'; publishMiniBackupConnections();
          const ownsTransport = () => isCurrent() && entry.transport === transport;
          const retire = (reason = 'unknown') => { if (ownsTransport()) retireMiniBackupTransport(entry, transport, true, reason); };
          let finishAuthentication = null;
          const session = await core.createRtcSession({ ...options,
            onState: (status, error) => {
              if (error || ['disconnected', 'failed', 'closed'].includes(status)) retire(error || status === 'failed' ? 'transport-error' : status === 'disconnected' ? 'transport-disconnected' : 'unknown');
              if (ownsTransport()) publishMiniBackupConnections();
            },
            onChannel: channel => {
              if (!ownsTransport()) { try { channel?.close?.(); } catch (_) {} return; }
              entry.channel = channel; publishMiniBackupConnections();
              const offers = root.P2PBackupConsent.bufferOffers(channel, core);
              entry.detachOffers = offers.detach;
              pairing.attachTrusted(channel, {
                self, peer, store: identityStore, allowSameApp: true,
                onAuthenticated: () => {
                  finishAuthentication = () => {
                    if (!ownsTransport() || !entry.lease?.valid() || !options.onReady()) return;
                    entry.authenticated = true; entry.state = 'connected'; entry.lease.ready(channel); publishMiniBackupConnections();
                    offers.release((offer, respond) => {
                      if (!ownsTransport()) return;
                      promptIncomingBackup(peer, offer, respond, channel, entry);
                    });
                  };
                  finishAuthentication();
                },
                onError: () => retire('transport-error')
              });
            }
          });
          if (!ownsTransport()) { session.close(); throw new Error('Conexión Mini retirada.'); }
          entry.session = session;
          entry.lease = peerSessionManager().lease(session, startedAt, retire, { guest: !root.privateTurnTest?.active, transportOwnedExternally: true });
          finishAuthentication?.();
          return session;
        }
      });
      await entry.availability.start();
      return entry;
    } catch (_) {
      if (isCurrent()) { entry.state = 'error'; publishMiniBackupConnections(); scheduleMiniBackupRetry(peer, attempt, entry); }
      return entry;
    } finally { finishSetup(); }
  }

  // A live lease survives view refresh and foreground events. Its own fixed
  // deadline/credential invalidation retires it; refresh never slides that bound.
  function refreshMiniBackupInbox(force = false) {
    if (!isNetworkOnline()) return;
    for (const entry of miniBackupListeners.values()) entry.lease?.valid();
    // Do not silently allocate a replacement after ordinary lease expiry.
  }

  async function startMiniBackupInbox(epoch = null) {
    if (!epoch) watchMiniBackupAccount();
    const accountEpoch = epoch || miniBackupAccountWatch.capture();
    let peers = [];
    try { peers = (await identityStore.listPeers()).filter(isMiniBackupPeer); } catch (_) { return 0; }
    if (!accountEpoch.current()) return 0;
    peers = peers.filter(peer => accountEpoch.current(String(peer.peerId).trim()));
    const ids = new Set(peers.map(peer => String(peer.peerId)));
    for (const key of miniBackupKnownPeers.keys()) if (!ids.has(key)) miniBackupKnownPeers.delete(key);
    for (const peer of peers) { miniBackupKnownPeers.set(String(peer.peerId), peer); ensureMiniBackupListener(peer, 0, accountEpoch).catch(() => {}); }
    publishMiniBackupConnections();
    return peers.length;
  }

  async function startPassiveInbox() {
    passiveInboxStarted = true;
    if (!isNetworkOnline()) return 0;
    startMiniBackupInbox().catch(() => {});
    let peers = [];
    try { peers = (await identityStore.listPeers()).filter(p => p.peerApp === 'sa'); }
    catch (_) { return 0; }
    let started = 0;
    for (const peer of sortPeersByRecentActivity(peers)) {
      try { await ensurePeerListener(peer, 0); started += 1; } catch (_) {}
    }
    return started;
  }
  function stopPeerListener(peerId) {
    const key = String(peerId || '').trim();
    if (!key) return false;
    detachPresence(key);
    const entry = passivePeerListeners.get(key);
    if (!entry) return false;
    entry.stopped = true;
    try { if (entry.retryTimer) root.clearTimeout?.(entry.retryTimer); } catch (_) {}
    try { entry.attendanceDetach?.(); } catch (_) {}
    try { entry.session?.close?.('unlinked'); } catch (_) { try { entry.session?.close?.(); } catch (_) {} }
    passivePeerListeners.delete(key);
    try { refreshMiniP2PHeader().catch(() => {}); } catch (_) {}
    return true;
  }
  async function discardPersistedStagedRoster(value) {
      const peerId = String(value || '').trim();
      const current = getEffectiveStaged(peerId);
      try { stagedStore?.clear?.(peerId || current?.peerId); } catch (_) {}
      try { if (!peerId || String(pendingRoster?.peer?.peerId || pendingRoster?.peerId || '') === peerId) pendingRoster = null; } catch (_) {}
      try { activityStore?.markStagedReviewed?.(peerId || current?.peerId); } catch (_) {}
      try { await refreshMiniP2PHeader(); } catch (_) {}
      document.dispatchEvent(new CustomEvent('p2p-staged-roster-change'));
  }

  async function reviewPersistedStagedRoster(peerId = null) {
    const staged = getEffectiveStaged(peerId);
    if (!staged || typeof staged.text !== 'string' || !staged.text) { toast('No hay roster pendiente por revisar.'); return renderHome(); }
    let peer = staged.peer || null;
    if (!peer) {
      try {
        const fresh = await identityStore.getPeer(staged.peerId);
        peer = fresh && fresh.peerApp === 'sa' ? fresh : { peerId: staged.peerId, peerApp: 'sa', displayName: staged.peerName || 'SA' };
      } catch (_) {
        peer = { peerId: staged.peerId, peerApp: 'sa', displayName: staged.peerName || 'SA' };
      }
    }
    pendingRoster = { text: staged.text, sha256: staged.sha256, transferId: staged.transferId || '', peer, employeeCount: staged.employeeCount || 0 };
    return reviewPendingRoster();
  }

  function validateRosterBeforeReview(result) {
    if (result.kind !== 'roster' || result.schema !== 'sa-roster/v1') throw new Error('Tipo P2P no permitido en esta fase.');
    if (!root.SaRosterImport) throw new Error('El validador SA roster no está disponible; se rechazó el payload.');
    const parsed=JSON.parse(result.text);
    const classification=root.SaRosterImport.classifyImportPayload(parsed);
    if (!classification || classification.kind !== 'sa') throw new Error('El payload recibido no es sa-roster/v1.');
    root.SaRosterImport.normalizeSaRoster(parsed);
    return parsed;
  }

  async function stageReceivedRoster(result,peer,channel,options = {}) {
    const background = options.background === true;
    try {
      const parsed=validateRosterBeforeReview(result);
      pendingRoster={text:result.text,sha256:result.sha256,transferId:result.transferId,peer,employeeCount:Array.isArray(parsed.employees)?parsed.employees.length:0};
      try {
        persistStagedEntry({ text: result.text, sha256: result.sha256, transferId: result.transferId, peerId: peer?.peerId || '', peerName: peer ? peerName(peer) : 'SA', employeeCount: pendingRoster.employeeCount, receivedAt: new Date().toISOString() });
      } catch (_) {}
      try {
        const display = peer ? peerName(peer) : 'SA';
        const digest = String(result.sha256 || '').toLowerCase().trim();
        recordP2PActivity('roster-staged', peer, 'Roster de ' + display + ' con ' + String(pendingRoster.employeeCount || 0) + ' empleados listo para revisar.', digest ? ('roster-staged:' + digest) : ('roster-staged:' + String(result.transferId || '')));
      } catch (_) {}
      core.sendControl(channel,'roster-staged',{
        transferId:result.transferId,
        sha256:result.sha256,
        kind:'roster',
        schema:'sa-roster/v1',
        validated:true
      });
      try {
        const digest = String(result.sha256 || '').toLowerCase().trim();
        const receivedKey = digest ? ('roster-received:' + digest) : ('roster-received:' + String(result.transferId || ''));
        signalTerminalSuccess(receivedKey, { title: 'Roster recibido', detail: String(pendingRoster.employeeCount || 0) + ' empleados verificados.' });
      } catch (_) {}
      try { await refreshMiniP2PHeader(); } catch (_) {}
      document.dispatchEvent(new CustomEvent('p2p-staged-roster-change'));
      if (!background && isTransferModalOpen()) renderRosterReceived();
      else {
        try {
          const display = peer ? peerName(peer) : 'SA';
          toast('Roster de ' + display + ' listo para revisar en Transferencias.');
        } catch (_) {}
      }
    }catch(error){
      document.dispatchEvent(new CustomEvent('connection-data-applied'));
      pendingRoster=null;
      const reason=boundedUserSafeError(error);
      try {
        core.sendControl(channel,'roster-rejected',{
          transferId:result.transferId,
          reason,
          kind:'roster',
          schema:'sa-roster/v1',
          validated:false
        });
      } catch (_) {}
      core.revokeChannel(channel);
      renderError(reason);
    }
  }

  async function stageReceivedBackup(result, peer, channel, options = {}) {
    const background = options.background === true;
    const bridge = root.SaMiniP2PBackup;
    if (!bridge || !bridge.backupStagedStore) {
      const err = new Error('Módulo de respaldos no disponible.');
      try { bridge?.sendBackupRejectedAck?.(channel, { transferId: result.transferId, reason: err.message, schema: result.schema }); } catch (_) {}
      core.revokeChannel(channel, err);
      if (!background) renderError(err);
      return;
    }

    try {
      if (result.kind !== 'backup') {
        throw new Error('Tipo P2P no permitido en respaldo.');
      }
      if (peer?.peerApp === 'mini' && result.schema !== 'mini-backup/v1') {
        throw new Error('Esquema de respaldo no coincide con el peer Mini.');
      }
      if (peer?.peerApp === 'sa' && result.schema !== 'sa-backup/v1') {
        throw new Error('Esquema de respaldo no coincide con el peer SA.');
      }
      if (result.schema !== 'mini-backup/v1' && result.schema !== 'sa-backup/v1') {
        throw new Error('Tipo o esquema de respaldo no permitido.');
      }
      const stagedRecord = bridge.backupStagedStore.stageBackup({
        transferId: result.transferId,
        sha256: result.sha256,
        kind: 'backup',
        schema: result.schema,
        bytes: result.bytes,
        sourceApp: peer?.peerApp || (result.schema === 'mini-backup/v1' ? 'mini' : 'sa'),
        sourcePeerId: peer?.peerId || '',
        sourcePeerName: peer ? peerName(peer) : (result.schema === 'mini-backup/v1' ? 'Mini' : 'SA'),
        receivedAt: new Date().toISOString()
      });

      bridge.sendBackupStagedAck(channel, {
        transferId: result.transferId,
        sha256: result.sha256,
        schema: result.schema
      });

      const display = peer ? peerName(peer) : (result.schema === 'mini-backup/v1' ? 'Mini' : 'SA');
      const digest = String(result.sha256 || '').toLowerCase().trim();
      try {
        recordP2PActivity('backup-staged', peer, 'Respaldo de ' + display + ' listo.', digest ? ('backup-staged:' + digest) : ('backup-staged:' + String(result.transferId || '')));
      } catch (_) {}
      try {
        signalTerminalSuccess(digest ? ('backup-received:' + digest) : ('backup-received:' + String(result.transferId || '')), {
          title: 'Respaldo recibido',
          detail: 'Respaldo de ' + display + ' verificado.'
        });
      } catch (_) {}

      try { await refreshMiniP2PHeader(); } catch (_) {}

      if (!background && isTransferModalOpen()) {
        const box = body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
        if (box) {
          box.classList.remove('is-error');
          box.classList.add('is-success');
          box.innerHTML = statusMessage('check', 'Respaldo recibido y verificado', `Respaldo de ${display}. Aún no se ha aplicado nada.`);
          const actionsBox = body()?.querySelector('.mini-p2p-actions');
          if (actionsBox) {
            const isMini = result.schema === 'mini-backup/v1';
            const actionBtn = isMini
              ? uiButton('Revisar respaldo', 'data-review-backup-now="' + esc(result.transferId) + '"', 'primary', 'chevronRight')
              : uiButton('Descargar respaldo', 'data-download-backup-now="' + esc(result.transferId) + '"', 'primary', 'restore');
            actionsBox.innerHTML = `${actionBtn}${uiButton('Ir al inicio', 'data-go-home', 'secondary', 'chevronLeft')}`;
            actionsBox.querySelector('[data-go-home]')?.addEventListener('click', renderHome);
            actionsBox.querySelector('[data-review-backup-now]')?.addEventListener('click', () => {
              renderBackupReview(result.transferId).catch(e => toast('Error al revisar: ' + e.message));
            });
            actionsBox.querySelector('[data-download-backup-now]')?.addEventListener('click', () => {
              try {
                bridge.downloadBackupBytes(stagedRecord);
                bridge.backupStagedStore.removeStaged(result.transferId);
                refreshMiniP2PHeader().catch(() => {});
                toast('Respaldo descargado.');
                renderHome();
              } catch (e) {
                toast('Error al descargar: ' + e.message);
              }
            });
          }
        } else {
          renderHome();
        }
      } else if (typeof options.onStaged === 'function') {
        options.onStaged(stagedRecord, display);
      } else {
        toast('Respaldo de ' + display + ' listo en Respaldos P2P.');
      }
    } catch (error) {
      const reason = boundedUserSafeError(error);
      try { options.onFailed?.(reason); } catch (_) {}
      try {
        bridge.sendBackupRejectedAck(channel, {
          transferId: result.transferId,
          reason,
          schema: result.schema
        });
      } catch (_) {}
      core.revokeChannel(channel, error);
      if (!background) renderError(reason);
    }
  }

  // ---- Received Mini backup review (cards instead of raw JSON) ----
  function formatReviewDay(day) {
    if (!day) return '—';
    try {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
    } catch (_) { return day; }
  }

  function reviewRange(counts) {
    if (!counts.attendanceDays) return 'sin asistencia';
    const days = counts.attendanceDays + ' día' + (counts.attendanceDays === 1 ? '' : 's');
    if (counts.firstDay === counts.lastDay) return days + ' (' + formatReviewDay(counts.firstDay) + ')';
    return days + ' (' + formatReviewDay(counts.firstDay) + ' – ' + formatReviewDay(counts.lastDay) + ')';
  }

  function backupCompareRow(icon, label, before, after, tone = '') {
    const value = before
      ? `${esc(before)} <b aria-hidden="true">→</b><span class="mini-p2p-sr-only"> pasa a </span> ${esc(after)}`
      : esc(after);
    return `<li class="mini-backup-compare-row ${tone}"><span class="mini-roster-metric-icon">${vectorIcon(icon, 15)}</span><div><strong>${esc(label)}</strong><span>${value}</span></div></li>`;
  }

  async function renderBackupReview(transferId) {
    const bridge = root.SaMiniP2PBackup;
    const staged = bridge?.backupStagedStore?.getStaged(transferId);
    if (!staged) { toast('El respaldo ya no está disponible.'); return renderBackupHub(); }
    let parsed;
    try {
      ({ parsed } = bridge.parseStagedMiniBackup(staged));
    } catch (err) {
      return renderError(err.message || String(err));
    }
    const current = {
      users: root.employeeRepository?.getAll?.() || [],
      attendance: root.attendanceRepository?.getAll?.() || {}
    };
    const model = root.MiniBackupReview.buildBackupReviewModel(parsed, current);
    const sender = staged.sourcePeerName || 'otro Mini';
    const b = model.backup;
    const created = b.exportedAt ? formatPeerDate(b.exportedAt) : 'en fecha desconocida';
    const employeeRows = model.backupEmployees.map(e => `<li><strong>${esc((e.number ? e.number + ' · ' : '') + e.name)}</strong><span>${esc(e.position || 'Sin cargo')}</span></li>`).join('');
    const changeRows = [
      backupCompareRow('users', 'Empleados', model.current.employees + ' actuales', b.employees + ' del respaldo'),
      model.employees.added.length ? backupCompareRow('add', 'Se agregan', '', model.employees.added.length + ' empleado' + (model.employees.added.length === 1 ? '' : 's') + ' nuevo' + (model.employees.added.length === 1 ? '' : 's'), 'is-info') : '',
      model.employees.removed.length ? backupCompareRow('warning', 'Se quitan de este Mini', '', model.employees.removed.slice(0, 3).map(e => e.name).join(', ') + (model.employees.removed.length > 3 ? ' y ' + (model.employees.removed.length - 3) + ' más' : ''), 'is-danger') : '',
      backupCompareRow('attendance', 'Asistencia', reviewRange(model.current), reviewRange(b))
    ].join('');
    const replaceNotice = model.replacesExistingData ? `
      <div class="mini-roster-notice is-danger">${vectorIcon('warning', 17)}<div>
        <strong>Restaurar reemplaza los datos de este Mini</strong>
        <span>Tus ${model.current.employees} empleados y ${model.current.attendanceDays} días de asistencia actuales se sustituyen por los del respaldo. Descargá una copia antes si querés conservarlos.</span>
        <button type="button" class="mini-p2p-link-btn" data-download-current>${vectorIcon('backup', 15)}<span>Descargar mi respaldo actual</span></button>
      </div></div>` : '';

    shell();
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step mini-roster-review mini-backup-review">
        ${backButton('Respaldos')}
        <div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('backup', 15)}<span>RESPALDO MINI</span></div><span class="mini-roster-step-count">1 / 2</span></div>
        <div><h3>Respaldo de ${esc(sender)}</h3><p>Creado ${esc(created)} · verificado y todavía sin aplicar.</p></div>
        <div class="mini-roster-metrics">
          ${rosterMetric('users', 'Empleados', b.employees, 'is-info')}
          ${rosterMetric('attendance', 'Días', b.attendanceDays, 'is-info')}
          ${rosterMetric('requests', 'Solicitudes', b.requests, 'is-info')}
          ${rosterMetric('building', 'Obras', b.workContexts, 'is-info')}
        </div>
        <section class="mini-backup-compare" aria-labelledby="mini-backup-compare-title">
          <h4 id="mini-backup-compare-title">Qué cambiará en este Mini</h4>
          <ul>${changeRows}</ul>
        </section>
        ${replaceNotice}
        ${employeeRows ? `<details class="mini-roster-details"><summary>${vectorIcon('users', 16)}<span>Ver empleados del respaldo</span>${countBadge(model.backupEmployees.length, 'empleados')}${vectorIcon('chevronRight', 15)}</summary><ul>${employeeRows}</ul></details>` : ''}
        <footer class="mini-roster-footer">
          <span class="mini-roster-hint">Podés descartarlo: no se aplica nada hasta que confirmes.</span>
          <div class="mini-backup-footer-actions">${secondary('Descartar', 'data-discard-review')}${primary('Restaurar', 'data-apply-backup', 'restore')}</div>
        </footer>
      </div>`; });

    body().querySelector('[data-back]')?.addEventListener('click', renderBackupHub);
    body().querySelector('[data-download-current]')?.addEventListener('click', () => {
      try { root.downloadJSON?.(); toast('Respaldo actual descargado.'); } catch (err) { toast('No se pudo descargar: ' + err.message); }
    });
    body().querySelector('[data-discard-review]')?.addEventListener('click', async () => {
      bridge.backupStagedStore.removeStaged(transferId);
      try { await refreshMiniP2PHeader(); } catch (_) {}
      toast('Respaldo descartado.');
      renderBackupHub();
    });
    body().querySelector('[data-apply-backup]')?.addEventListener('click', async () => {
      if (model.replacesExistingData && typeof root.showConfirm === 'function') {
        const ok = await root.showConfirm(`Se reemplazarán ${model.current.employees} empleados y ${model.current.attendanceDays} días de asistencia de este Mini por el respaldo de ${sender}.`, { title: '¿Restaurar respaldo?', confirmText: 'Restaurar', danger: true });
        if (!ok) return;
      }
      try {
        root.restoreMiniBackupData(parsed, { stagedTransferId: transferId });
      } catch (err) {
        return renderError(err.message || String(err));
      }
      try { recordP2PActivity('backup-restored', { peerId: staged.sourcePeerId, peerApp: 'mini', displayName: sender }, 'Respaldo de ' + sender + ' restaurado.', 'backup-restored:' + staged.sha256); } catch (_) {}
      try { await refreshMiniP2PHeader(); } catch (_) {}
      morphShell(() => { body().innerHTML = `
        <div class="mini-p2p-step mini-roster-result">
          <div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('check', 15)}<span>RESTAURADO</span></div><span class="mini-roster-step-count">2 / 2</span></div>
          <div class="mini-p2p-result"><span class="mini-p2p-result-icon">${vectorIcon('check', 20)}</span><div class="mini-p2p-result-copy"><h3>Respaldo restaurado</h3><p>Este Mini ahora tiene los datos del respaldo de ${esc(sender)}.</p></div></div>
          <div class="mini-roster-metrics">
            ${rosterMetric('users', 'Empleados', b.employees, 'is-success')}
            ${rosterMetric('attendance', 'Días', b.attendanceDays, 'is-success')}
            ${rosterMetric('requests', 'Solicitudes', b.requests, 'is-success')}
            ${rosterMetric('building', 'Obras', b.workContexts, 'is-success')}
          </div>
          <div class="mini-p2p-actions">${primary('Finalizar', 'data-finish-restore', 'check')}</div>
        </div>`; });
      body().querySelector('[data-finish-restore]')?.addEventListener('click', () => closeTransferModal());
      try { signalTerminalSuccess('backup-restored:' + staged.sha256, { title: 'Respaldo restaurado', detail: 'Datos de ' + sender + ' aplicados.' }); } catch (_) {}
    });
  }

  async function renderBackupHub() {
    cleanupSession();
    startMiniBackupInbox().catch(() => {});
    shell();
    const self = await identityStore.getSelf();
    const allPeers = await identityStore.listPeers();
    const stagedBackups = root.SaMiniP2PBackup?.backupStagedStore?.listStaged() || [];

    const stagedCards = stagedBackups.map(staged => {
      const isMini = staged.schema === 'mini-backup/v1';
      const stagedWhen = formatPeerDate(staged.receivedAt);
      const stagedSize = root.SaMiniP2PBackup ? root.SaMiniP2PBackup.formatBackupSize(staged.size) : (staged.size + ' B');
      const actionBtn = isMini
        ? uiButton('Revisar', 'data-review-backup="' + esc(staged.transferId) + '" aria-label="Revisar respaldo de ' + esc(staged.sourcePeerName) + '"', 'primary', 'chevronRight')
        : uiButton('Descargar', 'data-download-backup="' + esc(staged.transferId) + '" aria-label="Descargar respaldo de ' + esc(staged.sourcePeerName) + '"', 'primary', 'restore');
      const note = isMini
        ? `${esc(stagedSize)} · recibido ${esc(stagedWhen)}. Aún no se ha aplicado nada.`
        : `${esc(stagedSize)} · recibido ${esc(stagedWhen)}. Sólo descarga; no se importa.`;
      return `<div class="mini-p2p-staged-card" data-staged-backup="${esc(staged.transferId)}"><span class="mini-p2p-staged-icon">${vectorIcon('backup', 17)}</span><div class="mini-p2p-staged-copy"><strong>Respaldo de ${esc(staged.sourcePeerName)} listo</strong><span>${note}</span></div><div class="mini-p2p-staged-actions">${actionBtn}${uiButton('Descartar', 'data-discard-backup="' + esc(staged.transferId) + '" aria-label="Descartar respaldo de ' + esc(staged.sourcePeerName) + '"', 'secondary', 'close')}</div></div>`;
    }).join('');

    const pendingSection = stagedBackups.length > 0 ? `
      <section class="mini-p2p-activity" aria-labelledby="mini-backup-pending-title">
        <div class="mini-p2p-activity-head">
          <div><h3 id="mini-backup-pending-title">Respaldos pendientes</h3><div class="mini-p2p-subtitle">Copias recibidas que requieren una decisión</div></div>
          ${countBadge(stagedBackups.length, 'pendientes')}
        </div>
        ${stagedCards}
      </section>` : '';

    const peerRows = allPeers.length ? allPeers.map(peer => {
      const isMini = peer.peerApp === 'mini';
      const alias = aliasStore.getAlias(peer.peerId);
      const original = peerOriginalName(peer);
      const originalLine = alias ? ` · Original: ${esc(original)}` : '';
      const typeLabel = isMini ? 'Mini' : 'SA';
      const avatarIcon = isMini ? 'package' : 'hardHat';
      return `
        <div class="mini-p2p-peer-row">
          <span class="mini-p2p-peer-avatar">${vectorIcon(avatarIcon, 17)}</span>
          <div class="mini-p2p-peer-copy">
            <div class="mini-p2p-peer-title-line">
              <strong>${esc(peerName(peer))}</strong>
              <span class="mini-p2p-peer-pill is-online">${typeLabel}</span>
            </div>
            <div class="mini-p2p-peer-meta">${isMini ? 'Recibe respaldos automáticamente' : ''}${originalLine}</div>
          </div>
          <div class="mini-p2p-device-actions">
            ${uiButton('Enviar', `data-send-backup="${esc(peer.peerId)}" aria-label="Enviar respaldo a ${esc(peerName(peer))}"`, 'primary', 'backup')}
            ${isMini ? '' : uiButton('Esperar', `data-wait-backup="${esc(peer.peerId)}" aria-label="Esperar respaldo de ${esc(peerName(peer))}"`, 'secondary', 'inbox')}
            <button type="button" class="mini-p2p-icon-btn is-danger" data-unlink-backup="${esc(peer.peerId)}" aria-label="Desvincular ${esc(peerName(peer))}" title="Desvincular">${vectorIcon('unlink', 16)}</button>
          </div>
        </div>`;
    }).join('') : '<div class="mini-p2p-empty">Aún no hay dispositivos vinculados. Vincula otro Mini para respaldos o usa un SA ya vinculado.</div>';

    morphShell(() => {
      body().innerHTML = `
        <div class="mini-p2p-home">
          <div class="mini-p2p-header-line">
            ${backButton('Inicio')}
            <div><h2>Respaldos P2P</h2><p>Transfiere copias de seguridad de forma directa y segura.</p></div>
          </div>
          ${pendingSection}
          <section class="mini-p2p-devices" aria-labelledby="mini-backup-devices-title">
            <div class="mini-p2p-section-head">
              <div><h3 id="mini-backup-devices-title">Dispositivos vinculados</h3><div class="mini-p2p-subtitle">Envía o espera respaldos con estos dispositivos</div></div>
              ${countBadge(allPeers.length, 'dispositivos')}
            </div>
            <div class="mini-p2p-peer-list">${peerRows}</div>
          </section>
          <div class="mini-p2p-actions">
            ${uiButton('Vincular otro Mini', 'data-backup-pair-mini', 'primary', 'link')}
          </div>
        </div>`;
    });

    body().querySelector('[data-back]').addEventListener('click', renderHome);
    body().querySelector('[data-backup-pair-mini]').addEventListener('click', renderBackupPairing);
    body().querySelectorAll('[data-send-backup]').forEach(btn => btn.addEventListener('click', () => sendBackupToPeer(btn.dataset.sendBackup)));
    body().querySelectorAll('[data-wait-backup]').forEach(btn => btn.addEventListener('click', () => waitBackupTransfer(btn.dataset.waitBackup)));
    body().querySelectorAll('[data-review-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.reviewBackup;
      const staged = root.SaMiniP2PBackup?.backupStagedStore?.getStaged(transferId);
      if (!staged) return renderBackupHub();
      renderBackupReview(transferId).catch(err => toast('Error al revisar respaldo: ' + err.message));
    }));
    body().querySelectorAll('[data-download-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.downloadBackup;
      const staged = root.SaMiniP2PBackup?.backupStagedStore?.getStaged(transferId);
      if (!staged) return renderBackupHub();
      try {
        root.SaMiniP2PBackup.downloadBackupBytes(staged);
        root.SaMiniP2PBackup.backupStagedStore.removeStaged(transferId);
        await refreshMiniP2PHeader();
        toast('Respaldo descargado.');
        renderBackupHub();
      } catch (err) {
        toast('Error al descargar respaldo: ' + err.message);
      }
    }));
    body().querySelectorAll('[data-discard-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const transferId = btn.dataset.discardBackup;
      root.SaMiniP2PBackup?.backupStagedStore?.removeStaged(transferId);
      await refreshMiniP2PHeader();
      renderBackupHub();
    }));
    body().querySelectorAll('[data-unlink-backup]').forEach(btn => btn.addEventListener('click', async () => {
      const peerId = btn.dataset.unlinkBackup;
      const peer = await identityStore.getPeer(peerId);
      const name = peer ? peerName(peer) : 'este dispositivo';
      if (typeof root.showConfirm !== 'function') { toast('Confirmación no disponible en este entorno.'); return; }
      const confirmed = await root.showConfirm(`¿Desvincular a ${name}?`, { title: 'Desvincular dispositivo', confirmText: 'Desvincular', danger: true });
      if (!confirmed) return;
      peerRecentLastSeen.delete(peerId);
      detachPresence(peerId, { persist: false });
      await identityStore.removePeer(peerId);
      aliasStore.removeAlias(peerId);
      try { stopPeerListener(peerId); } catch (_) {}
      stopMiniBackupListener(peerId); miniBackupKnownPeers.delete(String(peerId)); publishMiniBackupConnections();
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderBackupHub();
    }));
  }

  async function renderBackupPairing() {
    cleanupSession();
    shell();
    morphShell(() => {
      body().innerHTML = `
        <div class="mini-p2p-step">
          ${backButton('Respaldos')}
          <div><h3>Vincular otro Mini</h3><p>Conecta dos dispositivos Mini para transferir copias de seguridad.</p></div>
          <div class="mini-p2p-actions">
            ${uiButton('Escanear QR de otro Mini', 'data-scan-backup-pair', 'primary', 'camera')}
            ${uiButton('Ingresar código + clave', 'data-manual-backup-pair', 'secondary', 'hash')}
            ${uiButton('Mostrar mi código para vincular', 'data-share-backup-pair', 'secondary', 'link')}
          </div>
          <p class="mini-p2p-footnote">El emparejamiento entre Minis es exclusivo para respaldos. No comparte listas de personal ni asistencia operativa.</p>
        </div>`;
    });
    body().querySelector('[data-back]').addEventListener('click', renderBackupHub);
    body().querySelector('[data-scan-backup-pair]').addEventListener('click', () => renderQrScanner({ allowSameApp: true }));
    body().querySelector('[data-manual-backup-pair]').addEventListener('click', () => renderManualPair({ allowSameApp: true }));
    body().querySelector('[data-share-backup-pair]').addEventListener('click', renderBackupPairShare);
  }

  async function renderBackupPairShare() {
    cleanupSession();
    shell();
    const self = await identityStore.getSelf();
    const descriptor = await core.makePairDescriptor(self);
    const pairUrl = core.buildPairUrl(descriptor, (typeof root !== 'undefined' && root.location?.href) ? root.location.href : 'https://mini.invalid/');

    morphShell(() => {
      body().innerHTML = `
        <div class="mini-p2p-step">
          ${backButton('Vincular')}
          <div><h3>Código de vinculación</h3><p>En el otro Mini, escanea este QR o introduce el código y la clave manualmente:</p></div>
          <div class="mini-p2p-pair-grid">
            <div class="mini-p2p-qr-block" data-qr-block>
              <span class="mini-p2p-qr-label">QR de vinculación</span>
              ${renderQr(pairUrl)}
            </div>
            <div class="mini-p2p-code-panel">
              <div class="mini-p2p-field"><label>Código</label><div class="mini-p2p-code">${esc(descriptor.code)}</div></div>
              <div class="mini-p2p-field"><label>Clave</label><div class="mini-p2p-code">${esc(descriptor.key)}</div></div>
            </div>
          </div>
          <div class="mini-p2p-status" data-pair-status>Esperando conexión del otro Mini…</div>
          <div class="mini-p2p-actions">${secondary('Cancelar', 'data-cancel-share')}</div>
        </div>`;
    });

    const handleCancel = () => { cleanupSession(); renderBackupPairing(); };
    body().querySelector('[data-back]').addEventListener('click', handleCancel);
    body().querySelector('[data-cancel-share]').addEventListener('click', handleCancel);

    const signaling = new core.SignalingClient({
      room: descriptor.room,
      peerId: self.deviceId,
      proof: descriptor.proof,
      expiresAt: descriptor.expiresAt
    });

    activeSession = await core.createRtcSession({
      signaling, initiator: true,
      expiresAt: descriptor.expiresAt,
      onState: (status, error) => {
        const box = body()?.querySelector('[data-pair-status]');
        if (!box) return;
        box.hidden = false;
        if (error) {
          activePairConfirmation = null;
          box.removeAttribute('data-pair-state');
          box.classList?.add?.('is-error');
          box.textContent = 'Error: ' + error.message;
          return;
        }
        if (activePairConfirmation || box.getAttribute('data-pair-state') || box.querySelector('[data-accept]')) {
          return;
        }
        if (status === 'connected') box.textContent = 'Canal conectado. Verificando identidad…';
        else if (status === 'connecting') box.textContent = 'Conectando con el otro Mini…';
      },
      onChannel: channel => {
        activeChannel = channel;
        pairing.attachPairing(channel, {
          self, descriptor, initiator: true, store: identityStore,
          allowSameApp: true,
          onCandidate: ({ remote, sas, accept, reject }) => renderPairConfirmation(remote, sas, accept, reject),
          onLinked: peer => {
            activeBackupReceiverDetach = armBackupReceiver(channel, peer);
            renderLinkedWaiting(peer, { allowSameApp: true });
          },
          onRejected: () => renderError('El otro Mini rechazó el vínculo.'),
          onError: renderError
        });
      }
    });
  }

  async function sendBackupToPeer(peerId, customPayload = null) {
    cleanupSession();
    const attempt = { consentController: new AbortController() };
    activeSendAttempt = attempt;
    let setupSignaling = null;
    let sendNotice = null;
    try {
      // Mini peers reuse the inbox transport; SA retains its existing one-shot flow.
      activeManualPeerId = String(peerId || '').trim();
      shell();
      const self = await identityStore.getSelf();
      const peer = await identityStore.getPeer(peerId);
      if (activeSendAttempt !== attempt) return;
      if (!peer) throw new Error('Dispositivo vinculado no encontrado.');
      const partnerName = peerName(peer);
      const title = `Enviar respaldo a ${partnerName}`;

      morphShell(() => {
        body().innerHTML = `
          <div class="mini-p2p-step">
            ${backButton('Respaldos')}
            <div class="mini-p2p-mode-chip">${vectorIcon('backup', 15)}<span>Respaldo P2P</span></div>
            <div><h3>${esc(title)}</h3><p>Transfiriendo datos de este Mini de forma directa y cifrada.</p></div>
            <div class="mini-p2p-status" data-backup-send-status>Conectando con ${esc(partnerName)}…</div>
            <div class="mini-p2p-actions">${secondary('Cancelar', 'data-cancel-send')}</div>
          </div>`;
      });

      const center = notices();
      const handleCancel = () => { if (activeSendAttempt !== attempt) return; sendNotice?.dismiss(); cleanupSession(); renderBackupHub(); };
      body().querySelector('[data-back]').addEventListener('click', handleCancel);
      body().querySelector('[data-cancel-send]').addEventListener('click', handleCancel);

      const payload = customPayload || await root.SaMiniP2PBackup.createMiniBackupPayload();
      if (activeSendAttempt !== attempt) return;
      sendNotice = center?.show({ id: 'backup-send-' + peer.peerId, state: 'loading', title: 'Conectando', description: 'Buscando a ' + partnerName + '…' }) || null;
      inFlightSendNotice = sendNotice;

      const performSend = async channel => {
        if (activeSendAttempt !== attempt) return;
        const liveBox = body()?.querySelector('[data-backup-send-status]');
        if (liveBox) liveBox.textContent = 'Esperando que ' + partnerName + ' acepte el respaldo…';
        sendNotice?.update({ state: 'loading', title: 'Esperando aceptación', description: partnerName + ' debe aceptar el respaldo (' + backupSizeLabel(payload.size) + ').' });

        try {
          const bridge = root.SaMiniP2PBackup;
          if (!bridge || typeof bridge.sendBackupOnChannel !== 'function') {
            throw new Error('Módulo de respaldos P2P no disponible.');
          }
          // SA does not speak backup-offer yet: SA peers keep the direct transfer.
          const decision = peer.peerApp !== 'mini' ? 'accepted' : await root.P2PBackupConsent.requestConsent(channel, core, {
            offerId: root.P2PBackupConsent.createOfferId(),
            schema: 'mini-backup/v1',
            size: payload.size,
            senderName: String(self.displayName || 'Mini').slice(0, 80)
          }, { signal: attempt.consentController.signal });
          if (activeSendAttempt !== attempt) return;
          if (decision !== 'accepted') {
            const why = decision === 'declined' ? partnerName + ' rechazó el respaldo.'
              : decision === 'timeout' ? partnerName + ' no respondió a tiempo.'
              : 'Se perdió la conexión con ' + partnerName + '.';
            throw new Error(why);
          }
          if (activeSendAttempt !== attempt) return;
          const { transfer, ack } = await bridge.sendBackupOnChannel(channel, {
            bytes: payload.bytes,
            schema: 'mini-backup/v1',
            onProgress: progress => {
              if (activeSendAttempt !== attempt) return;
              const curBox = body()?.querySelector('[data-backup-send-status]');
              if (curBox) curBox.textContent = 'Enviando respaldo… ' + Math.round(progress * 100) + '%';
              sendNotice?.update({ state: 'progress', title: 'Enviando respaldo', progress, description: Math.round(progress * 100) + '% · a ' + partnerName });
            }
          });
          if (activeSendAttempt !== attempt) return;
          if (inFlightSendNotice === sendNotice) inFlightSendNotice = null;
          sendNotice?.update({ state: 'success', title: 'Respaldo enviado', progress: 1, description: partnerName + ' lo recibió y verificó.' });

          if (liveBox) {
            liveBox.classList.remove('is-error');
            liveBox.classList.add('is-success');
            liveBox.innerHTML = statusMessage('check', 'Respaldo recibido por ' + partnerName, 'Transferencia completada y verificada.');
          }
          recordP2PActivity('backup-sent', peer, 'Respaldo enviado a ' + partnerName + '.', 'backup-sent:' + payload.sha256);
          signalTerminalSuccess('backup-sent:' + payload.sha256, { title: 'Respaldo enviado', detail: 'Transferencia a ' + partnerName + ' confirmada.' });
        } catch (err) {
          if (activeSendAttempt !== attempt) return;
          if (liveBox) {
            liveBox.classList.add('is-error');
            liveBox.textContent = 'Error al enviar respaldo: ' + (err.message || err);
          }
          if (inFlightSendNotice === sendNotice) inFlightSendNotice = null;
          sendNotice?.update({ state: 'error', title: 'Respaldo no enviado', description: String(err.message || err), duration: 7000 });
        } finally {
          // A Mini lease owns the transport beyond this one transfer.
          // Legacy SA sends still retire their separate transport below.
          if (peer.peerApp === 'mini') {
            if (activeSendAttempt === attempt) { attempt.consentController.abort(); activeSendAttempt = null; activeManualPeerId = null; }
            return;
          }
          const finished = activeSession;
          setTimeout(() => {
            if (activeSession === finished && activeSendAttempt === attempt) {
              try { finished?.close?.(); } catch (_) {}
              attempt.consentController.abort();
              activeSendAttempt = null;
              activeSession = null;
              activeChannel = null;
              activeManualPeerId = null;
              startMiniBackupInbox().catch(() => {});
            }
          }, 1500);
        }
      };
      if (isMiniBackupPeer(peer)) {
        miniBackupIntents?.invalidate(String(peer.peerId).trim());
        const entry = await ensureMiniBackupListener(peer);
        await entry?.availability?.demand();
        if (!entry?.lease || entry.busy) throw new Error('El dispositivo está ocupado. Reintenta.');
        await entry.lease.run(async channel => {
          if (entry.busy) throw new Error('El dispositivo está recibiendo otro respaldo.');
          await performSend(channel);
        });
        return;
      }

      const route = await core.deriveTrustedRoute(peer.linkToken);
      if (activeSendAttempt !== attempt) return;
      const signaling = setupSignaling = new core.SignalingClient({ room: route.room, peerId: self.deviceId, proof: route.proof });

      const createdSession = await core.createRtcSession({
        signaling, initiator: true,
        onState: (status, error) => {
          if (activeSendAttempt !== attempt) return;
          const liveBox = body()?.querySelector('[data-backup-send-status]');
          if (!liveBox) return;
          if (error) {
            liveBox.classList.add('is-error');
            liveBox.textContent = 'Error de conexión: ' + (error.message || error);
          } else if (status === 'connected') {
            liveBox.textContent = 'Canal conectado. Verificando identidad…';
          } else if (status === 'connecting') {
            liveBox.textContent = 'Conectando con ' + partnerName + '…';
          }
        },
        onChannel: channel => {
          if (activeSendAttempt !== attempt) return;
          activeChannel = channel;
          pairing.attachTrusted(channel, {
            self, peer, store: identityStore,
            allowSameApp: peer.peerApp === self.appType,
            onAuthenticated: () => performSend(channel),
            onError: err => {
              if (activeSendAttempt !== attempt) return;
              const liveBox = body()?.querySelector('[data-backup-send-status]');
              if (liveBox) {
                liveBox.classList.add('is-error');
                liveBox.textContent = 'Error de autenticación: ' + (err.message || err);
              }
            }
          });
        }
      });
      if (activeSendAttempt !== attempt) {
        try { createdSession?.close?.(); } catch (_) {}
        return;
      }
      activeSession = createdSession;
    } catch (_) {
      // Only this setup owner may restore its passive receiver. Never print
      // provider errors: those can contain authentication or server details.
      try { setupSignaling?.close?.(); } catch (_) {}
      if (activeSendAttempt !== attempt) return;
      attempt.consentController.abort();
      activeSendAttempt = null;
      try { activeSession?.close?.(); } catch (_) {}
      activeSession = null;
      activeChannel = null;
      activeManualPeerId = null;
      if (inFlightSendNotice === sendNotice) inFlightSendNotice = null;
      try { sendNotice?.dismiss?.(); } catch (_) {}
      const box = body()?.querySelector('[data-backup-send-status]');
      if (box) {
        box.classList.add('is-error');
        box.textContent = 'No se pudo iniciar el envío. Reintenta; tus datos se conservan.';
      }
      startMiniBackupInbox().catch(() => {});
    }
  }

  async function waitBackupTransfer(peerId) {
    cleanupSession();
    activeManualPeerId = String(peerId || '').trim();
    shell();
    const self = await identityStore.getSelf();
    const peer = await identityStore.getPeer(peerId);
    if (!peer) throw new Error('Dispositivo vinculado no encontrado.');
    const partnerName = peerName(peer);
    const title = `Esperar respaldo de ${partnerName}`;

    morphShell(() => {
      body().innerHTML = `
        <div class="mini-p2p-step">
          ${backButton('Respaldos')}
          <div class="mini-p2p-mode-chip">${vectorIcon('backup', 15)}<span>Respaldo P2P</span></div>
          <div><h3>${esc(title)}</h3><p>Ahora en el otro dispositivo selecciona este Mini y pulsa “Enviar respaldo”.</p></div>
          <div class="mini-p2p-status" data-wait-status>Esperando conexión autenticada…</div>
          <div class="mini-p2p-actions">${secondary('Cancelar espera', 'data-cancel')}</div>
        </div>`;
    });

    const handleCancel = () => { cleanupSession(); renderBackupHub(); };
    body().querySelector('[data-back]').addEventListener('click', handleCancel);
    body().querySelector('[data-cancel]').addEventListener('click', handleCancel);

    if (isMiniBackupPeer(peer)) {
      const entry = await ensureMiniBackupListener(peer);
      if (!entry) throw new Error('No se pudo preparar la conexión.');
      return;
    }

    const route = await core.deriveTrustedRoute(peer.linkToken);
    const signaling = new core.SignalingClient({ room: route.room, peerId: self.deviceId, proof: route.proof });

    activeSession = await core.createRtcSession({
      signaling, initiator: false,
      onState: (status, error) => {
        const box = body()?.querySelector('[data-wait-status]');
        if (!box) return;
        if (error) {
          box.classList.add('is-error');
          box.textContent = 'Error: ' + error.message;
        } else if (status === 'connected') {
          box.textContent = 'Canal conectado. Verificando identidad…';
        } else if (status === 'connecting') {
          box.textContent = 'Conectando con ' + partnerName + '…';
        }
      },
      onChannel: channel => {
        activeChannel = channel;
        const offers = peer.peerApp === 'mini' ? root.P2PBackupConsent.bufferOffers(channel, core) : null;
        pairing.attachTrusted(channel, {
          self, peer, store: identityStore,
          allowSameApp: peer.peerApp === self.appType,
          onAuthenticated: () => {
            const box = body()?.querySelector('[data-wait-status]');
            if (peer.peerApp !== 'mini') {
              // SA sends directly (no offer); opening "Esperar" is the consent.
              activeBackupReceiverDetach = armBackupReceiver(channel, peer, { background: false });
            } else {
            // The user opened "Esperar" for this peer: that is the consent.
            const detachOffers = offers.detach;
            offers.release((offer, respond) => {
              try { activeBackupReceiverDetach?.(); } catch (_) {}
              const receiverDetach = armBackupReceiver(channel, peer, { background: false, expectedOffer: offer });
              activeBackupReceiverDetach = () => { detachOffers(); receiverDetach(); };
              respond(true);
            });
            activeBackupReceiverDetach = detachOffers;
            }
            if (box) {
              box.classList.remove('is-error');
              box.innerHTML = statusMessage('check', partnerName + ' autenticado', 'Esperando transmisión del respaldo…');
            }
          },
          onError: error => {
            const box = body()?.querySelector('[data-wait-status]');
            if (box) {
              box.classList.add('is-error');
              box.textContent = 'Error de autenticación: ' + (error.message || error);
            }
          }
        });
      }
    });
  }

  function hasOwn(value,key){return Object.prototype.hasOwnProperty.call(value||{},key);}

  function rosterTuple(projectId,employeeId){return JSON.stringify([String(projectId||''),String(employeeId||'')]);}

  function buildRosterReviewModel(text) {
    const parsed=JSON.parse(text);
    const roster=root.SaRosterImport.normalizeSaRoster(parsed);
    const current=Array.isArray(root.users)?root.users:(root.employeeRepository?.getAll?.()||[]);
    const plan=root.SaRosterImport.buildSaImportPlan(current,roster,root.EmployeeNumberRules);
    const currentByTuple=new Map(current.filter(u=>u?.saProjectId&&u?.saEmployeeId).map(u=>[rosterTuple(u.saProjectId,u.saEmployeeId),u]));
    const rawByTuple=new Map((parsed.employees||[]).map(r=>[rosterTuple(r.saProjectId||parsed.saProjectId,r.saEmployeeId),r]));
    const incomingKeys=new Set(roster.employees.map(r=>rosterTuple(r.saProjectId,r.saEmployeeId)));
    const updates=[];
    let unchangedCount=0;
    for(const incoming of roster.employees){
      const local=currentByTuple.get(rosterTuple(incoming.saProjectId,incoming.saEmployeeId));
      if(!local)continue;
      const raw=rawByTuple.get(rosterTuple(incoming.saProjectId,incoming.saEmployeeId))||{};
      const changes=[];
      if(String(local.number??'')!==String(incoming.number??''))changes.push(`Ficha ${local.number??'—'} → ${incoming.number}`);
      if(String(local.name??'')!==String(incoming.name??''))changes.push(`Nombre: ${local.name||'—'} → ${incoming.name}`);
      if(hasOwn(raw,'position')&&String(local.position??'')!==String(incoming.position??''))changes.push(`Cargo: ${local.position||'Sin cargo'} → ${incoming.position||'Sin cargo'}`);
      if(hasOwn(raw,'sueldo')&&String(local.sueldo??'')!==String(incoming.sueldo??''))changes.push('Sueldo actualizado');
      if(hasOwn(raw,'paused')){
        const before=local.paused===true;
        const after=incoming.paused===true;
        if(before!==after)changes.push(after?'Pausado desde SA':'Reactivado desde SA');
      }
      if(changes.length)updates.push({incoming,local,changes});else unchangedCount+=1;
    }
    const creates=plan.creates.map(incoming=>({incoming}));
    const missing=current.filter(u=>u?.saProjectId===roster.saProjectId&&u?.saEmployeeId&&!incomingKeys.has(rosterTuple(u.saProjectId,u.saEmployeeId)));
    return {parsed,roster,plan,updates,creates,missing,unchangedCount,current};
  }

  function rosterMetric(icon,label,value,kind='') {
    return `<div class="mini-roster-metric ${kind}"><span class="mini-roster-metric-icon">${vectorIcon(icon,16)}</span><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
  }

  function renderRosterReceived() {
    if(!pendingRoster)return renderHome();
    const name=pendingRoster.transport==='firebase'?(pendingRoster.contextLabel||'SA'):peerName(pendingRoster.peer);
    morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step">${backButton()}<div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('users',15)}<span>Personal de la obra</span></div><span class="mini-roster-step-count">1 / 3</span></div>${statusMessage('check','Roster recibido y verificado',`${pendingRoster.employeeCount} empleados de ${name}. Aún no se ha aplicado nada.`)}<div class="mini-p2p-actions">${primary('Revisar cambios','data-review-roster','chevronRight')}${secondary('Cancelar','data-cancel-review','close')}</div></div>`;});
    body().querySelector('[data-back]')?.addEventListener('click',renderHome);
    body().querySelector('[data-cancel-review]')?.addEventListener('click',renderHome);
    body().querySelector('[data-review-roster]')?.addEventListener('click',reviewPendingRoster);
  }

  function reviewPendingRoster() {
    if(!pendingRoster)return;
    let model;
    try{model=buildRosterReviewModel(pendingRoster.text);}catch(error){return renderError(error);}
    pendingRoster.reviewModel=model;
    pendingRoster.resolutions=pendingRoster.resolutions||{};
    const conflictCount=model.plan.reconciliationCandidates.length;
    const handled=model.plan.reconciliationCandidates.filter(c=>hasOwn(pendingRoster.resolutions,rosterTuple(c.saProjectId,c.saEmployeeId))).length;
    const allHandled=handled===conflictCount;
    const detailRows=[
      ...model.updates.map(x=>`<li><span class="mini-roster-state is-warning">Cambio</span><strong>${esc(x.incoming.name)}</strong><span>${x.changes.map(esc).join(' · ')}</span></li>`),
      ...model.creates.map(x=>`<li><span class="mini-roster-state is-info">Nuevo</span><strong>${esc(x.incoming.name)}</strong><span>Se agregará a Mini · ficha ${esc(x.incoming.number)}</span></li>`)
    ].join('');
    const missingRows=model.missing.map(u=>`<li><strong>${esc(u.name||u.saEmployeeId)}</strong><span>Ya no aparece en este roster de SA · se conservará en Mini</span></li>`).join('');
    const conflicts=model.plan.reconciliationCandidates.map(c=>{
      const key=rosterTuple(c.saProjectId,c.saEmployeeId);
      const chosen=pendingRoster.resolutions[key];
      const choices=c.candidates.map(candidate=>`<button type="button" class="mini-roster-choice ${chosen===candidate.id?'is-selected':''}" data-roster-choice="${esc(key)}" data-local-id="${esc(candidate.id)}">${vectorIcon(chosen===candidate.id?'check':'link',15)}<span><strong>Vincular con ${esc(candidate.name)}</strong><small>Ficha ${esc(candidate.number)} · conserva el ID local</small></span></button>`).join('');
      return `<section class="mini-roster-conflict-card"><div class="mini-roster-conflict-head"><span class="mini-roster-state is-warning">Conflicto</span><div><strong>${esc(c.name)}</strong><small>SA ID ${esc(c.saEmployeeId)} · ficha ${esc(c.number)}</small></div></div><p>La ficha ya pertenece a un empleado local. Elige el vínculo correcto o deja este registro fuera de esta importación.</p><div class="mini-roster-choice-grid">${choices}<button type="button" class="mini-roster-choice ${chosen==='skip'?'is-selected':''}" data-roster-choice="${esc(key)}" data-local-id="skip">${vectorIcon(chosen==='skip'?'check':'close',15)}<span><strong>No vincular ahora</strong><small>Este registro de SA se omitirá en esta aplicación</small></span></button></div></section>`;
    }).join('');
    const baseHint=!allHandled?`Resuelve ${conflictCount-handled} conflicto${conflictCount-handled===1?'':'s'} para aplicar.`:'Los cambios están listos para aplicar en Mini.';
    let versionDecision = null;
    try {
      const target = (model && model.roster) || (model && model.parsed) || JSON.parse(pendingRoster.text);
      versionDecision = classifyReviewedRosterForUi(target);
    } catch (_) {
      versionDecision = { outcome: 'ambiguous', reason: 'version-guard-unavailable' };
    }
    const versionOutcome = (versionDecision && versionDecision.outcome) || 'ambiguous';
    const versionCanApply = versionOutcome === 'first' || versionOutcome === 'newer';
    const recovery = versionDecision?.reason === 'local-personnel-missing';
    const versionBanner = `<div class="mini-roster-version is-${esc(versionOutcome)}" role="status" aria-live="polite">${vectorIcon(versionIcon(versionOutcome),16)}<div><strong>${esc(recovery ? 'Recuperar personal' : versionLabel(versionOutcome))}</strong><span>${esc(recovery ? 'El personal de este Mini está vacío. Revisa esta lista para recuperarlo.' : versionDetail(versionOutcome))}</span></div></div>`;
    const hint = !versionCanApply ? versionDetail(versionOutcome) : baseHint;
    const canApply = allHandled && versionCanApply;
    morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step mini-roster-review">${backButton('Personal recibido')}<div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('users',15)}<span>REVISIÓN SA</span></div><span class="mini-roster-step-count">2 / 3</span></div><div><h3>Actualizar personal</h3><p>${esc(pendingRoster.contextLabel||peerName(pendingRoster.peer))} · Personal autorizado</p></div>${versionBanner}<div class="mini-roster-metrics">${rosterMetric('add','Nuevos',model.creates.length,'is-info')}${rosterMetric('edit','Modificados',model.updates.length,'is-warning')}${rosterMetric('check','Sin cambios',model.unchangedCount,'is-success')}${conflictCount?rosterMetric('conflict','Conflictos',conflictCount,'is-danger'):''}</div>${model.missing.length?`<div class="mini-roster-notice">${vectorIcon('warning',17)}<div><strong>${model.missing.length} empleado${model.missing.length===1?'':'s'} ya no aparece${model.missing.length===1?'':'n'} en este roster</strong><span>Mini los conservará. La sincronización de roster no elimina historial ni personal automáticamente.</span></div></div>`:''}${(detailRows||missingRows)?`<details open class="mini-roster-details"><summary>${vectorIcon('inbox',16)}<span>Ver detalle de cambios</span>${countBadge(model.updates.length+model.creates.length+model.missing.length,'cambios')}${vectorIcon('chevronRight',15)}</summary><ul>${detailRows}${missingRows}</ul></details>`:''}${conflicts?`<div class="mini-roster-conflicts"><div class="mini-roster-section-head"><h4>Resolver vínculos</h4>${countBadge(conflictCount,'conflictos')}<span>${handled} / ${conflictCount}</span></div>${conflicts}</div>`:''}<footer class="mini-roster-footer"><span class="mini-roster-hint">${esc(hint)}</span>${primary('Aplicar actualización','data-apply-roster '+(canApply?'':'disabled'),'check')}${secondary('Revisar después','data-roster-later','chevronRight')}</footer></div>`;});
    body().querySelector('[data-back]')?.addEventListener('click',renderRosterReceived);
    body().querySelector('[data-roster-later]')?.addEventListener('click',renderHome);
    body().querySelectorAll('[data-roster-choice]').forEach(btn=>btn.addEventListener('click',()=>{pendingRoster.resolutions[btn.dataset.rosterChoice]=btn.dataset.localId;reviewPendingRoster();}));
    body().querySelector('[data-apply-roster]')?.addEventListener('click',applyReviewedRoster);
  }

  async function applyReviewedRoster(){
    if(!pendingRoster?.reviewModel||typeof root.applyReviewedSaRoster!=='function'){toast('No se pudo aplicar el roster revisado.');return;}
    try {
      const target = (pendingRoster.reviewModel && pendingRoster.reviewModel.roster) || (pendingRoster.reviewModel && pendingRoster.reviewModel.parsed) || null;
      if (target) {
        const recheck = classifyReviewedRosterForUi(target);
        const outcome = (recheck && recheck.outcome) || 'ambiguous';
        if (outcome !== 'first' && outcome !== 'newer') { renderError(new Error(versionBlockedMessage(outcome))); return; }
      }
    } catch (_) {}
    const confirmedLinks=Object.entries(pendingRoster.resolutions||{}).filter(([,localId])=>localId!=='skip').map(([key,localId])=>{const [saProjectId,saEmployeeId]=JSON.parse(key);return{saProjectId,saEmployeeId,localId};});
    try{
      const result=await root.applyReviewedSaRoster({text:pendingRoster.text,confirmedLinks,source:pendingRoster.transport==='firebase'?'sa-firebase':'sa-p2p'});
      const skipped=result.skippedCount||0;
      const model=pendingRoster.reviewModel;
      const linkedCount=confirmedLinks.length;
      const appliedDigest = String(pendingRoster.sha256 || '').toLowerCase().trim();
      morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step mini-roster-result"><div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('check',15)}<span>APLICADO</span></div><span class="mini-roster-step-count">3 / 3</span></div><div class="mini-p2p-result"><span class="mini-p2p-result-icon">${vectorIcon('check',20)}</span><div class="mini-p2p-result-copy"><h3>Personal actualizado</h3><p>El personal está actualizado. La asistencia anterior se conserva.</p></div></div><div class="mini-roster-metrics">${rosterMetric('add','Agregados',result.createdCount||0,'is-info')}${rosterMetric('edit','Con cambios',(model?.updates?.length||0)+linkedCount,'is-success')}${rosterMetric('check','Sin cambios',model?.unchangedCount||0,'is-success')}${rosterMetric('warning','Omitidos',skipped,skipped?'is-warning':'is-success')}</div>${skipped?`<div class="mini-roster-notice">${vectorIcon('warning',17)}<div><strong>${skipped} registro${skipped===1?' quedó':'s quedaron'} sin vincular</strong><span>Puedes volver a actualizar el personal y resolverlos más adelante.</span></div></div>`:''}<div class="mini-p2p-actions">${primary('Finalizar','data-finish-roster','check')}</div></div>`;});
      try { signalTerminalSuccess(appliedDigest ? ('roster-applied:' + appliedDigest) : 'roster-applied', { title: 'Personal actualizado', detail: String(result.createdCount || 0) + ' agregados en Mini.' }); } catch (_) {}
      try {
        const appliedPeer = pendingRoster.peer || null;
        const appliedName = appliedPeer ? peerName(appliedPeer) : 'SA';
        recordP2PActivity('roster-applied', appliedPeer, 'Roster de ' + appliedName + ' aplicado con ' + String(result.createdCount || 0) + ' agregados.', appliedDigest ? ('roster-applied:' + appliedDigest) : '');
      } catch (_) {}
      try { stagedStore?.clear?.(pendingRoster.peer?.peerId); } catch (_) {}
      try { activityStore?.markStagedReviewed?.(pendingRoster.peer?.peerId); } catch (_) {}
      document.dispatchEvent(new CustomEvent('connection-data-applied'));
      pendingRoster=null;
      try { await refreshMiniP2PHeader(); } catch (_) {}
      body().querySelector('[data-finish-roster]')?.addEventListener('click',()=>openP2PTransferModal());
    }catch(error){renderError(error);}
  }

  async function consumePairHash() {
    const encoded=core.parsePairHash(location.hash);
    if(!encoded)return false;
    history.replaceState(null,'',location.pathname+location.search);
    try{
      const descriptor=await core.decodePairDescriptor(encoded);
      shell();
      await startPairing(descriptor);
      return true;
    }catch(error){
      shell();
      morphShell(() => { body().innerHTML = `<div class="mini-p2p-step"><div><h3>Vínculo QR inválido</h3><p>${esc(error.message||error)}</p></div><div class="mini-p2p-actions">${secondary('Volver','data-home','chevronLeft')}</div></div>`; });
      body().querySelector('[data-home]').addEventListener('click',renderHome);
      return true;
    }
  }

  async function openP2PTransferModal(method){await renderHome();connectionsMenu?.show(method==='direct'||method==='internet'?method:undefined);}
  async function openP2PPairingScanner(){await renderQrScanner();}
  root.MiniEmployeeSender?.configure({getChannel: peerId => (activeManualPeerId===peerId ? activeChannel : passivePeerListeners.get(peerId)?.channel) || null, ensureChannel: peer => ensurePeerListener(peer)});
  root.reviewFirebaseRoster=async payload=>{
    if(!root.SaRosterImport)throw new Error('Validador de personal no disponible.');
    root.SaRosterImport.normalizeSaRoster(payload);
    const option=document.getElementById('cloud-field-binding')?.selectedOptions?.[0];
    const contextLabel=option?.dataset.projectId===payload.saProjectId?option.textContent:'SA';
    pendingRoster={text:JSON.stringify(payload),peer:null,transport:'firebase',contextLabel,employeeCount:payload.employees.length};
    shell();connectionsMenu?.review('internet');renderRosterReceived();
  };
  root.openP2PTransferModal=openP2PTransferModal;
  root.openP2PPairingScanner=openP2PPairingScanner;
  root.openP2PBackupHub=renderBackupHub;
  root.closeP2PTransferModal=()=>closeTransferModal();
  root.waitTrustedTransfer=waitTrustedTransfer;
  root.waitTrustedRoster=waitTrustedRoster;
  root.waitTrustedAttendance=waitTrustedAttendance;
  root.waitBackupTransfer=waitBackupTransfer;
  root.sendBackupToPeer=sendBackupToPeer;
  root.armBackupReceiver=armBackupReceiver;
  root.startPairing=startPairing;
  root.renderBackupPairShare=renderBackupPairShare;
  root.renderPairConfirmation=renderPairConfirmation;
  root.renderQr=renderQr;
  root.refreshMiniP2PHeader=refreshMiniP2PHeader;
  root.MiniP2PAlias={isValidChosenMiniAlias, shortHeaderLabel, MINI_DEFAULT_ALIAS: 'Mini - Dispositivo'};
  root.MiniDeviceIdentity = {
    getName: async () => (await identityStore.getSelf())?.displayName || '',
    saveName: async name => { await identityStore.renameSelf(name); refreshMiniP2PHeader().catch(() => {}); },
    issue: miniAliasIssue
  };
  root.MiniP2PRosterVersions={labels: ROSTER_VERSION_LABELS, labelFor: versionLabel, iconFor: versionIcon, detailFor: versionDetail, blockedMessageFor: versionBlockedMessage, classify: classifyReviewedRosterForUi, getGuard: getVersionGuard};
  root.MiniP2PSuccessFeedback={ signal: signalTerminalSuccess, reset: resetTerminalSuccessSignals, chime: playSuccessChime, badge: countBadge, has: (value) => { try { return firedTerminalSuccessKeys.has(String(value || '').trim()); } catch (_) { return false; } } };
  root.addEventListener?.('pagehide', stopAllMiniBackupListeners);
  root.MiniP2PBackupInbox={ snapshot: miniBackupConnectionSnapshot, subscribe: subscribeMiniBackupConnections, reconnect: reconnectMiniBackupPeer, start: startMiniBackupInbox, ensure: ensureMiniBackupListener, stop: stopMiniBackupListener, retire: closeMiniBackupConnection, stopAll: stopAllMiniBackupListeners, listeners: miniBackupListeners };
  root.MiniP2PPassiveInbox={ start: startPassiveInbox, ensure: ensurePeerListener, stop: stopPeerListener, backoffDelayMs: passiveBackoffDelayMs, isStarted: () => passiveInboxStarted, listeners: passivePeerListeners, armPassiveChannel, isPeerOnline, isNetworkOnline };
  root.MiniP2PPresence = { isPeerOnline, getPeerState: getPeerVisualState, getPresence: getPeerPresence, attach: attachPresence, detach: detachPresence, isNetworkOnline, expireStale: expireStalePresence, handleOffline: handleNetworkOffline, handleOnline: handleNetworkOnline, HEARTBEAT_MS: core.PRESENCE_HEARTBEAT_MS || 25000, TTL_MS: core.PRESENCE_TTL_MS || 60000, BACKOFF_SCHEDULE_MS: PASSIVE_BACKOFF_SCHEDULE_MS };
  root.MiniP2PActivityUi={ stagedCount: getStagedPendingCount, staged: getEffectiveStaged, stagedList: getAllStaged, activities: getRecentP2PActivities, reviewStaged: reviewPersistedStagedRoster, discardStaged: discardPersistedStagedRoster };

  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshMiniBackupInbox(true); });
    root.addEventListener?.('pageshow', () => refreshMiniBackupInbox(true));
    setInterval(() => { if (document.visibilityState !== 'hidden') refreshMiniBackupInbox(false); }, 60000);
  } catch (_) {}
  const boot=()=>{ try { root.MiniWelcome?.ensureNamed(root.MiniDeviceIdentity).catch(()=>{}); } catch (_) {} refreshMiniP2PHeader().catch(()=>{}); try { startPassiveInbox().catch(()=>{}); } catch (_) {} return consumePairHash().catch(()=>{}); };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  root.addEventListener('hashchange',()=>consumePairHash().catch(()=>{}));
})(window);
