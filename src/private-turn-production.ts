interface PrivateTurnProductionRoot {
    location?: { origin: string };
    MiniProductionTurn?: unknown;
    PrivateTurnBootstrap?: { install(options: PrivateTurnBootstrapOptions): PrivateTurnBootstrapHandle };
    document?: { dispatchEvent(event: unknown): unknown };
    CustomEvent?: new (type: string, init: { detail: unknown }) => unknown;
}
// Optional production entry for https://miniasist.erlin.do. Inert unless the page sets
// `window.MiniProductionTurn = { enabled: true }`; any other shape or origin is refused.
(function exposePrivateTurnProduction(root: any, factory: (root: PrivateTurnProductionRoot) => unknown) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    if (root) root.PrivateTurnProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root: PrivateTurnProductionRoot) {
    let state: 'off' | 'active' | 'configuration-invalid' = 'off';
    // The UI listens for `mini-turn-status` ({ relay }) to tell "direct connection only" from "relay available".
    function publish(status: PrivateTurnRelayStatus): void {
        try {
            const Event = root.CustomEvent;
            if (Event) root.document?.dispatchEvent(new Event('mini-turn-status', { detail: { relay: status } }));
        } catch { /* A missing or failing document never affects the connection. */ }
    }
    const marker = root.MiniProductionTurn as { enabled?: unknown } | null | undefined;
    if (marker !== undefined) {
        try {
            if (!marker || typeof marker !== 'object' || Array.isArray(marker) || typeof marker.enabled !== 'boolean'
                || Object.keys(marker).some(key => key !== 'enabled')) throw new Error('TURN_PRODUCTION_CONFIGURATION_INVALID');
            if (marker.enabled) {
                if (root.location?.origin !== 'https://miniasist.erlin.do' || !root.PrivateTurnBootstrap) throw new Error('TURN_PRODUCTION_CONFIGURATION_INVALID');
                root.PrivateTurnBootstrap.install({ enabled: true, profile: 'mini-production', appIdentity: 'mini',
                    contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' }, onRelayStatus: publish });
                state = 'active';
            }
        } catch {
            state = 'configuration-invalid';
        }
    }
    return { status: () => state };
});
