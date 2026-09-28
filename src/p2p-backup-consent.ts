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
  // The trusted handshake finishes at different moments on each phone (each side
  // writes IndexedDB first), so an offer sent right after authenticating can reach a
  // peer that is not listening yet. The sender repeats it; the receiver dedupes.
  const DEFAULT_RESEND_MS = 2_000;

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
    options: { timeoutMs?: number; resendMs?: number } = {}
  ): Promise<ConsentResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: ConsentResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(resend);
        channel.removeEventListener('message', onMessage);
        resolve(result);
      };
      const sendOffer = () => {
        try {
          core.sendControl(channel, 'backup-offer', offer);
        } catch {
          finish('closed');
        }
      };
      const onMessage = (event: { data: unknown }) => {
        const control = safeParse(core, event.data);
        if (!control || control.type !== 'backup-offer-reply' || control.data.offerId !== offer.offerId) return;
        finish(control.data.accepted === true ? 'accepted' : 'declined');
      };
      const timer = setTimeout(() => finish('timeout'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const resend = setInterval(() => { if (!settled) sendOffer(); }, options.resendMs ?? DEFAULT_RESEND_MS);
      channel.addEventListener('message', onMessage);
      sendOffer();
    });
  }

  type OfferHandler = (offer: ConsentOffer, respond: (accepted: boolean) => void) => void;

  // Listen from the moment the channel opens; hold offers until release() (called
  // once the channel is authenticated). Each offerId is delivered only once.
  function bufferOffers(channel: ConsentChannel, core: ConsentCore) {
    const seen = new Set<string>();
    const queued: ConsentOffer[] = [];
    let handler: OfferHandler | null = null;

    const deliver = (offer: ConsentOffer) => {
      if (!handler) { queued.push(offer); return; }
      let answered = false;
      handler(offer, accepted => {
        if (answered) return;
        answered = true;
        try {
          core.sendControl(channel, 'backup-offer-reply', { offerId: offer.offerId, accepted });
        } catch (error) {
          console.warn('No se pudo responder la oferta de respaldo.', error);
        }
      });
    };
    const onMessage = (event: { data: unknown }) => {
      const control = safeParse(core, event.data);
      if (!control || control.type !== 'backup-offer') return;
      const offer = control.data as ConsentOffer;
      if (seen.has(offer.offerId)) return;
      seen.add(offer.offerId);
      deliver(offer);
    };
    channel.addEventListener('message', onMessage);
    return {
      release(onOffer: OfferHandler) {
        handler = onOffer;
        for (const offer of queued.splice(0)) deliver(offer);
      },
      detach() {
        handler = null;
        queued.length = 0;
        channel.removeEventListener('message', onMessage);
      }
    };
  }

  function listenForOffers(channel: ConsentChannel, core: ConsentCore, onOffer: OfferHandler): () => void {
    const inbox = bufferOffers(channel, core);
    inbox.release(onOffer);
    return inbox.detach;
  }

  function matchesOffer(offer: ConsentOffer | null, transfer: { schema?: unknown; size?: unknown }): boolean {
    return !!offer && transfer.schema === offer.schema && transfer.size === offer.size;
  }

  return {
    DEFAULT_TIMEOUT_MS,
    createOfferId,
    requestConsent,
    bufferOffers,
    listenForOffers,
    matchesOffer
  };
});
