// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ReportSendGuard` (browser global consumed by index.html).
// Before sending the day's report by WhatsApp: warn when the day is unusual
// (older than yesterday, older than a month, or in the future). It never
// changes the message itself: that text is imported elsewhere.

type ReportSendLevel = 'today' | 'yesterday' | 'recent' | 'old' | 'future';

interface ReportSendPrompt { title: string; message: string; confirmText: string; cancelText: string; danger: boolean; }

(function exposeReportSendGuard(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ReportSendGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReportSendGuardModule() {
  const OLD_AFTER_DAYS = 30;

  // Whole calendar days between two YYYY-MM-DD keys (UTC math: no DST slips).
  function daysBetween(fromKey: string, toKey: string): number {
    const toUtc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000);
  }

  function classify(dateKey: string, todayKey: string): { level: ReportSendLevel; days: number } {
    const days = daysBetween(dateKey, todayKey);
    if (days < 0) return { level: 'future', days };
    if (days === 0) return { level: 'today', days };
    if (days === 1) return { level: 'yesterday', days };
    return { level: days > OLD_AFTER_DAYS ? 'old' : 'recent', days };
  }

  function prompt(result: { level: ReportSendLevel; days: number }, dateLabel: string): ReportSendPrompt | null {
    if (result.level === 'today' || result.level === 'yesterday') return null;
    const common = { confirmText: 'Enviar ese día', cancelText: 'Ir a hoy' };
    if (result.level === 'future') {
      return { ...common, title: 'Día futuro', message: `Vas a enviar el reporte del ${dateLabel}, un día que todavía no pasó. ¿Seguro?`, danger: true };
    }
    if (result.level === 'old') {
      return { ...common, title: 'Reporte de hace más de un mes', message: `Vas a enviar el reporte del ${dateLabel} (hace ${result.days} días). ¿Es el día correcto?`, danger: true };
    }
    return { ...common, title: 'No es el reporte de hoy', message: `Vas a enviar el reporte del ${dateLabel} (hace ${result.days} días).`, danger: false };
  }

  return { OLD_AFTER_DAYS, classify, prompt };
});
