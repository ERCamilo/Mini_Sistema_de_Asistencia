interface MiniPeerLeaseSession { close(): void; getLeaseRemainingMs?(): number; }
interface MiniPeerLeaseChannel { readyState?: string; }
interface MiniPeerLeaseOptions {
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
}
(function exposeMiniPeerSessionManager(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniPeerSessionManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniPeerSessionManagerModule() {
  const MAX_LEASE_MS = 300000;
  function create(options: MiniPeerLeaseOptions = {}) {
    const now = options.now || (() => performance.now());
    const schedule = options.schedule || ((fn: () => void, delay: number) => setTimeout(fn, delay));
    const cancel = options.cancel || ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    function lease(session: MiniPeerLeaseSession, startedAt: number, onRetired: () => void, eligibility: { guest?: boolean; transportOwnedExternally?: boolean } = {}) {
      const credentialRemaining = () => {
        try { return session.getLeaseRemainingMs ? session.getLeaseRemainingMs() : eligibility.guest === true ? MAX_LEASE_MS : 0; }
        catch { return 0; }
      };
      const initialRemaining = credentialRemaining();
      const deadline = Math.min(startedAt + MAX_LEASE_MS, now() + (Number.isFinite(initialRemaining) ? Math.max(0, initialRemaining) : 0));
      let stopped = false, channel: MiniPeerLeaseChannel | null = null, timer: unknown;
      let running = false, tail: Promise<unknown> = Promise.resolve();
      const operations = new Set<(error: Error) => void>();
      const waiting = new Set<{ resolve: (channel: MiniPeerLeaseChannel) => void; reject: (error: Error) => void }>();
      function retire() {
        if (stopped) return;
        stopped = true;
        if (timer !== undefined) cancel(timer);
        for (const waiter of waiting) waiter.reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
        waiting.clear();
        running = false;
        for (const reject of operations) reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
        operations.clear();
        try { onRetired(); } finally { try { if (eligibility.transportOwnedExternally !== true) session.close(); } catch { /* Isolated transport cleanup. */ } }
      }
      function valid(): boolean {
        if (!stopped && (now() >= deadline || credentialRemaining() <= 0)) retire();
        return !stopped;
      }
      function check() {
        if (!valid()) return;
        timer = schedule(check, Math.min(1000, deadline - now()));
      }
      check();
      function ready(value: MiniPeerLeaseChannel): boolean {
        if (!valid()) return false;
        channel = value;
        for (const waiter of waiting) waiter.resolve(value);
        waiting.clear();
        return true;
      }
      function authenticated(): Promise<MiniPeerLeaseChannel> {
        if (!valid()) return Promise.reject(new Error('La conexión expiró. Reintenta.'));
        if (channel?.readyState === 'open') return Promise.resolve(channel);
        return new Promise((resolve, reject) => waiting.add({ resolve, reject }));
      }
      function run<T>(operation: (value: MiniPeerLeaseChannel) => Promise<T>): Promise<T> {
        if (!valid()) return Promise.reject(new Error('La conexión expiró o se interrumpió. Reintenta.'));
        let rejectOperation: (error: Error) => void;
        const cancelled = new Promise<T>((_resolve, reject) => { rejectOperation = reject; operations.add(reject); });
        const result = tail.then(async () => {
          const value = await authenticated();
          if (!valid() || value.readyState !== 'open') throw new Error('Canal no disponible. Reintenta.');
          running = true;
          try { return await operation(value); } finally { running = false; }
        });
        tail = result.catch(() => {});
        const delivered = Promise.race([result, cancelled]);
        void delivered.then(() => operations.delete(rejectOperation!), () => operations.delete(rejectOperation!));
        return delivered;
      }
      return { session, ready, valid, retire, run, busy: () => running, deadline };
    }
    return { lease, now };
  }
  return { create, MAX_LEASE_MS };
});
