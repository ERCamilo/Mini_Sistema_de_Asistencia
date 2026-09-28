"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.GuidedTour` (browser global consumed by index.html).
// "Hazlo conmigo": a coach-mark tour over the real UI. It dims the screen,
// spotlights one control and explains it; tapping that control advances.
// It never blocks the app (pointer-events pass through), only guides.
(function exposeGuidedTour(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.GuidedTour = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGuidedTourModule() {
    const GUTTER = 16;
    const GAP = 12;
    const PAD = 4;
    const MISSING_TARGET_MS = 2500;
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), Math.max(min, max));
    }
    function spotlightRect(target, view) {
        return {
            top: clamp(target.top - PAD, 0, view.height),
            left: clamp(target.left - PAD, 0, view.width),
            width: target.width + PAD * 2,
            height: target.height + PAD * 2
        };
    }
    // Upper-half targets: bubble right below them. Lower-half targets (bottom
    // sheets, confirm dialogs, nav bar): bubble at the top of the screen so it
    // never covers the text around the control the user must read.
    function placeBubble(target, bubble, view) {
        const left = clamp(target.left + target.width / 2 - bubble.width / 2, GUTTER, view.width - GUTTER - bubble.width);
        const belowTop = target.top + target.height + GAP;
        const inUpperHalf = target.top + target.height / 2 < view.height / 2;
        if (inUpperHalf && belowTop + bubble.height <= view.height - GUTTER)
            return { side: 'below', top: belowTop, left };
        return { side: 'top', top: GUTTER, left };
    }
    function clickAdvances(clicked, target) {
        return !!target && target.contains(clicked);
    }
    function isVisible(el) {
        if (!el)
            return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }
    function createGuidedTour(doc, win) {
        let steps = [];
        let index = -1;
        let options = {};
        let root = null;
        let spot = null;
        let bubble = null;
        let timer;
        let shownAt = 0;
        function currentTarget() {
            const step = steps[index];
            if (!step)
                return null;
            const el = doc.querySelector(step.target);
            return isVisible(el) ? el : null;
        }
        function layout() {
            if (!root || !spot || !bubble)
                return;
            const view = { width: win.innerWidth, height: win.innerHeight };
            const target = currentTarget();
            const next = bubble.querySelector('[data-tour-next]');
            if (!target) {
                spot.hidden = true;
                // Missing/animating target: after a moment let the user continue by hand.
                next.hidden = Date.now() - shownAt < MISSING_TARGET_MS;
                const size = { width: bubble.offsetWidth, height: bubble.offsetHeight };
                bubble.style.top = `${Math.max(GUTTER, (view.height - size.height) / 2)}px`;
                bubble.style.left = `${Math.max(GUTTER, (view.width - size.width) / 2)}px`;
                return;
            }
            next.hidden = true;
            const step = steps[index];
            const area = step.spotlight ? doc.querySelector(step.spotlight) : null;
            const rect = (isVisible(area) ? area : target).getBoundingClientRect();
            const s = spotlightRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }, view);
            spot.hidden = false;
            Object.assign(spot.style, { top: `${s.top}px`, left: `${s.left}px`, width: `${s.width}px`, height: `${s.height}px` });
            const pos = placeBubble(s, { width: bubble.offsetWidth, height: bubble.offsetHeight }, view);
            bubble.dataset.side = pos.side;
            bubble.style.top = `${pos.top}px`;
            bubble.style.left = `${pos.left}px`;
        }
        function render() {
            var _a;
            const step = steps[index];
            if (!step || !bubble)
                return;
            bubble.querySelector('[data-tour-count]').textContent = `Paso ${index + 1} de ${steps.length}`;
            bubble.querySelector('[data-tour-title]').textContent = step.title;
            bubble.querySelector('[data-tour-text]').textContent = step.text;
            bubble.classList.remove('is-entering');
            void bubble.offsetWidth;
            bubble.classList.add('is-entering');
            shownAt = Date.now();
            try {
                (_a = step.onEnter) === null || _a === void 0 ? void 0 : _a.call(step);
            }
            catch (error) {
                console.warn('Tour: onEnter falló.', error);
            }
            win.setTimeout(() => {
                var _a;
                (_a = currentTarget()) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                layout();
            }, 60);
        }
        function go(nextIndex) {
            if (nextIndex >= steps.length) {
                finish();
                return;
            }
            index = nextIndex;
            render();
        }
        function onDocumentClick(event) {
            if (!root || (bubble && bubble.contains(event.target)))
                return;
            if (clickAdvances(event.target, currentTarget())) {
                // Let the app handle the tap first (open tab, modal...), then move on.
                win.setTimeout(() => go(index + 1), 350);
            }
        }
        function teardown() {
            if (timer)
                clearInterval(timer);
            doc.removeEventListener('click', onDocumentClick, true);
            win.removeEventListener('resize', layout);
            root === null || root === void 0 ? void 0 : root.remove();
            root = spot = bubble = null;
            steps = [];
            index = -1;
        }
        function finish() {
            const done = options.onFinish;
            teardown();
            done === null || done === void 0 ? void 0 : done();
        }
        function stop() {
            if (!root)
                return;
            const exit = options.onExit;
            teardown();
            exit === null || exit === void 0 ? void 0 : exit();
        }
        function start(tourSteps, tourOptions = {}) {
            teardown();
            steps = tourSteps.slice();
            options = tourOptions;
            root = doc.createElement('div');
            root.className = 'guided-tour';
            root.innerHTML = `
        <div class="guided-tour-spot" aria-hidden="true"></div>
        <div class="guided-tour-bubble" role="dialog" aria-live="polite" aria-label="Hazlo conmigo">
          <div class="guided-tour-count" data-tour-count></div>
          <strong data-tour-title></strong>
          <p data-tour-text></p>
          <div class="guided-tour-actions">
            <button type="button" class="guided-tour-exit" data-tour-exit>Salir</button>
            <button type="button" class="guided-tour-next" data-tour-next hidden>Siguiente</button>
          </div>
        </div>`;
            spot = root.querySelector('.guided-tour-spot');
            bubble = root.querySelector('.guided-tour-bubble');
            bubble.querySelector('[data-tour-exit]').addEventListener('click', stop);
            bubble.querySelector('[data-tour-next]').addEventListener('click', () => go(index + 1));
            doc.body.appendChild(root);
            doc.addEventListener('click', onDocumentClick, true);
            win.addEventListener('resize', layout);
            timer = setInterval(layout, 250);
            go(0);
        }
        return { start, stop, isActive: () => !!root, currentStep: () => index };
    }
    let shared = null;
    function tour() {
        if (!shared)
            shared = createGuidedTour(document, window);
        return shared;
    }
    return {
        spotlightRect,
        placeBubble,
        clickAdvances,
        createGuidedTour,
        start: (s, o) => tour().start(s, o),
        stop: () => tour().stop(),
        isActive: () => !!shared && shared.isActive()
    };
});
