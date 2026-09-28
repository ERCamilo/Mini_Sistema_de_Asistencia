"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.StorageHelp` (browser global consumed by index.html).
// When to show the "almacenamiento casi lleno" help popup.
(function exposeStorageHelp(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.StorageHelp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStorageHelpModule() {
    const PROMPT_THRESHOLD_PCT = 80;
    const SNOOZE_MS = 24 * 60 * 60 * 1000;
    const SNOOZE_KEY = 'storageHelpSnoozedUntil';
    function shouldPrompt(input) {
        if (!(input.usagePct >= PROMPT_THRESHOLD_PCT))
            return false;
        return !(Number(input.snoozedUntil) > input.now);
    }
    function snoozeUntil(now) {
        return now + SNOOZE_MS;
    }
    return { PROMPT_THRESHOLD_PCT, SNOOZE_KEY, shouldPrompt, snoozeUntil };
});
