interface MiniAvailabilityAccountEpoch { current(peerId?: string): boolean; }
interface MiniAvailabilityAccountWatch { (): void; capture(): MiniAvailabilityAccountEpoch; invalidatePeer(peerId: string): void; }
interface MiniAvailabilityEvent { type: string; frame?: { type: string; data: { sdp?: string; usernameFragment?: string } }; }
interface MiniAvailabilitySignal {
  expiresAt?: number | null;
  onEvent(callback: (event: MiniAvailabilityEvent) => void): () => void;
  connect(): Promise<void>;
  send(type: string, data: unknown): void;
  close(reason?: string): void;
}
interface MiniAvailabilitySession {
  close(): void;
  startNegotiation?(): Promise<void>;
  pc?: { localDescription?: { sdp?: string } | null; remoteDescription?: { sdp?: string } | null };
}
interface MiniAvailabilityOptions {
  signaling: MiniAvailabilitySignal;
  localPeerId: string;
  remotePeerId: string;
  validateFrame(frame: unknown): NonNullable<MiniAvailabilityEvent['frame']>;
  createSession(options: { signaling: MiniAvailabilitySignal; initiator: boolean; demandNegotiation: { localPeerId: string; remotePeerId: string } }): Promise<MiniAvailabilitySession>;
  onState?(state: string, error?: unknown): void;
  setupTimeoutMs?: number;
}
(function exposeMiniPeerAvailability(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniPeerAvailability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function miniPeerAvailabilityModule() {
  function identity(sdp: string = ''): string | null {
    const origin = /^o=[^ ]+ ([^ ]+) ([^ ]+) /m.exec(sdp);
    const fragments = sdp.split(/\r?\n/).filter(line => line.startsWith('a=ice-ufrag:')).map(line => line.slice(12)).sort();
    return origin && fragments.length ? origin[1] + ':' + origin[2] + ':' + fragments.join(',') : null;
  }
  function create(options: MiniAvailabilityOptions) {
    if (!options.localPeerId || !options.remotePeerId || options.localPeerId === options.remotePeerId) throw new Error('Identidades Mini inválidas.');
    const signaling = options.signaling;
    const retired = new Set<string>();
    let stopped = false, off: (() => void) | null = null, generation = 0;
    let active: MiniAvailabilitySession | null = null;
    let setup: Promise<MiniAvailabilitySession> | null = null;
    let listeners = new Set<(event: MiniAvailabilityEvent) => void>();
    let buffered: MiniAvailabilityEvent[] = [], bytes = 0;
    let offerIdentity: string | null = null;
    let cancelSetup: ((error: Error) => void) | null = null;
    let localDemand = false, timer: ReturnType<typeof setTimeout> | null = null;
    function remember(value: string | null) {
      if (!value) return;
      retired.add(value);
      if (retired.size > 64) retired.delete(retired.values().next().value!);
    }
    function retire() {
      cancelSetup?.(new Error('Preparación Mini retirada.')); cancelSetup = null;
      generation++;
      remember(offerIdentity);
      remember(identity(active?.pc?.remoteDescription?.sdp));
      remember(identity(active?.pc?.localDescription?.sdp));
      const previous = active;
      active = null; setup = null; localDemand = false; offerIdentity = null;
      if (timer) clearTimeout(timer);
      timer = null; buffered = []; bytes = 0; listeners = new Set();
      try { previous?.close(); } catch { /* Transport does not own availability. */ }
      if (!stopped) options.onState?.('available');
    }
    function ensure(): Promise<MiniAvailabilitySession> {
      if (stopped) return Promise.reject(new Error('Disponibilidad Mini cerrada.'));
      if (setup) return setup;
      if (active) return Promise.resolve(active);
      const ownGeneration = generation;
      const ownListeners = listeners;
      const borrowed: MiniAvailabilitySignal = {
        expiresAt: null,
        connect: () => signaling.connect(),
        send: (type, data) => { if (stopped || generation !== ownGeneration) throw new Error('Conexión Mini retirada.'); signaling.send(type, data); },
        onEvent: callback => { ownListeners.add(callback); return () => ownListeners.delete(callback); },
        close: () => { /* RTC retirement must leave shared signaling available. */ }
      };
      timer = setTimeout(() => { if (ownGeneration === generation) { retire(); options.onState?.('error', new Error('La preparación Mini excedió el tiempo límite.')); } }, Math.min(30000, Math.max(1, options.setupTimeoutMs ?? 10000)));
      const cancelled = new Promise<MiniAvailabilitySession>((_resolve, reject) => { cancelSetup = reject; });
      const creation = Promise.resolve().then(() => {
        if (stopped || ownGeneration !== generation) throw new Error('Preparación Mini retirada.');
        return options.createSession({ signaling: borrowed, initiator: false,
          demandNegotiation: { localPeerId: options.localPeerId, remotePeerId: options.remotePeerId } });
      }).then(async session => {
        if (stopped || ownGeneration !== generation) { session.close(); throw new Error('Preparación Mini retirada.'); }
        active = session;
        const queue = buffered; buffered = []; bytes = 0;
        for (const event of queue) for (const callback of ownListeners) callback(event);
        if (localDemand && !offerIdentity) await session.startNegotiation?.();
        if (stopped || ownGeneration !== generation) throw new Error('Preparación Mini retirada.');
        setup = null; cancelSetup = null;
        if (timer) clearTimeout(timer); timer = null;
        options.onState?.('connecting');
        return session;
      }).catch(error => {
        if (ownGeneration === generation && !stopped) { retire(); options.onState?.('error', error); }
        throw error;
      });
      setup = Promise.race([creation, cancelled]);
      return setup;
    }
    function receive(event: MiniAvailabilityEvent) {
      if (stopped) return;
      if (['peer-left', 'socket-closed', 'socket-error', 'error'].includes(event.type)) {
        for (const callback of listeners) callback(event);
        retire();
        if (event.type !== 'peer-left') options.onState?.('signaling-error');
        return;
      }
      // Membership is availability, not an instruction to allocate TURN.
      if (event.type !== 'signal' || !event.frame) return;
      let frame: NonNullable<MiniAvailabilityEvent['frame']>;
      try { frame = options.validateFrame(event.frame); } catch (error) { options.onState?.('error', error); return; }
      const id = identity(frame.data.sdp);
      if (id && retired.has(id)) return;
      if (!active && !setup && frame.type !== 'offer') return;
      if (frame.type === 'offer') {
        if (!id) return;
        const currentIdentity = offerIdentity || identity(active?.pc?.remoteDescription?.sdp);
        if (active && currentIdentity && currentIdentity !== id) retire();
        offerIdentity = id;
      }
      const validated = { type: 'signal', frame };
      if (active) { for (const callback of listeners) callback(validated); return; }
      const size = JSON.stringify(validated).length;
      if (buffered.length >= 64 || bytes + size > 256 * 1024) { retire(); options.onState?.('error', new Error('Demasiadas señales Mini pendientes.')); return; }
      buffered.push(validated); bytes += size;
      void ensure().catch(() => { /* State callback owns setup failure reporting. */ });
    }
    return {
      async start() { if (stopped) throw new Error('Disponibilidad Mini cerrada.'); if (!off) off = signaling.onEvent(receive); await signaling.connect(); if (stopped) throw new Error('Disponibilidad Mini cerrada.'); if (!active && !setup) options.onState?.('available'); },
      demand() { localDemand = true; return ensure(); },
      retire,
      stop() { if (stopped) return; stopped = true; retire(); off?.(); off = null; signaling.close('availability-stop'); },
      getSession: () => active
    };
  }
  function watchAccount(auth: { currentUser?: { uid?: string } | null; onAuthStateChanged(callback: (user: { uid?: string } | null) => void): () => void } | null, changed: (epoch: MiniAvailabilityAccountEpoch) => void): MiniAvailabilityAccountWatch {
    const initialUid = auth?.currentUser?.uid || null;
    let first = true, generation = 0, disposed = false;
    const peers = new Map<string, number>();
    function capture(): MiniAvailabilityAccountEpoch {
      const ownGeneration = generation, snapshot = new Map(peers);
      return { current: peerId => !disposed && generation === ownGeneration && (peerId === undefined || (peers.get(peerId) || 0) === (snapshot.get(peerId) || 0)) };
    }
    const off = auth?.onAuthStateChanged(user => {
      if (disposed) return;
      if (first) { first = false; if ((user?.uid || null) === initialUid) return; }
      generation++; peers.clear();
      changed(capture());
    }) || (() => {});
    return Object.assign(() => { if (disposed) return; disposed = true; generation++; peers.clear(); off(); }, {
      capture,
      invalidatePeer: (peerId: string) => { peers.set(peerId, (peers.get(peerId) || 0) + 1); }
    });
  }

  return { create, watchAccount };
});
