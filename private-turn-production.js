"use strict";
// Optional production entry for https://miniasist.erlin.do. Inert unless the page sets
// `window.MiniProductionTurn = { enabled: true }`; any other shape or origin is refused.
(function exposePrivateTurnProduction(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.PrivateTurnProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var _a;
    let state = 'off';
    // The UI listens for `mini-turn-status` ({ relay }) to tell "direct connection only" from "relay available".
    function publish(status) {
        var _a;
        try {
            const Event = root.CustomEvent;
            if (Event)
                (_a = root.document) === null || _a === void 0 ? void 0 : _a.dispatchEvent(new Event('mini-turn-status', { detail: { relay: status } }));
        }
        catch { /* A missing or failing document never affects the connection. */ }
    }
    const marker = root.MiniProductionTurn;
    if (marker !== undefined) {
        try {
            if (!marker || typeof marker !== 'object' || Array.isArray(marker) || typeof marker.enabled !== 'boolean'
                || Object.keys(marker).some(key => key !== 'enabled'))
                throw new Error('TURN_PRODUCTION_CONFIGURATION_INVALID');
            if (marker.enabled) {
                if (((_a = root.location) === null || _a === void 0 ? void 0 : _a.origin) !== 'https://miniasist.erlin.do' || !root.PrivateTurnBootstrap)
                    throw new Error('TURN_PRODUCTION_CONFIGURATION_INVALID');
                root.PrivateTurnBootstrap.install({ enabled: true, profile: 'mini-production', appIdentity: 'mini',
                    contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' }, onRelayStatus: publish });
                state = 'active';
            }
        }
        catch {
            state = 'configuration-invalid';
        }
    }
    return { status: () => state };
});
