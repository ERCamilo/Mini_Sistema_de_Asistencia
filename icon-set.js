"use strict";
// UMD wrapper: exposes window.IconSet (browser) + module.exports (node --test).
// module:"none" gives every src/*.ts one shared global scope, so all type names here
// are Icon-prefixed to avoid colliding with employee-number-rules / draft-import /
// attendance-report. `module` is already declared ambiently by employee-number-rules.ts
// in that shared scope, so we must NOT redeclare it here (would be a TS2451 error).
//
// The app can render every icon either as a unicode emoji (the legacy look) or as a
// lightweight Lucide line icon (SVG, ISC license). Both modes are fully offline: the
// SVG bodies live here, so no font/CDN is loaded at runtime. Lucide icons inherit the
// theme color via `currentColor`, so they re-theme for free.
(function exposeIconSet(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.IconSet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIconSetApi() {
    const ICON_STYLES = ['lucide', 'emoji'];
    const DEFAULT_ICON_STYLE = 'lucide';
    // Semantic name -> { emoji fallback, Lucide body }. Lucide v1.21.0 (ISC).
    const ICONS = {
        attendance: { emoji: '📋', body: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>' },
        employees: { emoji: '👥', body: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>' },
        reports: { emoji: '📊', body: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>' },
        more: { emoji: '⋯', body: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>' },
        add: { emoji: '＋', body: '<path d="M5 12h14"/><path d="M12 5v14"/>' },
        daily: { emoji: '📅', body: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>' },
        weekly: { emoji: '🗓️', body: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>' },
        palette: { emoji: '🎨', body: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>' },
        settings: { emoji: '⚙️', body: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>' },
        search: { emoji: '🔍', body: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>' },
        clock: { emoji: '⏱️', body: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' },
        camera: { emoji: '📷', body: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>' },
        gallery: { emoji: '🖼️', body: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>' },
        edit: { emoji: '✏️', body: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>' },
        trash: { emoji: '🗑️', body: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' },
        backup: { emoji: '💾', body: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>' },
        restore: { emoji: '📂', body: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>' },
        replace: { emoji: '🔁', body: '<path d="M14 4a1 1 0 0 1 1-1"/><path d="M15 10a1 1 0 0 1-1-1"/><path d="M21 4a1 1 0 0 0-1-1"/><path d="M21 9a1 1 0 0 1-1 1"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a2 2 0 0 1 2-2h2"/><rect x="3" y="14" width="7" height="7" rx="1"/>' },
        addMany: { emoji: '➕', body: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>' },
        install: { emoji: '📲', body: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>' },
        refresh: { emoji: '🔄', body: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>' },
        chevronLeft: { emoji: '❮', body: '<path d="m15 18-6-6 6-6"/>' },
        chevronRight: { emoji: '❯', body: '<path d="m9 18 6-6-6-6"/>' },
        check: { emoji: '✓', body: '<path d="M20 6 9 17l-5-5"/>' },
        close: { emoji: '✕', body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
        hash: { emoji: '🔢', body: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>' },
        conflict: { emoji: '⛔', body: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>' },
        warning: { emoji: '⚠️', body: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>' },
        inbox: { emoji: '📭', body: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>' },
        success: { emoji: '✅', body: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
        bell: { emoji: '🔔', body: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>' }
    };
    const FALLBACK = { emoji: '•', body: '<circle cx="12" cy="12" r="3"/>' };
    const SVG_OPEN = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true" focusable="false">';
    const SVG_CLOSE = '</svg>';
    function normalizeIconStyle(style) {
        return style === 'emoji' ? 'emoji' : DEFAULT_ICON_STYLE;
    }
    function getDef(name) {
        return Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : FALLBACK;
    }
    function hasIcon(name) {
        return Object.prototype.hasOwnProperty.call(ICONS, name);
    }
    function iconNames() {
        return Object.keys(ICONS);
    }
    function iconEmoji(name) {
        return getDef(name).emoji;
    }
    function iconSvg(name) {
        return SVG_OPEN + getDef(name).body + SVG_CLOSE;
    }
    function iconMarkup(name, style) {
        return normalizeIconStyle(style) === 'emoji' ? iconEmoji(name) : iconSvg(name);
    }
    function resolveIcon(name, style) {
        const kindEmoji = normalizeIconStyle(style) === 'emoji';
        return {
            kind: kindEmoji ? 'emoji' : 'svg',
            value: kindEmoji ? iconEmoji(name) : iconSvg(name),
            name: name
        };
    }
    return {
        ICON_STYLES,
        DEFAULT_ICON_STYLE,
        normalizeIconStyle,
        hasIcon,
        iconNames,
        iconEmoji,
        iconSvg,
        iconMarkup,
        resolveIcon
    };
});
