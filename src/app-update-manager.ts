interface AppUpdateManagerOptions {
  policy: AppVersionPolicy; prefix: string;
  read(key: string): string | null; write(key: string, value: string): void;
  now(): number; online(): boolean; fetchRelease(): Promise<unknown>; canShow(): boolean;
  show(kind: 'news' | 'update', releases: AppRelease[], version: string, close: () => void, apply: () => Promise<void>): boolean;
  showSuccess?(close: () => void): boolean;
  beforeReload(): Promise<void>; prepareUpdate?(): Promise<void>; reload(): void; status(message: string): void;
}

(function exposeAppUpdateManager(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.AppUpdateManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // BEGIN UPDATE MANAGER
  function createReleaseManager(options: AppUpdateManagerOptions) {
    const policy = options.policy;
    const key = (name: string) => `${options.prefix}:${name}`;
    const read = (name: string): string | null => { try { return options.read(key(name)); } catch (_) { return null; } };
    const write = (name: string, value: string): boolean => { try { options.write(key(name), value); return true; } catch (_) { return false; } };
    let booted = false, dialogOpen = false, applying = false, applyGeneration = 0;
    let incoming: AppReleaseManifest | null = null;
    let flight: Promise<void> | null = null;
    let manualCheck = false;
    let deferred = read('deferredVersion');
    let pendingNews: AppRelease[] = [];
    let pendingSuccess = false;
    let lastCheckedAt = Number(read('lastUpdateCheck')) || 0;
    function closeNews() {
      dialogOpen = false;
      const lastSeen = read('lastSeenVersion');
      if (!lastSeen || policy.compareVersions(policy.APP_VERSION, lastSeen) > 0) write('lastSeenVersion', policy.APP_VERSION);
      pendingNews = [];
    }
    function closeUpdate(offeredVersion: string) {
      dialogOpen = false;
      applyGeneration++;
      deferred = offeredVersion; write('deferredVersion', deferred);
    }
    async function apply() {
      if (applying || !incoming) return;
      applying = true;
      const generation = ++applyGeneration;
      const target = incoming.version;
      let saved = false;
      try {
        options.status('Guardando datos…');
        await options.beforeReload();
        if (generation !== applyGeneration) return;
        saved = true;
        options.status('Descargando actualización…');
        await options.prepareUpdate?.();
        if (generation === applyGeneration) {
          write('updateReceipt', JSON.stringify({ from: policy.APP_VERSION, target }));
          options.status('Abriendo la aplicación…'); options.reload();
        }
      }
      catch (_) {
        options.status(saved ? 'No se pudo actualizar. Revisa tu conexión y vuelve a intentarlo; tus datos se conservan.'
          : 'No se pudo actualizar. Guarda o cierra tus cambios y vuelve a intentarlo.');
      }
      finally { applying = false; }
    }
    function showNews(manual = false) {
      if (dialogOpen) return;
      const entries = manual ? policy.CHANGELOG : pendingNews;
      if (!entries.length || (!manual && !options.canShow())) return;
      dialogOpen = options.show('news', entries, policy.APP_VERSION, closeNews, apply);
    }
    function showUpdate(manual = false) {
      if (dialogOpen || !incoming || (!manual && !options.canShow())) return;
      if (!manual && !policy.shouldPromptForUpdate({ hasController: true, currentVersion: policy.APP_VERSION, availableVersion: incoming.version, lastPromptedVersion: deferred })) return;
      const offered = incoming;
      dialogOpen = options.show('update', policy.getUnseenReleases(policy.APP_VERSION, offered.changelog), offered.version, () => closeUpdate(offered.version), apply);
    }
    function flush() {
      if (pendingSuccess) {
        if (!dialogOpen && options.canShow()) {
          dialogOpen = options.showSuccess?.(() => { dialogOpen = false; }) || false;
          pendingSuccess = false;
        }
      } else if (pendingNews.length) showNews(); else showUpdate();
    }
    function consumeUpdateReceipt(): boolean {
      const value = read('updateReceipt');
      if (!value || !write('updateReceipt', '')) return false;
      try {
        const receipt = JSON.parse(value) as { from?: string; target?: string };
        return !!receipt && typeof receipt.from === 'string' && receipt.target === policy.APP_VERSION
          && policy.compareVersions(receipt.target, receipt.from) > 0;
      } catch (_) { return false; }
    }
    function boot() {
      if (booted) return;
      booted = true;
      const seen = read('lastSeenVersion');
      if (consumeUpdateReceipt()) {
        pendingSuccess = !!seen && policy.compareVersions(seen, policy.APP_VERSION) >= 0
          || write('lastSeenVersion', policy.APP_VERSION);
        if (pendingSuccess) { flush(); return; }
      }
      if (!seen || !/^\d+\.\d+\.\d+$/.test(seen)) write('lastSeenVersion', policy.APP_VERSION);
      else pendingNews = policy.getUnseenReleases(seen, policy.CHANGELOG);
      flush();
    }
    async function performCheck() {
      try {
        const value = await options.fetchRelease();
        if (!policy.isReleaseManifest(value)) throw new Error('Invalid release');
        if (policy.compareVersions(value.version, policy.APP_VERSION) <= 0) {
          if (manualCheck) options.status(`Ya tienes la versión actual (v${policy.APP_VERSION}).`);
          return;
        }
        if (incoming && policy.compareVersions(value.version, incoming.version) < 0) { showUpdate(manualCheck); return; }
        incoming = value;
        showUpdate(manualCheck);
      } catch (_) { if (manualCheck) options.status('No se pudo consultar la actualización. Revisa tu conexión e inténtalo de nuevo.'); }
    }
    function check(manual = false, force = false): Promise<void> {
      if (flight) { if (manual) { manualCheck = true; options.status('Buscando actualizaciones…'); } return flight; }
      if (!options.online()) { if (manual) options.status('Sin conexión: no se pudo buscar actualizaciones.'); return Promise.resolve(); }
      if (!manual && !force && !policy.shouldCheckForUpdate({ now: options.now(), lastCheckedAt, online: true })) return Promise.resolve();
      lastCheckedAt = options.now(); write('lastUpdateCheck', String(lastCheckedAt));
      if (manual) options.status('Buscando actualizaciones…');
      manualCheck = manual;
      flight = performCheck().finally(() => { flight = null; manualCheck = false; });
      return flight;
    }
    function controllerChanged(hadController: boolean) { return hadController ? check(false, true) : Promise.resolve(); }
    return { boot, check, flush, showNews, controllerChanged, apply };
  }
  return { createReleaseManager };
  // END UPDATE MANAGER
});
