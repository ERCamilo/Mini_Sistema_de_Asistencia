// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.MiniWelcome` (browser global consumed by p2p-roster-ui.js at boot).
// Blocking first-run gate: a Mini without its own device name cannot continue,
// so every Mini/SA peer sees a recognizable name when pairing or receiving backups.

interface WelcomeIdentity {
  getName(): Promise<string | null | undefined>;
  saveName(name: string): Promise<void>;
  issue(name: string): string;
}

interface WelcomeView {
  showIssue(message: string): void;
  close(): void;
}

interface WelcomeRenderArgs {
  initialName: string;
  onSubmit(name: string): Promise<string>;
}

interface WelcomeOptions {
  render?: (args: WelcomeRenderArgs) => WelcomeView | void;
}

(function exposeMiniWelcome(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniWelcome = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMiniWelcomeModule() {
  let pending: Promise<string> | null = null;

  function normalizeName(value: unknown): string {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function needsWelcome(name: unknown, issue: (name: string) => string): boolean {
    return issue(normalizeName(name)) !== '';
  }

  function renderDefault({ initialName, onSubmit }: WelcomeRenderArgs): WelcomeView {
    const overlay = document.createElement('div');
    overlay.className = 'mini-welcome';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mini-welcome-title');
    overlay.innerHTML = `
      <form class="mini-welcome-card" novalidate>
        <div class="mini-welcome-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <rect class="mini-welcome-device" x="13" y="5" width="22" height="38" rx="5"/>
            <path class="mini-welcome-wave" d="M40 16a10 10 0 0 1 0 16"/>
            <path class="mini-welcome-wave is-late" d="M44 11a16 16 0 0 1 0 26"/>
            <path d="M21 36h6"/>
          </svg>
        </div>
        <h2 id="mini-welcome-title">¡Bienvenido a Mini!</h2>
        <p class="mini-welcome-lead">¿Cómo se llama este dispositivo? Otros Mini y SA verán este nombre al vincularse y al enviarte respaldos.</p>
        <label class="mini-welcome-label" for="mini-welcome-name">Nombre de este dispositivo</label>
        <input id="mini-welcome-name" class="mini-welcome-input" maxlength="80" autocomplete="off" autocapitalize="words" placeholder="Ej: Juan · Obra Norte" enterkeyhint="done">
        <div class="mini-welcome-issue" role="alert" hidden></div>
        <button type="submit" class="mini-welcome-submit">Continuar</button>
        <p class="mini-welcome-footnote">Es obligatorio para continuar. Usá tu nombre, la obra o el equipo.</p>
      </form>`;
    const form = overlay.querySelector('form') as HTMLFormElement;
    const input = overlay.querySelector('input') as HTMLInputElement;
    const issueBox = overlay.querySelector('.mini-welcome-issue') as HTMLElement;
    const submit = overlay.querySelector('.mini-welcome-submit') as HTMLButtonElement;
    input.value = initialName;
    const showIssue = (message: string) => {
      issueBox.hidden = !message;
      issueBox.textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message) input.focus();
    };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        showIssue(await onSubmit(input.value));
      } catch (error) {
        showIssue(error instanceof Error ? error.message : 'No se pudo guardar el nombre.');
      } finally {
        submit.disabled = false;
      }
    });
    // The gate cannot be dismissed: keep focus inside and ignore Escape.
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); return; }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      (document.activeElement === input ? submit : input).focus();
    });
    document.body.appendChild(overlay);
    document.documentElement.classList.add('mini-welcome-open');
    setTimeout(() => input.focus(), 50);
    return {
      showIssue,
      close() {
        overlay.classList.add('is-leaving');
        document.documentElement.classList.remove('mini-welcome-open');
        setTimeout(() => overlay.remove(), 240);
      }
    };
  }

  function isOpen(): boolean {
    return pending !== null;
  }

  async function ensureNamed(identity: WelcomeIdentity, options: WelcomeOptions = {}): Promise<string> {
    let current = '';
    try {
      current = normalizeName(await identity.getName());
    } catch (error) {
      console.warn('No se pudo leer el nombre del dispositivo.', error);
    }
    if (!needsWelcome(current, identity.issue)) return current;
    if (pending) return pending;
    const render = options.render || renderDefault;
    pending = new Promise<string>(resolve => {
      let view: WelcomeView | void;
      const onSubmit = async (raw: string): Promise<string> => {
        const name = normalizeName(raw);
        const problem = identity.issue(name);
        if (problem) return problem;
        await identity.saveName(name);
        view?.close();
        pending = null;
        resolve(name);
        return '';
      };
      view = render({ initialName: identity.issue(current) ? '' : current, onSubmit });
    });
    return pending;
  }

  return { needsWelcome, ensureNamed, isOpen, normalizeName };
});
