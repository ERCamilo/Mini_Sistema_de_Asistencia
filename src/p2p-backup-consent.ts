// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.P2PBackupConsent` (browser global consumed by p2p-roster-ui.js).
// AirDrop-style consent for P2P backups: the sender offers (name, size, schema)
// over the authenticated channel and only streams bytes after the receiver
// accepts. The receiver then admits only the transfer that matches the offer.

interface ConsentOffer {
  offerId: string;
  schema: string;
  size: number;
  senderName: string;
}

interface ConsentChannel {
  readyState?: string;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

interface ConsentControlFrame {
  type: string;
  data: any;
}

interface ConsentCore {
  sendControl(channel: ConsentChannel, type: string, data: unknown): void;
  parseControl(data: unknown): ConsentControlFrame | null;
}

type ConsentResult = 'accepted' | 'declined' | 'timeout' | 'closed';

(function exposeP2PBackupConsent(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.P2PBackupConsent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createP2PBackupConsentModule() {
  const DEFAULT_TIMEOUT_MS = 90_000;

  function createOfferId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'offer-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Invalid control frames throw in core.parseControl; for consent they are just "not mine".
  function safeParse(core: ConsentCore, data: unknown): ConsentControlFrame | null {
    try { return core.parseControl(data); } catch { return null; }
  }

  function requestConsent(
    channel: ConsentChannel,
    core: ConsentCore,
    offer: ConsentOffer,
    options: { timeoutMs?: number } = {}
  ): Promise<ConsentResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: ConsentResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.removeEventListener('message', onMessage);
        resolve(result);
      };
      const onMessage = (event: { data: unknown }) => {
        const control = safeParse(core, event.data);
        if (!control || control.type !== 'backup-offer-reply' || control.data.offerId !== offer.offerId) return;
        finish(control.data.accepted === true ? 'accepted' : 'declined');
      };
      const timer = setTimeout(() => finish('timeout'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      channel.addEventListener('message', onMessage);
      try {
        core.sendControl(channel, 'backup-offer', offer);
      } catch {
        finish('closed');
      }
    });
  }

  function listenForOffers(
    channel: ConsentChannel,
    core: ConsentCore,
    onOffer: (offer: ConsentOffer, respond: (accepted: boolean) => void) => void
  ): () => void {
    const onMessage = (event: { data: unknown }) => {
      const control = safeParse(core, event.data);
      if (!control || control.type !== 'backup-offer') return;
      const offer = control.data as ConsentOffer;
      let answered = false;
      const respond = (accepted: boolean) => {
        if (answered) return;
        answered = true;
        try {
          core.sendControl(channel, 'backup-offer-reply', { offerId: offer.offerId, accepted });
        } catch (error) {
          console.warn('No se pudo responder la oferta de respaldo.', error);
        }
      };
      onOffer(offer, respond);
    };
    channel.addEventListener('message', onMessage);
    return () => channel.removeEventListener('message', onMessage);
  }

  function matchesOffer(offer: ConsentOffer | null, transfer: { schema?: unknown; size?: unknown }): boolean {
    return !!offer && transfer.schema === offer.schema && transfer.size === offer.size;
  }

  return {
    DEFAULT_TIMEOUT_MS,
    createOfferId,
    requestConsent,
    listenForOffers,
    matchesOffer
  };
});
