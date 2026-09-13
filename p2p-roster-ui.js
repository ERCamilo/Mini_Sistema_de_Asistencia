(function (root) {
  'use strict';
  const core = root.SaMiniP2P;
  const pairing = root.SaMiniP2PPairing;
  const aliases = root.SaMiniP2PPeerAliases;
  const activityApi = root.SaMiniP2PActivity || null;
  if (!core || !pairing || !aliases) throw new Error('P2P core/pairing/alias store must load before P2P roster UI.');

  const MODAL_ID = 'mini-p2p-transfer-modal';
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
    if (outcome === 'equal') return 'Este roster ya fue aplicado en Mini. No se puede aplicar de nuevo.';
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
      return guard.classifyIncoming(rosterLike);
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
  function headerLinkEl() {
    try { return document.getElementById('btn-attendance-link'); } catch (_) { return null; }
  }
  function isPassivePeerLive(peerId) {
    try {
      const entry = passivePeerListeners.get(String(peerId || '').trim());
      const channel = entry?.channel;
      return Boolean(channel && channel.readyState === 'open' && core.isChannelAuthenticated?.(channel) === true);
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
      if (!peers.length) {
        if (labelEl) labelEl.textContent = 'SA no vinculado';
        try { btn.setAttribute('aria-label', 'SA no vinculado. Vincular'); } catch (_) {}
        try { btn.setAttribute('title', 'SA no vinculado'); } catch (_) {}
        try { btn.onclick = openP2PPairingScanner; } catch (_) {}
        try { btn.setAttribute('data-p2p-header-state', 'unlinked'); } catch (_) {}
        try { btn.setAttribute('data-p2p-state', 'unlinked'); } catch (_) {}
        return 'unlinked';
      }
      const peer = peers[0];
      const primary = peerName(peer);
      const original = peerOriginalName(peer);
      const live = peers.some(item => isPassivePeerLive(item.peerId)) || Boolean(activeChannel && activeChannel.readyState === 'open' && core.isChannelAuthenticated?.(activeChannel) === true);
      const connectionState = live ? 'connected' : 'disconnected';
      if (labelEl) labelEl.textContent = 'SA ' + connectionState;
      let alias = '';
      try { alias = aliasStore.getAlias(peer.peerId); } catch (_) {}
      const pendingSuffix = pendingCount > 0 ? '. ' + pendingCount + ' pendiente' + (pendingCount === 1 ? '' : 's') + ' por revisar' : '';
      const stateText = live ? 'conectado' : 'vinculado, sin conexión activa';
      const audit = (alias && alias !== original)
        ? ('SA ' + stateText + ': ' + alias + ', proyecto ' + original + pendingSuffix + '. Abrir Transferencias')
        : ('SA ' + stateText + ': ' + primary + pendingSuffix + '. Abrir Transferencias');
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
  let activeQrStream = null;
  let activeQrScanTimer = null;
  let activeQrScanGeneration = 0;
  const ATTENDANCE_READY_SCHEMA = 'attendance-ready/v1';
  const PASSIVE_BASE_DELAY_MS = 1000;
  const PASSIVE_MAX_DELAY_MS = 30000;
  const passivePeerListeners = new Map();
  let passiveInboxStarted = false;
  let activeManualPeerId = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function peerName(peer) { return aliasStore.resolveName(peer); }
  function peerOriginalName(peer) {
    const original = String(peer?.displayName || '').trim();
    return original || (peer?.peerApp === 'sa' ? 'SA' : peer?.peerApp === 'mini' ? 'Mini' : 'Dispositivo');
  }
  function peerActivityMs(peer) {
    const parsed = Date.parse(peer?.lastSeenAt || peer?.linkedAt || '');
    return Number.isFinite(parsed) ? parsed : 0;
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

  function cleanupSession() {
    cleanupQrScanner();
    activeManualPeerId = null;
    if (activeAttendanceResponderDetach) {
      try { activeAttendanceResponderDetach(); } catch (_) {}
      activeAttendanceResponderDetach = null;
    }
    try { activeSession?.close?.(); } catch (_) {}
    activeSession = null;
    activeChannel = null;
  }

  function closeTransferModal(options = {}) {
    if (activeMorphCleanup) activeMorphCleanup();
    if (!options.keepSession) cleanupSession();
    modal()?.remove();
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
          <div class="mini-p2p-title-wrap"><strong id="mini-p2p-title" class="mini-p2p-title">Transferencias directas</strong><div class="mini-p2p-subtitle">Mini ↔ SA · conexión directa</div></div>
          <button type="button" class="mini-p2p-icon-btn" data-p2p-close aria-label="Cerrar" title="Cerrar">${vectorIcon('close', 17)}</button>
        </header>
        <div class="mini-p2p-body" data-p2p-body></div>
      </section>`;
    el.querySelector('[data-p2p-close]').addEventListener('click', () => closeTransferModal());
    el.addEventListener('click', e => { if (e.target === el) closeTransferModal(); });
    document.body.appendChild(el);
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

  function capability(iconName, title, detail, stateClass = '') {
    return `<div class="mini-p2p-capability ${stateClass}"><span class="mini-p2p-capability-icon">${vectorIcon(iconName, 16)}</span><span class="mini-p2p-capability-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span></div>`;
  }

  async function renderHome() {
    shell();
    cleanupSession();
    const self = await identityStore.getSelf();
    const peers = sortPeersByRecentActivity((await identityStore.listPeers()).filter(p => p.peerApp === 'sa'));
    const peerRows = peers.length ? peers.map(peer => {
      const alias = aliasStore.getAlias(peer.peerId);
      const original = peerOriginalName(peer);
      const lastSeen = formatPeerDate(peer.lastSeenAt || peer.linkedAt);
      const originalLine = alias ? ` · Original: ${esc(original)}` : '';
      return `
        <div class="mini-p2p-peer-row">
          <span class="mini-p2p-peer-avatar">${vectorIcon('hardHat', 17)}</span>
          <div class="mini-p2p-peer-copy"><strong>${esc(peerName(peer))}</strong><div class="mini-p2p-peer-meta">Última conexión: ${esc(lastSeen)}${originalLine}</div></div>
          <div class="mini-p2p-device-actions">
            <button type="button" class="mini-p2p-icon-btn" data-rename-peer="${esc(peer.peerId)}" aria-label="Cambiar nombre de ${esc(peerName(peer))}" title="Cambiar nombre">${vectorIcon('edit', 16)}</button>
            ${uiButton('Roster', `data-wait-peer="${esc(peer.peerId)}" aria-label="Esperar roster de ${esc(peerName(peer))}"`, 'primary', 'users')}
            ${uiButton('Asistencia', `data-wait-attendance="${esc(peer.peerId)}" aria-label="Esperar asistencia de ${esc(peerName(peer))}"`, 'secondary', 'attendance')}
            <button type="button" class="mini-p2p-icon-btn is-danger" data-unlink="${esc(peer.peerId)}" aria-label="Desvincular ${esc(peerName(peer))}" title="Desvincular">${vectorIcon('unlink', 16)}</button>
          </div>
        </div>`;
    }).join('') : '<div class="mini-p2p-empty">Aún no hay SA vinculados. Escanea el QR de SA para agregar el primero.</div>';

    const stagedEntries = getAllStaged();
    const stagedCount = stagedEntries.length;
    const stagedCards = stagedEntries.map(staged => {
      const stagedName = String(staged.peerName || (staged.peer ? peerName(staged.peer) : 'SA'));
      const stagedWhen = formatPeerDate(staged.receivedAt);
      const stagedEmployees = Number(staged.employeeCount || 0);
      const stagedPeerId = String(staged.peer?.peerId || staged.peerId || '');
      return `<div class="mini-p2p-staged-card" data-staged-peer="${esc(stagedPeerId)}"><span class="mini-p2p-staged-icon">${vectorIcon('users', 17)}</span><div class="mini-p2p-staged-copy"><strong>Roster de ${esc(stagedName)} listo para revisar</strong><span>${esc(stagedEmployees)} empleados · recibido ${esc(stagedWhen)}. Aún no se ha aplicado nada.</span></div><div class="mini-p2p-staged-actions">${uiButton('Revisar', 'data-review-staged="' + esc(stagedPeerId) + '" aria-label="Revisar roster de ' + esc(stagedName) + '"', 'primary', 'chevronRight')}${uiButton('Descartar', 'data-discard-staged="' + esc(stagedPeerId) + '" aria-label="Descartar roster de ' + esc(stagedName) + '"', 'secondary', 'close')}</div></div>`;
    }).join('');
    const pendingSection = stagedCount > 0 ? `
      <section class="mini-p2p-activity" aria-labelledby="mini-p2p-pending-title">
        <div class="mini-p2p-activity-head">
          <div><h3 id="mini-p2p-pending-title">Pendientes por revisar</h3><div class="mini-p2p-subtitle">Datos recibidos que requieren una decisión</div></div>
          ${countBadge(stagedCount, 'pendientes')}
        </div>
        ${stagedCards}
      </section>` : '';
    morphShell(() => { body().innerHTML = `
      ${pendingSection}
      <section class="mini-p2p-capabilities-wrap" aria-labelledby="mini-p2p-capabilities-title">
        <h3 id="mini-p2p-capabilities-title" class="mini-p2p-section-label">Capacidades</h3>
        <div class="mini-p2p-capabilities">
          ${capability('users', 'Personal', 'Recibir de SA', 'is-ready')}
          ${capability('attendance', 'Asistencia', 'Responder a SA', 'is-ready')}
          ${capability('backup', 'Backup', 'Próximamente', 'is-disabled')}
          ${capability('restore', 'Archivos', 'Próximamente', 'is-disabled')}
        </div>
      </section>
      <section class="mini-p2p-devices" aria-labelledby="mini-p2p-devices-title">
        <div class="mini-p2p-devices-head">
          <div><h3 id="mini-p2p-devices-title">SA vinculados</h3><div class="mini-p2p-subtitle">${peers.length} dispositivo${peers.length === 1 ? '' : 's'} guardado${peers.length === 1 ? '' : 's'} en este Mini</div></div>
          <div class="mini-p2p-self">Este Mini: <strong>${esc(self.displayName)}</strong><button type="button" class="mini-p2p-icon-btn" data-rename-self aria-label="Cambiar nombre de este Mini" title="Cambiar nombre de este Mini">${vectorIcon('edit', 15)}</button></div>
        </div>
        <div class="mini-p2p-peer-list">${peerRows}</div>
      </section>
      <div class="mini-p2p-actions">
        ${uiButton('Escanear QR de SA', 'data-scan-pair', 'primary', 'camera')}
        ${uiButton('Usar código + clave', 'data-manual-pair', 'secondary', 'hash')}
      </div>
      <p class="mini-p2p-footnote">El QR evita escribir código y clave. Vincular sólo crea una relación segura; recibir datos nunca los incorpora automáticamente.</p>`; });
    body().querySelector('[data-scan-pair]').addEventListener('click', () => renderQrScanner());
    body().querySelector('[data-manual-pair]').addEventListener('click', () => renderManualPair());
    body().querySelector('[data-rename-self]')?.addEventListener('click', renderSelfNameEditor);
    body().querySelectorAll('[data-rename-peer]').forEach(btn => btn.addEventListener('click', () => renderPeerAliasEditor(btn.dataset.renamePeer)));
    body().querySelectorAll('[data-wait-peer]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitPeer, 'roster')));
    body().querySelectorAll('[data-wait-attendance]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitAttendance, 'attendance')));
    body().querySelectorAll('[data-review-staged]').forEach(btn => btn.addEventListener('click', () => reviewPersistedStagedRoster(btn.dataset.reviewStaged)));
    body().querySelectorAll('[data-discard-staged]').forEach(btn => btn.addEventListener('click', async () => {
      const peerId = String(btn.dataset.discardStaged || '').trim();
      const current = getEffectiveStaged(peerId);
      try { stagedStore?.clear?.(peerId || current?.peerId); } catch (_) {}
      try { if (!peerId || String(pendingRoster?.peer?.peerId || pendingRoster?.peerId || '') === peerId) pendingRoster = null; } catch (_) {}
      try { activityStore?.markStagedReviewed?.(peerId || current?.peerId); } catch (_) {}
      try { await refreshMiniP2PHeader(); } catch (_) {}
      renderHome();
    }));
    body().querySelectorAll('[data-unlink]').forEach(btn => btn.addEventListener('click', async () => {
      const peerId = btn.dataset.unlink;
      const peer = await identityStore.getPeer(peerId);
      const name = peer ? peerName(peer) : 'este SA';
      if (typeof root.showConfirm !== 'function') { toast('Confirmación no disponible en este entorno.'); return; }
      const confirmed = await root.showConfirm(`¿Desvincular a ${name}?`, { title: 'Desvincular SA', confirmText: 'Desvincular', danger: true });
      if (!confirmed) return;
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
    try { startPassiveInbox().catch(() => {}); } catch (_) {}
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

  async function descriptorFromScannedQr(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) throw new Error('El QR no contiene datos de vinculación.');
    let encoded = null;
    try {
      const parsedUrl = new URL(raw, root.location?.href || 'https://mini.invalid/');
      encoded = core.parsePairHash(parsedUrl.hash);
    } catch (_) {}
    if (!encoded && raw.startsWith('#')) encoded = core.parsePairHash(raw);
    if (!encoded && /^[A-Za-z0-9_-]+$/.test(raw)) encoded = raw;
    if (!encoded) throw new Error('Este QR no es un vínculo válido de SA.');
    return core.decodePairDescriptor(encoded);
  }

  async function renderQrScanner() {
    if (!(await ensureMiniAliasChosen('scan'))) return;
    cleanupSession();
    shell();
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>Escanear QR de SA</h3><p>Apunta la cámara al QR que aparece en SA. Mini leerá el código y la clave automáticamente.</p></div>
        <div class="mini-p2p-scanner"><video data-qr-video playsinline muted></video><div class="mini-p2p-scanner-frame" aria-hidden="true"></div></div>
        <div class="mini-p2p-status" data-qr-status role="status" aria-live="polite">Preparando cámara…</div>
        <div class="mini-p2p-actions">${secondary('Usar código + clave','data-manual-fallback','hash')}</div>
      </div>`; });

    const back = () => { cleanupQrScanner(); renderHome(); };
    body().querySelector('[data-back]')?.addEventListener('click', back);
    body().querySelector('[data-manual-fallback]')?.addEventListener('click', () => { cleanupQrScanner(); renderManualPair(); });
    const status = body().querySelector('[data-qr-status]');
    const video = body().querySelector('[data-qr-video]');
    const mediaDevices = root.navigator?.mediaDevices;
    const Detector = root.BarcodeDetector;
    if (!mediaDevices?.getUserMedia || typeof Detector !== 'function') {
      if (status) status.textContent = 'Este navegador no permite escanear QR directamente. Puedes usar código + clave.';
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
      if (status) status.textContent = 'Cámara activa. Buscando QR de SA…';

      const scan = async () => {
        if (generation !== activeQrScanGeneration || !activeQrStream) return;
        try {
          const results = await detector.detect(video);
          const rawValue = results?.find(item => typeof item?.rawValue === 'string' && item.rawValue.trim())?.rawValue;
          if (rawValue) {
            if (status) status.textContent = 'QR detectado. Verificando vínculo…';
            const descriptor = await descriptorFromScannedQr(rawValue);
            cleanupQrScanner();
            await startPairing(descriptor);
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
        ? 'No se concedió acceso a la cámara. Puedes permitirlo e intentar de nuevo o usar código + clave.'
        : (error?.message || 'No se pudo iniciar la cámara. Usa código + clave.');
    }
  }

  async function renderManualPair() {
    if (!(await ensureMiniAliasChosen('manual'))) return;
    cleanupSession();
    morphShell(() => { body().innerHTML = `
      <div class="mini-p2p-step">
        ${backButton()}
        <div><h3>Vincular con SA</h3><p>Escribe el código de 6 dígitos y la clave que muestra SA. Si escaneaste el QR, este paso se completa automáticamente.</p></div>
        <div class="mini-p2p-field"><label for="mini-p2p-manual-code">Código</label><input id="mini-p2p-manual-code" class="mini-p2p-code" data-code inputmode="numeric" maxlength="7" placeholder="583 214"></div>
        <div class="mini-p2p-field"><label for="mini-p2p-manual-key">Clave</label><input id="mini-p2p-manual-key" class="mini-p2p-code" data-key maxlength="11" placeholder="ABCDE-23456" autocapitalize="characters"></div>
        <div class="mini-p2p-actions">${primary('Conectar con SA','data-connect','link')}</div>
        <div class="mini-p2p-status" data-pair-status hidden></div>
      </div>`; });
    body().querySelector('[data-back]').addEventListener('click', renderHome);
    const connectButton = body().querySelector('[data-connect]');
    connectButton.addEventListener('click', async () => {
      if (connectButton.disabled) return;
      connectButton.disabled = true;
      connectButton.setAttribute('aria-busy', 'true');
      connectButton.textContent = 'Conectando…';
      try {
        const descriptor = await core.pairDescriptorFromManual(body().querySelector('[data-code]').value, body().querySelector('[data-key]').value);
        await startPairing(descriptor);
      } catch (error) {
        const box = body()?.querySelector('[data-pair-status]');
        if (box) { box.hidden = false; box.classList?.add?.('is-error'); box.textContent = error.message; }
        if (connectButton.isConnected) {
          connectButton.disabled = false;
          connectButton.removeAttribute('aria-busy');
          connectButton.textContent = 'Conectar con SA';
        }
      }
    });
  }

  async function startPairing(descriptor) {
    try {
      const gateSelf = await identityStore.getSelf();
      if (!isValidChosenMiniAlias(gateSelf?.displayName)) {
        await renderMiniAliasSetup({ type: 'pair', descriptor });
        return;
      }
    } catch (_) {
      await renderMiniAliasSetup({ type: 'pair', descriptor });
      return;
    }
    cleanupSession();
    shell();
    if (descriptor.expiresAt !== undefined && Number(descriptor.expiresAt) <= Date.now()) throw new Error('La sesión de emparejamiento expiró.');
    if (!body().querySelector('[data-pair-status]')) {
      morphShell(() => { body().innerHTML = `<div class="mini-p2p-step"><div><h3>Vincular con ${esc(descriptor.issuerName || 'SA')}</h3><p>Conectando mediante el vínculo seguro.</p></div><div class="mini-p2p-status" data-pair-status>Buscando SA…</div><div class="mini-p2p-actions">${secondary('Cancelar','data-cancel')}</div></div>`; });
      body().querySelector('[data-cancel]').addEventListener('click', renderHome);
    } else {
      body().querySelector('[data-pair-status]').textContent = 'Buscando SA…';
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
        const box=body()?.querySelector('[data-pair-status]');
        if (!box) return;
        if (error) {
          box.textContent='Error: '+error.message;
          const retry=body()?.querySelector('[data-connect]');
          if (retry) { retry.disabled=false; retry.removeAttribute('aria-busy'); retry.textContent='Conectar con SA'; }
        } else if (status === 'connected') box.textContent='Canal conectado. Verificando identidad…';
        else if (status === 'connecting' || status === 'new') box.textContent='Negociando conexión…';
      },
      onChannel: channel => {
        activeChannel = channel;
        pairing.attachPairing(channel, {
          self, descriptor, initiator: false, store: identityStore,
          onCandidate: ({ remote, sas, accept, reject }) => renderPairConfirmation(remote, sas, accept, reject),
          onLinked: peer => {
            armRosterReceiver(channel, peer);
            armAttendanceResponder(channel, peer, self);
            renderLinkedWaiting(peer);
          },
          onRejected: () => renderError('SA rechazó el vínculo.'),
          onError: renderError
        });
      }
    });
  }

  function renderPairConfirmation(remote, sas, accept, reject) {
    const box=body()?.querySelector('[data-pair-status]');
    if (!box) return;
    box.innerHTML = `<div class="mini-p2p-step"><div><strong>${esc(remote.displayName)}</strong> quiere vincularse.</div><span>Confirma que ambos dispositivos muestran el mismo código:</span><strong class="mini-p2p-sas">${esc(sas)}</strong><div class="mini-p2p-actions">${uiButton('Rechazar','data-reject','secondary')}${uiButton('Confirmar vínculo','data-accept','primary','link')}</div></div>`;
    box.querySelector('[data-reject]').addEventListener('click', reject);
    box.querySelector('[data-accept]').addEventListener('click', async () => { box.textContent='Esperando confirmación de SA…'; await accept(); });
  }

  function renderLinkedWaiting(peer) {
    morphShell(() => { body().innerHTML = `<div class="mini-p2p-step"><div class="mini-p2p-result"><span class="mini-p2p-result-icon">${vectorIcon('check',18)}</span><div class="mini-p2p-result-copy"><h3>SA vinculado</h3><p><strong>${esc(peerName(peer))}</strong> quedó reconocido por este Mini.</p></div></div><div class="mini-p2p-status" data-receive-state>Esperando roster en esta conexión…</div><div class="mini-p2p-actions">${secondary('Terminar','data-finish')}</div></div>`; });
    body().querySelector('[data-finish]').addEventListener('click', renderHome);
    try { refreshMiniP2PHeader().catch(() => {}); } catch (_) {}
    try {
      const peerId = String(peer?.peerId || '').trim();
      signalTerminalSuccess(peerId ? ('pair-linked:' + peerId) : 'pair-linked', { title: 'SA vinculado', detail: peerName(peer) + ' quedó vinculado.' });
      recordP2PActivity('peer-linked', peer, peerName(peer) + ' quedó vinculado a este Mini.', peerId ? ('peer-linked:' + peerId) : '');
    } catch (_) {}
  }

  function renderError(error) {
    const message=error?.message || String(error || 'Error P2P');
    const box=body()?.querySelector('[data-pair-status]') || body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
    if (box) { box.classList?.add?.('is-error'); box.innerHTML = `<strong>Error:</strong> ${esc(message)}`; }
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
      ? `Esperar asistencia de ${esc(peerName(peer))}`
      : `Esperar roster de ${esc(peerName(peer))}`;
    const subtitle = isAttendance
      ? 'Ahora en SA selecciona este Mini y solicita la asistencia.'
      : 'Ahora en SA selecciona este Mini y pulsa “Enviar roster”.';
    const modeBadge = `<div class="mini-p2p-mode-chip">${vectorIcon(isAttendance ? 'attendance' : 'users', 15)}<span>${isAttendance ? 'Asistencia' : 'Personal / Roster'}</span></div>`;
    const modeHelp = isAttendance
      ? '<p class="mini-p2p-footnote">Este Mini responderá automáticamente a las solicitudes de asistencia enviadas por este SA.</p>'
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
                if(box) { box.classList?.remove?.('is-error'); box.innerHTML=statusMessage('check','SA autenticado','Esperando roster…'); }
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
      onResponseSent: wrappedSent
    });
  }

  function armRosterReceiver(channel, peer, options = {}) {
    const background = options.background === true;
    const receiver=core.createTransferReceiver({
      channel,
      onProgress:progress=>{ if (background) return; const box=body()?.querySelector('[data-receive-state]')||body()?.querySelector('[data-wait-status]');if(box)box.textContent='Recibiendo roster… '+Math.round(progress*100)+'%';},
      onError:error=>{ if (!background) renderError(error); },
      onComplete:result=>stageReceivedRoster(result,peer,channel,{ background })
    });
    channel.addEventListener('message',event=>{
      const control=core.parseControl(event.data);
      if(control)return;
      receiver(event);
    });
  }

  function passiveBackoffDelayMs(attempt) {
    const safeAttempt = Number.isSafeInteger(attempt) && attempt >= 0 ? Math.min(attempt, 5) : 0;
    const delay = PASSIVE_BASE_DELAY_MS * (2 ** safeAttempt);
    return Math.min(PASSIVE_MAX_DELAY_MS, delay);
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
    try { return getAllStaged().length; } catch (_) { return 0; }
  }
  function armPassiveChannel(channel, peer, self) {
    armRosterReceiver(channel, peer);
    const detach = armAttendanceResponder(channel, peer, self, {});
    sendAttendanceReady(channel);
    return detach;
  }
  function schedulePassiveRetry(peer, attempt) {
    const peerId = String(peer?.peerId || '').trim();
    if (!peerId) return;
    const existing = passivePeerListeners.get(peerId);
    if (!existing || existing.stopped) return;
    const nextAttempt = Number.isSafeInteger(attempt) ? attempt + 1 : 1;
    const delay = passiveBackoffDelayMs(nextAttempt);
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
        ensurePeerListener(peer, nextAttempt).catch(() => {});
      }, delay);
    } catch (_) { return; }
    existing.retryTimer = timer;
    existing.retryCount = nextAttempt;
  }
  async function ensurePeerListener(peer, attempt = 0) {
    const peerId = String(peer?.peerId || '').trim();
    if (!peerId || peer?.peerApp !== 'sa' || !peer?.linkToken) throw new Error('SA vinculado no encontrado.');
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
                refreshMiniP2PHeader().catch(() => {});
              } catch (_) {
                schedulePassiveRetry(peer, live.retryCount || 0);
              }
            },
            onError: () => { schedulePassiveRetry(peer, (passivePeerListeners.get(peerId)?.retryCount) || attempt); }
          });
        }
      });
      const live = passivePeerListeners.get(peerId);
      if (!live || live.stopped) { try { session?.close?.(); } catch (_) {} return live || entry; }
      live.session = session;
      live.detach = () => { try { session?.close?.(); } catch (_) {} };
      return live;
    } catch (_) {
      schedulePassiveRetry(peer, attempt);
      return passivePeerListeners.get(peerId) || entry;
    }
  }
  async function startPassiveInbox() {
    passiveInboxStarted = true;
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
      if (!background && isTransferModalOpen()) renderRosterReceived();
      else {
        try {
          const display = peer ? peerName(peer) : 'SA';
          toast('Roster de ' + display + ' listo para revisar en Transferencias.');
        } catch (_) {}
      }
    }catch(error){
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
    const name=peerName(pendingRoster.peer);
    morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step">${backButton()}<div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('users',15)}<span>Personal / Roster</span></div><span class="mini-roster-step-count">1 / 3</span></div>${statusMessage('check','Roster recibido y verificado',`${pendingRoster.employeeCount} empleados de ${name}. Aún no se ha aplicado nada.`)}<div class="mini-p2p-actions">${primary('Revisar cambios','data-review-roster','chevronRight')}${secondary('Cancelar','data-cancel-review','close')}</div></div>`;});
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
      ...model.updates.map(x=>`<li><strong>${esc(x.incoming.name)}</strong><span>${x.changes.map(esc).join(' · ')}</span></li>`),
      ...model.creates.map(x=>`<li><strong>${esc(x.incoming.name)}</strong><span>Se agregará a Mini · ficha ${esc(x.incoming.number)}</span></li>`)
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
    const versionBanner = `<div class="mini-roster-version is-${esc(versionOutcome)}" role="status" aria-live="polite">${vectorIcon(versionIcon(versionOutcome),16)}<div><strong>${esc(versionLabel(versionOutcome))}</strong><span>${esc(versionDetail(versionOutcome))}</span></div></div>`;
    const hint = !versionCanApply ? versionDetail(versionOutcome) : baseHint;
    const canApply = allHandled && versionCanApply;
    morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step mini-roster-review">${backButton('Roster recibido')}<div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('users',15)}<span>REVISIÓN SA</span></div><span class="mini-roster-step-count">2 / 3</span></div><div><h3>Revisa qué cambiará en Mini</h3><p>Compara el roster validado con el personal actual antes de guardar.</p></div>${versionBanner}<div class="mini-roster-metrics">${rosterMetric('add','Nuevos',model.creates.length,'is-info')}${rosterMetric('edit','Modificados',model.updates.length,'is-warning')}${rosterMetric('check','Sin cambios',model.unchangedCount,'is-success')}${rosterMetric('conflict','Conflictos',conflictCount,conflictCount?'is-danger':'is-success')}</div>${model.missing.length?`<div class="mini-roster-notice">${vectorIcon('warning',17)}<div><strong>${model.missing.length} empleado${model.missing.length===1?'':'s'} ya no aparece${model.missing.length===1?'':'n'} en este roster</strong><span>Mini los conservará. La sincronización de roster no elimina historial ni personal automáticamente.</span></div></div>`:''}${(detailRows||missingRows)?`<details class="mini-roster-details"><summary>${vectorIcon('inbox',16)}<span>Ver detalle de cambios</span>${countBadge(model.updates.length+model.creates.length+model.missing.length,'cambios')}${vectorIcon('chevronRight',15)}</summary><ul>${detailRows}${missingRows}</ul></details>`:''}${conflicts?`<div class="mini-roster-conflicts"><div class="mini-roster-section-head"><h4>Resolver vínculos</h4>${countBadge(conflictCount,'conflictos')}<span>${handled} / ${conflictCount}</span></div>${conflicts}</div>`:''}<footer class="mini-roster-footer"><span class="mini-roster-hint">${esc(hint)}</span>${primary('Aplicar roster en Mini','data-apply-roster '+(canApply?'':'disabled'),'check')}</footer></div>`;});
    body().querySelector('[data-back]')?.addEventListener('click',renderRosterReceived);
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
      const result=await root.applyReviewedSaRoster({text:pendingRoster.text,confirmedLinks});
      const skipped=result.skippedCount||0;
      const model=pendingRoster.reviewModel;
      const linkedCount=confirmedLinks.length;
      const appliedDigest = String(pendingRoster.sha256 || '').toLowerCase().trim();
      morphShell(()=>{body().innerHTML=`<div class="mini-p2p-step mini-roster-result"><div class="mini-roster-flow-head"><div class="mini-p2p-mode-chip">${vectorIcon('check',15)}<span>APLICADO</span></div><span class="mini-roster-step-count">3 / 3</span></div><div class="mini-p2p-result"><span class="mini-p2p-result-icon">${vectorIcon('check',20)}</span><div class="mini-p2p-result-copy"><h3>Roster aplicado</h3><p>Mini conserva los IDs locales y la asistencia histórica vinculada.</p></div></div><div class="mini-roster-metrics">${rosterMetric('add','Agregados',result.createdCount||0,'is-info')}${rosterMetric('edit','Con cambios',(model?.updates?.length||0)+linkedCount,'is-success')}${rosterMetric('check','Sin cambios',model?.unchangedCount||0,'is-success')}${rosterMetric('warning','Omitidos',skipped,skipped?'is-warning':'is-success')}</div>${skipped?`<div class="mini-roster-notice">${vectorIcon('warning',17)}<div><strong>${skipped} registro${skipped===1?' quedó':'s quedaron'} sin vincular</strong><span>Puedes volver a recibir el roster y resolverlos más adelante.</span></div></div>`:''}<div class="mini-p2p-actions">${primary('Finalizar','data-finish-roster','check')}</div></div>`;});
      try { signalTerminalSuccess(appliedDigest ? ('roster-applied:' + appliedDigest) : 'roster-applied', { title: 'Roster aplicado', detail: String(result.createdCount || 0) + ' agregados en Mini.' }); } catch (_) {}
      try {
        const appliedPeer = pendingRoster.peer || null;
        const appliedName = appliedPeer ? peerName(appliedPeer) : 'SA';
        recordP2PActivity('roster-applied', appliedPeer, 'Roster de ' + appliedName + ' aplicado con ' + String(result.createdCount || 0) + ' agregados.', appliedDigest ? ('roster-applied:' + appliedDigest) : '');
      } catch (_) {}
      try { stagedStore?.clear?.(pendingRoster.peer?.peerId); } catch (_) {}
      try { activityStore?.markStagedReviewed?.(pendingRoster.peer?.peerId); } catch (_) {}
      pendingRoster=null;
      try { await refreshMiniP2PHeader(); } catch (_) {}
      body().querySelector('[data-finish-roster]')?.addEventListener('click',renderHome);
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

  async function openP2PTransferModal(){await renderHome();}
  async function openP2PPairingScanner(){await renderQrScanner();}
  root.openP2PTransferModal=openP2PTransferModal;
  root.openP2PPairingScanner=openP2PPairingScanner;
  root.closeP2PTransferModal=()=>closeTransferModal();
  root.waitTrustedTransfer=waitTrustedTransfer;
  root.waitTrustedRoster=waitTrustedRoster;
  root.waitTrustedAttendance=waitTrustedAttendance;
  root.refreshMiniP2PHeader=refreshMiniP2PHeader;
  root.MiniP2PAlias={isValidChosenMiniAlias, shortHeaderLabel, MINI_DEFAULT_ALIAS: 'Mini - Dispositivo'};
  root.MiniP2PRosterVersions={labels: ROSTER_VERSION_LABELS, labelFor: versionLabel, iconFor: versionIcon, detailFor: versionDetail, blockedMessageFor: versionBlockedMessage, classify: classifyReviewedRosterForUi, getGuard: getVersionGuard};
  root.MiniP2PSuccessFeedback={ signal: signalTerminalSuccess, reset: resetTerminalSuccessSignals, chime: playSuccessChime, badge: countBadge, has: (value) => { try { return firedTerminalSuccessKeys.has(String(value || '').trim()); } catch (_) { return false; } } };
  root.MiniP2PPassiveInbox={ start: startPassiveInbox, ensure: ensurePeerListener, stop: stopPeerListener, backoffDelayMs: passiveBackoffDelayMs, isStarted: () => passiveInboxStarted, listeners: passivePeerListeners, armPassiveChannel };
  root.MiniP2PActivityUi={ stagedCount: getStagedPendingCount, staged: getEffectiveStaged, stagedList: getAllStaged, activities: getRecentP2PActivities, reviewStaged: reviewPersistedStagedRoster };

  const boot=()=>{ refreshMiniP2PHeader().catch(()=>{}); try { startPassiveInbox().catch(()=>{}); } catch (_) {} return consumePairHash().catch(()=>{}); };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  root.addEventListener('hashchange',()=>consumePairHash().catch(()=>{}));
})(window);
