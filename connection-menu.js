"use strict";
(function exposeConnectionMenu(root, factory) { const api = factory(); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.ConnectionMenu = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function createModeState(options) {
        let mode = 'direct';
        return { current: () => mode, select: (next) => {
                if (next !== 'direct' && next !== 'internet')
                    throw new Error('Medio de conexión no válido.');
                if (next === mode)
                    return true;
                if (next === 'internet' && !options.internetAvailable || !options.canChange())
                    return false;
                mode = next;
                return true;
            } };
    }
    function mount(options) {
        const { shell, directBody } = options, d = shell.ownerDocument;
        d.body.classList.add('connections-open');
        const app = options.app || (shell.classList.contains('sa-p2p-shell') ? 'sa' : 'mini');
        const trigger = d.activeElement;
        const origins = [];
        const observers = [];
        const cleanupCallbacks = [];
        let internet = null, released = false, currentTask = '', detailIndex = 0, detailDevice = '', detailAccount = '', detailAccountUnavailable = false;
        let detailOwner = null, detailSlot = null;
        let detailScope = null;
        let presentation = null;
        function node(tag, className = '') { const n = d.createElement(tag); n.className = className; return n; }
        function button(text, action) { const n = d.createElement('button'); n.type = 'button'; n.textContent = text; n.onclick = action; return n; }
        function move(n, target) {
            if (!n || n.parentElement === target)
                return;
            if (!origins.some(row => row.node === n) && n.parentElement)
                origins.push({ node: n, parent: n.parentElement, next: n.nextSibling });
            target.append(n);
        }
        function el(id) { return d.getElementById(id); }
        const home = node('div', directBody.className + ' connections-home');
        home.dataset.connectionsHome = '';
        const account = node('section', 'connections-account');
        account.dataset.connectionsAccount = '';
        const accountTitle = node('strong');
        accountTitle.textContent = 'Cuenta Google';
        account.append(accountTitle);
        const feedback = node('div', 'connections-feedback');
        feedback.setAttribute('aria-live', 'polite');
        const toolbar = node('div', 'connections-toolbar');
        const priorities = node('section', 'connections-priorities');
        priorities.dataset.connectionsActions = '';
        const pending = node('div', 'connections-pending'), primaryActions = node('div', 'connections-primary-actions');
        priorities.append(pending, primaryActions);
        const list = node('div', 'connections-list');
        list.dataset.connectionsList = '';
        const directList = node('div', 'connections-source-list'), cloudList = node('div', 'connections-source-list');
        list.append(directList, cloudList);
        const heading = node('h3');
        heading.textContent = app === 'sa' ? 'Vínculos' : 'Mi vínculo';
        const empty = node('section', 'connections-empty');
        const emptyTitle = node('strong'), emptyHint = node('p');
        emptyTitle.textContent = app === 'sa' ? 'Todavía no hay vínculos' : 'Conecta Mini con tu obra';
        emptyHint.textContent = app === 'sa' ? 'Usa Vincular Mini para compartir personal y recibir asistencia.' : 'Escanea la invitación que te comparte SA para recibir personal y enviar asistencia.';
        empty.append(icon('building'), emptyTitle, emptyHint);
        const extras = node('div', 'connections-extras');
        const taskHost = node('div', directBody.className + ' connections-task');
        taskHost.dataset.connectionsTask = '';
        taskHost.hidden = true;
        const taskTitle = node('h3');
        taskTitle.className = 'connections-screen-title';
        const taskBack = button('Volver a conexiones', () => { show(); });
        taskBack.dataset.connectionsBack = '';
        const taskContent = node('div', 'connections-task-content');
        taskHost.append(taskBack, taskTitle, taskContent);
        const store = node('div');
        store.hidden = true;
        store.dataset.connectionsStore = '';
        const add = button(app === 'mini' ? 'Asociar a una obra' : 'Vincular', () => { task('link'); });
        add.dataset.connectionsAdd = '';
        if (app === 'mini') {
            const device = button('Asociar a otro dispositivo', () => {
                if (!guard())
                    return;
                const backup = extras.querySelector('[data-open-backup-hub-btn]') || directBody.querySelector('[data-open-backup-hub-btn]');
                if (!backup) {
                    options.notify('No se pudo abrir la asociación de dispositivos. Vuelve a abrir Conexiones.');
                    return;
                }
                showDirect();
                backup.click();
            });
            device.dataset.connectionsDevice = '';
            device.prepend(icon('phone'));
            toolbar.append(device);
        }
        const refresh = button('Actualizar conexiones', () => { if (!guard())
            return; void refreshCloud(); });
        toolbar.prepend(add);
        toolbar.append(refresh);
        if (app === 'mini') {
            refresh.prepend(icon('refresh'));
            add.prepend(icon('link'));
            refresh.dataset.connectionsRefresh = '';
        }
        home.append(priorities, toolbar, heading, list, empty, extras, account);
        shell.insertBefore(home, directBody);
        shell.insertBefore(feedback, directBody);
        shell.insertBefore(taskHost, directBody);
        shell.append(store);
        const header = shell.querySelector('header');
        if (header)
            move(account, header);
        const parts = new Map();
        const detailPart = node('section', 'connections-form connections-detail');
        detailPart.dataset.connectionStep = 'details';
        parts.set('details', detailPart);
        store.append(detailPart);
        const accountOpen = button('Mi cuenta', () => { task('account'); });
        accountOpen.dataset.connectionAccountOpen = '';
        account.append(accountOpen);
        function section(name, ids) {
            var _a;
            const part = node('section', 'connections-form');
            part.dataset.connectionStep = name;
            parts.set(name, part);
            store.append(part);
            for (const id of ids) {
                const n = el(id);
                if (!(n instanceof HTMLElement))
                    continue;
                const label = d.querySelector('label[for="' + id + '"]');
                if (label)
                    move(label, part);
                move(((_a = n.parentElement) === null || _a === void 0 ? void 0 : _a.tagName) === 'LABEL' ? n.parentElement : n, part);
            }
            return part;
        }
        function guard() {
            if (!options.canChange() || !options.beforeLeaveInternet()) {
                options.notify('Finaliza o cancela la operación actual antes de continuar.');
                return false;
            }
            return true;
        }
        async function refreshCloud() {
            var _a;
            try {
                await ((_a = options.refreshInternet) === null || _a === void 0 ? void 0 : _a.call(options));
                if (!released)
                    renderCloud();
            }
            catch (e) {
                options.notify(e instanceof Error ? e.message : 'No se pudieron actualizar las conexiones.');
            }
        }
        function updateEmpty() { empty.hidden = !!list.querySelector('[data-connection-card]'); }
        function decorate(n, method) {
            n.dataset.connectionCard = '';
            n.dataset.connectionTransport = method;
            n.classList.add('connections-card');
            if (!n.querySelector('.connections-route')) {
                const badge = node('span', 'connections-route');
                badge.textContent = method === 'internet' ? 'Por internet' : 'Directa';
                n.prepend(badge);
            }
        }
        function bindCloudAction(label, action, index) {
            var _a;
            const option = (_a = el('cloud-field-binding')) === null || _a === void 0 ? void 0 : _a.options[index];
            const bound = (option === null || option === void 0 ? void 0 : option.dataset.orgId) ? { orgId: option.dataset.orgId, projectId: option.dataset.projectId, groupId: option.dataset.groupId } : null;
            const b = button(label, () => {
                var _a, _b;
                if (!guard())
                    return;
                if (b.dataset.primaryAction === 'send') {
                    const date = el('cloud-field-date');
                    if (date)
                        date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                }
                const select = el('cloud-field-binding');
                if (select) {
                    const actual = bound ? [...select.options].findIndex(o => o.dataset.orgId === bound.orgId && o.dataset.projectId === bound.projectId && o.dataset.groupId === bound.groupId) : index;
                    if (actual < 0) {
                        options.notify('Este vínculo ya no está autorizado. Actualiza las conexiones.');
                        return;
                    }
                    select.value = String(actual);
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (action === 'roster' || action === 'receive') {
                    (_a = el(app === 'mini' ? 'cloud-field-roster' : 'sa-field-receive')) === null || _a === void 0 ? void 0 : _a.click();
                    return;
                }
                if (task(action) && action === 'leave')
                    (_b = el('cloud-field-leave')) === null || _b === void 0 ? void 0 : _b.click();
            });
            if (app === 'mini')
                b.prepend(icon(action === 'send' ? 'send' : action === 'roster' ? 'people' : action === 'members' ? 'share' : action === 'leave' ? 'unlink' : 'document'));
            b.dataset.cloudAction = action;
            return b;
        }
        function renderCloud() {
            var _a;
            if (app === 'sa') {
                const devices = el('sa-field-devices');
                if (devices)
                    move(devices, cloudList);
                const accounts = [...((devices === null || devices === void 0 ? void 0 : devices.querySelectorAll('[data-connection-account-id]')) || [])];
                for (const card of accounts) {
                    decorate(card, 'internet');
                    if (!card.querySelector('.connections-row-icon')) {
                        const symbol = icon('people');
                        symbol.classList.add('connections-row-icon');
                        card.prepend(symbol);
                    }
                    if (!card.querySelector('[data-connection-detail]')) {
                        const detail = button('Ver dispositivos', () => { if (!guard())
                            return; detailAccount = card.dataset.connectionAccountId || ''; detailAccountUnavailable = false; detailDevice = ''; task('details'); });
                        detail.dataset.connectionDetail = '';
                        detail.setAttribute('aria-label', 'Ver dispositivos de ' + (((_a = card.querySelector('h3')) === null || _a === void 0 ? void 0 : _a.textContent) || 'esta cuenta'));
                        card.append(detail);
                    }
                }
                devices === null || devices === void 0 ? void 0 : devices.querySelectorAll('[data-device-id]').forEach(card => {
                    var _a;
                    // Account devices keep their native controls in details, never overview rows.
                    if (card.closest('[data-connection-account-id]'))
                        return;
                    decorate(card, 'internet');
                    if (!card.querySelector('.connections-row-icon')) {
                        const symbol = icon('phone');
                        symbol.classList.add('connections-row-icon');
                        card.prepend(symbol);
                    }
                    const access = card.querySelector('[data-device-action]');
                    if (access)
                        access.textContent = ((_a = access.textContent) === null || _a === void 0 ? void 0 : _a.includes('Revocar')) || access.textContent === 'Desvincular' ? 'Desvincular' : 'Restaurar vínculo';
                    if (!card.querySelector('[data-connection-detail]')) {
                        const detail = button('Ver vínculo', () => { if (!guard())
                            return; detailDevice = card.dataset.deviceId || ''; detailAccount = ''; detailAccountUnavailable = false; task('details'); });
                        detail.dataset.connectionDetail = '';
                        card.append(detail);
                    }
                    if (!card.querySelector('[data-cloud-action]')) {
                        const actions = node('div', 'connections-card-actions');
                        actions.append(bindCloudAction('Compartir personal', 'personal', 0), bindCloudAction('Recibir asistencia de la obra', 'receive', 0));
                        card.append(actions);
                    }
                });
                if (devices)
                    for (const p of [...devices.children])
                        if (!p.hasAttribute('data-device-id') && !p.hasAttribute('data-connection-account-id'))
                            p.hidden = accounts.length > 0 || !!devices.querySelector('[data-device-id]');
            }
            else {
                const select = el('cloud-field-binding');
                cloudList.replaceChildren();
                [...((select === null || select === void 0 ? void 0 : select.options) || [])].forEach((option, index) => {
                    const card = node('article', 'connections-card');
                    decorate(card, 'internet');
                    const title = node('strong');
                    title.textContent = option.textContent;
                    const authorization = node('p');
                    authorization.textContent = 'Obra y grupo autorizados para este Mini';
                    const actions = node('div', 'connections-card-actions');
                    actions.append(bindCloudAction('Recibir personal', 'roster', index), bindCloudAction('Enviar asistencia', 'send', index), bindCloudAction('Miembros y asistencia', 'members', index), bindCloudAction('Desvincular', 'leave', index));
                    const detail = button('Administrar vínculo', () => { detailIndex = index; detailScope = { orgId: option.dataset.orgId || '', projectId: option.dataset.projectId || '', groupId: option.dataset.groupId || '' }; task('details'); });
                    detail.dataset.connectionDetail = '';
                    const symbol = icon('building');
                    symbol.classList.add('connections-row-icon');
                    card.append(symbol, title, authorization, detail, actions);
                    cloudList.append(card);
                });
            }
            updateEmpty();
            renderHeader();
            renderPriorities();
            renderInvitation();
            if (currentTask === 'details')
                renderDetails();
            if (currentTask === 'account')
                renderAccount();
        }
        function renderHeader() {
            const status = el(app === 'mini' ? 'firebase-link-status' : 'sa-field-status'), email = (status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || '';
            accountOpen.textContent = email || 'Mi cuenta';
            accountOpen.title = email ? 'Mi cuenta · ' + email : 'Mi cuenta';
            accountOpen.setAttribute('aria-label', 'Mi cuenta');
            accountTitle.textContent = email ? ((status === null || status === void 0 ? void 0 : status.dataset.accountName) || email).trim().slice(0, 1).toUpperCase() : 'G';
        }
        function icon(kind) { if (app === 'mini' && typeof MiniConnectionPresentation !== 'undefined')
            return MiniConnectionPresentation.icon(d, kind); const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('connections-line-icon'); const path = d.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', kind === 'phone' ? 'M7 2h10v20H7zM10 18h4' : kind === 'building' ? 'M3 22V2h12v20M15 10h6v12M6 6h2M10 6h2M6 10h2M10 10h2M6 14h2M10 14h2M18 14h1M18 18h1M6 22v-4h6v4' : kind === 'link' ? 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2' : kind === 'people' ? 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8' : 'M14 2H6v20h14V8l-6-6M14 2v6h6M9 13h8M9 17h8'); svg.append(path); return svg; }
        function currentEvents() {
            var _a;
            try {
                const raw = (_a = el(app === 'mini' ? 'cloud-field-updates' : 'sa-field-updates')) === null || _a === void 0 ? void 0 : _a.dataset.events;
                return raw ? JSON.parse(raw) : [];
            }
            catch {
                return [];
            }
        }
        function renderPriorities() {
            var _a, _b, _c, _d;
            pending.replaceChildren();
            primaryActions.replaceChildren();
            const events = currentEvents(), local = app === 'sa' ? Number(((_a = el('sa-field-updates')) === null || _a === void 0 ? void 0 : _a.dataset.localPending) || 0) : 0, pendingTitle = node('h3');
            pendingTitle.textContent = 'Por revisar';
            pendingTitle.className = 'connections-pending-heading';
            pending.append(pendingTitle);
            priorities.dataset.app = app;
            if (app === 'mini')
                priorities.append(primaryActions, pending);
            if (!events.length && !local) {
                const text = node('p', 'connections-clear');
                text.textContent = app === 'sa' ? 'No hay envíos por revisar' : 'No hay cambios por revisar';
                pending.append(text);
            }
            for (const event of events) {
                const card = node('article', 'connections-action-card');
                card.dataset.noticeKind = event.kind;
                const title = node('strong');
                title.textContent = event.title;
                const description = node('p');
                description.textContent = event.description;
                const count = node('span', 'connections-count');
                count.textContent = String(event.count);
                count.setAttribute('aria-label', event.count + ' pendiente(s)');
                const review = button(event.kind === 'roster' ? 'Revisar personal' : 'Revisar asistencia', () => { if (guard())
                    d.dispatchEvent(new CustomEvent('connection-open-notice', { detail: { app, event } })); });
                review.dataset.noticeReview = '';
                card.prepend(icon(event.kind === 'roster' ? 'people' : 'document'));
                card.append(count, title, description, review);
                if (event.deferred) {
                    const later = node('small');
                    later.textContent = 'Guardado para después';
                    card.append(later);
                }
                pending.append(card);
            }
            if (local > 0) {
                const card = node('article', 'connections-action-card'), title = node('strong'), description = node('p');
                title.textContent = 'Asistencia recibida';
                description.textContent = local + ' envío(s) guardados aquí para revisar.';
                const review = button('Revisar asistencia recibida', () => { if (guard())
                    d.dispatchEvent(new CustomEvent('connection-open-local-inbox')); });
                review.dataset.primaryAction = 'local-review';
                card.prepend(icon('document'));
                card.append(title, description, review);
                pending.append(card);
            }
            if (app === 'mini') {
                const select = el('cloud-field-binding'), index = Number((select === null || select === void 0 ? void 0 : select.value) || 0);
                if (select === null || select === void 0 ? void 0 : select.options.length) {
                    const card = node('article', 'connections-action-card connections-daily');
                    const title = node('h3');
                    title.textContent = 'Compartir asistencia';
                    const description = node('p');
                    description.textContent = ((_b = select.options[index]) === null || _b === void 0 ? void 0 : _b.textContent) || 'Selecciona una obra';
                    const send = bindCloudAction('Preparar envío', 'send', index);
                    send.dataset.primaryAction = 'send';
                    send.textContent = 'Enviar asistencia';
                    card.append(icon('send'), title, description, send);
                    primaryActions.append(card);
                    const personnel = node('article', 'connections-action-card connections-personal-action'), personnelTitle = node('h3'), personnelHint = node('p');
                    personnelTitle.textContent = 'Personal de mi obra';
                    personnelHint.textContent = ((_c = select.options[index]) === null || _c === void 0 ? void 0 : _c.textContent) || '';
                    const update = bindCloudAction('Actualizar personal', 'roster', index);
                    update.dataset.primaryAction = 'roster';
                    personnel.append(icon('people'), personnelTitle, personnelHint, update);
                    primaryActions.append(personnel);
                    const peers = node('article', 'connections-action-card connections-members-action'), peerTitle = node('h3'), peerHint = node('p'), share = bindCloudAction('Compartir con otro Mini', 'members', index);
                    share.dataset.primaryAction = 'members';
                    peerTitle.textContent = 'Otros Minis de mi obra';
                    peerHint.textContent = 'Compartir o revisar asistencia de varios días';
                    peers.append(icon('share'), peerTitle, peerHint, share);
                    primaryActions.append(peers);
                }
            }
            else {
                const card = node('article', 'connections-action-card');
                const title = node('h3');
                title.textContent = 'Compartir personal';
                const description = node('p');
                description.textContent = (((_d = el('sa-field-project-name')) === null || _d === void 0 ? void 0 : _d.value) || 'Obra activa') + ' · Personal oficial para tus Minis.';
                const publish = button('Preparar personal', () => { task('personal'); });
                publish.dataset.primaryAction = 'personal';
                card.append(icon('people'), title, description, publish);
                const link = node('article', 'connections-action-card connections-link-tile'), linkTitle = node('h3'), linkHint = node('p');
                linkTitle.textContent = 'Vincular Mini';
                linkHint.textContent = 'Conectar un nuevo Mini';
                add.textContent = 'Vincular Mini';
                link.append(icon('link'), linkTitle, linkHint, add);
                primaryActions.append(card, link);
            }
        }
        function contextCard(title, description) { const card = node('section', 'connections-context'); const heading = node('strong'), text = node('p'); heading.textContent = title; text.textContent = description; card.append(heading, text); return card; }
        function identityCard() {
            const status = el('firebase-link-status'), email = (status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || '', name = (status === null || status === void 0 ? void 0 : status.dataset.accountName) || email || 'Cuenta Google';
            const card = contextCard(name, email || 'Inicia sesión para gestionar tus vínculos');
            card.classList.add('mini-connection-identity');
            const avatar = node('span', 'connections-avatar');
            avatar.textContent = name.trim().slice(0, 1).toUpperCase() || 'G';
            avatar.setAttribute('aria-hidden', 'true');
            card.prepend(avatar);
            return card;
        }
        function decorateActionRow(row, title, hint, kind) {
            const copy = node('span'), label = node('strong'), description = node('small');
            label.textContent = title;
            description.textContent = hint;
            copy.append(label, description);
            row.replaceChildren(copy);
            row.classList.add('mini-connection-action-row');
            if (typeof MiniConnectionPresentation !== 'undefined') {
                row.prepend(MiniConnectionPresentation.icon(d, kind));
                row.append(MiniConnectionPresentation.icon(d, 'chevron'));
            }
        }
        function restoreSaDetails() {
            const devices = el('sa-field-devices');
            const accountDevices = detailPart.querySelector('[data-account-devices]');
            if (accountDevices) {
                accountDevices.hidden = true;
                if (detailOwner && (devices === null || devices === void 0 ? void 0 : devices.contains(detailOwner)))
                    detailOwner.append(accountDevices);
                else
                    accountDevices.remove();
            }
            const card = detailPart.querySelector('[data-device-id]');
            if (card) {
                if (detailSlot && (devices === null || devices === void 0 ? void 0 : devices.contains(detailSlot)))
                    detailSlot.replaceWith(card);
                else
                    card.remove();
            }
            detailOwner = null;
            detailSlot = null;
        }
        function renderDetails() {
            var _a, _b, _c;
            if (app === 'sa') {
                const devices = el('sa-field-devices');
                if (detailAccountUnavailable) {
                    detailPart.replaceChildren(contextCard('Cuenta no disponible', 'Esta cuenta ya no está en la lista. Actualiza las conexiones.'));
                    return;
                }
                if (detailAccount) {
                    const owner = [...((devices === null || devices === void 0 ? void 0 : devices.querySelectorAll('[data-connection-account-id]')) || [])].find(card => card.dataset.connectionAccountId === detailAccount);
                    if (owner === detailOwner && detailPart.querySelector('[data-account-devices]'))
                        return;
                    restoreSaDetails();
                    detailPart.replaceChildren();
                    const contents = owner === null || owner === void 0 ? void 0 : owner.querySelector('[data-account-devices]');
                    if (owner && contents) {
                        detailOwner = owner;
                        contents.hidden = false;
                        detailPart.append(contents);
                        taskTitle.textContent = ((_a = owner.querySelector('h3')) === null || _a === void 0 ? void 0 : _a.textContent) || 'Dispositivos de la cuenta';
                    }
                    else {
                        detailAccount = '';
                        detailAccountUnavailable = true;
                        taskTitle.textContent = 'Cuenta no disponible';
                        detailPart.append(contextCard('Cuenta no disponible', 'Esta cuenta ya no está en la lista. Actualiza las conexiones.'));
                    }
                    return;
                }
                const replacement = [...((devices === null || devices === void 0 ? void 0 : devices.querySelectorAll('[data-device-id]')) || [])].find(card => card.dataset.deviceId === detailDevice);
                if (detailSlot && (devices === null || devices === void 0 ? void 0 : devices.contains(detailSlot)) && !replacement)
                    return;
                restoreSaDetails();
                detailPart.replaceChildren();
                if (replacement) {
                    detailSlot = node('span');
                    detailSlot.hidden = true;
                    replacement.before(detailSlot);
                    detailPart.append(replacement);
                    taskTitle.textContent = ((_b = replacement.querySelector('h3')) === null || _b === void 0 ? void 0 : _b.textContent) || 'Detalle del vínculo';
                }
                else {
                    detailPart.append(contextCard('Vínculo no disponible', 'Actualiza las conexiones para consultar este Mini.'));
                }
                return;
            }
            detailPart.replaceChildren();
            const select = el('cloud-field-binding');
            const index = (detailScope === null || detailScope === void 0 ? void 0 : detailScope.orgId) ? [...((select === null || select === void 0 ? void 0 : select.options) || [])].findIndex(o => o.dataset.orgId === (detailScope === null || detailScope === void 0 ? void 0 : detailScope.orgId) && o.dataset.projectId === (detailScope === null || detailScope === void 0 ? void 0 : detailScope.projectId) && o.dataset.groupId === (detailScope === null || detailScope === void 0 ? void 0 : detailScope.groupId)) : detailIndex;
            const option = select === null || select === void 0 ? void 0 : select.options[index];
            if (!option) {
                detailPart.append(contextCard('Vínculo no disponible', 'Actualiza las conexiones.'));
                return;
            }
            taskTitle.textContent = 'Detalle del vínculo';
            const identity = identityCard(), scope = contextCard(option.textContent || 'Obra', 'Obra y grupo autorizados');
            scope.classList.add('mini-connection-scope');
            if (typeof MiniConnectionPresentation !== 'undefined')
                scope.prepend(MiniConnectionPresentation.icon(d, 'building'));
            const badge = node('span', 'mini-connection-status');
            badge.textContent = 'Autorizado';
            scope.append(badge);
            identity.append(scope, contextCard('Por internet', 'Ruta de conexión'));
            detailPart.append(identity);
            const actions = node('div', 'connections-detail-actions');
            actions.append(bindCloudAction('Recibir personal', 'roster', index), bindCloudAction('Enviar asistencia', 'send', index), bindCloudAction('Miembros y asistencia', 'members', index), bindCloudAction('Desvincular de esta obra', 'leave', index));
            detailPart.append(actions);
            const rename = button('Nombre del dispositivo', () => { task('settings'); });
            decorateActionRow(rename, 'Nombre de este Mini', ((_c = el('cloud-field-device-name')) === null || _c === void 0 ? void 0 : _c.dataset.resolvedName) || 'Mini', 'tag');
            detailPart.append(rename);
            const hint = node('p', 'connections-hint');
            hint.textContent = 'Desvincular conserva el personal y la asistencia guardados en este dispositivo.';
            detailPart.append(hint);
        }
        function renderAccount() {
            var _a, _b, _c;
            const previous = taskContent.querySelector('[data-account-summary]');
            previous === null || previous === void 0 ? void 0 : previous.remove();
            const summary = node('section', 'connections-account-summary');
            summary.dataset.accountSummary = '';
            const status = el(app === 'mini' ? 'firebase-link-status' : 'sa-field-status'), email = (status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || '', name = (status === null || status === void 0 ? void 0 : status.dataset.accountName) || email || 'Cuenta Google';
            const avatar = node('span', 'connections-avatar');
            avatar.textContent = email ? (name.trim()[0] || 'G').toUpperCase() : 'G';
            avatar.setAttribute('aria-hidden', 'true');
            const identity = contextCard(name, email || 'Inicia sesión para gestionar tus vínculos');
            identity.prepend(avatar);
            if (app === 'mini') {
                identity.classList.add('mini-connection-identity');
                const provider = contextCard('Cuenta Google', email ? 'Conectada' : 'Sin iniciar sesión');
                provider.classList.add('mini-connection-provider');
                const logo = d.createElement('img');
                logo.src = './vendor/google-g.png';
                logo.width = 26;
                logo.height = 26;
                logo.alt = '';
                provider.prepend(logo);
                identity.append(provider);
                summary.append(identity);
                if (!email)
                    summary.append(account);
            }
            else
                summary.append(identity, account);
            if (app === 'mini') {
                const select = el('cloud-field-binding'), works = new Set([...((select === null || select === void 0 ? void 0 : select.options) || [])].map(o => o.dataset.orgId + '|' + o.dataset.projectId));
                const linked = button('Mis obras vinculadas · ' + works.size, () => { show(); });
                const device = button('Este dispositivo · ' + (((_a = el('cloud-field-device-name')) === null || _a === void 0 ? void 0 : _a.dataset.resolvedName) || ((_b = el('cloud-field-device-name')) === null || _b === void 0 ? void 0 : _b.value) || 'Mini'), () => { task('settings'); });
                decorateActionRow(device, 'Este dispositivo', ((_c = el('cloud-field-device-name')) === null || _c === void 0 ? void 0 : _c.dataset.resolvedName) || 'Mini', 'phone');
                decorateActionRow(linked, 'Mis obras vinculadas', works.size + ' obra(s) autorizada(s)', 'building');
                summary.append(device, linked);
            }
            const backup = extras.querySelector('[data-open-backup-hub-btn]');
            if (backup)
                summary.append(button('Respaldos y transferencia directa', () => { backup.click(); }));
            const pendingCount = currentEvents().reduce((total, event) => total + event.count, 0);
            summary.append(button('Pendientes por revisar · ' + pendingCount, () => { show(); }));
            const hint = node('p', 'connections-hint');
            hint.textContent = 'Cerrar sesión conserva los datos guardados en este dispositivo.';
            if (app === 'mini' && email)
                summary.append(account);
            summary.append(hint);
            taskContent.prepend(summary);
        }
        function renderInvitation() {
            if (app !== 'mini')
                return;
            const part = parts.get('link'), status = el('firebase-link-status');
            if (!part || !status)
                return;
            const phase = status.dataset.linkPhase || 'ready';
            part.dataset.linkPhase = phase;
            const intro = part.querySelector('[data-invitation-intro]');
            if (intro)
                intro.hidden = phase === 'preview' || phase === 'linked';
            const old = part.querySelector('[data-link-result]');
            old === null || old === void 0 ? void 0 : old.remove();
            const cancel = part.querySelector('[data-invitation-cancel]');
            if (cancel)
                cancel.hidden = phase === 'linked';
            const add = el('firebase-link-add');
            if (add)
                add.hidden = true;
            if (phase !== 'linked')
                return;
            const result = node('section', 'mini-connection-linked');
            result.dataset.linkResult = '';
            if (typeof MiniConnectionPresentation !== 'undefined')
                result.append(MiniConnectionPresentation.icon(d, 'check'));
            const title = node('strong'), hint = node('p');
            title.textContent = 'Conectado con ' + (status.dataset.projectName || 'tu obra');
            hint.textContent = 'Actualiza el personal para comenzar a pasar asistencia.';
            result.append(title, hint);
            let groups = [];
            try {
                groups = JSON.parse(status.dataset.groupIds || '[]');
            }
            catch {
                groups = [];
            }
            const select = el('cloud-field-binding'), choices = [...((select === null || select === void 0 ? void 0 : select.options) || [])].map((option, index) => ({ option, index })).filter(({ option }) => option.dataset.orgId === status.dataset.orgId && option.dataset.projectId === status.dataset.projectId && groups.includes(option.dataset.groupId || ''));
            if (choices.length) {
                for (const { option, index } of choices) {
                    const update = bindCloudAction(choices.length > 1 ? 'Actualizar personal · ' + (option.dataset.groupName || option.textContent) : 'Actualizar personal', 'roster', index);
                    update.dataset.linkedRoster = '';
                    result.append(update);
                }
            }
            else
                result.append(contextCard('Preparando tu obra', 'Espera un momento mientras se carga el personal disponible.'));
            result.append(button('Ir a conexiones', () => { show(); }));
            part.append(result);
        }
        function renderSendPreview() {
            var _a, _b;
            const part = parts.get(currentTask);
            if (!part || !['send', 'members'].includes(currentTask))
                return;
            for (const screen of parts.values())
                (_a = screen.querySelector('[data-send-preview]')) === null || _a === void 0 ? void 0 : _a.remove();
            const preview = node('section', 'connections-send-preview');
            preview.dataset.sendPreview = '';
            const select = el('cloud-field-binding'), option = select === null || select === void 0 ? void 0 : select.selectedOptions[0];
            preview.append(contextCard((option === null || option === void 0 ? void 0 : option.textContent) || 'Obra y grupo', currentTask === 'members' ? 'El otro Mini revisará los días antes de aplicarlos.' : 'SA revisará los días antes de incorporarlos.'));
            try {
                const raw = (_b = el('cloud-field-updates')) === null || _b === void 0 ? void 0 : _b.dataset.preview;
                const data = raw ? JSON.parse(raw) : null;
                if (data && data.orgId === (option === null || option === void 0 ? void 0 : option.dataset.orgId) && data.projectId === (option === null || option === void 0 ? void 0 : option.dataset.projectId) && data.groupId === (option === null || option === void 0 ? void 0 : option.dataset.groupId)) {
                    const metrics = node('div', 'connections-metrics');
                    for (const [value, label] of data.dates.length > 1 ? [[data.days.length, 'días con asistencia'], [data.present, 'marcas presentes'], [data.overtimeHours, 'h extras']] : [[data.present, 'presentes'], [data.unmarked, 'sin marca'], [data.overtimeHours, 'h extras']])
                        metrics.append(contextCard(String(value), String(label)));
                    preview.append(metrics);
                    for (const day of data.days) {
                        const details = d.createElement('details');
                        details.className = 'connections-preview-day';
                        details.open = data.days.length === 1;
                        details.dataset.previewDay = day.workDate;
                        const title = d.createElement('summary');
                        title.textContent = MiniAttendanceDays.formatDate(day.workDate) + ' · ' + day.present + ' presentes';
                        title.prepend(icon('calendar'));
                        title.append(icon('chevron'));
                        details.append(title);
                        const rows = node('div', 'connections-preview-rows');
                        for (const row of day.rows)
                            rows.append(contextCard(row.number + ' · ' + row.name, row.label));
                        details.append(rows);
                        preview.append(details);
                    }
                    if (data.emptyDates.length) {
                        const empty = contextCard(data.emptyDates.length + ' día(s) sin asistencia', 'Estos días no se enviarán: ' + data.emptyDates.map(MiniAttendanceDays.formatDate).join(', '));
                        empty.dataset.emptyDays = '';
                        preview.append(empty);
                    }
                    if (!data.days.length)
                        preview.append(contextCard('No hay asistencia para enviar', 'Elige otros días o registra la asistencia.'));
                    const send = el('cloud-field-send');
                    if (send) {
                        const text = data.days.length > 1 ? 'Enviar ' + data.days.length + ' días a SA' : 'Enviar a SA';
                        send.replaceChildren(icon('send'), d.createTextNode(text));
                    }
                }
                else
                    preview.append(contextCard('Revisa los días que vas a compartir', 'Comprueba las personas y las horas antes de enviar.'));
            }
            catch {
                preview.append(contextCard('Vista previa no disponible', 'Revisa los días seleccionados.'));
            }
            const refresh = button('Revisar días seleccionados', () => { var _a; void ((_a = options.prepareSend) === null || _a === void 0 ? void 0 : _a.call(options)); });
            refresh.prepend(icon('calendar'));
            refresh.dataset.previewRefresh = '';
            preview.append(refresh);
            const dates = el('cloud-field-dates');
            if ((dates === null || dates === void 0 ? void 0 : dates.parentElement) === part)
                dates.after(preview);
            else
                part.prepend(preview);
        }
        function sendPreviewChanged() { renderSendPreview(); }
        d.addEventListener('connection-send-preview', sendPreviewChanged);
        function enhancePersonal(part) {
            var _a;
            const list = el('sa-field-employees');
            if (!list)
                return;
            const bar = node('div', 'connections-personal-toolbar'), count = node('strong'), search = d.createElement('input');
            search.type = 'search';
            search.placeholder = 'Buscar por número o nombre';
            search.setAttribute('aria-label', 'Buscar personal');
            search.dataset.personalSearch = '';
            bar.append(count);
            const all = el('sa-field-all');
            if (all)
                bar.append(all);
            list.before(bar, search);
            function update() { const rows = [...list.querySelectorAll('label')], selected = rows.filter(row => { var _a; return (_a = row.querySelector('input')) === null || _a === void 0 ? void 0 : _a.checked; }).length; count.textContent = selected + ' seleccionados'; for (const row of rows)
                row.hidden = !(row.textContent || '').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()); const publish = el('sa-field-publish'); if (publish)
                publish.textContent = selected ? 'Compartir ' + selected + ' empleados' : 'Compartir personal seleccionado'; }
            search.addEventListener('input', update);
            list.addEventListener('change', update);
            (_a = el('sa-field-all')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => queueMicrotask(update));
            const observer = new MutationObserver(update);
            observer.observe(list, { childList: true });
            observers.push(observer);
            update();
            const hint = node('p', 'connections-hint');
            hint.textContent = 'Se comparte personal, sin sueldos ni préstamos.';
            part.append(hint);
        }
        function activate(name, scope) {
            if (!guard())
                return false;
            if (app === 'mini') {
                const select = el('cloud-field-binding');
                const index = [...((select === null || select === void 0 ? void 0 : select.options) || [])].findIndex(o => o.dataset.orgId === scope.orgId && o.dataset.projectId === scope.projectId && o.dataset.groupId === scope.groupId);
                if (!select || index < 0) {
                    options.notify('Esta obra o grupo ya no está autorizado. Actualiza las conexiones.');
                    return false;
                }
                select.value = String(index);
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return name === 'roster' ? true : task(name);
        }
        function updates(event) { const detail = event.detail; if ((detail === null || detail === void 0 ? void 0 : detail.app) === app && !released)
            renderPriorities(); }
        d.addEventListener('connection-updates', updates);
        function initializeInternet() {
            var _a, _b, _c;
            if (internet || !options.internetAvailable)
                return;
            try {
                internet = options.getInternet();
                move(internet, store);
                internet.hidden = false;
                const prefix = app === 'sa' ? 'sa-field-' : 'firebase-link-';
                for (const id of ['login', 'logout'])
                    move(el(prefix + id), account);
                const login = el(prefix + 'login');
                if (login) {
                    login.classList.add('connection-google-button');
                    const mark = d.createElement('img');
                    mark.src = app === 'mini' ? './vendor/google-g.png' : 'js/vendor/google-g.png';
                    mark.width = 20;
                    mark.height = 20;
                    mark.alt = '';
                    mark.setAttribute('aria-hidden', 'true');
                    const label = node('span');
                    label.textContent = 'Iniciar sesión con Google';
                    login.replaceChildren(mark, label);
                    let lastHidden = login.hidden;
                    const watcher = new MutationObserver(() => { if (login.hidden === lastHidden)
                        return; lastHidden = login.hidden; void refreshCloud(); });
                    watcher.observe(login, { attributes: true, attributeFilter: ['hidden'] });
                    observers.push(watcher);
                }
                move(el(prefix + 'status'), feedback);
                if (app === 'mini') {
                    move(el('firebase-link-error'), feedback);
                    move(el('cloud-field-status'), feedback);
                    const linkPart = section('link', ['firebase-link-code', 'firebase-link-review', 'firebase-link-details', 'firebase-link-confirm', 'firebase-link-add']);
                    const intro = contextCard('Escanea la invitación de SA', 'Abre el QR en SA y apunta la cámara.');
                    intro.dataset.invitationIntro = '';
                    intro.classList.add('mini-invitation-intro');
                    if (typeof MiniConnectionPresentation !== 'undefined')
                        intro.prepend(MiniConnectionPresentation.icon(d, 'qr'));
                    const scan = button('Escanear QR de SA', () => { var _a; if (!guard())
                        return; showDirect(); (_a = options.scanInvitation) === null || _a === void 0 ? void 0 : _a.call(options); });
                    scan.dataset.invitationScan = '';
                    intro.append(scan);
                    linkPart.prepend(intro);
                    const input = el('firebase-link-code');
                    if (input) {
                        const label = d.createElement('label');
                        label.htmlFor = 'firebase-link-code';
                        label.textContent = 'O pega el código de invitación';
                        label.className = 'mini-invitation-code-label';
                        input.before(label);
                        input.setAttribute('placeholder', 'Pega aquí el código que te envió SA');
                    }
                    const review = el('firebase-link-review');
                    if (review)
                        review.textContent = 'Revisar código';
                    const linkWatcher = new MutationObserver(() => { renderInvitation(); presentation === null || presentation === void 0 ? void 0 : presentation.refresh(); });
                    const status = el('firebase-link-status');
                    if (status) {
                        linkWatcher.observe(status, { attributes: true, attributeFilter: ['data-link-phase', 'data-link-busy'] });
                        observers.push(linkWatcher);
                    }
                    const error = el('firebase-link-error');
                    if (error)
                        move(error, linkPart);
                    if (typeof MiniConnectionPresentation !== 'undefined')
                        (_a = el('firebase-link-details')) === null || _a === void 0 ? void 0 : _a.querySelectorAll('.connections-capabilities>div').forEach((card, i) => { if (!card.querySelector('svg'))
                            card.prepend(MiniConnectionPresentation.icon(d, i ? 'document' : 'people')); });
                    const confirmIdentity = identityCard();
                    confirmIdentity.classList.add('mini-connection-confirm-account');
                    (_b = el('firebase-link-confirm')) === null || _b === void 0 ? void 0 : _b.before(confirmIdentity);
                    const cancelInvitation = button('Cancelar', () => { show(); });
                    cancelInvitation.dataset.invitationCancel = '';
                    linkPart.append(cancelInvitation);
                    renderInvitation();
                    const sendPart = section('send', ['cloud-field-dates', 'cloud-field-send', 'cloud-field-retry']);
                    const retry = el('cloud-field-retry');
                    if (retry)
                        retry.textContent = 'Reintentar envíos';
                    const footer = node('footer', 'mini-connection-footer');
                    const send = el('cloud-field-send');
                    if (send) {
                        send.textContent = 'Enviar a SA';
                        footer.append(send);
                    }
                    footer.append(button('Volver', () => { show(); }));
                    sendPart.append(footer);
                    const leavePart = section('leave', ['cloud-field-leave', 'cloud-field-leave-review']);
                    if (typeof MiniConnectionPresentation !== 'undefined') {
                        const leaveReview = el('cloud-field-leave-review');
                        if (leaveReview && !leaveReview.querySelector('.mini-connection-icon'))
                            leaveReview.prepend(MiniConnectionPresentation.icon(d, 'unlink'));
                    }
                    const leaveCancel = el('cloud-field-leave-cancel'), cancelLeave = () => { task('details'); };
                    leaveCancel === null || leaveCancel === void 0 ? void 0 : leaveCancel.addEventListener('click', cancelLeave);
                    cleanupCallbacks.push(() => leaveCancel === null || leaveCancel === void 0 ? void 0 : leaveCancel.removeEventListener('click', cancelLeave));
                    const confirmLeave = el('cloud-field-leave-confirm');
                    if (confirmLeave)
                        confirmLeave.textContent = 'Desvincular';
                    const settings = section('settings', ['cloud-field-device-name', 'cloud-field-device-save']);
                    const aliasHint = node('p', 'connections-hint');
                    aliasHint.textContent = 'Deja el nombre vacío para usar el de tu cuenta Google.';
                    settings.append(aliasHint);
                    section('members', ['cloud-field-members']);
                    const select = el('cloud-field-binding');
                    if (select) {
                        const watcher = new MutationObserver(renderCloud);
                        watcher.observe(select, { childList: true });
                        observers.push(watcher);
                    }
                }
                else {
                    const controls = el('sa-field-controls');
                    const personal = section('personal', ['sa-field-project-name', 'sa-field-group-name', 'sa-field-refresh', 'sa-field-all', 'sa-field-employees', 'sa-field-publish']);
                    enhancePersonal(personal);
                    const invitePart = section('invite', ['sa-field-create', 'sa-field-invite']);
                    invitePart.prepend(contextCard('Invitar un Mini', 'Comparte el código con la persona que usará Mini. Deberá revisar y confirmar la obra y el grupo.'));
                    personal.append(button('Crear invitación para Mini', () => { var _a; (_a = el('sa-field-create')) === null || _a === void 0 ? void 0 : _a.click(); }));
                    // Keep label text associated with existing inputs in the shared task.
                    if (controls)
                        for (const label of [...controls.querySelectorAll('label')]) {
                            if (label.querySelector('input'))
                                continue;
                            if ((_c = label.textContent) === null || _c === void 0 ? void 0 : _c.includes('Nombre'))
                                move(label, parts.get('personal'));
                        }
                    const devices = el('sa-field-devices');
                    if (devices) {
                        const watcher = new MutationObserver(renderCloud);
                        watcher.observe(devices, { childList: true });
                        observers.push(watcher);
                    }
                }
                renderCloud();
                void refreshCloud();
            }
            catch (e) {
                options.notify(e instanceof Error ? e.message : 'No se pudo preparar la cuenta.');
            }
        }
        function renderOverview() {
            const source = directBody.querySelector('.mini-p2p-peer-list,.sa-p2p-peer-list');
            if (source && !source.hasAttribute('data-connections-harvested')) {
                source.setAttribute('data-connections-harvested', '');
                directList.replaceChildren();
                for (const card of [...source.querySelectorAll('.mini-p2p-peer-row,.sa-p2p-peer-row')]) {
                    decorate(card, 'direct');
                    directList.append(card);
                }
                extras.replaceChildren();
                const pending = directBody.querySelector('.mini-p2p-activity');
                if (pending)
                    extras.append(pending);
                const self = directBody.querySelector('.mini-p2p-self,.sa-p2p-self');
                if (self)
                    extras.append(self);
                const backup = directBody.querySelector('[data-open-backup-hub-btn]');
                if (backup)
                    extras.append(backup);
            }
            initializeInternet();
            renderCloud();
        }
        function paintHome() {
            currentTask = '';
            if (app === 'sa')
                restoreSaDetails();
            currentTask = '';
            shell.insertBefore(feedback, taskHost);
            shell.dataset.connectionScreen = 'home';
            if (header)
                header.append(account);
            else
                home.append(account);
            home.hidden = false;
            taskHost.hidden = true;
            directBody.hidden = true;
            feedback.hidden = false;
            for (const part of parts.values())
                store.append(part);
        }
        function show(_method) {
            if (released)
                return false;
            if (currentTask && !guard())
                return false;
            const returning = !!currentTask && !['account', 'details', 'send'].includes(currentTask);
            paintHome();
            renderOverview();
            if (returning)
                void refreshCloud();
            return true;
        }
        function showDirect() {
            home.hidden = true;
            taskHost.hidden = true;
            directBody.hidden = false;
            feedback.hidden = true;
        }
        function pairingChoices() {
            if (app === 'mini')
                taskContent.append(identityCard());
            const choices = node('fieldset', 'connections-route-choices'), legend = node('legend');
            legend.textContent = 'Elige cómo conectar';
            choices.append(legend);
            let selected = options.internetAvailable ? 'internet' : 'direct';
            for (const [value, title, description] of [['internet', 'Por internet', 'Recibir personal y enviar asistencia desde cualquier lugar.'], ['direct', 'Conexión directa', 'Conectar con SA cuando ambos equipos estén disponibles.']]) {
                if (value === 'internet' && !options.internetAvailable)
                    continue;
                const card = node('label', 'connections-route-card');
                card.dataset.routeCard = value;
                const radio = d.createElement('input');
                radio.type = 'radio';
                radio.name = 'connection-route';
                radio.value = value;
                radio.checked = selected === value;
                const copy = node('span'), heading = node('strong'), hint = node('small');
                heading.textContent = title;
                hint.textContent = description;
                copy.append(heading, hint);
                card.append(radio, copy);
                if (app === 'mini' && typeof MiniConnectionPresentation !== 'undefined')
                    card.prepend(MiniConnectionPresentation.icon(d, value === 'internet' ? 'cloud' : 'qr'));
                choices.append(card);
                radio.onchange = () => { selected = value; };
            }
            const continueButton = button('Continuar', () => {
                var _a, _b, _c;
                if (!guard())
                    return;
                if (selected === 'internet') {
                    if (app === 'mini') {
                        taskHost.dataset.screen = 'invitation';
                        currentTask = 'invitation';
                        shell.dataset.connectionScreen = 'invitation';
                    }
                    openForm(app === 'sa' ? 'personal' : 'link', app === 'sa' ? 'Compartir personal' : 'Vincular con mi obra');
                    if (app === 'sa' && ((_a = el('sa-field-login')) === null || _a === void 0 ? void 0 : _a.hidden))
                        store.append(account);
                    (_b = el('firebase-link-add')) === null || _b === void 0 ? void 0 : _b.click();
                }
                else {
                    showDirect();
                    (_c = directBody.querySelector(app === 'sa' ? '[data-new-pair]' : '[data-manual-pair]')) === null || _c === void 0 ? void 0 : _c.click();
                }
            });
            continueButton.dataset.screenPrimary = '';
            taskContent.append(choices, continueButton);
            if (app === 'mini') {
                const scan = button('Escanear QR de SA', () => { var _a; if (!guard())
                    return; showDirect(); (_a = directBody.querySelector('[data-scan-pair]')) === null || _a === void 0 ? void 0 : _a.click(); });
                taskContent.append(scan);
            }
        }
        function openForm(name, title) {
            for (const part of parts.values())
                store.append(part);
            taskContent.replaceChildren();
            taskTitle.textContent = title;
            const part = parts.get(name);
            if (part)
                taskContent.append(part);
            if (app === 'mini' && (name === 'send' || name === 'members') && part) {
                const dates = el('cloud-field-dates');
                if (dates)
                    move(dates, part);
                if (dates)
                    part.prepend(dates);
            }
        }
        function task(name) {
            var _a, _b, _c;
            if (released || !guard())
                return false;
            initializeInternet();
            if (name === 'link' || name === 'invitation' || name === 'account')
                taskHost.insertBefore(account, taskTitle);
            else
                store.append(account);
            taskHost.dataset.screen = name;
            shell.dataset.connectionScreen = name;
            currentTask = name;
            home.hidden = true;
            directBody.hidden = true;
            taskHost.hidden = false;
            feedback.hidden = false;
            openForm(name === 'link' ? 'route' : name === 'invitation' ? 'link' : name, name === 'send' ? 'Enviar asistencia' : name === 'leave' ? 'Desvincular de la obra' : name === 'settings' ? 'Nombre de este Mini' : name === 'members' ? 'Miembros y asistencia' : 'Compartir personal');
            if (name === 'link') {
                taskTitle.textContent = 'Vincular';
                pairingChoices();
            }
            if (name === 'invite')
                taskTitle.textContent = 'Invitar un Mini';
            if (name === 'invitation')
                taskTitle.textContent = 'Revisar invitación';
            if (name === 'details')
                renderDetails();
            if (name === 'account') {
                taskTitle.textContent = 'Mi cuenta';
                renderAccount();
            }
            if (name === 'send') {
                renderSendPreview();
                void ((_a = options.prepareSend) === null || _a === void 0 ? void 0 : _a.call(options));
            }
            if (name === 'members') {
                renderSendPreview();
                void ((_b = options.prepareMembers) === null || _b === void 0 ? void 0 : _b.call(options));
            }
            taskHost.append(feedback);
            presentation === null || presentation === void 0 ? void 0 : presentation.refresh();
            if (app === 'mini')
                (_c = shell.querySelector('[data-mini-header-back]')) === null || _c === void 0 ? void 0 : _c.focus();
            else
                taskBack.focus();
            return true;
        }
        function directClick(event) {
            const target = event.target;
            if (target === null || target === void 0 ? void 0 : target.closest('[data-wait-peer],[data-wait-attendance],[data-send-peer],[data-select-peer],[data-rename-peer],[data-open-backup-hub-btn],[data-rename-self]'))
                showDirect();
        }
        home.addEventListener('click', directClick, true);
        const bodyWatcher = new MutationObserver(() => {
            if (released)
                return;
            if (!directBody.querySelector('.mini-p2p-peer-list,.sa-p2p-peer-list') && directBody.childElementCount)
                showDirect();
        });
        bodyWatcher.observe(directBody, { childList: true });
        observers.push(bodyWatcher);
        function keydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                options.close();
                return;
            }
            if (event.key !== 'Tab')
                return;
            const nodes = [...shell.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n => !n.hasAttribute('disabled') && n.getClientRects().length > 0 && n.tabIndex >= 0);
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && d.activeElement === first) {
                event.preventDefault();
                last === null || last === void 0 ? void 0 : last.focus();
            }
            else if (!event.shiftKey && d.activeElement === last) {
                event.preventDefault();
                first === null || first === void 0 ? void 0 : first.focus();
            }
        }
        shell.addEventListener('keydown', keydown);
        if (app === 'mini' && typeof MiniConnectionPresentation !== 'undefined')
            presentation = MiniConnectionPresentation.mount({ shell, body: directBody, task: taskHost, title: taskTitle, back: taskBack, account: accountOpen });
        return {
            show, task, activate, canNavigate: guard,
            review(_method) { showDirect(); },
            release() {
                if (!options.beforeLeaveInternet())
                    return false;
                if (app === 'sa')
                    restoreSaDetails();
                presentation === null || presentation === void 0 ? void 0 : presentation.dispose();
                cleanupCallbacks.forEach(fn => fn());
                released = true;
                d.removeEventListener('connection-send-preview', sendPreviewChanged);
                d.body.classList.remove('connections-open');
                d.removeEventListener('connection-updates', updates);
                observers.forEach(o => o.disconnect());
                for (const { node, parent, next } of [...origins].reverse()) {
                    if ((next === null || next === void 0 ? void 0 : next.parentNode) === parent)
                        parent.insertBefore(node, next);
                    else
                        parent.append(node);
                }
                if (internet)
                    internet.hidden = true;
                shell.removeEventListener('keydown', keydown);
                if (trigger === null || trigger === void 0 ? void 0 : trigger.isConnected)
                    queueMicrotask(() => trigger.focus());
                return true;
            }
        };
    }
    return { createModeState, mount };
});
