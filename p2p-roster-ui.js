(function (root) {
  'use strict';
  const core = root.SaMiniP2P;
  const pairing = root.SaMiniP2PPairing;
  const aliases = root.SaMiniP2PPeerAliases;
  if (!core || !pairing || !aliases) throw new Error('P2P core/pairing/alias store must load before P2P roster UI.');

  const MODAL_ID = 'mini-p2p-transfer-modal';
  const identityStore = core.makeIdentityStore('mini', 'Mini - Dispositivo');
  const aliasStore = aliases.createPeerAliasStore({ storageKey: 'mini_p2p_peer_aliases_v1' });
  let activeSession = null;
  let activeChannel = null;
  let pendingRoster = null;
  let activeAttendanceResponderDetach = null;
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
    el.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="mini-p2p-title" style="width:min(650px,100%);max-height:92vh;overflow:auto;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);box-sizing:border-box;">
        <header style="display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:inherit;z-index:2">
          <span style="font-size:24px">⇄</span>
          <div style="flex:1"><strong id="mini-p2p-title">Transferencias directas</strong><div style="font-size:12px;color:var(--text-muted)">Mini ↔ SA · WebRTC</div></div>
          <button type="button" data-p2p-close aria-label="Cerrar" title="Cerrar" style="border:0;background:transparent;color:inherit;font-size:28px;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">×</button>
        </header>
        <div data-p2p-body style="padding:18px 20px"></div>
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

  function primary(label, attrs = '') {
    return `<button type="button" class="btn-full btn-primary" ${attrs} style="margin-top:0;min-height:44px">${label}</button>`;
  }
  function disabledCard(title, detail) {
    return `<button type="button" disabled aria-disabled="true" style="width:100%;text-align:left;border:1px solid var(--border-color);border-radius:14px;padding:14px;opacity:.5;background:var(--input-bg);color:var(--text-muted);cursor:not-allowed;min-height:44px"><strong>${title}</strong><div style="font-size:12px;margin-top:4px">${detail} · Próximamente</div></button>`;
  }

  async function renderHome() {
    shell();
    cleanupSession();
    pendingRoster = null;
    const self = await identityStore.getSelf();
    const peers = sortPeersByRecentActivity((await identityStore.listPeers()).filter(p => p.peerApp === 'sa'));
    const peerRows = peers.length ? peers.map(peer => {
      const alias = aliasStore.getAlias(peer.peerId);
      const original = peerOriginalName(peer);
      const linked = formatPeerDate(peer.linkedAt);
      const lastSeen = formatPeerDate(peer.lastSeenAt || peer.linkedAt);
      const originalLine = alias ? `<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Original: ${esc(original)}</div>` : '';
      return `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:12px;padding:12px;background:var(--input-bg)">
        <div style="flex:1;min-width:180px"><strong>${esc(peerName(peer))}</strong>${originalLine}<div style="font-size:11px;color:var(--text-muted);line-height:1.35">Última conexión: ${esc(lastSeen)} · Vinculado: ${esc(linked)}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" data-rename-peer="${esc(peer.peerId)}" aria-label="Cambiar nombre de ${esc(peerName(peer))}" title="Cambiar nombre" style="border:1px solid var(--border-color);border-radius:10px;padding:9px;background:var(--card-bg);color:var(--accent-color);cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">✎</button>
          <button type="button" data-wait-peer="${esc(peer.peerId)}" class="btn-primary" style="border:0;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer;min-height:44px;margin-top:0">Esperar roster</button>
          <button type="button" data-wait-attendance="${esc(peer.peerId)}" class="btn-secondary" style="border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer;min-height:44px;margin-top:0;color:var(--accent-color)">Esperar asistencia</button>
          <button type="button" data-unlink="${esc(peer.peerId)}" aria-label="Desvincular" title="Desvincular" style="border:1px solid var(--border-color);border-radius:10px;padding:9px;background:var(--card-bg);color:var(--danger-color);cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">×</button>
        </div>
      </div>`;
    }).join('') : '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Aún no hay SA vinculados.</div>';

    morphShell(() => { body().innerHTML = `
      <div style="display:grid;gap:10px">
        <div style="border:1px solid var(--border-color);border-radius:14px;padding:14px;background:var(--input-bg)"><strong>👥 Personal / Roster</strong><div style="font-size:12px;margin-top:4px;color:var(--text-muted)">Disponible ahora · recibir desde SA</div></div>
        <div style="border:1px solid var(--border-color);border-radius:14px;padding:14px;background:var(--input-bg)"><strong>🕒 Asistencia</strong><div style="font-size:12px;margin-top:4px;color:var(--text-muted)">Disponible ahora · responder solicitud de SA</div></div>
        ${disabledCard('💾 Backup','Mini ↔ Mini')}
        ${disabledCard('📄 Documentos / Archivos','Reservado para una fase futura')}
      </div>
      <div style="margin-top:18px;display:flex;justify-content:space-between;gap:10px"><strong>SA vinculados</strong><span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px">Este Mini: <strong>${esc(self.displayName)}</strong><button type="button" data-rename-self aria-label="Cambiar nombre de este Mini" title="Cambiar nombre de este Mini" style="border:0;background:transparent;color:var(--accent-color);cursor:pointer;padding:6px 8px;font-size:14px;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">✎</button></span></div>
      <div style="display:grid;gap:8px;margin-top:10px">${peerRows}</div>
      <div style="margin-top:16px;display:grid;gap:8px">
        ${primary('Escanear QR de SA','data-scan-pair')}
        <button type="button" data-manual-pair class="btn-full btn-secondary" style="min-height:44px;margin-top:0">Usar código + clave</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);line-height:1.45;margin-top:12px">El QR evita escribir código y clave. La entrada manual sigue disponible como respaldo. Recibir un roster no lo importa automáticamente.</p>`; });
    body().querySelector('[data-scan-pair]').addEventListener('click', renderQrScanner);
    body().querySelector('[data-manual-pair]').addEventListener('click', renderManualPair);
    body().querySelector('[data-rename-self]')?.addEventListener('click', renderSelfNameEditor);
    body().querySelectorAll('[data-rename-peer]').forEach(btn => btn.addEventListener('click', () => renderPeerAliasEditor(btn.dataset.renamePeer)));
    body().querySelectorAll('[data-wait-peer]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitPeer, 'roster')));
    body().querySelectorAll('[data-wait-attendance]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitAttendance, 'attendance')));
    body().querySelectorAll('[data-unlink]').forEach(btn => btn.addEventListener('click', async () => {
      const peerId = btn.dataset.unlink;
      const peer = await identityStore.getPeer(peerId);
      const name = peer ? peerName(peer) : 'este SA';
      if (typeof root.showConfirm !== 'function') {
        toast('Confirmación no disponible en este entorno.');
        return;
      }
      const confirmed = await root.showConfirm(`¿Desvincular a ${name}?`, {
        title: 'Desvincular SA',
        confirmText: 'Desvincular',
        danger: true
      });
      if (!confirmed) return;
      await identityStore.removePeer(peerId);
      aliasStore.removeAlias(peerId);
      renderHome();
    }));
  }

  async function renderSelfNameEditor() {
    const self = await identityStore.getSelf();
    morphShell(() => { body().innerHTML = `
      <button type="button" data-back aria-label="Volver" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 0;display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px">← Volver</button>
      <h3 style="margin:0 0 6px">Nombre de este Mini</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Este es el nombre que este dispositivo presenta en futuros emparejamientos.</p>
      <label for="mini-p2p-self-name" style="display:block;font-size:12px;margin-bottom:5px">Nombre del dispositivo</label>
      <input id="mini-p2p-self-name" data-self-name maxlength="80" value="${esc(self.displayName)}" placeholder="Ej: Mini almacén" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-color);min-height:44px">
      <p style="font-size:11px;line-height:1.45;color:var(--text-muted);margin-top:8px">Cambiarlo no modifica deviceId, claves ni vínculos existentes. Los aliases personalizados guardados en otros dispositivos tampoco cambian.</p>
      <div style="margin-top:14px">${primary('Guardar nombre del Mini','data-save-self-name')}</div>`; });
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
      <button type="button" data-back aria-label="Volver" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 0;display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px">← Volver</button>
      <h3 style="margin:0 0 6px">Nombre de esta conexión</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Nombre original: <strong>${esc(original)}</strong></p>
      <label for="mini-p2p-peer-alias" style="display:block;font-size:12px;margin-bottom:5px">Nombre personalizado</label>
      <input id="mini-p2p-peer-alias" data-peer-alias maxlength="64" value="${esc(currentAlias)}" placeholder="Ej: SA oficina" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-color);min-height:44px">
      <p style="font-size:11px;line-height:1.45;color:var(--text-muted);margin-top:8px">Este nombre se guarda sólo en este Mini. No cambia el vínculo, la identidad del dispositivo ni sus claves de seguridad.</p>
      <div style="display:grid;gap:8px;margin-top:14px">
        ${primary('Guardar nombre','data-save-alias')}
        <button type="button" data-clear-alias class="btn-full btn-secondary" style="margin-top:0;min-height:44px">Usar nombre original</button>
      </div>`; });
    const input = body().querySelector('[data-peer-alias]');
    input?.focus();
    input?.select();
    body().querySelector('[data-back]').addEventListener('click', renderHome);
    body().querySelector('[data-save-alias]').addEventListener('click', () => {
      aliasStore.setAlias(peer.peerId, input.value);
      renderHome();
    });
    body().querySelector('[data-clear-alias]').addEventListener('click', () => {
      aliasStore.removeAlias(peer.peerId);
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
    cleanupSession();
    shell();
    morphShell(() => { body().innerHTML = `
      <button type="button" data-back aria-label="Volver" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 0;display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px">← Volver</button>
      <h3 style="margin:0 0 6px">Escanear QR de SA</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Apunta la cámara al QR que aparece en SA. Mini leerá el código y la clave automáticamente.</p>
      <div style="position:relative;border:1px solid var(--border-color);border-radius:14px;overflow:hidden;background:var(--input-bg);aspect-ratio:1/1;max-height:56vh">
        <video data-qr-video playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
        <div style="position:absolute;inset:14%;border:2px solid var(--accent-color);border-radius:18px;pointer-events:none"></div>
      </div>
      <div data-qr-status role="status" aria-live="polite" style="font-size:12px;color:var(--text-muted);margin-top:10px">Preparando cámara…</div>
      <button type="button" data-manual-fallback class="btn-full btn-secondary" style="min-height:44px;margin-top:12px">Usar código + clave</button>`; });

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

  function renderManualPair() {
    cleanupSession();
    morphShell(() => { body().innerHTML = `
      <button type="button" data-back aria-label="Volver" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 0;display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px">← Volver</button>
      <h3 style="margin:0 0 6px">Vincular con SA</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-top:0">Escribe el código de 6 dígitos y la clave que muestra SA. Si escaneaste el QR, este paso se completa automáticamente.</p>
      <label for="mini-p2p-manual-code" style="display:block;font-size:12px;margin:14px 0 5px">Código</label>
      <input id="mini-p2p-manual-code" data-code inputmode="numeric" maxlength="7" placeholder="583 214" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-color);font-size:18px;letter-spacing:3px;min-height:44px">
      <label for="mini-p2p-manual-key" style="display:block;font-size:12px;margin:14px 0 5px">Clave</label>
      <input id="mini-p2p-manual-key" data-key maxlength="11" placeholder="ABCDE-23456" autocapitalize="characters" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-color);font-size:17px;letter-spacing:2px;text-transform:uppercase;min-height:44px">
      <div style="margin-top:16px">${primary('Conectar con SA','data-connect')}</div>
      <div data-pair-status style="font-size:12px;margin-top:12px"></div>`; });
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
        if (box) box.textContent = error.message;
        if (connectButton.isConnected) {
          connectButton.disabled = false;
          connectButton.removeAttribute('aria-busy');
          connectButton.textContent = 'Conectar con SA';
        }
      }
    });
  }

  async function startPairing(descriptor) {
    cleanupSession();
    shell();
    if (descriptor.expiresAt !== undefined && Number(descriptor.expiresAt) <= Date.now()) throw new Error('La sesión de emparejamiento expiró.');
    if (!body().querySelector('[data-pair-status]')) {
      morphShell(() => { body().innerHTML = `<h3 style="margin-top:0">Vincular con ${esc(descriptor.issuerName || 'SA')}</h3><p style="font-size:13px;color:var(--text-muted)">Conectando mediante el vínculo del QR…</p><div data-pair-status style="padding:14px;border-radius:12px;background:var(--input-bg);border:1px solid var(--border-color);font-size:13px">Buscando SA…</div><button type="button" data-cancel class="btn-full btn-secondary" style="min-height:44px;margin-top:10px">Cancelar</button>`; });
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
    box.innerHTML = `<strong>${esc(remote.displayName)}</strong> quiere vincularse.<br><span style="font-size:12px;color:var(--text-muted)">Confirma que ambos muestran:</span><div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:8px 0;color:var(--accent-color)">${esc(sas)}</div><div style="display:flex;gap:8px"><button type="button" data-reject class="btn-full btn-secondary" style="flex:1;min-height:44px;margin-top:0;color:var(--danger-color);border-color:var(--danger-color)">Rechazar</button><button type="button" data-accept class="btn-full btn-primary" style="flex:1;min-height:44px;margin-top:0">Confirmar vínculo</button></div>`;
    box.querySelector('[data-reject]').addEventListener('click', reject);
    box.querySelector('[data-accept]').addEventListener('click', async () => { box.textContent='Esperando confirmación de SA…'; await accept(); });
  }

  function renderLinkedWaiting(peer) {
    morphShell(() => { body().innerHTML = `<h3 style="margin-top:0">✓ SA vinculado</h3><p><strong>${esc(peerName(peer))}</strong> quedó reconocido por este Mini.</p><div data-receive-state style="padding:14px;border-radius:12px;background:var(--input-bg);border:1px solid var(--border-color);font-size:13px">Esperando roster en esta conexión…</div><button type="button" data-finish class="btn-full btn-secondary" style="min-height:44px;margin-top:10px">Terminar</button>`; });
    body().querySelector('[data-finish]').addEventListener('click', renderHome);
  }

  function renderError(error) {
    const message=error?.message || String(error || 'Error P2P');
    const box=body()?.querySelector('[data-pair-status]') || body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
    if (box) box.innerHTML = `<strong style="color:var(--danger-color)">Error:</strong> ${esc(message)}`;
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
    if (bottomCancel) bottomCancel.style.display = 'none';
    box.innerHTML = `
      <div style="color:var(--danger-color);font-weight:700;margin-bottom:6px">Error de conexión</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${esc(message)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-retry-wait class="btn-full btn-primary" style="flex:1;min-height:44px;margin-top:0">Reintentar</button>
        <button type="button" data-cancel-wait class="btn-full btn-secondary" style="flex:1;min-height:44px;margin-top:0">Cancelar</button>
      </div>`;
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
    const modeBadge = isAttendance
      ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;background:var(--input-bg);border:1px solid var(--border-color);font-size:12px;font-weight:700;color:var(--accent-color);margin-bottom:12px"><span>🕒</span> Modo: Asistencia</div>`
      : `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;background:var(--input-bg);border:1px solid var(--border-color);font-size:12px;font-weight:700;color:var(--accent-color);margin-bottom:12px"><span>👥</span> Modo: Personal / Roster</div>`;
    const modeHelp = isAttendance
      ? '<p style="font-size:12px;color:var(--text-muted);margin:0 0 14px">Este Mini responderá automáticamente a las solicitudes de asistencia enviadas por este SA.</p>'
      : '<p style="font-size:12px;color:var(--text-muted);margin:0 0 14px">Recibirás la lista de personal para revisarla antes de guardar.</p>';

    morphShell(() => { body().innerHTML = `<button type="button" data-back aria-label="Volver" style="border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 0;display:inline-flex;align-items:center;gap:6px;font-size:14px;min-height:44px">← Volver</button><div style="margin-top:4px">${modeBadge}</div><h3 style="margin:0 0 8px">${title}</h3><p style="font-size:13px;opacity:.7;margin:0 0 6px">${subtitle}</p>${modeHelp}<div data-wait-status style="padding:14px;border-radius:12px;background:var(--input-bg);border:1px solid var(--border-color);font-size:13px;line-height:1.45">Esperando conexión autenticada…</div><button type="button" data-cancel class="btn-full btn-secondary" style="min-height:44px;margin-top:14px">Cancelar espera</button>`; });
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
          box.textContent='✓ Respuesta de asistencia enviada. Conexión finalizada.';
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
                  onResponseSent: () => {
                    attendanceResponseSent = true;
                    const liveBox=body()?.querySelector('[data-wait-status]');
                    if(liveBox) liveBox.textContent='✓ Respuesta de asistencia enviada. SA la validará antes de incorporarla.';
                  }
                });
                if (typeof activeAttendanceResponderDetach !== 'function') {
                  throw new Error('El módulo de asistencia no está disponible en este Mini.');
                }
                // The responder listener is armed before Mini announces readiness.
                sendAttendanceReady(channel);
                if(box) box.textContent = '✓ SA autenticado. Listo para recibir la solicitud de asistencia…';
              } else {
                armRosterReceiver(channel,peer);
                if(box) box.textContent = '✓ SA autenticado. Esperando roster…';
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

  function armAttendanceResponder(channel, peer, self, callbacks = {}) {
    if (!root.AttendanceExport || typeof root.AttendanceExport.attachAttendanceResponder !== 'function') return null;
    const deviceId = self?.deviceId || undefined;
    return root.AttendanceExport.attachAttendanceResponder(channel, peer, {
      get repository() { return root.attendanceRepository; },
      get employeeRepository() { return root.employeeRepository; },
      get attendanceData() { return root.attendanceData; },
      get employees() { return root.users; },
      deviceId,
      onResponseSent: callbacks.onResponseSent
    });
  }

  function armRosterReceiver(channel, peer) {
    const receiver=core.createTransferReceiver({
      channel,
      onProgress:progress=>{const box=body()?.querySelector('[data-receive-state]')||body()?.querySelector('[data-wait-status]');if(box)box.textContent='Recibiendo roster… '+Math.round(progress*100)+'%';},
      onError:renderError,
      onComplete:result=>stageReceivedRoster(result,peer,channel)
    });
    channel.addEventListener('message',event=>{
      const control=core.parseControl(event.data);
      if(control)return;
      receiver(event);
    });
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

  async function stageReceivedRoster(result,peer,channel) {
    try {
      const parsed=validateRosterBeforeReview(result);
      pendingRoster={text:result.text,sha256:result.sha256,peer,employeeCount:Array.isArray(parsed.employees)?parsed.employees.length:0};
      core.sendControl(channel,'roster-staged',{
        transferId:result.transferId,
        sha256:result.sha256,
        kind:'roster',
        schema:'sa-roster/v1',
        validated:true
      });
      const box=body()?.querySelector('[data-receive-state]')||body()?.querySelector('[data-wait-status]');
      if(!box)return;
      box.innerHTML=`<strong style="color:var(--success-color)">✓ Roster recibido · SHA-256 verificado</strong><br><span style="font-size:12px;color:var(--text-muted)">${pendingRoster.employeeCount} empleados de ${esc(peerName(peer))}. Aún no se ha importado nada.</span><div style="margin-top:10px">${primary('Revisar roster en Mini','data-review-roster')}</div>`;
      box.querySelector('[data-review-roster]').addEventListener('click',reviewPendingRoster);
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

  function reviewPendingRoster() {
    if(!pendingRoster)return;
    const text=pendingRoster.text;
    pendingRoster=null;
    cleanupSession();
    modal()?.remove();
    if(typeof root.openImportEmployeesModal!=='function'||typeof root.validateImportTextarea!=='function'){
      toast('No se pudo abrir la revisión del roster.');return;
    }
    root.openImportEmployeesModal();
    const ta=document.getElementById('import-employees-textarea');
    if(!ta){toast('No se encontró el importador de personal.');return;}
    ta.value=text;
    root.validateImportTextarea(ta);
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
      morphShell(() => { body().innerHTML = `<h3>Vínculo QR inválido</h3><p>${esc(error.message||error)}</p><div>${primary('Volver','data-home')}</div>`; });
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

  const boot=()=>consumePairHash().catch(()=>{});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  root.addEventListener('hashchange',()=>consumePairHash().catch(()=>{}));
})(window);
