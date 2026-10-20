interface MiniUpdatesManager {
  boot(): void; flush(): void; showNews(manual?: boolean): void;
  check(manual?: boolean, force?: boolean): Promise<void>; controllerChanged(hadController: boolean): Promise<void>;
}
interface MiniUpdatesOptions {
  openModal(id: string): void; closeModal(id: string): void;
  beforeReload(): Promise<void>; isBusy(): boolean;
}
interface Window {
  MiniAppVersion: AppVersionPolicy;
  AppUpdateManager: { createReleaseManager(options: AppUpdateManagerOptions): MiniUpdatesManager };
  MiniUpdates: { init(options: MiniUpdatesOptions): void; showNews(): void; check(): Promise<void>; close(id: string): void; onModalClosed(id: string): void };
}
(function exposeMiniUpdates(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniUpdates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  let manager: MiniUpdatesManager | null = null, config: MiniUpdatesOptions | null = null;
  const callbacks = new Map<string, () => void>();
  function status(message: string) {
    const active = document.querySelector('#update-modal.active [data-release-status]');
    if (active) active.textContent = message;
    const inline = document.getElementById('app-update-status');
    if (inline) inline.textContent = message;
  }
  async function fetchRelease(): Promise<unknown> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('./app-release.json?__incoming=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Release unavailable');
      const content = await response.text(); if (content.length > 150000) throw new Error('Release too large');
      return JSON.parse(content) as unknown;
    } finally { clearTimeout(timer); }
  }
  async function refreshWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration(); if (!registration) return;
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (!worker || worker.state === 'activated') return;
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => { clearTimeout(timer); worker.removeEventListener('statechange', check); error ? reject(error) : resolve(); };
      const check = () => { if (worker.state === 'activated') done(); else if (worker.state === 'redundant') done(new Error('Update failed')); };
      const timer = setTimeout(() => done(new Error('Update timeout')), 20000);
      worker.addEventListener('statechange', check); check();
    });
  }
  function show(kind: 'news' | 'update', releases: AppRelease[], version: string, onClose: () => void, apply: () => Promise<void>): boolean {
    const id = kind === 'news' ? 'whats-new-modal' : 'update-modal';
    const modal = document.getElementById(id); if (!modal || !config) return false;
    modal.querySelector('[data-release-title]')!.textContent = kind === 'news' ? `Novedades · v${version}` : `Actualización disponible · v${version}`;
    const list = modal.querySelector('[data-release-list]')!; list.replaceChildren();
    for (const release of releases) {
      const section = document.createElement('section'), title = document.createElement('h3'), date = document.createElement('p'), items = document.createElement('ul');
      title.textContent = `${release.title} · v${release.version}`; date.textContent = release.date.split('-').reverse().join('/');
      for (const text of release.items) { const item = document.createElement('li'); item.textContent = text; items.appendChild(item); }
      section.append(title, date, items); list.appendChild(section);
    }
    modal.querySelector('[data-release-status]')!.textContent = '';
    const button = modal.querySelector<HTMLButtonElement>('[data-release-apply]');
    if (button) button.onclick = () => { button.disabled = true; void apply().finally(() => { button.disabled = false; }); };
    callbacks.set(id, onClose); config.openModal(id); return true;
  }
  function init(options: MiniUpdatesOptions) {
    if (manager) return;
    config = options;
    manager = window.AppUpdateManager.createReleaseManager({
      policy: window.MiniAppVersion, prefix: 'mini',
      read: key => localStorage.getItem(key), write: (key, value) => localStorage.setItem(key, value),
      now: () => Date.now(), online: () => navigator.onLine !== false,
      fetchRelease, canShow: () => !options.isBusy() && !document.querySelector('.modal.active, .mini-p2p-overlay, .mini-welcome-overlay'),
      show, beforeReload: async () => { await options.beforeReload(); await refreshWorker(); }, reload: () => location.reload(), status
    });
    manager.boot();
    let hadController = !!navigator.serviceWorker?.controller;
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
      const previous = hadController; hadController = true; void manager!.controllerChanged(previous);
    });
    const check = () => { if (document.visibilityState !== 'hidden') void manager!.check(); };
    window.addEventListener('online', () => { void manager!.check(false, true); });
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    setInterval(check, 60000); setInterval(() => manager!.flush(), 1000); check();
    document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = 'v' + window.MiniAppVersion.APP_VERSION; });
  }
  function onModalClosed(id: string) { const callback = callbacks.get(id); callbacks.delete(id); callback?.(); }
  return {
    init, showNews: () => manager?.showNews(true), check: () => manager?.check(true) || Promise.resolve(),
    close: (id: string) => config?.closeModal(id), onModalClosed
  };
});
