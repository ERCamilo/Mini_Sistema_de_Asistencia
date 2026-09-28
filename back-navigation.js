"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.BackNavigation` (browser global consumed by index.html).
// Android/browser "back" behaves like a native app: it closes the top layer
// (dialog, sheet, P2P step, secondary tab) and only leaves the app at the root.
// One guard history entry exists while anything is open; it is consumed
// silently when the UI returns to the root by other means (close buttons).
(function exposeBackNavigation(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.BackNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBackNavigationModule() {
    function createBackNavigation(options) {
        // A reload (e.g. the service-worker auto-update) keeps the current history
        // entry; if it is our guard, adopt it instead of stacking another one.
        const current = options.history.state;
        let guarded = !!(current && current.miniBackGuard === true);
        let consuming = false;
        function pushGuard() {
            options.history.pushState({ miniBackGuard: true }, '');
            guarded = true;
        }
        function safeResolve() {
            try {
                return options.resolveLayer();
            }
            catch (error) {
                console.warn('No se pudo resolver la capa para "atrás".', error);
                return null;
            }
        }
        function sync() {
            if (consuming)
                return;
            const layer = safeResolve();
            if (layer && !guarded) {
                pushGuard();
            }
            else if (!layer && guarded) {
                consuming = true;
                guarded = false;
                options.history.back();
            }
        }
        function handlePop() {
            if (consuming) {
                consuming = false;
                sync();
                return;
            }
            guarded = false;
            const layer = safeResolve();
            if (layer === 'block') {
                pushGuard();
                return;
            }
            if (typeof layer === 'function') {
                try {
                    layer();
                }
                catch (error) {
                    console.warn('No se pudo cerrar la capa con "atrás".', error);
                }
            }
            sync();
        }
        options.addPopListener(handlePop);
        return { sync, handlePop, isGuarded: () => guarded };
    }
    return { createBackNavigation };
});
