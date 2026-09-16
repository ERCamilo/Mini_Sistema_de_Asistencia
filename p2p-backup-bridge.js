(function (root) {
  'use strict';

  const MAX_PENDING_BACKUPS_TOTAL = 3;
  const MAX_PENDING_BACKUPS_PER_APP = MAX_PENDING_BACKUPS_TOTAL;
  const BACKUP_SETTINGS_KEYS = ['appTheme', 'iconStyle', 'checkMode', 'reminderConfig', 'expectedHoursPerDay'];

  function createBackupStagingStore(maxTotal = MAX_PENDING_BACKUPS_TOTAL) {
    const staged = [];

    function listStaged(sourceApp = null) {
      if (!sourceApp) return [...staged];
      const target = String(sourceApp).trim().toLowerCase();
      return staged.filter(item => item.sourceApp === target);
    }

    function getStaged(transferIdOrSha) {
      if (!transferIdOrSha) return null;
      const key = String(transferIdOrSha).trim().toLowerCase();
      return staged.find(item => item.transferId === key || item.sha256 === key) || null;
    }

    function getPendingCount(sourceApp = null) {
      if (sourceApp) return listStaged(sourceApp).length;
      return staged.length;
    }

    function removeStaged(transferIdOrSha) {
      if (!transferIdOrSha) return false;
      const key = String(transferIdOrSha).trim().toLowerCase();
      const index = staged.findIndex(item => item.transferId === key || item.sha256 === key);
      if (index === -1) return false;
      staged.splice(index, 1);
      return true;
    }

    function clear() {
      staged.length = 0;
    }

    function stageBackup(entry) {
      if (!entry || typeof entry !== 'object') throw new Error('Entrada de respaldo inválida.');
      if (!entry.transferId) throw new Error('transferId requerido para staging.');
      if (!entry.sha256 || typeof entry.sha256 !== 'string') throw new Error('sha256 requerido para staging.');
      if (entry.kind !== 'backup') throw new Error('Sólo se admite staging para kind=backup.');
      if (entry.schema !== 'mini-backup/v1' && entry.schema !== 'sa-backup/v1') {
        throw new Error('Esquema de respaldo no admitido.');
      }
      if (!entry.bytes || !(entry.bytes instanceof Uint8Array || ArrayBuffer.isView(entry.bytes) || entry.bytes instanceof ArrayBuffer)) {
        throw new Error('Bytes de respaldo inválidos.');
      }

      const rawBytes = entry.bytes instanceof Uint8Array
        ? entry.bytes
        : (entry.bytes instanceof ArrayBuffer
            ? new Uint8Array(entry.bytes)
            : new Uint8Array(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength));

      const transferId = String(entry.transferId).trim();
      const sha256 = String(entry.sha256).trim().toLowerCase();
      const sourceApp = String(entry.sourceApp || (entry.schema === 'mini-backup/v1' ? 'mini' : 'sa')).trim().toLowerCase();

      // Deduplicar por transferId o por SHA-256 antes del límite
      const existing = staged.find(item => item.transferId === transferId || item.sha256 === sha256);
      if (existing) {
        return existing;
      }

      // Validar límite máximo TOTAL en este Mini receptor (máximo 3 total)
      if (staged.length >= maxTotal) {
        throw new Error('Límite de backups pendientes alcanzado (máximo ' + maxTotal + ').');
      }

      const record = {
        transferId,
        sha256,
        kind: 'backup',
        schema: entry.schema,
        size: rawBytes.byteLength,
        bytes: rawBytes,
        sourceApp,
        sourcePeerId: String(entry.sourcePeerId || '').trim(),
        sourcePeerName: String(entry.sourcePeerName || (sourceApp === 'sa' ? 'SA' : 'Mini')).trim().slice(0, 80),
        receivedAt: entry.receivedAt || new Date().toISOString()
      };

      staged.push(record);
      return record;
    }

    return {
      stageBackup,
      listStaged,
      getStaged,
      removeStaged,
      clear,
      getPendingCount,
      maxTotal,
      maxPerApp: maxTotal
    };
  }

  const backupStagedStore = createBackupStagingStore();

  function createMiniBackupData() {
    const settings = {};
    if (typeof root.localStorage !== 'undefined') {
      BACKUP_SETTINGS_KEYS.forEach(k => {
        const v = root.localStorage.getItem(k);
        if (v !== null) settings[k] = v;
      });
    }
    if (typeof root.normalizeRequestState === 'function') {
      try { root.normalizeRequestState(); } catch (_) {}
    }
    const requestExport = (root.fieldRequestsRepository && typeof root.fieldRequestsRepository.exportCollections === 'function')
      ? root.fieldRequestsRepository.exportCollections(root.requests || [], root.requestTemplates || [])
      : { requests: root.requests || [], templates: root.requestTemplates || [] };

    const workContexts = (root.workContextManager && typeof root.workContextManager.exportSnapshot === 'function')
      ? root.workContextManager.exportSnapshot()
      : [];

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      users: Array.isArray(root.users) ? root.users : [],
      attendance: (root.attendanceData && typeof root.attendanceData === 'object') ? root.attendanceData : {},
      requests: Array.isArray(requestExport.requests) ? requestExport.requests : [],
      templates: Array.isArray(requestExport.templates) ? requestExport.templates : [],
      workContexts,
      settings
    };
  }

  async function createMiniBackupPayload(customData = null) {
    const data = customData || createMiniBackupData();
    const json = JSON.stringify(data, null, 2);
    const bytes = new TextEncoder().encode(json);
    const core = root.SaMiniP2P;
    const sha256 = core ? await core.sha256Hex(bytes) : null;
    return { data, json, bytes, sha256, size: bytes.byteLength };
  }

  function reviewStagedBackupInMini(stagedEntry) {
    if (!stagedEntry) throw new Error('Respaldo no encontrado.');
    if (stagedEntry.schema !== 'mini-backup/v1' || stagedEntry.sourceApp !== 'mini') {
      throw new Error('Mini sólo puede revisar y restaurar respaldos propios de Mini (mini-backup/v1). Los respaldos de SA son de sólo descarga.');
    }

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(stagedEntry.bytes);
    } catch (_) {
      throw new Error('El respaldo no contiene texto UTF-8 válido.');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new Error('El respaldo no contiene JSON válido.');
    }

    const hasUsers = Array.isArray(parsed.users) && parsed.users.length > 0;
    const hasAtt = parsed.attendance && typeof parsed.attendance === 'object';
    const hasReqs = Array.isArray(parsed.requests) && parsed.requests.length > 0;
    if (!hasUsers && !hasAtt && !hasReqs) {
      throw new Error('No se encontraron datos válidos en el respaldo.');
    }

    // Poblar el modal nativo de restauración existente sin duplicar lógica
    if (typeof root.document !== 'undefined') {
      const ta = root.document.getElementById('restore-backup-textarea');
      const modal = root.document.getElementById('modal-restore-backup');
      if (ta) {
        ta.value = text;
        ta.dataset.transferId = stagedEntry.transferId;
        if (typeof root.validateRestoreTextarea === 'function') {
          root.validateRestoreTextarea(ta);
        }
      }
      if (modal) {
        modal.dataset.transferId = stagedEntry.transferId;
      }
      if (typeof root.openModal === 'function') {
        root.openModal('modal-restore-backup');
      }
    }

    return { parsed, text };
  }

  function downloadBackupBytes(stagedEntry, customFilename = null) {
    if (!stagedEntry || !stagedEntry.bytes) throw new Error('No hay bytes para descargar.');
    const dateStr = new Date().toISOString().slice(0, 10);
    const hashPrefix = String(stagedEntry.sha256 || '').slice(0, 8);
    const app = stagedEntry.sourceApp === 'sa' ? 'sa' : 'mini';
    const filename = customFilename || ('backup_' + app + '_' + dateStr + (hashPrefix ? '_' + hashPrefix : '') + '.json');

    if (typeof root.Blob !== 'undefined' && typeof root.document !== 'undefined') {
      const blob = new Blob([stagedEntry.bytes], { type: 'application/json' });
      const a = root.document.createElement('a');
      a.href = root.URL.createObjectURL(blob);
      a.download = filename;
      root.document.body.appendChild(a);
      a.click();
      root.document.body.removeChild(a);
      setTimeout(() => root.URL.revokeObjectURL(a.href), 1000);
    }
    return filename;
  }

  function isSameAppPeer(peer) {
    return Boolean(peer && peer.peerApp === 'mini');
  }

  function formatBackupSize(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function sendBackupStagedAck(channel, { transferId, sha256, schema }) {
    const core = root.SaMiniP2P;
    if (!core) throw new Error('SaMiniP2P core no disponible.');
    core.sendControl(channel, 'backup-staged', {
      transferId,
      sha256: String(sha256).toLowerCase(),
      kind: 'backup',
      schema,
      validated: true
    });
  }

  function sendBackupRejectedAck(channel, { transferId, reason, schema }) {
    const core = root.SaMiniP2P;
    if (!core) throw new Error('SaMiniP2P core no disponible.');
    const safeSchema = schema === 'sa-backup/v1' ? 'sa-backup/v1' : 'mini-backup/v1';
    core.sendControl(channel, 'backup-rejected', {
      transferId,
      reason: String(reason || 'Respaldo rechazado.').slice(0, 256),
      kind: 'backup',
      schema: safeSchema,
      validated: false
    });
  }

  function waitForBackupStageAck(channel, transfer, timeoutMs = 20000) {
    const core = root.SaMiniP2P || (typeof require !== 'undefined' ? require('./p2p-core.js') : null);
    if (!core) throw new Error('SaMiniP2P core no disponible.');
    if (!transfer || !transfer.transferId) throw new Error('Transferencia requerida para esperar ACK.');

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try { channel.removeEventListener('message', handleAckMessage); } catch (_) {}
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      function handleAckMessage(event) {
        let msg;
        try { msg = core.parseControl(event.data); }
        catch (err) { finish(reject, err); return; }
        if (!msg || (msg.type !== 'backup-staged' && msg.type !== 'backup-rejected')) return;
        if (String(msg.data?.transferId || '') !== transfer.transferId) return;

        if (msg.type === 'backup-rejected') {
          try {
            const rejection = core.validateBackupRejected(msg.data, transfer);
            finish(reject, new Error(`El destinatario rechazó el respaldo: ${rejection.reason}`));
          } catch (err) {
            finish(reject, err);
          }
          return;
        }

        try {
          const ack = core.validateBackupStageAck(msg.data, transfer);
          finish(resolve, ack);
        } catch (err) {
          finish(reject, err);
        }
      }

      timer = setTimeout(() => finish(reject, new Error('El receptor no confirmó la recepción del respaldo a tiempo.')), timeoutMs);
      channel.addEventListener('message', handleAckMessage);
    });
  }

  async function sendBackupOnChannel(channel, { bytes, schema = 'mini-backup/v1', onProgress, timeoutMs = 20000 }) {
    const core = root.SaMiniP2P || (typeof require !== 'undefined' ? require('./p2p-core.js') : null);
    if (!core) throw new Error('SaMiniP2P core no disponible.');
    if (!core.isChannelAuthenticated(channel)) throw new Error('Canal P2P no autenticado.');

    const rawBytes = bytes instanceof Uint8Array
      ? bytes
      : (bytes instanceof ArrayBuffer
          ? new Uint8Array(bytes)
          : (ArrayBuffer.isView(bytes)
              ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
              : null));
    if (!rawBytes) throw new Error('Bytes de respaldo inválidos.');
    if (rawBytes.byteLength > (core.MAX_BACKUP_BYTES || 25 * 1024 * 1024)) {
      throw new Error('El respaldo excede el límite permitido.');
    }

    const bufferedFrames = [];
    let knownTransfer = null;
    let settled = false;
    let timer = null;

    let resolveAck, rejectAck;
    const ackPromise = new Promise((resolve, reject) => {
      resolveAck = resolve;
      rejectAck = reject;
    });

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try { channel.removeEventListener('message', handleMessage); } catch (_) {}
    };

    const finishResolve = (val) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveAck(val);
    };

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectAck(err);
    };

    const processFrame = (msg) => {
      if (!knownTransfer || settled) return false;
      if (String(msg.data?.transferId || '') !== knownTransfer.transferId) {
        return false;
      }

      if (msg.type === 'backup-rejected') {
        try {
          const rejection = core.validateBackupRejected(msg.data, knownTransfer);
          finishReject(new Error(`El destinatario rechazó el respaldo: ${rejection.reason}`));
        } catch (err) {
          finishReject(err);
        }
        return true;
      }

      if (msg.type === 'backup-staged') {
        try {
          const ack = core.validateBackupStageAck(msg.data, knownTransfer);
          finishResolve(ack);
        } catch (err) {
          finishReject(err);
        }
        return true;
      }

      return false;
    };

    function handleMessage(event) {
      if (settled) return;
      let msg;
      try { msg = core.parseControl(event.data); }
      catch (_) { return; }
      if (!msg || (msg.type !== 'backup-staged' && msg.type !== 'backup-rejected')) return;

      if (knownTransfer) {
        processFrame(msg);
      } else {
        bufferedFrames.push(msg);
      }
    }

    channel.addEventListener('message', handleMessage);

    try {
      const transfer = await core.sendPayload(channel, {
        kind: core.BACKUP_KIND || 'backup',
        schema,
        bytes: rawBytes,
        onProgress
      });

      knownTransfer = transfer;

      let handled = false;
      for (const msg of bufferedFrames) {
        if (processFrame(msg)) {
          handled = true;
          break;
        }
      }

      if (!handled && !settled) {
        timer = setTimeout(() => {
          finishReject(new Error('El receptor no confirmó la recepción del respaldo a tiempo.'));
        }, timeoutMs);
      }

      const ack = await ackPromise;
      return { transfer, ack };
    } finally {
      cleanup();
    }
  }

  const api = {
    MAX_PENDING_BACKUPS_TOTAL,
    MAX_PENDING_BACKUPS_PER_APP,
    BACKUP_SETTINGS_KEYS,
    createBackupStagingStore,
    backupStagedStore,
    createMiniBackupData,
    createMiniBackupPayload,
    reviewStagedBackupInMini,
    downloadBackupBytes,
    isSameAppPeer,
    formatBackupSize,
    sendBackupStagedAck,
    sendBackupRejectedAck,
    waitForBackupStageAck,
    sendBackupOnChannel
  };

  root.SaMiniP2PBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
