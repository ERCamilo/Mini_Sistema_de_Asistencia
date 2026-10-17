interface FirebaseLinkPresentation {
    icon(document: Document, kind: string): SVGElement;
}
interface FirebaseLinkRoot {
    MiniConnectionPresentation?: FirebaseLinkPresentation;
}
interface FirebaseLinkUser {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    getIdToken(forceRefresh?: boolean): Promise<string>;
}
interface FirebaseLinkAuth {
    getUser(): FirebaseLinkUser | null;
    subscribe(callback: (user: FirebaseLinkUser | null) => void): () => void;
    login(): Promise<unknown>;
    logout(): Promise<void>;
}
interface FirebaseLinkPreview {
    orgId: string;
    orgName: string;
    projectId: string;
    projectName: string;
    groups: {
        id: string;
        name: string;
    }[];
    expiresAt: number;
}
interface FirebaseLinkState {
    phase: 'signedOut' | 'ready' | 'preview' | 'linked';
    email: string;
    busy: boolean;
    error: string;
    preview: FirebaseLinkPreview | null;
}
interface FirebaseLinkOptions {
    auth: FirebaseLinkAuth;
    endpoint: string;
    fetcher: typeof fetch;
    now?: () => number;
}
interface FirebaseLinkConfig {
    firebase: {
        apiKey: string;
        authDomain: string;
        projectId: string;
        appId: string;
    };
    endpoint: string;
    emulator?: string;
}
interface FirebaseLinkSdkAuth {
    currentUser: FirebaseLinkUser | null;
    onAuthStateChanged(callback: (user: FirebaseLinkUser | null) => void): () => void;
    setPersistence(mode: string): Promise<void>;
    signInWithPopup(provider: unknown): Promise<unknown>;
    signOut(): Promise<void>;
    useEmulator(url: string): void;
}
interface FirebaseLinkSdk {
    initializeApp(config: FirebaseLinkConfig['firebase'], name: string): {
        auth(): FirebaseLinkSdkAuth;
    };
    auth: {
        GoogleAuthProvider: new () => {
            setCustomParameters(params: Record<string, string>): void;
        };
    };
}
(function exposeFirebaseLink(root: any, factory: (root: FirebaseLinkRoot) => unknown) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniFirebaseLink = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root: FirebaseLinkRoot) {
    function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Respuesta no válida.'); return value as Record<string, unknown>; }
    function text(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 128)
        throw new Error('Respuesta no válida.'); return value; }
    function id(value: unknown): string { const s = text(value); if (s.trim() !== s || /[\/\s\x00-\x1f]/.test(s) || s === 'legacy-unresolved')
        throw new Error('Referencia no válida.'); return s; }
    function parsePreview(value: unknown): FirebaseLinkPreview {
        const r = record(value);
        if (!Array.isArray(r.groups) || r.groups.length < 1 || r.groups.length > 20 || typeof r.expiresAt !== 'number' || !Number.isFinite(r.expiresAt))
            throw new Error('Invitación no válida.');
        const groups = r.groups.map(value => { const g = record(value); return { id: id(g.id), name: text(g.name) }; });
        if (new Set(groups.map(g => g.id)).size !== groups.length)
            throw new Error('Grupos no válidos.');
        return { orgId: id(r.orgId), orgName: text(r.orgName), projectId: id(r.projectId), projectName: text(r.projectName), groups, expiresAt: r.expiresAt };
    }
    function parseInvitationQr(raw:string):string|null {const match=/^sa-mini-invite\/v1:([A-Za-z0-9_-]{43})$/.exec(raw.trim());return match?match[1]:null;}
    function loopback(url: URL): boolean { return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
    function validateConfig(value: unknown, origin: string): FirebaseLinkConfig {
        const r = record(value), f = record(r.firebase), page = new URL(origin), url = new URL(text(r.endpoint));
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
            throw new Error('Servicio de vinculación no válido.');
        const firebase = { apiKey: text(f.apiKey), authDomain: text(f.authDomain), projectId: id(f.projectId), appId: text(f.appId) };
        let emulator: string | undefined;
        if (r.emulator !== undefined) {
            const e = new URL(text(r.emulator));
            if (!loopback(page) || !loopback(url) || !loopback(e) || url.protocol !== 'http:' || e.protocol !== 'http:' || e.username || e.password || e.search || e.hash || e.pathname !== '/' || !firebase.projectId.startsWith('demo-'))
                throw new Error('Emulador disponible sólo en laboratorio local.');
            emulator = e.origin;
        }
        else if (url.protocol !== 'https:' || page.protocol !== 'https:')
            throw new Error('La vinculación requiere HTTPS.');
        return { firebase, endpoint: url.origin, ...(emulator ? { emulator } : {}) };
    }
    function createController(options: FirebaseLinkOptions) {
        const now = options.now || Date.now;
        let user: FirebaseLinkUser | null = null, epoch = 0, code = '';
        let current: FirebaseLinkState = { phase: 'signedOut', email: '', busy: false, error: '', preview: null };
        const listeners = new Set<(state: FirebaseLinkState) => void>();
        function state(): FirebaseLinkState { return { ...current, preview: current.preview ? { ...current.preview, groups: current.preview.groups.map(g => ({ ...g })) } : null }; }
        function emit(): void { listeners.forEach(fn => fn(state())); }
        function reset(next: FirebaseLinkUser | null): void { epoch++; code = ''; user = next; current = { phase: next ? 'ready' : 'signedOut', email: next?.email || '', busy: false, error: '', preview: null }; emit(); }
        const unsubscribe = options.auth.subscribe(next => { if (next?.uid !== user?.uid)
            reset(next); });
        reset(options.auth.getUser());
        function message(error: unknown): string {
            const c = typeof error === 'object' && error ? String((error as {
                code?: unknown;
            }).code || '') : '';
            if (['INVITE_UNAVAILABLE', 'SCOPE_UNAVAILABLE', 'ACCESS_REVOKED'].includes(c))
                return 'Esta invitación ya no está disponible. Solicita una nueva a SA.';
            if (c === 'UNAUTHENTICATED' || c === 'FORBIDDEN')
                return 'Inicia sesión con una cuenta Google autorizada.';
            if (c === 'auth/popup-blocked')
                return 'Permite la ventana de Google y vuelve a intentar.';
            if (c === 'auth/popup-closed-by-user')
                return 'Inicio de sesión cancelado.';
            if (c === 'RATE_LIMITED')
                return 'Espera un momento antes de volver a intentar.';
            return 'No se pudo completar. Revisa tu conexión y vuelve a intentar.';
        }
        async function request(route: string, expected: number): Promise<unknown> {
            if (!user)
                throw new Error('Sin sesión');
            const account = user, abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
            try {
                const token = await account.getIdToken(true);
                if (expected !== epoch)
                    throw new Error('Sesión cambió');
                const response = await options.fetcher(options.endpoint + '/v1/invitations/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ token: code }), signal: abort.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
                const body: unknown = await response.json();
                if (!response.ok) {
                    const r = record(body);
                    throw { code: r.error };
                }
                return body;
            }
            finally {
                clearTimeout(timer);
            }
        }
        async function preview(input: string): Promise<void> {
            if (current.busy || !user)
                return;
            code = '';
            current.preview = null;
            current.phase = 'ready';
            current.error = '';
            if (!/^[A-Za-z0-9_-]{43}$/.test(input.trim())) {
                current.error = 'Introduce el código completo de la invitación.';
                emit();
                return;
            }
            code = input.trim();
            const generation = epoch;
            current.busy = true;
            emit();
            try {
                const result = parsePreview(await request('preview', generation));
                if (generation !== epoch)
                    return;
                if (result.expiresAt <= now())
                    throw { code: 'INVITE_UNAVAILABLE' };
                current.preview = result;
                current.phase = 'preview';
            }
            catch (error) {
                if (generation === epoch) {
                    code = '';
                    current.error = message(error);
                }
            }
            finally {
                if (generation === epoch) {
                    current.busy = false;
                    emit();
                }
            }
        }
        async function confirm(): Promise<void> {
            if (current.busy || !user || current.phase !== 'preview' || !current.preview)
                return;
            if (current.preview.expiresAt <= now()) {
                cancel();
                current.error = 'La invitación venció. Solicita una nueva.';
                emit();
                return;
            }
            const expected = current.preview, generation = epoch;
            current.busy = true;
            current.error = '';
            emit();
            try {
                const r = record(await request('redeem', generation));
                if (generation !== epoch)
                    return;
                if (r.status !== 'linked' || r.orgId !== expected.orgId || r.projectId !== expected.projectId || !Array.isArray(r.groupIds) || r.groupIds.length < expected.groups.length || r.groupIds.length > 20 || r.groupIds.some(g => { try {
                    id(g);
                    return false;
                }
                catch {
                    return true;
                } }) || new Set(r.groupIds).size !== r.groupIds.length || expected.groups.some(g => !(r.groupIds as unknown[]).includes(g.id)))
                    throw new Error('Scope no válido');
                current.phase = 'linked';
                code = '';
            }
            catch (error) {
                if (generation === epoch) {
                    code = '';
                    current.preview = null;
                    current.phase = 'ready';
                    current.error = message(error);
                }
            }
            finally {
                if (generation === epoch) {
                    current.busy = false;
                    emit();
                }
            }
        }
        function cancel(): void { if (current.busy)
            return; reset(user); }
        async function login(): Promise<void> { if (current.busy)
            return; const generation = epoch; current.busy = true; current.error = ''; emit(); try {
            await options.auth.login();
        }
        catch (error) {
            if (generation === epoch)
                current.error = message(error);
        }
        finally {
            if (generation === epoch) {
                current.busy = false;
                emit();
            }
        } }
        async function logout(): Promise<void> { if (current.busy)
            return; const generation = epoch; current.busy = true; emit(); try {
            await options.auth.logout();
            reset(null);
        }
        catch (error) {
            if (generation === epoch) {
                current.busy = false;
                current.error = message(error);
                emit();
            }
        } }
        return { state, preview, confirm, cancel, login, logout, subscribe: (fn: (s: FirebaseLinkState) => void) => { listeners.add(fn); fn(state()); return () => listeners.delete(fn); }, dispose: () => { epoch++; code = ''; unsubscribe(); listeners.clear(); } };
    }
    function createBrowserAuth(sdk: FirebaseLinkSdk, config: FirebaseLinkConfig): FirebaseLinkAuth {
        const auth = sdk.initializeApp(config.firebase, 'mini-field').auth();
        if (config.emulator)
            auth.useEmulator(config.emulator);
        const ready = auth.setPersistence('local').then(() => null, error => error);
        return { getUser: () => auth.currentUser, subscribe: fn => auth.onAuthStateChanged(fn), login: async () => { const issue = await ready; if (issue)
                throw issue; const provider = new sdk.auth.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); return auth.signInWithPopup(provider); }, logout: () => auth.signOut() };
    }
    function mount(options: {
        document: Document;
        sdk: FirebaseLinkSdk;
        config: unknown;
        origin: string;
        onLinked?: () => void;
    }): {
        close(): boolean;
        useInvitation(code:string):boolean;
        setBindings(uid: string | null, count: number): void;
    } {
        const d = options.document;
        const el = (name: string) => d.getElementById('firebase-link-' + name) as HTMLElement;
        const input = el('code') as HTMLInputElement;
        const review = el('review') as HTMLButtonElement, confirm = el('confirm') as HTMLButtonElement, login = el('login') as HTMLButtonElement, logout = el('logout') as HTMLButtonElement, cancel = el('cancel') as HTMLButtonElement;
        let controller: ReturnType<typeof createController>;
        let adapter: FirebaseLinkAuth, knownUid: string | null = null, accessCount = 0, addingInvitation = false, lastPhase = '', draftCode = '';
        const add = d.createElement('button');
        add.type = 'button'; add.id = 'firebase-link-add'; add.className = 'btn-full btn-secondary';
        add.textContent = 'Vincular otra obra o grupo'; add.hidden = true;
        review.insertAdjacentElement('afterend', add);
        try {
            const config = validateConfig(options.config, options.origin);
            adapter = createBrowserAuth(options.sdk, config);
            controller = createController({ auth: adapter, endpoint: config.endpoint, fetcher: (input, init) => fetch(input, init) });
        }
        catch {
            el('status').textContent = 'La conexión con SA por internet está en preparación. Puedes seguir usando Mini de forma independiente.';
            [input, review, confirm, login, logout].forEach(n => { n.hidden = true; });
            return { close: () => true, useInvitation: () => false, setBindings: () => {} };
        }
        function render(s: FirebaseLinkState): void {
            const uid = adapter.getUser()?.uid || null;
            if (uid !== knownUid) { if(knownUid)draftCode=''; knownUid = uid; accessCount = 0; addingInvitation = !!draftCode; }
            const existing = !!uid && accessCount > 0 && !addingInvitation;
            el('status').textContent = s.busy ? 'Verificando…' : s.phase === 'signedOut' ? 'Inicia sesión para recuperar tus obras o vincular Mini con SA.' : existing ? 'Vinculación confirmada. Tus obras y grupos están en la lista de conexiones.' : s.phase === 'linked' ? 'Vinculación confirmada. Puedes recibir personal y enviar asistencia.' : s.email;
            el('error').textContent = s.error;
            const metadata=el('status');metadata.dataset.linkPhase=s.phase;metadata.dataset.linkBusy=String(s.busy);metadata.dataset.orgId=s.preview?.orgId||'';metadata.dataset.projectId=s.preview?.projectId||'';metadata.dataset.projectName=s.preview?.projectName||'';metadata.dataset.groupIds=JSON.stringify(s.preview?.groups.map(g=>g.id)||[]);
            el('status').dataset.accountEmail=s.phase==='signedOut'?'':s.email;
            el('status').dataset.accountName=adapter.getUser()?.displayName||'';
            el('status').dataset.accountPhoto=s.phase==='signedOut'?'':adapter.getUser()?.photoURL||'';
            login.hidden = s.phase !== 'signedOut';
            logout.hidden = s.phase === 'signedOut';
            input.hidden = s.phase !== 'ready' || existing;
            review.hidden = s.phase !== 'ready' || existing;
            add.hidden = !uid || accessCount < 1 || addingInvitation || s.phase === 'preview';
            confirm.hidden = s.phase !== 'preview';
            [login, logout, input, review, confirm, cancel, add].forEach(n => { n.disabled = s.busy; });
            const details = el('details');
            details.hidden = s.phase !== 'preview';
            if (s.preview) {
                el('org').textContent = s.preview.orgName;
                el('project').textContent = s.preview.projectName;
                el('groups').replaceChildren(...s.preview.groups.map(g => { const li = d.createElement('li'); li.textContent = g.name; return li; }));
            }
            else {
                el('org').textContent = '';
                el('project').textContent = '';
                el('groups').replaceChildren();
            }
            if (s.phase !== 'ready')input.value = '';else if(draftCode)input.value=draftCode;
        }
        const permissions=d.createElement('section');permissions.className='connections-capabilities';
        for(const [title,description] of [['Recibir personal','Revisar y aplicar el personal autorizado de SA.'],['Enviar asistencia','Enviar a SA para su revisión antes de incorporarla.']]){const card=d.createElement('div'),heading=d.createElement('strong'),hint=d.createElement('p');heading.textContent=title;hint.textContent=description;card.append(heading,hint);if(typeof root.MiniConnectionPresentation!=='undefined')card.prepend(root.MiniConnectionPresentation.icon(d,title==='Recibir personal'?'people':'document'));permissions.append(card);}
        el('details').append(permissions);
        controller.subscribe(s => {
            render(s);
            if (s.phase === 'linked' && lastPhase !== 'linked') { addingInvitation = false; options.onLinked?.(); }
            lastPhase = s.phase;
        });
        add.addEventListener('click', () => { if (controller.state().busy) return; addingInvitation = true; controller.cancel(); render(controller.state()); input.focus(); });
        login.addEventListener('click', () => { void controller.login(); });
        logout.addEventListener('click', () => { void controller.logout(); });
        review.addEventListener('click', () => { const code = input.value; draftCode=''; input.value = ''; void controller.preview(code); });
        confirm.addEventListener('click', () => { void controller.confirm(); });
        return { close: () => { if (controller.state().busy)
                return false; addingInvitation = false; draftCode=''; controller.cancel(); input.value = ''; return true; }, useInvitation: code=>{if(controller.state().busy||!/^[A-Za-z0-9_-]{43}$/.test(code))return false;controller.cancel();draftCode=code;addingInvitation=true;render(controller.state());if(!input.hidden)input.focus();return true;}, setBindings: (uid, count) => {
            if ((adapter.getUser()?.uid || null) !== uid || !Number.isInteger(count) || count < 0) return;
            if (knownUid !== uid) { knownUid = uid; addingInvitation = false; }
            accessCount = count; render(controller.state());
        } };
    }
    return { parseInvitationQr,createController, validateConfig, createBrowserAuth, mount };
});
