"use strict";
(function exposeFirebaseLink(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniFirebaseLink = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    function record(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Respuesta no válida.');
        return value;
    }
    function text(value) {
        if (typeof value !== 'string' || !value.trim() || value.length > 128)
            throw new Error('Respuesta no válida.');
        return value;
    }
    function id(value) {
        const s = text(value);
        if (s.trim() !== s || /[\/\s\x00-\x1f]/.test(s) || s === 'legacy-unresolved')
            throw new Error('Referencia no válida.');
        return s;
    }
    function parsePreview(value) {
        const r = record(value);
        if (!Array.isArray(r.groups) || r.groups.length < 1 || r.groups.length > 20 || typeof r.expiresAt !== 'number' || !Number.isFinite(r.expiresAt))
            throw new Error('Invitación no válida.');
        const groups = r.groups.map(value => { const g = record(value); return { id: id(g.id), name: text(g.name) }; });
        if (new Set(groups.map(g => g.id)).size !== groups.length)
            throw new Error('Grupos no válidos.');
        return { orgId: id(r.orgId), orgName: text(r.orgName), projectId: id(r.projectId), projectName: text(r.projectName), groups, expiresAt: r.expiresAt };
    }
    function parseInvitationQr(raw) { const match = /^sa-mini-invite\/v1:([A-Za-z0-9_-]{43})$/.exec(raw.trim()); return match ? match[1] : null; }
    function loopback(url) { return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
    function validateConfig(value, origin) {
        const r = record(value), f = record(r.firebase), page = new URL(origin), url = new URL(text(r.endpoint));
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
            throw new Error('Servicio de vinculación no válido.');
        const firebase = { apiKey: text(f.apiKey), authDomain: text(f.authDomain), projectId: id(f.projectId), appId: text(f.appId) };
        let emulator;
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
    function createController(options) {
        const now = options.now || Date.now;
        let user = null, epoch = 0, code = '';
        let current = { phase: 'signedOut', email: '', busy: false, error: '', preview: null };
        const listeners = new Set();
        function state() { return { ...current, preview: current.preview ? { ...current.preview, groups: current.preview.groups.map(g => ({ ...g })) } : null }; }
        function emit() { listeners.forEach(fn => fn(state())); }
        function reset(next) { epoch++; code = ''; user = next; current = { phase: next ? 'ready' : 'signedOut', email: (next === null || next === void 0 ? void 0 : next.email) || '', busy: false, error: '', preview: null }; emit(); }
        const unsubscribe = options.auth.subscribe(next => {
            if ((next === null || next === void 0 ? void 0 : next.uid) !== (user === null || user === void 0 ? void 0 : user.uid))
                reset(next);
        });
        reset(options.auth.getUser());
        function message(error) {
            const c = typeof error === 'object' && error ? String(error.code || '') : '';
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
        async function request(route, expected) {
            if (!user)
                throw new Error('Sin sesión');
            const account = user, abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
            try {
                const token = await account.getIdToken(true);
                if (expected !== epoch)
                    throw new Error('Sesión cambió');
                const response = await options.fetcher(options.endpoint + '/v1/invitations/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ token: code }), signal: abort.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
                const body = await response.json();
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
        async function preview(input) {
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
        async function confirm() {
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
                if (r.status !== 'linked' || r.orgId !== expected.orgId || r.projectId !== expected.projectId || !Array.isArray(r.groupIds) || r.groupIds.length < expected.groups.length || r.groupIds.length > 20 || r.groupIds.some(g => {
                    try {
                        id(g);
                        return false;
                    }
                    catch {
                        return true;
                    }
                }) || new Set(r.groupIds).size !== r.groupIds.length || expected.groups.some(g => !r.groupIds.includes(g.id)))
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
        function cancel() {
            if (current.busy)
                return;
            reset(user);
        }
        async function login() {
            if (current.busy)
                return;
            const generation = epoch;
            current.busy = true;
            current.error = '';
            emit();
            try {
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
            }
        }
        async function logout() {
            if (current.busy)
                return;
            const generation = epoch;
            current.busy = true;
            emit();
            try {
                await options.auth.logout();
                reset(null);
            }
            catch (error) {
                if (generation === epoch) {
                    current.busy = false;
                    current.error = message(error);
                    emit();
                }
            }
        }
        return { state, preview, confirm, cancel, login, logout, subscribe: (fn) => { listeners.add(fn); fn(state()); return () => listeners.delete(fn); }, dispose: () => { epoch++; code = ''; unsubscribe(); listeners.clear(); } };
    }
    function createBrowserAuth(sdk, config) {
        const auth = sdk.initializeApp(config.firebase, 'mini-field').auth();
        if (config.emulator)
            auth.useEmulator(config.emulator);
        const ready = auth.setPersistence('local').then(() => null, error => error);
        return { getUser: () => auth.currentUser, subscribe: fn => auth.onAuthStateChanged(fn), login: async () => {
                const issue = await ready;
                if (issue)
                    throw issue;
                const provider = new sdk.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                return auth.signInWithPopup(provider);
            }, logout: () => auth.signOut() };
    }
    function mount(options) {
        const d = options.document;
        const el = (name) => d.getElementById('firebase-link-' + name);
        const input = el('code');
        const review = el('review'), confirm = el('confirm'), login = el('login'), logout = el('logout'), cancel = el('cancel');
        let controller;
        let adapter, knownUid = null, accessCount = 0, addingInvitation = false, lastPhase = '', draftCode = '';
        const add = d.createElement('button');
        add.type = 'button';
        add.id = 'firebase-link-add';
        add.className = 'btn-full btn-secondary';
        add.textContent = 'Vincular otra obra o grupo';
        add.hidden = true;
        review.insertAdjacentElement('afterend', add);
        try {
            const config = validateConfig(options.config, options.origin);
            adapter = createBrowserAuth(options.sdk, config);
            controller = createController({ auth: adapter, endpoint: config.endpoint, fetcher: (input, init) => fetch(input, init) });
        }
        catch {
            el('status').textContent = 'La conexión con SA por internet está en preparación. Puedes seguir usando Mini de forma independiente.';
            [input, review, confirm, login, logout].forEach(n => { n.hidden = true; });
            return { close: () => true, useInvitation: () => false, setBindings: () => { } };
        }
        function render(s) {
            var _a, _b, _c, _d, _e, _f, _g;
            const uid = ((_a = adapter.getUser()) === null || _a === void 0 ? void 0 : _a.uid) || null;
            if (uid !== knownUid) {
                if (knownUid)
                    draftCode = '';
                knownUid = uid;
                accessCount = 0;
                addingInvitation = !!draftCode;
            }
            const existing = !!uid && accessCount > 0 && !addingInvitation;
            el('status').textContent = s.busy ? 'Verificando…' : s.phase === 'signedOut' ? 'Inicia sesión para recuperar tus obras o vincular Mini con SA.' : existing ? 'Vinculación confirmada. Tus obras y grupos están en la lista de conexiones.' : s.phase === 'linked' ? 'Vinculación confirmada. Puedes recibir personal y enviar asistencia.' : s.email;
            el('error').textContent = s.error;
            const metadata = el('status');
            metadata.dataset.linkPhase = s.phase;
            metadata.dataset.linkBusy = String(s.busy);
            metadata.dataset.orgId = ((_b = s.preview) === null || _b === void 0 ? void 0 : _b.orgId) || '';
            metadata.dataset.projectId = ((_c = s.preview) === null || _c === void 0 ? void 0 : _c.projectId) || '';
            metadata.dataset.projectName = ((_d = s.preview) === null || _d === void 0 ? void 0 : _d.projectName) || '';
            metadata.dataset.groupIds = JSON.stringify(((_e = s.preview) === null || _e === void 0 ? void 0 : _e.groups.map(g => g.id)) || []);
            el('status').dataset.accountEmail = s.phase === 'signedOut' ? '' : s.email;
            el('status').dataset.accountName = ((_f = adapter.getUser()) === null || _f === void 0 ? void 0 : _f.displayName) || '';
            el('status').dataset.accountPhoto = s.phase === 'signedOut' ? '' : ((_g = adapter.getUser()) === null || _g === void 0 ? void 0 : _g.photoURL) || '';
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
            if (s.phase !== 'ready')
                input.value = '';
            else if (draftCode)
                input.value = draftCode;
        }
        const permissions = d.createElement('section');
        permissions.className = 'connections-capabilities';
        for (const [title, description] of [['Recibir personal', 'Revisar y aplicar el personal autorizado de SA.'], ['Enviar asistencia', 'Enviar a SA para su revisión antes de incorporarla.']]) {
            const card = d.createElement('div'), heading = d.createElement('strong'), hint = d.createElement('p');
            heading.textContent = title;
            hint.textContent = description;
            card.append(heading, hint);
            if (typeof root.MiniConnectionPresentation !== 'undefined')
                card.prepend(root.MiniConnectionPresentation.icon(d, title === 'Recibir personal' ? 'people' : 'document'));
            permissions.append(card);
        }
        el('details').append(permissions);
        controller.subscribe(s => {
            var _a;
            render(s);
            if (s.phase === 'linked' && lastPhase !== 'linked') {
                addingInvitation = false;
                (_a = options.onLinked) === null || _a === void 0 ? void 0 : _a.call(options);
            }
            lastPhase = s.phase;
        });
        add.addEventListener('click', () => { if (controller.state().busy)
            return; addingInvitation = true; controller.cancel(); render(controller.state()); input.focus(); });
        login.addEventListener('click', () => { void controller.login(); });
        logout.addEventListener('click', () => { void controller.logout(); });
        review.addEventListener('click', () => { const code = input.value; draftCode = ''; input.value = ''; void controller.preview(code); });
        confirm.addEventListener('click', () => { void controller.confirm(); });
        return { close: () => {
                if (controller.state().busy)
                    return false;
                addingInvitation = false;
                draftCode = '';
                controller.cancel();
                input.value = '';
                return true;
            }, useInvitation: code => { if (controller.state().busy || !/^[A-Za-z0-9_-]{43}$/.test(code))
                return false; controller.cancel(); draftCode = code; addingInvitation = true; render(controller.state()); if (!input.hidden)
                input.focus(); return true; }, setBindings: (uid, count) => {
                var _a;
                if ((((_a = adapter.getUser()) === null || _a === void 0 ? void 0 : _a.uid) || null) !== uid || !Number.isInteger(count) || count < 0)
                    return;
                if (knownUid !== uid) {
                    knownUid = uid;
                    addingInvitation = false;
                }
                accessCount = count;
                render(controller.state());
            } };
    }
    return { parseInvitationQr, createController, validateConfig, createBrowserAuth, mount };
});
