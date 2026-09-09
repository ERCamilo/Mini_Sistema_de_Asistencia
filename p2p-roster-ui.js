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

  function cleanupSession() {
    try { activeSession?.close?.(); } catch (_) {}
    activeSession = null;
    activeChannel = null;
  }

  function closeTransferModal(options = {}) {
    if (!options.keepSession) cleanupSession();
    modal()?.remove();
  }

  function shell() {
    if (modal()) return;
    const el = document.createElement('div');
    el.id = MODAL_ID;
    el.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="mini-p2p-title" style="width:min(650px,100%);max-height:92vh;overflow:auto;background:var(--bg-secondary,#fff);color:var(--text-primary,#111827);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);">
        <header style="display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border-color,rgba(148,163,184,.3));position:sticky;top:0;background:inherit;z-index:2">
          <span style="font-size:24px">⇄</span>
          <div style="flex:1"><strong id="mini-p2p-title">Transferencias directas</strong><div style="font-size:12px;opacity:.65">Mini ↔ SA · WebRTC</div></div>
          <button type="button" data-p2p-close aria-label="Cerrar" style="border:0;background:transparent;color:inherit;font-size:28px;cursor:pointer">×</button>
        </header>
        <div data-p2p-body style="padding:18px 20px"></div>
      </section>`;
    el.querySelector('[data-p2p-close]').addEventListener('click', () => closeTransferModal());
    el.addEventListener('click', e => { if (e.target === el) closeTransferModal(); });
    document.body.appendChild(el);
  }

  function primary(label, attrs = '') {
    return `<button type="button" ${attrs} style="width:100%;padding:12px;border:0;border-radius:12px;background:var(--primary-color,#2563eb);color:#fff;font-weight:800;cursor:pointer">${label}</button>`;
  }
  function disabledCard(title, detail) {
    return `<button type="button" disabled aria-disabled="true" style="width:100%;text-align:left;border:1px solid var(--border-color,rgba(148,163,184,.3));border-radius:14px;padding:14px;opacity:.45;background:var(--bg-tertiary,rgba(148,163,184,.08));color:inherit;cursor:not-allowed"><strong>${title}</strong><div style="font-size:12px;margin-top:4px">${detail} · Próximamente</div></button>`;
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
      const originalLine = alias ? `<div style="font-size:11px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Original: ${esc(original)}</div>` : '';
      return `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--border-color,rgba(148,163,184,.3));border-radius:12px;padding:12px">
        <div style="flex:1;min-width:180px"><strong>${esc(peerName(peer))}</strong>${originalLine}<div style="font-size:11px;opacity:.6;line-height:1.35">Última conexión: ${esc(lastSeen)} · Vinculado: ${esc(linked)}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" data-rename-peer="${esc(peer.peerId)}" aria-label="Cambiar nombre de ${esc(peerName(peer))}" title="Cambiar nombre" style="border:1px solid rgba(37,99,235,.32);border-radius:10px;padding:9px;background:transparent;color:var(--primary-color,#2563eb);cursor:pointer">✎</button>
          <button type="button" data-wait-peer="${esc(peer.peerId)}" style="border:0;border-radius:10px;padding:9px 11px;background:#16a34a;color:white;font-weight:700;cursor:pointer">Esperar roster</button>
          <button type="button" data-wait-attendance="${esc(peer.peerId)}" style="border:0;border-radius:10px;padding:9px 11px;background:var(--primary-color,#2563eb);color:white;font-weight:700;cursor:pointer">Esperar asistencia</button>
          <button type="button" data-unlink="${esc(peer.peerId)}" aria-label="Desvincular" style="border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:9px;background:transparent;color:#dc2626;cursor:pointer">×</button>
        </div>
      </div>`;
    }).join('') : '<div style="font-size:13px;opacity:.7;padding:8px 0">Aún no hay SA vinculados.</div>';

    body().innerHTML = `
      <div style="display:grid;gap:10px">
        <div style="border:1px solid rgba(37,99,235,.3);border-radius:14px;padding:14px;background:rgba(37,99,235,.08)"><strong>👥 Personal / Roster</strong><div style="font-size:12px;margin-top:4px">Disponible ahora · recibir desde SA</div></div>
        <div style="border:1px solid rgba(37,99,235,.3);border-radius:14px;padding:14px;background:rgba(37,99,235,.08)"><strong>🕒 Asistencia</strong><div style="font-size:12px;margin-top:4px">Disponible ahora · responder solicitud de SA</div></div>
        ${disabledCard('💾 Backup','Mini ↔ Mini')}
        ${disabledCard('📄 Documentos / Archivos','Reservado para una fase futura')}
      </div>
      <div style="margin-top:18px;display:flex;justify-content:space-between;gap:10px"><strong>SA vinculados</strong><span style="font-size:11px;opacity:.72;display:flex;align-items:center;gap:5px">Este Mini: <strong>${esc(self.displayName)}</strong><button type="button" data-rename-self aria-label="Cambiar nombre de este Mini" title="Cambiar nombre de este Mini" style="border:0;background:transparent;color:var(--primary-color,#2563eb);cursor:pointer;padding:2px 4px;font-size:13px">✎</button></span></div>
      <div style="display:grid;gap:8px;margin-top:10px">${peerRows}</div>
      <div style="margin-top:16px">${primary('Vincular con SA usando código + clave','data-manual-pair')}</div>
      <p style="font-size:11px;opacity:.65;line-height:1.45;margin-top:12px">Recibir un roster no lo importa automáticamente. Primero se verifica SHA-256 y luego se abre la revisión normal de Mini.</p>`;
    body().querySelector('[data-manual-pair]').addEventListener('click', renderManualPair);
    body().querySelector('[data-rename-self]')?.addEventListener('click', renderSelfNameEditor);
    body().querySelectorAll('[data-rename-peer]').forEach(btn => btn.addEventListener('click', () => renderPeerAliasEditor(btn.dataset.renamePeer)));
    body().querySelectorAll('[data-wait-peer]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitPeer, 'roster')));
    body().querySelectorAll('[data-wait-attendance]').forEach(btn => btn.addEventListener('click', () => waitTrustedTransfer(btn.dataset.waitAttendance, 'attendance')));
    body().querySelectorAll('[data-unlink]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('¿Desvincular este SA?')) return;
      const peerId = btn.dataset.unlink;
      await identityStore.removePeer(peerId);
      aliasStore.removeAlias(peerId);
      renderHome();
    }));
  }

  async function renderSelfNameEditor() {
    const self = await identityStore.getSelf();
    body().innerHTML = `
      <button type="button" data-back style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 12px">← Volver</button>
      <h3 style="margin:0 0 6px">Nombre de este Mini</h3>
      <p style="font-size:13px;opacity:.7;margin:0 0 14px">Este es el nombre que este dispositivo presenta en futuros emparejamientos.</p>
      <label for="mini-p2p-self-name" style="display:block;font-size:12px;margin-bottom:5px">Nombre del dispositivo</label>
      <input id="mini-p2p-self-name" data-self-name maxlength="80" value="${esc(self.displayName)}" placeholder="Ej: Mini almacén" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color,#cbd5e1);border-radius:10px;background:var(--bg-primary,#fff);color:inherit">
      <p style="font-size:11px;line-height:1.45;opacity:.65">Cambiarlo no modifica deviceId, claves ni vínculos existentes. Los aliases personalizados guardados en otros dispositivos tampoco cambian.</p>
      <div style="margin-top:14px">${primary('Guardar nombre del Mini','data-save-self-name')}</div>`;
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
    body().innerHTML = `
      <button type="button" data-back style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 12px">← Volver</button>
      <h3 style="margin:0 0 6px">Nombre de esta conexión</h3>
      <p style="font-size:13px;opacity:.7;margin:0 0 14px">Nombre original: <strong>${esc(original)}</strong></p>
      <label for="mini-p2p-peer-alias" style="display:block;font-size:12px;margin-bottom:5px">Nombre personalizado</label>
      <input id="mini-p2p-peer-alias" data-peer-alias maxlength="64" value="${esc(currentAlias)}" placeholder="Ej: SA oficina" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color,#cbd5e1);border-radius:10px;background:var(--bg-primary,#fff);color:inherit">
      <p style="font-size:11px;line-height:1.45;opacity:.65">Este nombre se guarda sólo en este Mini. No cambia el vínculo, la identidad del dispositivo ni sus claves de seguridad.</p>
      <div style="display:grid;gap:8px;margin-top:14px">
        ${primary('Guardar nombre','data-save-alias')}
        <button type="button" data-clear-alias style="width:100%;border:1px solid var(--border-color,rgba(148,163,184,.4));border-radius:12px;padding:11px 14px;background:transparent;color:inherit;font-weight:700;cursor:pointer">Usar nombre original</button>
      </div>`;
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

  function renderManualPair() {
    cleanupSession();
    body().innerHTML = `
      <button type="button" data-back style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 12px">← Volver</button>
      <h3 style="margin:0 0 6px">Vincular con SA</h3>
      <p style="font-size:13px;opacity:.7;margin-top:0">Escribe el código de 6 dígitos y la clave que muestra SA. Si escaneaste el QR, este paso se completa automáticamente.</p>
      <label style="display:block;font-size:12px;margin:14px 0 5px">Código</label>
      <input data-code inputmode="numeric" maxlength="7" placeholder="583 214" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color,#cbd5e1);border-radius:10px;background:var(--bg-primary,#fff);color:inherit;font-size:18px;letter-spacing:3px">
      <label style="display:block;font-size:12px;margin:14px 0 5px">Clave</label>
      <input data-key maxlength="11" placeholder="ABCDE-23456" autocapitalize="characters" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color,#cbd5e1);border-radius:10px;background:var(--bg-primary,#fff);color:inherit;font-size:17px;letter-spacing:2px;text-transform:uppercase">
      <div style="margin-top:16px">${primary('Conectar con SA','data-connect')}</div>
      <div data-pair-status style="font-size:12px;margin-top:12px"></div>`;
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
      body().innerHTML = `<h3 style="margin-top:0">Vincular con ${esc(descriptor.issuerName || 'SA')}</h3><p style="font-size:13px;opacity:.7">Conectando mediante el vínculo del QR…</p><div data-pair-status style="padding:12px;border-radius:12px;background:rgba(59,130,246,.08);font-size:13px">Buscando SA…</div><button type="button" data-cancel style="width:100%;margin-top:10px;border:0;background:transparent;color:inherit;padding:10px;cursor:pointer">Cancelar</button>`;
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
    box.innerHTML = `<strong>${esc(remote.displayName)}</strong> quiere vincularse.<br><span style="font-size:12px">Confirma que ambos muestran:</span><div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:8px 0">${esc(sas)}</div><div style="display:flex;gap:8px"><button type="button" data-reject style="flex:1;padding:10px;border:1px solid #ef4444;border-radius:10px;background:transparent;color:#dc2626">Rechazar</button><button type="button" data-accept style="flex:1;padding:10px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:800">Confirmar vínculo</button></div>`;
    box.querySelector('[data-reject]').addEventListener('click', reject);
    box.querySelector('[data-accept]').addEventListener('click', async () => { box.textContent='Esperando confirmación de SA…'; await accept(); });
  }

  function renderLinkedWaiting(peer) {
    body().innerHTML = `<h3 style="margin-top:0">✓ SA vinculado</h3><p><strong>${esc(peerName(peer))}</strong> quedó reconocido por este Mini.</p><div data-receive-state style="padding:12px;border-radius:12px;background:rgba(59,130,246,.08);font-size:13px">Esperando roster en esta conexión…</div><button type="button" data-finish style="width:100%;margin-top:10px;border:0;background:transparent;color:inherit;padding:10px;cursor:pointer">Terminar</button>`;
    body().querySelector('[data-finish]').addEventListener('click', renderHome);
  }

  function renderError(error) {
    const message=error?.message || String(error || 'Error P2P');
    const box=body()?.querySelector('[data-pair-status]') || body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
    if (box) box.innerHTML = `<strong style="color:#dc2626">Error:</strong> ${esc(message)}`;
    else toast('Error P2P: '+message);
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
    const title = isAttendance
      ? `Esperar asistencia de ${esc(peerName(peer))}`
      : `Esperar roster de ${esc(peerName(peer))}`;
    const subtitle = isAttendance
      ? 'Ahora en SA selecciona este Mini y solicita la asistencia.'
      : 'Ahora en SA selecciona este Mini y pulsa “Enviar roster”.';
    body().innerHTML = `<button type="button" data-back style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 12px">← Volver</button><h3 style="margin:0 0 8px">${title}</h3><p style="font-size:13px;opacity:.7">${subtitle}</p><div data-wait-status style="padding:12px;border-radius:12px;background:rgba(59,130,246,.08);font-size:13px">Esperando conexión autenticada…</div>`;
    body().querySelector('[data-back]').addEventListener('click', renderHome);
    const route=await core.deriveTrustedRoute(peer.linkToken);
    const signaling=new core.SignalingClient({room:route.room,peerId:self.deviceId,proof:route.proof});
    activeSession=await core.createRtcSession({
      signaling,initiator:false,
      onState:(status,error)=>{const box=body()?.querySelector('[data-wait-status]');if(box&&error)box.textContent='Error: '+error.message;},
      onChannel:channel=>{
        activeChannel=channel;
        pairing.attachTrusted(channel,{
          self,peer,store:identityStore,
          onAuthenticated:()=>{
            const box=body()?.querySelector('[data-wait-status]');
            if(box) box.textContent = isAttendance
              ? '✓ SA autenticado. Esperando solicitud de asistencia…'
              : '✓ SA autenticado. Esperando roster…';
            armRosterReceiver(channel,peer);
            armAttendanceResponder(channel,peer,self);
          },
          onError:renderError
        });
      }
    });
  }

  function armAttendanceResponder(channel, peer, self) {
    if (!root.AttendanceExport || typeof root.AttendanceExport.attachAttendanceResponder !== 'function') return;
    const deviceId = self?.deviceId || undefined;
    root.AttendanceExport.attachAttendanceResponder(channel, peer, {
      get repository() { return root.attendanceRepository; },
      get employeeRepository() { return root.employeeRepository; },
      get attendanceData() { return root.attendanceData; },
      get employees() { return root.users; },
      deviceId
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
      box.innerHTML=`<strong style="color:#16a34a">✓ Roster recibido · SHA-256 verificado</strong><br><span style="font-size:12px">${pendingRoster.employeeCount} empleados de ${esc(peerName(peer))}. Aún no se ha importado nada.</span><div style="margin-top:10px">${primary('Revisar roster en Mini','data-review-roster')}</div>`;
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
      body().innerHTML=`<h3>Vínculo QR inválido</h3><p>${esc(error.message||error)}</p><div>${primary('Volver','data-home')}</div>`;
      body().querySelector('[data-home]').addEventListener('click',renderHome);
      return true;
    }
  }

  async function openP2PTransferModal(){await renderHome();}
  root.openP2PTransferModal=openP2PTransferModal;
  root.closeP2PTransferModal=()=>closeTransferModal();
  root.waitTrustedTransfer=waitTrustedTransfer;
  root.waitTrustedRoster=waitTrustedRoster;
  root.waitTrustedAttendance=waitTrustedAttendance;

  const boot=()=>consumePairHash().catch(()=>{});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  root.addEventListener('hashchange',()=>consumePairHash().catch(()=>{}));
})(window);
