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
            var _a;
            let settled = false;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                channel.removeEventListener('message', onMessage);
                resolve(result);
            };
            const onMessage = (event) => {
                const control = safeParse(core, event.data);
                if (!control || control.type !== 'backup-offer-reply' || control.data.offerId !== offer.offerId)
                    return;
                finish(control.data.accepted === true ? 'accepted' : 'declined');
            };
            const timer = setTimeout(() => finish('timeout'), (_a = options.timeoutMs) !== null && _a !== void 0 ? _a : DEFAULT_TIMEOUT_MS);
            channel.addEventListener('message', onMessage);
            try {
                core.sendControl(channel, 'backup-offer', offer);
            }
            catch {
                finish('closed');
            }
        });
    }
    function listenForOffers(channel, core, onOffer) {
        const onMessage = (event) => {
            const control = safeParse(core, event.data);
            if (!control || control.type !== 'backup-offer')
                return;
            const offer = control.data;
            let answered = false;
            const respond = (accepted) => {
                if (answered)
                    return;
                answered = true;
                try {
                    core.sendControl(channel, 'backup-offer-reply', { offerId: offer.offerId, accepted });
                }
                catch (error) {
                    console.warn('No se pudo responder la oferta de respaldo.', error);
                }
            };
            onOffer(offer, respond);
        };
        channel.addEventListener('message', onMessage);
        return () => channel.removeEventListener('message', onMessage);
    }
    function matchesOffer(offer, transfer) {
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
