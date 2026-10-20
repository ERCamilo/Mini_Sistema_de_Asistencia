interface AppRelease { version: string; date: string; title: string; items: string[] }
interface AppReleaseManifest { version: string; changelog: AppRelease[] }
interface AppVersionPolicy {
  APP_VERSION: string; CHANGELOG: AppRelease[]; CHECK_INTERVAL_MS: number;
  compareVersions(a: string, b: string): number;
  getUnseenReleases(lastSeen: string | null, changelog?: AppRelease[]): AppRelease[];
  shouldPromptForUpdate(input: { hasController: boolean; currentVersion: string; availableVersion: string; lastPromptedVersion?: string | null }): boolean;
  shouldCheckForUpdate(input: { now: number; lastCheckedAt: number; online?: boolean }): boolean;
  isReleaseManifest(value: unknown): value is AppReleaseManifest;
}

(function exposeAppVersion(root: any, factory: () => AppVersionPolicy) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniAppVersion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // BEGIN VERSION POLICY
  const APP_VERSION = '2.17.6';
  const CHANGELOG: AppRelease[] = [
    { version: '2.17.6', date: '2026-10-20', title: 'Personal recibido de SA', items: ['Revisa en Conexiones el personal recibido de SA antes de aplicarlo.', 'Descarta pendientes sin cambiar el personal ya guardado.', 'Consulta los pendientes actualizados con controles legibles en pantallas móviles.'] },
    { version: '2.17.5', date: '2026-10-20', title: 'Novedades y actualizaciones a tu ritmo', items: ['Consulta las mejoras de cada versión desde Ajustes.', 'Elige cuándo actualizar sin interrumpir tu trabajo.', 'Busca actualizaciones y revisa sus novedades antes de instalarlas.'] },
    { version: '2.17.4', date: '2026-10-19', title: 'Conexiones y acceso', items: ['Mejoras al conectar dispositivos y acceder con Google.'] }
  ];
  const CHECK_INTERVAL_MS = 30 * 60 * 1000;
  function validVersion(value: unknown): value is string {
    return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
      && value.split('.').every(part => Number.isSafeInteger(Number(part)));
  }
  function compareVersions(a: string, b: string): number {
    if (!validVersion(a) || !validVersion(b)) return 0;
    const left = a.split('.').map(Number), right = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    return 0;
  }
  function getUnseenReleases(lastSeen: string | null, changelog: AppRelease[] = CHANGELOG): AppRelease[] {
    if (!validVersion(lastSeen)) return [];
    return changelog.filter(release => compareVersions(release.version, lastSeen) > 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  }
  function shouldPromptForUpdate(input: { hasController: boolean; currentVersion: string; availableVersion: string; lastPromptedVersion?: string | null }): boolean {
    return input.hasController && validVersion(input.currentVersion) && validVersion(input.availableVersion)
      && compareVersions(input.availableVersion, input.currentVersion) > 0
      && (!validVersion(input.lastPromptedVersion) || compareVersions(input.availableVersion, input.lastPromptedVersion) > 0);
  }
  function shouldCheckForUpdate(input: { now: number; lastCheckedAt: number; online?: boolean }): boolean {
    return input.online !== false && Number.isFinite(input.now)
      && (!Number.isFinite(input.lastCheckedAt) || input.lastCheckedAt <= 0 || input.now < input.lastCheckedAt || input.now - input.lastCheckedAt >= CHECK_INTERVAL_MS);
  }
  function isReleaseManifest(value: unknown): value is AppReleaseManifest {
    if (!value || typeof value !== 'object') return false;
    const data = value as AppReleaseManifest;
    return validVersion(data.version) && Array.isArray(data.changelog) && data.changelog.length > 0 && data.changelog.length <= 100
      && data.changelog[0]?.version === data.version && data.changelog.every((entry, index) =>
        validVersion(entry?.version) && (index === 0 || compareVersions(data.changelog[index - 1].version, entry.version) > 0)
        && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.title === 'string' && entry.title.length > 0 && entry.title.length <= 200
        && Array.isArray(entry.items) && entry.items.length > 0 && entry.items.length <= 30
        && entry.items.every(item => typeof item === 'string' && item.length > 0 && item.length <= 500));
  }
  return { APP_VERSION, CHANGELOG, CHECK_INTERVAL_MS, compareVersions, getUnseenReleases, shouldPromptForUpdate, shouldCheckForUpdate, isReleaseManifest };
  // END VERSION POLICY
});
