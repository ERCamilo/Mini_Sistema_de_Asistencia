"use strict";
(function exposePrivateTurnPublicPreview(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.PrivateTurnPublicPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    var _a;
    let state = 'inert';
    const marker = root.MiniPublicTurnPreview;
    if (marker !== undefined) {
        try {
            if (!marker || marker.enabled !== true || marker.label !== 'beta 1.9'
                || typeof marker.revision !== 'string' || !/^[a-f0-9]{7,40}$/.test(marker.revision)
                || Object.keys(marker).some(key => !['enabled', 'label', 'revision'].includes(key))
                || ((_a = root.location) === null || _a === void 0 ? void 0 : _a.origin) !== 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev'
                || !root.PrivateTurnBootstrap)
                throw new Error('TURN_PUBLIC_CONFIGURATION_INVALID');
            root.PrivateTurnBootstrap.install({ enabled: true, profile: 'mini-pages-turn-test', appIdentity: 'mini',
                forceRelay: true, diagnostics: true, contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-seconds', clockSource: 'issuer' },
                previewRelease: { label: marker.label, revision: marker.revision } });
            state = 'active';
        }
        catch {
            state = 'configuration-invalid';
            const doc = root.document;
            if ((doc === null || doc === void 0 ? void 0 : doc.body) && !doc.getElementById('mini-public-turn-status')) {
                const message = doc.createElement('p');
                message.id = 'mini-public-turn-status';
                message.setAttribute('role', 'alert');
                message.textContent = 'La configuración de la prueba TURN no está disponible. El respaldo pendiente se conserva.';
                doc.body.appendChild(message);
            }
        }
    }
    return { status: () => state };
});
