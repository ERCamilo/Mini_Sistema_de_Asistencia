"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.P2PBackupConsent` (browser global consumed by p2p-roster-ui.js).
// AirDrop-style consent for P2P backups: the sender offers (name, size, schema)
// over the authenticated channel and only streams bytes after the receiver
// accepts. The receiver then admits only the transfer that matches the offer.
(function exposeP2PBackupConsent(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.P2PBackupConsent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createP2PBackupConsentModule() {
    const DEFAULT_TIMEOUT_MS = 90000;
    // The trusted handshake finishes at different moments on each phone (each side
    // writes IndexedDB first), so an offer sent right after authenticating can reach a
    // peer that is not listening yet. The sender repeats it; the receiver dedupes.
    const DEFAULT_RESEND_MS = 2000;
    function createOfferId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            return crypto.randomUUID();
        return 'offer-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    // Invalid control frames throw in core.parseControl; for consent they are just "not mine".
    function safeParse(core, data) {
        try {
            return core.parseControl(data);
        }
        catch {
            return null;
        }
    }
    function requestConsent(channel, core, offer, options = {}) {
        return new Promise(resolve => {
            var _a, _b;
            let settled = false;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                clearInterval(resend);
                channel.removeEventListener('message', onMessage);
                resolve(result);
            };
            const sendOffer = () => {
                try {
                    core.sendControl(channel, 'backup-offer', offer);
                }
                catch {
                    finish('closed');
                }
            };
            const onMessage = (event) => {
                const control = safeParse(core, event.data);
                if (!control || control.type !== 'backup-offer-reply' || control.data.offerId !== offer.offerId)
                    return;
                finish(control.data.accepted === true ? 'accepted' : 'declined');
            };
            const timer = setTimeout(() => finish('timeout'), (_a = options.timeoutMs) !== null && _a !== void 0 ? _a : DEFAULT_TIMEOUT_MS);
            const resend = setInterval(() => { if (!settled)
                sendOffer(); }, (_b = options.resendMs) !== null && _b !== void 0 ? _b : DEFAULT_RESEND_MS);
            channel.addEventListener('message', onMessage);
            sendOffer();
        });
    }
    // Listen from the moment the channel opens; hold offers until release() (called
    // once the channel is authenticated). Each offerId is delivered only once.
    function bufferOffers(channel, core) {
        const seen = new Set();
        const pending = new Set();
        let detached = false;
        const MAX_OFFERS = 64;
        const queued = [];
        let handler = null;
        const deliver = (offer) => {
            if (detached)
                return;
            if (!handler) {
                queued.push(offer);
                return;
            }
            let answered = false;
            handler(offer, accepted => {
                if (answered || detached)
                    return;
                answered = true;
                pending.delete(offer.offerId);
                try {
                    core.sendControl(channel, 'backup-offer-reply', { offerId: offer.offerId, accepted });
                }
                catch (error) {
                    console.warn('No se pudo responder la oferta de respaldo.', error);
                }
            });
        };
        const onMessage = (event) => {
            const control = safeParse(core, event.data);
            if (!control || control.type !== 'backup-offer')
                return;
            const offer = control.data;
            if (detached || seen.has(offer.offerId))
                return;
            if (seen.size >= MAX_OFFERS) {
                // Keep unanswered offers pinned so they cannot be redelivered.
                const answeredId = [...seen].find(id => !pending.has(id));
                if (answeredId !== undefined)
                    seen.delete(answeredId);
                else {
                    try {
                        core.sendControl(channel, 'backup-offer-reply', { offerId: offer.offerId, accepted: false });
                    }
                    catch { /* Safe rejection. */ }
                    return;
                }
            }
            seen.add(offer.offerId);
            pending.add(offer.offerId);
            deliver(offer);
        };
        channel.addEventListener('message', onMessage);
        return {
            release(onOffer) {
                if (detached)
                    return;
                handler = onOffer;
                for (const offer of queued.splice(0))
                    deliver(offer);
            },
            detach() {
                detached = true;
                handler = null;
                seen.clear();
                pending.clear();
                queued.length = 0;
                channel.removeEventListener('message', onMessage);
            }
        };
    }
    function listenForOffers(channel, core, onOffer) {
        const inbox = bufferOffers(channel, core);
        inbox.release(onOffer);
        return inbox.detach;
    }
    function matchesOffer(offer, transfer) {
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
