"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.MiniNotice` (browser global consumed by index.html and P2P UI).
// Physics-based "Sileo-like" notices without React or external libraries:
// a pill (header) and a body share one gooey SVG filter, so expanding the pill
// into a card looks like liquid. Width/height follow a spring (bounce .25, 600ms).
(function exposeMiniNotice(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniNotice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniNoticeModule() {
    const HEADER_HEIGHT = 40;
    const MAX_WIDTH = 360;
    const MAX_VISIBLE = 3;
    const EXIT_MS = 260;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    // Spring equivalent to Sileo's { bounce: 0.25, duration: 0.6s }.
    const OMEGA = (2 * Math.PI) / 0.6;
    const STIFFNESS = OMEGA * OMEGA;
    const DAMPING = 2 * 0.75 * OMEGA;
    const RING_CIRCUMFERENCE = 2 * Math.PI * 9;
    function springStep(state, target, dt) {
        let { value, velocity } = state;
        let remaining = Math.min(Math.max(dt, 0), 0.1);
        while (remaining > 0) {
            const step = Math.min(remaining, 1 / 120);
            const acceleration = -STIFFNESS * (value - target) - DAMPING * velocity;
            velocity += acceleration * step;
            value += velocity * step;
            remaining -= step;
        }
        return { value, velocity };
    }
    function autoDismissMs(options) {
        if (options.actions && options.actions.length > 0)
            return null;
        if (options.state === 'loading' || options.state === 'progress' || options.state === 'action')
            return null;
        if (typeof options.duration === 'number')
            return options.duration;
        if (options.duration === null)
            return null;
        return options.state === 'error' ? 7000 : 4000;
    }
    // Oldest first; notices waiting for a decision (Accept/Decline) are never dropped.
    function pickOverflow(entries, max) {
        const extra = entries.length - max;
        if (extra <= 0)
            return [];
        return entries.filter(entry => !entry.needsDecision).slice(0, extra).map(entry => entry.id);
    }
    function clampProgress(value) {
        const number = Number(value);
        if (!Number.isFinite(number))
            return 0;
        return Math.min(1, Math.max(0, number));
    }
    function iconMarkup(state, progress) {
        const open = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
        if (state === 'loading')
            return `${open}<path class="mini-notice-spin" d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>`;
        if (state === 'progress') {
            const offset = (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2);
            return `${open}<circle cx="12" cy="12" r="9" opacity=".25"/><circle class="mini-notice-ring" cx="12" cy="12" r="9" stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${offset}" transform="rotate(-90 12 12)"/></svg>`;
        }
        if (state === 'success')
            return `${open}<path class="mini-notice-draw" pathLength="1" d="M20 6 9 17l-5-5"/></svg>`;
        if (state === 'error')
            return `${open}<path class="mini-notice-draw" pathLength="1" d="M18 6 6 18"/><path class="mini-notice-draw" pathLength="1" d="m6 6 12 12"/></svg>`;
        if (state === 'action')
            return `${open}<path d="M12 3v12"/><path class="mini-notice-bob" d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
        return `${open}<path d="M8 7h12l-3-3"/><path d="M16 17H4l3 3"/></svg>`;
    }
    function createNoticeCenter(doc, win) {
        const notices = new Map();
        let viewport = null;
        let counter = 0;
        const reducedMotion = () => !!win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
        function ensureViewport() {
            if (viewport && doc.body.contains(viewport))
                return viewport;
            viewport = doc.createElement('div');
            viewport.className = 'mini-notice-viewport';
            viewport.setAttribute('aria-live', 'polite');
            doc.body.appendChild(viewport);
            return viewport;
        }
        function createNotice(id, initial) {
            let options = { ...initial };
            let expanded = false;
            let exiting = false;
            let frame = 0;
            let lastTime = 0;
            let dismissTimer;
            let expandTimer;
            const pill = { value: HEADER_HEIGHT, velocity: 0 };
            const body = { value: 0, velocity: 0 };
            const filterId = `mini-notice-goo-${id}`;
            const el = doc.createElement('div');
            el.className = 'mini-notice';
            el.innerHTML = `
        <svg class="mini-notice-canvas" aria-hidden="true">
          <defs><filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo"/>
            <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
          </filter></defs>
          <g filter="url(#${filterId})"><rect class="mini-notice-pill" rx="20" ry="20"/><rect class="mini-notice-body" rx="18" ry="18"/></g>
        </svg>
        <button type="button" class="mini-notice-header"><span class="mini-notice-stack"></span></button>
        <div class="mini-notice-content"><p class="mini-notice-description"></p><div class="mini-notice-actions"></div></div>`;
            const svg = el.querySelector('svg');
            const pillRect = el.querySelector('.mini-notice-pill');
            const bodyRect = el.querySelector('.mini-notice-body');
            const header = el.querySelector('.mini-notice-header');
            const stack = el.querySelector('.mini-notice-stack');
            const content = el.querySelector('.mini-notice-content');
            const description = el.querySelector('.mini-notice-description');
            const actionsBox = el.querySelector('.mini-notice-actions');
            function width() {
                return Math.min(MAX_WIDTH, (win.innerWidth || MAX_WIDTH) - 24);
            }
            function hasContent() {
                return !!options.description || !!(options.actions && options.actions.length);
            }
            function targets() {
                const inner = stack.lastElementChild;
                const pillWidth = Math.min(width(), Math.max(HEADER_HEIGHT, (inner ? inner.scrollWidth : 0) + 24));
                const bodyHeight = expanded && hasContent() ? content.scrollHeight : 0;
                return { pillWidth, bodyHeight };
            }
            function paint() {
                const w = width();
                const pillWidth = Math.max(HEADER_HEIGHT, pill.value);
                const bodyHeight = Math.max(0, body.value);
                const total = HEADER_HEIGHT + bodyHeight;
                el.style.width = `${w}px`;
                el.style.height = `${total}px`;
                svg.setAttribute('width', String(w));
                svg.setAttribute('height', String(total + 12));
                pillRect.setAttribute('x', String((w - pillWidth) / 2));
                pillRect.setAttribute('y', '0');
                pillRect.setAttribute('width', String(pillWidth));
                pillRect.setAttribute('height', String(HEADER_HEIGHT));
                bodyRect.setAttribute('x', '0');
                bodyRect.setAttribute('y', String(HEADER_HEIGHT - 2));
                bodyRect.setAttribute('width', String(w));
                bodyRect.setAttribute('height', String(bodyHeight > 1 ? bodyHeight + 2 : 0));
                header.style.width = `${pillWidth}px`;
                content.style.height = `${bodyHeight}px`;
                content.style.opacity = bodyHeight > 8 ? String(Math.min(1, bodyHeight / Math.max(1, content.scrollHeight))) : '0';
            }
            function animate() {
                const goal = targets();
                if (reducedMotion()) {
                    pill.value = goal.pillWidth;
                    pill.velocity = 0;
                    body.value = goal.bodyHeight;
                    body.velocity = 0;
                    paint();
                    return;
                }
                if (frame)
                    return;
                lastTime = 0;
                const tick = (time) => {
                    const dt = lastTime ? (time - lastTime) / 1000 : 1 / 60;
                    lastTime = time;
                    const next = targets();
                    Object.assign(pill, springStep(pill, next.pillWidth, dt));
                    Object.assign(body, springStep(body, next.bodyHeight, dt));
                    paint();
                    const settled = Math.abs(pill.value - next.pillWidth) < 0.3 && Math.abs(pill.velocity) < 0.3
                        && Math.abs(body.value - next.bodyHeight) < 0.3 && Math.abs(body.velocity) < 0.3;
                    if (settled) {
                        pill.value = next.pillWidth;
                        body.value = next.bodyHeight;
                        paint();
                        frame = 0;
                        return;
                    }
                    frame = win.requestAnimationFrame(tick);
                };
                frame = win.requestAnimationFrame(tick);
            }
            function renderHeader(previous) {
                const progress = clampProgress(options.progress);
                const sameLayer = previous && previous.state === options.state && previous.title === options.title;
                const current = stack.lastElementChild;
                if (sameLayer && current) {
                    const ring = current.querySelector('.mini-notice-ring');
                    if (ring)
                        ring.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2));
                    return;
                }
                const inner = doc.createElement('span');
                inner.className = 'mini-notice-inner';
                inner.innerHTML = `<span class="mini-notice-badge">${iconMarkup(options.state, progress)}</span><span class="mini-notice-title"></span>`;
                inner.querySelector('.mini-notice-title').textContent = options.title;
                if (current) {
                    current.classList.add('is-leaving');
                    setTimeout(() => current.remove(), 420);
                }
                stack.appendChild(inner);
            }
            function renderContent() {
                description.textContent = options.description || '';
                description.hidden = !options.description;
                actionsBox.innerHTML = '';
                for (const action of options.actions || []) {
                    const button = doc.createElement('button');
                    button.type = 'button';
                    button.className = `mini-notice-button is-${action.tone || 'secondary'}`;
                    button.textContent = action.label;
                    button.addEventListener('click', event => {
                        event.stopPropagation();
                        action.onSelect();
                    });
                    actionsBox.appendChild(button);
                }
                actionsBox.hidden = !(options.actions && options.actions.length);
            }
            function scheduleDismiss() {
                clearTimeout(dismissTimer);
                const ms = autoDismissMs(options);
                if (ms === null)
                    return;
                dismissTimer = setTimeout(() => {
                    if (expanded && hasContent()) {
                        expanded = false;
                        el.dataset.expanded = 'false';
                        animate();
                        dismissTimer = setTimeout(dismiss, 380);
                    }
                    else {
                        dismiss();
                    }
                }, ms);
            }
            function apply(next, previous) {
                options = next;
                el.dataset.state = options.state;
                const needsDecision = !!(options.actions && options.actions.length);
                el.setAttribute('role', needsDecision ? 'alertdialog' : 'status');
                el.setAttribute('aria-label', [options.title, options.description].filter(Boolean).join('. '));
                renderHeader(previous);
                renderContent();
                if (needsDecision)
                    expanded = true;
                el.dataset.expanded = String(expanded);
                animate();
                scheduleDismiss();
            }
            function dismiss() {
                var _a;
                if (exiting)
                    return;
                exiting = true;
                clearTimeout(dismissTimer);
                clearTimeout(expandTimer);
                if (frame)
                    win.cancelAnimationFrame(frame);
                el.dataset.exiting = 'true';
                notices.delete(id);
                setTimeout(() => el.remove(), reducedMotion() ? 0 : EXIT_MS);
                try {
                    (_a = options.onDismiss) === null || _a === void 0 ? void 0 : _a.call(options);
                }
                catch (error) {
                    console.warn('Aviso: onDismiss falló.', error);
                }
            }
            header.addEventListener('click', () => {
                if (!hasContent())
                    return;
                expanded = !expanded;
                el.dataset.expanded = String(expanded);
                animate();
            });
            let startY = null;
            el.addEventListener('pointerdown', event => { startY = event.clientY; });
            el.addEventListener('pointerup', event => {
                const moved = startY === null ? 0 : event.clientY - startY;
                startY = null;
                if (moved < -30 && !(options.actions && options.actions.length))
                    dismiss();
            });
            ensureViewport().prepend(el);
            apply(options, null);
            paint();
            win.requestAnimationFrame(() => { el.dataset.ready = 'true'; });
            if (hasContent()) {
                expandTimer = setTimeout(() => {
                    expanded = true;
                    el.dataset.expanded = 'true';
                    animate();
                }, 160);
            }
            return {
                update(partial) {
                    if (exiting)
                        return;
                    apply({ ...options, ...partial }, options);
                },
                needsDecision: () => !!(options.actions && options.actions.length),
                dismiss
            };
        }
        function trimOverflow() {
            var _a;
            const entries = [...notices.entries()].map(([id, notice]) => ({ id, needsDecision: notice.needsDecision() }));
            for (const id of pickOverflow(entries, MAX_VISIBLE))
                (_a = notices.get(id)) === null || _a === void 0 ? void 0 : _a.dismiss();
        }
        function show(options) {
            const id = options.id || `n${Date.now().toString(36)}${(counter += 1)}`;
            const existing = notices.get(id);
            if (existing) {
                existing.update(options);
            }
            else {
                notices.set(id, createNotice(id, options));
                trimOverflow();
            }
            return {
                id,
                update: next => { var _a; return (_a = notices.get(id)) === null || _a === void 0 ? void 0 : _a.update(next); },
                dismiss: () => { var _a; return (_a = notices.get(id)) === null || _a === void 0 ? void 0 : _a.dismiss(); }
            };
        }
        return {
            show,
            update: (id, next) => { var _a; return (_a = notices.get(id)) === null || _a === void 0 ? void 0 : _a.update(next); },
            dismiss: (id) => { var _a; return (_a = notices.get(id)) === null || _a === void 0 ? void 0 : _a.dismiss(); },
            has: (id) => notices.has(id)
        };
    }
    let defaultCenter = null;
    function center() {
        if (!defaultCenter) {
            if (typeof document === 'undefined' || typeof window === 'undefined')
                throw new Error('MiniNotice requiere un navegador.');
            defaultCenter = createNoticeCenter(document, window);
        }
        return defaultCenter;
    }
    return {
        springStep,
        autoDismissMs,
        pickOverflow,
        clampProgress,
        createNoticeCenter,
        show: (options) => center().show(options),
        update: (id, next) => center().update(id, next),
        dismiss: (id) => center().dismiss(id),
        has: (id) => center().has(id)
    };
});
