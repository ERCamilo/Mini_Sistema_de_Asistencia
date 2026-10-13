interface MiniPeerLeaseSession { close(): void; getLeaseRemainingMs?(): number; }
interface MiniPeerLeaseChannel { readyState?: string; }
interface MiniPeerLeaseOptions {
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
}
interface MiniPeerIntent { check(): void; current(): boolean; }
interface MiniPeerIntentRecord { token: MiniPeerIntent; promise: Promise<unknown>; reject(error: Error): void; }
(function exposeMiniPeerSessionManager(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniPeerSessionManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniPeerSessionManagerModule() {
  const MAX_LEASE_MS = 300000;
  // Intents outlive replaceable transport entries and own acquisition, not RTC.
  function createIntents() {
    const pending = new Map<string, MiniPeerIntentRecord>();
    const cancelled = () => new Error('Conexión Mini retirada. Reintenta.');
    function invalidate(key: string) {
      const record = pending.get(key);
      if (!record) return;
      pending.delete(key);
      record.reject(cancelled());
    }
    function run<T>(key: string, operation: (token: MiniPeerIntent) => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing.promise as Promise<T>;
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (error: unknown) => void;
      const result = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
      const token: MiniPeerIntent = {
        current: () => pending.get(key)?.token === token,
        check: () => { if (!token.current()) throw cancelled(); }
      };
      pending.set(key, { token, promise: result, reject });
      // Reserve even the delivered promise before calling code that can re-enter.
      // Cancellation settles the caller; it does not physically abort arbitrary work.
      try { void operation(token).then(resolve, reject); } catch (error) { reject(error); }
      const finish = () => { if (token.current()) pending.delete(key); };
      void result.then(finish, finish);
      return result;
    }
    return { run, invalidate, invalidateAll: () => { for (const key of [...pending.keys()]) invalidate(key); } };
  }
  function create(options: MiniPeerLeaseOptions = {}) {
    const now = options.now || (() => performance.now());
    const schedule = options.schedule || ((fn: () => void, delay: number) => setTimeout(fn, delay));
    const cancel = options.cancel || ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    function lease(session: MiniPeerLeaseSession, startedAt: number, onRetired: (reason: string) => void, eligibility: { guest?: boolean; transportOwnedExternally?: boolean } = {}) {
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
      let retirementReason: string | null = null;
      function retire(reason: string = 'unknown') {
        if (stopped) return;
        stopped = true;
        retirementReason = reason === 'lease-expired' ? reason : 'unknown';
        if (timer !== undefined) cancel(timer);
        const failure = () => new Error(reason === 'channel-closed'
          ? 'El canal se cerró. Reconecta para reintentar.'
          : 'La conexión expiró o se interrumpió. Reintenta.');
        for (const waiter of waiting) waiter.reject(failure());
        waiting.clear();
        running = false;
        for (const reject of operations) reject(failure());
        operations.clear();
        try { onRetired(retirementReason); } finally { try { if (eligibility.transportOwnedExternally !== true) session.close(); } catch { /* Isolated transport cleanup. */ } }
      }
      function valid(): boolean {
        if (!stopped && (now() >= deadline || credentialRemaining() <= 0)) retire('lease-expired');
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
        if (channel?.readyState === 'closing' || channel?.readyState === 'closed') {
          retire('channel-closed');
          return Promise.reject(new Error('El canal se cerró. Reconecta para reintentar.'));
        }
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
      return { session, ready, valid, retire, run, busy: () => running, deadline, getRetirementReason: () => retirementReason };
    }
    return { lease, now };
  }
  return { create, createIntents, MAX_LEASE_MS };
});
