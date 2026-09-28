// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.GuidedTour` (browser global consumed by index.html).
// "Hazlo conmigo": a coach-mark tour over the real UI. It dims the screen,
// spotlights one control and explains it; tapping that control advances.
// It never blocks the app (pointer-events pass through), only guides.

interface TourRect { top: number; left: number; width: number; height: number; }
interface TourSize { width: number; height: number; }

interface TourStep {
  target: string;
  // Optional larger area to light up (e.g. a whole dialog); taps still only
  // advance on `target`.
  spotlight?: string;
  title: string;
  text: string;
  onEnter?: () => void;
}

interface TourOptions {
  onFinish?: () => void;
  onExit?: () => void;
}

(function exposeGuidedTour(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.GuidedTour = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGuidedTourModule() {
  const GUTTER = 16;
  const GAP = 12;
  const PAD = 4;
  const MISSING_TARGET_MS = 2500;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function spotlightRect(target: TourRect, view: TourSize): TourRect {
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
  function placeBubble(target: TourRect, bubble: TourSize, view: TourSize) {
    const left = clamp(target.left + target.width / 2 - bubble.width / 2, GUTTER, view.width - GUTTER - bubble.width);
    const belowTop = target.top + target.height + GAP;
    const inUpperHalf = target.top + target.height / 2 < view.height / 2;
    if (inUpperHalf && belowTop + bubble.height <= view.height - GUTTER) return { side: 'below' as const, top: belowTop, left };
    return { side: 'top' as const, top: GUTTER, left };
  }

  function clickAdvances(clicked: unknown, target: { contains(node: unknown): boolean } | null): boolean {
    return !!target && target.contains(clicked);
  }

  function isVisible(el: Element | null): el is HTMLElement {
    if (!el) return false;
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function createGuidedTour(doc: Document, win: Window) {
    let steps: TourStep[] = [];
    let index = -1;
    let options: TourOptions = {};
    let root: HTMLElement | null = null;
    let spot: HTMLElement | null = null;
    let bubble: HTMLElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let shownAt = 0;

    function currentTarget(): HTMLElement | null {
      const step = steps[index];
      if (!step) return null;
      const el = doc.querySelector(step.target);
      return isVisible(el) ? el : null;
    }

    function layout() {
      if (!root || !spot || !bubble) return;
      const view = { width: win.innerWidth, height: win.innerHeight };
      const target = currentTarget();
      const next = bubble.querySelector('[data-tour-next]') as HTMLElement;
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
      const step = steps[index];
      if (!step || !bubble) return;
      (bubble.querySelector('[data-tour-count]') as HTMLElement).textContent = `Paso ${index + 1} de ${steps.length}`;
      (bubble.querySelector('[data-tour-title]') as HTMLElement).textContent = step.title;
      (bubble.querySelector('[data-tour-text]') as HTMLElement).textContent = step.text;
      bubble.classList.remove('is-entering');
      void bubble.offsetWidth;
      bubble.classList.add('is-entering');
      shownAt = Date.now();
      try { step.onEnter?.(); } catch (error) { console.warn('Tour: onEnter falló.', error); }
      win.setTimeout(() => {
        currentTarget()?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        layout();
      }, 60);
    }

    function go(nextIndex: number) {
      if (nextIndex >= steps.length) { finish(); return; }
      index = nextIndex;
      render();
    }

    function onDocumentClick(event: Event) {
      if (!root || (bubble && bubble.contains(event.target as Node))) return;
      if (clickAdvances(event.target, currentTarget())) {
        // Let the app handle the tap first (open tab, modal...), then move on.
        win.setTimeout(() => go(index + 1), 350);
      }
    }

    function teardown() {
      if (timer) clearInterval(timer);
      doc.removeEventListener('click', onDocumentClick, true);
      win.removeEventListener('resize', layout);
      root?.remove();
      root = spot = bubble = null;
      steps = [];
      index = -1;
    }

    function finish() {
      const done = options.onFinish;
      teardown();
      done?.();
    }

    function stop() {
      if (!root) return;
      const exit = options.onExit;
      teardown();
      exit?.();
    }

    function start(tourSteps: TourStep[], tourOptions: TourOptions = {}) {
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
      bubble!.querySelector('[data-tour-exit]')!.addEventListener('click', stop);
      bubble!.querySelector('[data-tour-next]')!.addEventListener('click', () => go(index + 1));
      doc.body.appendChild(root);
      doc.addEventListener('click', onDocumentClick, true);
      win.addEventListener('resize', layout);
      timer = setInterval(layout, 250);
      go(0);
    }

    return { start, stop, isActive: () => !!root, currentStep: () => index };
  }

  let shared: ReturnType<typeof createGuidedTour> | null = null;
  function tour() {
    if (!shared) shared = createGuidedTour(document, window);
    return shared;
  }

  return {
    spotlightRect,
    placeBubble,
    clickAdvances,
    createGuidedTour,
    start: (s: TourStep[], o?: TourOptions) => tour().start(s, o),
    stop: () => tour().stop(),
    isActive: () => !!shared && shared.isActive()
  };
});
