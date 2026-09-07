(function (root) {
  'use strict';
  const core = root.SaMiniP2P;
  const pairing = root.SaMiniP2PPairing;
  if (!core || !pairing) throw new Error('P2P core/pairing must load before P2P roster UI.');

  const MODAL_ID = 'mini-p2p-transfer-modal';
  const identityStore = core.makeIdentityStore('mini', 'Mini - Dispositivo');
  let activeSession = null;
  let activeChannel = null;
  let pendingRoster = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
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
    const peers = (await identityStore.listPeers()).filter(p => p.peerApp === 'sa');
    const peerRows = peers.length ? peers.map(peer => `
      <div style="display:flex;gap:8px;align-items:center;border:1px solid var(--border-color,rgba(148,163,184,.3));border-radius:12px;padding:12px">
        <div style="flex:1;min-width:0"><strong>${esc(peer.displayName)}</strong><div style="font-size:11px;opacity:.6">Vinculado ${esc(new Date(peer.linkedAt).toLocaleString('es-DO'))}</div></div>
        <button type="button" data-wait-peer="${esc(peer.peerId)}" style="border:0;border-radius:10px;padding:9px 11px;background:#16a34a;color:white;font-weight:700;cursor:pointer">Esperar roster</button>
        <button type="button" data-unlink="${esc(peer.peerId)}" aria-label="Desvincular" style="border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:9px;background:transparent;color:#dc2626;cursor:pointer">×</button>
      </div>`).join('') : '<div style="font-size:13px;opacity:.7;padding:8px 0">Aún no hay SA vinculados.</div>';

    body().innerHTML = `
      <div style="display:grid;gap:10px">
        <div style="border:1px solid rgba(37,99,235,.3);border-radius:14px;padding:14px;background:rgba(37,99,235,.08)"><strong>👥 Personal / Roster</strong><div style="font-size:12px;margin-top:4px">Disponible ahora · recibir desde SA</div></div>
        ${disabledCard('🕒 Asistencia','Mini → SA')}
        ${disabledCard('💾 Backup','Mini ↔ Mini')}
        ${disabledCard('📄 Documentos / Archivos','Reservado para una fase futura')}
      </div>
      <div style="margin-top:18px;display:flex;justify-content:space-between;gap:10px"><strong>SA vinculados</strong><span style="font-size:11px;opacity:.6">${esc(self.displayName)}</span></div>
      <div style="display:grid;gap:8px;margin-top:10px">${peerRows}</div>
      <div style="margin-top:16px">${primary('Vincular con SA usando código + clave','data-manual-pair')}</div>
      <p style="font-size:11px;opacity:.65;line-height:1.45;margin-top:12px">Recibir un roster no lo importa automáticamente. Primero se verifica SHA-256 y luego se abre la revisión normal de Mini.</p>`;
    body().querySelector('[data-manual-pair]').addEventListener('click', renderManualPair);
    body().querySelectorAll('[data-wait-peer]').forEach(btn => btn.addEventListener('click', () => waitTrustedRoster(btn.dataset.waitPeer)));
    body().querySelectorAll('[data-unlink]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('¿Desvincular este SA?')) return;
      await identityStore.removePeer(btn.dataset.unlink);
      renderHome();
    }));
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
    body().querySelector('[data-connect]').addEventListener('click', async () => {
      try {
        const descriptor = await core.pairDescriptorFromManual(body().querySelector('[data-code]').value, body().querySelector('[data-key]').value);
        await startPairing(descriptor);
      } catch (error) { body().querySelector('[data-pair-status]').textContent = error.message; }
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
      onState: (status, error) => { const box=body()?.querySelector('[data-pair-status]'); if(box && error) box.textContent='Error: '+error.message; },
      onChannel: channel => {
        activeChannel = channel;
        pairing.attachPairing(channel, {
          self, descriptor, initiator: false, store: identityStore,
          onCandidate: ({ remote, sas, accept, reject }) => renderPairConfirmation(remote, sas, accept, reject),
          onLinked: peer => {
            armRosterReceiver(channel, peer);
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
    body().innerHTML = `<h3 style="margin-top:0">✓ SA vinculado</h3><p><strong>${esc(peer.displayName)}</strong> quedó reconocido por este Mini.</p><div data-receive-state style="padding:12px;border-radius:12px;background:rgba(59,130,246,.08);font-size:13px">Esperando roster en esta conexión…</div><button type="button" data-finish style="width:100%;margin-top:10px;border:0;background:transparent;color:inherit;padding:10px;cursor:pointer">Terminar</button>`;
    body().querySelector('[data-finish]').addEventListener('click', renderHome);
  }

  function renderError(error) {
    const message=error?.message || String(error || 'Error P2P');
    const box=body()?.querySelector('[data-pair-status]') || body()?.querySelector('[data-receive-state]') || body()?.querySelector('[data-wait-status]');
    if (box) box.innerHTML = `<strong style="color:#dc2626">Error:</strong> ${esc(message)}`;
    else toast('Error P2P: '+message);
  }

  async function waitTrustedRoster(peerId) {
    cleanupSession();
    const self=await identityStore.getSelf();
    const peer=await identityStore.getPeer(peerId);
    if (!peer || peer.peerApp !== 'sa') throw new Error('SA vinculado no encontrado.');
    body().innerHTML = `<button type="button" data-back style="border:0;background:transparent;color:inherit;cursor:pointer;padding:0 0 12px">← Volver</button><h3 style="margin:0 0 8px">Esperar roster de ${esc(peer.displayName)}</h3><p style="font-size:13px;opacity:.7">Ahora en SA selecciona este Mini y pulsa “Enviar roster”.</p><div data-wait-status style="padding:12px;border-radius:12px;background:rgba(59,130,246,.08);font-size:13px">Esperando conexión autenticada…</div>`;
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
            const box=body()?.querySelector('[data-wait-status]'); if(box) box.textContent='✓ SA autenticado. Esperando roster…';
            armRosterReceiver(channel,peer);
          },
          onError:renderError
        });
      }
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
      box.innerHTML=`<strong style="color:#16a34a">✓ Roster recibido · SHA-256 verificado</strong><br><span style="font-size:12px">${pendingRoster.employeeCount} empleados de ${esc(peer.displayName)}. Aún no se ha importado nada.</span><div style="margin-top:10px">${primary('Revisar roster en Mini','data-review-roster')}</div>`;
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

  const boot=()=>consumePairHash().catch(()=>{});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  root.addEventListener('hashchange',()=>consumePairHash().catch(()=>{}));
})(window);
