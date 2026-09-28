// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.TutorialPlayer` (browser global consumed by index.html).
// In-app tutorial player: video, caption below it and a step bar (tap a step
// to jump there). Without the video it lists the steps as text. Videos can be
// saved for offline use in Cache Storage (its own quota, not the ~5 MB of data).

interface TutorialPlayerHandle { destroy(): void; }

(function exposeTutorialPlayer(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.TutorialPlayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTutorialPlayerModule() {
  const T = () => (globalThis as any).Tutorials;

  async function loadCaptions(id: string): Promise<TutorialsCaptionFile | null> {
    try {
      const response = await fetch(T().captionsUrl(id));
      return response.ok ? await response.json() : null;
    } catch (error) {
      console.warn('Tutorial: no se pudieron cargar los subtítulos de ' + id, error);
      return null;
    }
  }

  async function savedVideo(id: string, recordedAt: string): Promise<Blob | null> {
    try {
      if (typeof caches === 'undefined') return null;
      const cache = await caches.open(T().OFFLINE_CACHE);
      const hit = await cache.match(T().offlineKey(id, recordedAt));
      return hit ? await hit.blob() : null;
    } catch (error) {
      console.warn('Tutorial: no se pudo leer la copia guardada.', error);
      return null;
    }
  }

  function renderSteps(bar: HTMLElement, steps: TutorialsStep[], duration: number, seek: (t: number) => void) {
    bar.innerHTML = '';
    for (const s of steps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.step = String(s.step);
      button.style.flexGrow = String(Math.max(0.5, s.end - s.start));
      button.setAttribute('aria-label', `Paso ${s.step}: ${s.text}`);
      button.innerHTML = `<span>${s.step}</span>`;
      button.addEventListener('click', () => seek(s.start + 0.05));
      bar.appendChild(button);
    }
    bar.hidden = !steps.length || !(duration > 0);
  }

  function renderFallback(list: HTMLElement, steps: TutorialsStep[]) {
    const ol = list.querySelector('ol') as HTMLOListElement;
    ol.innerHTML = '';
    for (const s of steps) {
      const li = document.createElement('li');
      li.textContent = s.text;
      ol.appendChild(li);
    }
    list.hidden = false;
  }

  function mount(container: HTMLElement, id: string): TutorialPlayerHandle {
    container.innerHTML = `
      <div class="tutorial-player">
        <div class="tutorial-video-wrap"><video playsinline muted controls preload="metadata" aria-label="Video del tutorial"></video></div>
        <div class="tutorial-caption" aria-live="polite"></div>
        <div class="tutorial-steps" role="group" aria-label="Pasos del tutorial" hidden></div>
        <div class="tutorial-fallback" hidden><p>No se pudo cargar el video (sin conexión y sin copia guardada). Estos son los pasos:</p><ol></ol></div>
      </div>`;
    const video = container.querySelector('video') as HTMLVideoElement;
    const caption = container.querySelector('.tutorial-caption') as HTMLElement;
    const bar = container.querySelector('.tutorial-steps') as HTMLElement;
    const fallback = container.querySelector('.tutorial-fallback') as HTMLElement;
    let objectUrl = '';
    let alive = true;
    let file: TutorialsCaptionFile | null = null;
    let steps: TutorialsStep[] = [];

    const seek = (time: number) => {
      try { video.currentTime = time; video.play().catch(() => {}); } catch (_) { /* not ready yet */ }
    };

    const sync = () => {
      if (!file) return;
      const t = video.currentTime;
      const index = T().captionIndexAt(file.captions, t);
      caption.textContent = index >= 0 ? file.captions[index].text : '';
      bar.querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('is-active', t >= steps[i].start && t < steps[i].end);
        b.classList.toggle('is-done', t >= steps[i].end);
      });
    };

    const showFallback = () => {
      video.closest('.tutorial-video-wrap')?.setAttribute('hidden', '');
      bar.hidden = true;
      caption.hidden = true;
      if (steps.length) renderFallback(fallback, steps);
      else { fallback.querySelector('p')!.textContent = 'No se pudo cargar el tutorial. Probá de nuevo con conexión.'; fallback.hidden = false; }
    };

    video.addEventListener('timeupdate', sync);
    video.addEventListener('seeked', sync);
    video.addEventListener('error', showFallback);

    (async () => {
      file = await loadCaptions(id);
      if (!alive) return;
      steps = file ? T().stepSegments(file) : [];
      renderSteps(bar, steps, file ? file.duration : 0, seek);
      const blob = file ? await savedVideo(id, file.recordedAt) : null;
      if (!alive) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); video.src = objectUrl; }
      else video.src = T().videoUrl(id);
      video.play().catch(() => {});
    })();

    return {
      destroy() {
        alive = false;
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) { /* already gone */ }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        container.innerHTML = '';
      }
    };
  }

  // Saves the current recording of each tutorial; older copies are removed.
  async function saveOffline(ids: string[]): Promise<{ saved: number; failed: number }> {
    let saved = 0;
    let failed = 0;
    const cache = await caches.open(T().OFFLINE_CACHE);
    for (const id of ids) {
      try {
        const file = await loadCaptions(id);
        if (!file) throw new Error('sin subtítulos');
        const key = T().offlineKey(id, file.recordedAt);
        if (!(await cache.match(key))) {
          const response = await fetch(T().videoUrl(id), { cache: 'no-cache' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          await cache.put(key, response);
        }
        for (const old of await cache.keys()) {
          const url = new URL(old.url);
          if (url.pathname.endsWith('/' + id + '.webm') && url.search !== new URL(key, location.href).search) await cache.delete(old);
        }
        saved++;
      } catch (error) {
        console.warn('Tutorial: no se pudo guardar ' + id, error);
        failed++;
      }
    }
    return { saved, failed };
  }

  async function countSaved(ids: string[]): Promise<number> {
    try {
      if (typeof caches === 'undefined') return 0;
      const cache = await caches.open(T().OFFLINE_CACHE);
      let count = 0;
      for (const id of ids) {
        const file = await loadCaptions(id);
        if (file && (await cache.match(T().offlineKey(id, file.recordedAt)))) count++;
      }
      return count;
    } catch (error) {
      console.warn('Tutorial: no se pudo revisar la copia guardada.', error);
      return 0;
    }
  }

  return { mount, saveOffline, countSaved };
});
