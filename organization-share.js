"use strict";
(function exposeOrgShare(root, factory) { const api = factory(root); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.MiniOrganizationShare = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    function object(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Datos de asistencia no válidos.');
        return value;
    }
    function presentMembers(values) {
        const seen = new Set();
        return values.map(object).filter(p => { if (typeof p.deviceId !== 'string' || !p.deviceId)
            throw new Error('Miembro no válido.'); if (seen.has(p.deviceId))
            return false; seen.add(p.deviceId); return true; }).map(p => { const ownerName = typeof p.ownerName === 'string' && p.ownerName.trim() && !p.ownerName.includes('@') ? p.ownerName.trim().slice(0, 120) : 'Miembro de la obra'; return { deviceId: String(p.deviceId), name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 120) : ownerName, ownerName }; });
    }
    function createReviewModel(payload, employees, current, projectId) {
        const p = object(payload), date = String(p.workDate);
        if (p.schema !== 'attendance-submission/v1' || p.saProjectId !== projectId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !Array.isArray(p.rows) || p.rows.length > 500)
            throw new Error('La asistencia no corresponde a esta obra o fecha.');
        const seen = new Set();
        const rows = p.rows.map(value => {
            var _a, _b;
            const r = object(value), id = String(r.saEmployeeId || '');
            if (!id || seen.has(id) || !['present', 'unmarked'].includes(String(r.status)))
                throw new Error('Empleados de asistencia no válidos.');
            seen.add(id);
            const normal = r.normalHours, extra = r.overtimeHours;
            if (typeof normal !== 'number' || typeof extra !== 'number' || !Number.isFinite(normal) || !Number.isFinite(extra) || normal < 0 || extra < 0 || normal + extra > 24 || (r.status === 'present' && normal + extra <= 0) || (r.status === 'unmarked' && normal + extra !== 0))
                throw new Error('Horas recibidas no válidas.');
            const matches = employees.map(object).filter(e => e.saProjectId === projectId && e.saEmployeeId === id);
            const localId = matches.length === 1 && typeof matches[0].id === 'string' ? matches[0].id : null;
            const selectable = !!localId && r.status === 'present' && normal + extra > 0;
            return { saEmployeeId: id, name: String(r.name || 'Empleado'), localId, incomingHours: normal + extra, currentHours: localId ? (_b = (_a = current[localId]) === null || _a === void 0 ? void 0 : _a.hours) !== null && _b !== void 0 ? _b : null : null, selectable, selected: false, reason: !localId ? 'Recibe y aplica el personal de SA para vincular este empleado.' : r.status === 'unmarked' ? 'Sin marca en el envío. Se conserva la marca actual.' : '' };
        });
        return { date, rows };
    }
    function applyReviewBatch(models, repository) {
        if (!models.length || models.length > 31)
            throw new Error('Revisa entre 1 y 31 días.');
        const data = {}, seen = new Set();
        for (const model of models) {
            if (seen.has(model.date))
                throw new Error('Elige un solo envío por día.');
            seen.add(model.date);
            const day = {};
            for (const row of model.rows) {
                if (!row.selected)
                    continue;
                if (!row.selectable || !row.localId || !Number.isFinite(row.incomingHours) || row.incomingHours <= 0 || row.incomingHours > 24)
                    throw new Error('No se puede aplicar un empleado sin vínculo verificado u horas válidas.');
                day[row.localId] = { status: 'present', hours: row.incomingHours };
            }
            if (Object.keys(day).length)
                data[model.date] = day;
        }
        if (Object.keys(data).length)
            repository.importBatch(data, 'merge');
    }
    function applyReview(model, repository) { applyReviewBatch([model], repository); }
    function validateReviewItems(values) {
        if (!values.length || values.length > 31)
            throw new Error('Selecciona entre 1 y 31 días para revisar.');
        const items = values.map(object), dates = new Set(), ids = new Set();
        let sender = '';
        for (const item of items) {
            const p = object(item.payload), device = String(p.deviceId || ''), date = String(p.workDate), id = String(item.shareId || '');
            if (!device || !id || ids.has(id) || dates.has(date))
                throw new Error('Elige un solo envío por día.');
            if (sender && sender !== device)
                throw new Error('Selecciona días del mismo Mini para revisarlos juntos.');
            sender = device;
            dates.add(date);
            ids.add(id);
        }
        return items.sort((a, b) => String(object(a.payload).workDate).localeCompare(String(object(b.payload).workDate)));
    }
    function createReceipts(storage) {
        const key = (scope, id) => 'mini-org-share-review-v1:' + JSON.stringify([scope, id]);
        return {
            get(scope, id) { const v = storage.getItem(key(scope, id)); return v === 'applied' || v === 'discarded' ? v : null; },
            put(scope, id, decision) { storage.setItem(key(scope, id), decision); }
        };
    }
    function mount(o) {
        var _a;
        const d = o.document, host = d.getElementById('cloud-field-members'), receipts = createReceipts(o.storage);
        let generation = 0;
        let items = [];
        const queue = o.createQueue(async (row) => {
            const [orgId, projectId, groupId, targetDeviceId] = JSON.parse(row.scopeKey);
            return await o.request('share', { orgId, projectId, groupId, targetDeviceId, submission: row.payload });
        });
        function node(tag, text = '') { const n = d.createElement(tag); n.textContent = text; return n; }
        function button(text, fn, kind = 'chevron') { const b = d.createElement('button'); b.type = 'button'; b.className = 'btn-full btn-secondary'; const copy = node('span', text); b.append(root.MiniConnectionPresentation.icon(d, kind), copy); b.onclick = fn; return b; }
        const hint = node('p', 'Elige otro Mini de tu obra o revisa la asistencia que te han compartido.');
        const refresh = button('Actualizar miembros y recibidos', () => { void o.run(load); });
        refresh.id = 'cloud-members-refresh';
        (_a = refresh.querySelector('svg')) === null || _a === void 0 ? void 0 : _a.replaceWith(root.MiniConnectionPresentation.icon(d, 'refresh'));
        const content = node('div'), review = node('section');
        review.className = 'firebase-link-details';
        review.dataset.organizationReview = '';
        content.dataset.organizationDirectory = '';
        review.hidden = true;
        host.append(hint, refresh, content, review);
        function context() { const c = o.context(); if (!c)
            throw new Error('Selecciona una obra y un grupo con sesión Google.'); return c; }
        const scope = (c) => JSON.stringify([c.uid, c.orgId, c.projectId, c.groupId, c.deviceId]);
        function check(c, g) { if (g !== generation || !o.context() || scope(context()) !== scope(c))
            throw new Error('La cuenta o la obra cambió. Vuelve a consultar.'); }
        const body = (c) => ({ orgId: c.orgId, projectId: c.projectId, groupId: c.groupId, deviceId: c.deviceId });
        async function load() {
            var _a, _b;
            const c = context(), g = ++generation;
            content.replaceChildren();
            review.replaceChildren();
            review.hidden = true;
            hint.textContent = 'Consultando miembros autorizados…';
            const peers = await o.request('members', body(c)), incoming = await o.request('sharedinbox', body(c));
            check(c, g);
            if (!Array.isArray(peers) || !Array.isArray(incoming))
                throw new Error('Respuesta de miembros no válida.');
            items = incoming.map(object);
            content.replaceChildren();
            review.hidden = true;
            const select = d.createElement('select');
            select.className = 'search-input';
            select.id = 'cloud-members-target';
            select.setAttribute('aria-label', 'Destinatario de la misma obra y grupo');
            const blank = d.createElement('option');
            blank.value = '';
            blank.textContent = 'Selecciona un destinatario';
            select.append(blank);
            const members = presentMembers(peers), cards = node('div');
            cards.className = 'org-member-list';
            cards.setAttribute('aria-label', 'Minis autorizados de esta obra y grupo');
            for (const p of members) {
                const option = d.createElement('option');
                option.value = p.deviceId;
                option.textContent = p.name + (p.ownerName !== p.name ? ' · ' + p.ownerName : '');
                select.append(option);
                const card = button('', () => { select.value = p.deviceId; select.dispatchEvent(new Event('change')); });
                card.className = 'org-member-card';
                card.dataset.memberDevice = p.deviceId;
                const avatar = node('span', p.name.slice(0, 1).toUpperCase());
                avatar.className = 'connections-avatar';
                avatar.setAttribute('aria-hidden', 'true');
                const copy = node('span');
                copy.append(node('strong', p.name), node('small', p.ownerName === p.name ? 'Mini autorizado' : p.ownerName));
                card.replaceChildren(avatar, copy, root.MiniConnectionPresentation.icon(d, 'chevron'));
                card.setAttribute('aria-pressed', 'false');
                cards.append(card);
            }
            select.addEventListener('change', () => { for (const card of cards.querySelectorAll('button'))
                card.setAttribute('aria-pressed', String(card.dataset.memberDevice === select.value)); });
            const send = button('Compartir días seleccionados', () => {
                void o.run(async () => {
                    check(c, g);
                    const target = select.value;
                    if (!target)
                        throw new Error('Selecciona un miembro autorizado.');
                    const payloads = o.buildMany ? await o.buildMany() : [await o.build()].filter((p) => !!p);
                    check(c, g);
                    if (!payloads.length)
                        throw new Error('No hay asistencia para compartir en los días seleccionados.');
                    const key = JSON.stringify([c.orgId, c.projectId, c.groupId, target]);
                    if (payloads.length > 1) {
                        if (!queue.enqueueBatch)
                            throw new Error('No se pudieron guardar juntos los días.');
                        await queue.enqueueBatch(c.uid, key, payloads);
                    }
                    else
                        await queue.enqueue(c.uid, key, payloads[0]);
                    hint.textContent = payloads.length + ' día(s) guardado(s) en este Mini. Enviando…';
                    await queue.flush(c.uid, key);
                    check(c, g);
                    hint.textContent = 'Asistencia compartida. El destinatario debe revisarla antes de aplicarla.';
                });
            });
            send.id = 'cloud-members-send';
            send.disabled = !peers.length;
            send.dataset.sharingDisabled = String(!peers.length);
            const retry = button('Reintentar asistencia compartida pendiente', () => {
                void o.run(async () => {
                    check(c, g);
                    const rows = (await queue.pending(c.uid)).filter(row => { const key = JSON.parse(row.scopeKey); return key[0] === c.orgId && key[1] === c.projectId && key[2] === c.groupId; });
                    for (const key of new Set(rows.map(row => row.scopeKey)))
                        await queue.flush(c.uid, key);
                    hint.textContent = 'Reintento completado. Los envíos sin confirmación se conservan.';
                });
            });
            retry.id = 'cloud-members-retry';
            (_a = send.querySelector('svg')) === null || _a === void 0 ? void 0 : _a.replaceWith(root.MiniConnectionPresentation.icon(d, 'share'));
            (_b = retry.querySelector('svg')) === null || _b === void 0 ? void 0 : _b.replaceWith(root.MiniConnectionPresentation.icon(d, 'refresh'));
            content.append(node('h4', 'Elige a quién compartir'), cards, select, send, retry, node('h4', 'Asistencia recibida'));
            const selectedItems = new Set(), batchHint = node('p');
            batchHint.className = 'connections-hint';
            const reviewSelected = button('Revisar días seleccionados', () => { void o.run(async () => { check(c, g); await showReview(c, g, items.filter(item => selectedItems.has(String(item.shareId)))); }); }, 'calendar');
            reviewSelected.id = 'cloud-members-review-days';
            reviewSelected.disabled = true;
            reviewSelected.dataset.sharingDisabled = 'true';
            for (const value of incoming) {
                const item = object(value), p = object(item.payload), row = node('div');
                row.className = 'org-incoming-day';
                const label = node('label'), checkBox = d.createElement('input');
                checkBox.type = 'checkbox';
                checkBox.dataset.receivedDay = String(item.shareId);
                label.append(checkBox, node('span', String(item.senderName) + ' · ' + MiniAttendanceDays.formatDate(String(p.workDate))));
                checkBox.onchange = () => { if (checkBox.checked)
                    selectedItems.add(String(item.shareId));
                else
                    selectedItems.delete(String(item.shareId)); reviewSelected.disabled = !selectedItems.size; reviewSelected.dataset.sharingDisabled = String(reviewSelected.disabled); batchHint.textContent = selectedItems.size + (selectedItems.size === 1 ? ' día seleccionado para revisar.' : ' días seleccionados para revisar juntos.'); };
                const b = button('Revisar este día', () => { void o.run(async () => { check(c, g); await showReview(c, g, [item]); }); }, 'calendar');
                b.dataset.shareId = String(item.shareId);
                row.append(label, b);
                content.append(row);
            }
            if (incoming.length)
                content.append(batchHint, reviewSelected);
            else
                content.append(node('p', 'No hay asistencia recibida por revisar.'));
            const pending = (await queue.pending(c.uid)).filter(row => { const key = JSON.parse(row.scopeKey); return key[0] === c.orgId && key[1] === c.projectId && key[2] === c.groupId; }).length;
            check(c, g);
            hint.textContent = peers.length + ' miembro(s) disponible(s) · ' + incoming.length + ' recibido(s) por revisar · ' + pending + ' envío(s) pendiente(s).' + (!peers.length ? ' SA debe permitir compartir a ambos Minis de este grupo.' : '');
        }
        async function showReview(c, g, values) {
            var _a;
            const selected = validateReviewItems(values), entries = selected.map(item => { const payload = object(item.payload), shareId = String(item.shareId); return { item, payload, shareId, previous: receipts.get(scope(c), shareId), model: createReviewModel(payload, o.employees(), o.repository().getByDate(String(payload.workDate)), c.projectId) }; });
            review.replaceChildren(node('h4', String(selected[0].senderName) + ' · ' + entries.length + (entries.length === 1 ? ' día de asistencia' : ' días de asistencia')));
            review.hidden = false;
            review.append(node('p', 'Tus horas actuales se conservan. Elige las horas recibidas que quieras aplicar.'));
            async function acknowledge() {
                for (const entry of entries) {
                    const decision = receipts.get(scope(c), entry.shareId);
                    if (!decision)
                        throw new Error('Falta guardar la revisión de un día.');
                    await o.request('sharedack', { ...body(c), shareId: entry.shareId, decision });
                    check(c, g);
                }
                d.dispatchEvent(new CustomEvent('connection-data-applied'));
                await load();
            }
            if (entries.every(e => e.previous)) {
                review.append(node('p', 'Revisión guardada en este Mini. Falta confirmar la recepción.'), button('Confirmar revisión guardada', () => { void o.run(acknowledge); }, 'check'));
                return;
            }
            const models = entries.filter(e => !e.previous).map(e => e.model);
            const apply = button('Aplicar horas seleccionadas', () => {
                void o.run(async () => {
                    check(c, g);
                    const latest = await o.request('sharedinbox', body(c));
                    check(c, g);
                    if (!Array.isArray(latest))
                        throw new Error('No se pudo verificar la asistencia recibida.');
                    for (const entry of entries) {
                        if (!latest.some(value => object(value).shareId === entry.shareId && JSON.stringify(object(value).payload) === JSON.stringify(entry.payload)))
                            throw new Error('Un envío ya no está disponible. Actualiza la bandeja y los permisos con SA.');
                        if (entry.previous)
                            continue;
                        const fresh = createReviewModel(entry.payload, o.employees(), o.repository().getByDate(entry.model.date), c.projectId);
                        for (const row of entry.model.rows.filter(r => r.selected)) {
                            const current = fresh.rows.find(r => r.saEmployeeId === row.saEmployeeId);
                            if (!(current === null || current === void 0 ? void 0 : current.selectable) || current.localId !== row.localId || current.currentHours !== row.currentHours)
                                throw new Error('La asistencia actual cambió. Vuelve a revisar antes de aplicar.');
                        }
                    }
                    applyReviewBatch(models, o.repository());
                    for (const entry of entries)
                        if (!entry.previous)
                            receipts.put(scope(c), entry.shareId, entry.model.rows.some(r => r.selected) ? 'applied' : 'discarded');
                    o.onApplied();
                    await acknowledge();
                });
            }, 'check');
            apply.id = 'cloud-members-apply';
            apply.className = 'btn-full btn-primary';
            apply.disabled = true;
            apply.dataset.sharingDisabled = 'true';
            const repaint = () => { const count = models.filter(m => m.rows.some(r => r.selected)).length; apply.disabled = !count; apply.dataset.sharingDisabled = String(apply.disabled); apply.querySelector('span').textContent = entries.length === 1 ? 'Aplicar horas seleccionadas' : 'Aplicar ' + count + (count === 1 ? ' día' : ' días') + ' y conservar el resto'; };
            for (const entry of entries) {
                const day = node('details');
                day.className = 'org-share-day';
                day.dataset.reviewDate = entry.model.date;
                day.open = entries.length === 1;
                day.append(node('summary', MiniAttendanceDays.formatDate(entry.model.date) + ' · ' + entry.model.rows.filter(r => r.selectable).length + (entry.model.rows.filter(r => r.selectable).length === 1 ? ' persona con asistencia' : ' personas con asistencia')));
                if (entry.previous) {
                    day.append(node('p', 'Este día ya fue revisado. Se confirmará sin cambiar tus horas.'));
                    review.append(day);
                    continue;
                }
                const chooseDay = button('Aplicar todo este día', () => { for (const row of entry.model.rows)
                    if (row.selectable)
                        row.selected = true; for (const paint of paints)
                    paint(); repaint(); }, 'check');
                chooseDay.dataset.applyDay = entry.model.date;
                const keepDay = button('Conservar todo este día', () => { for (const row of entry.model.rows)
                    row.selected = false; for (const paint of paints)
                    paint(); repaint(); }, 'document');
                const paints = [];
                day.append(chooseDay, keepDay);
                for (const row of entry.model.rows) {
                    const line = node('div');
                    line.className = 'org-share-row';
                    line.append(node('strong', row.name), node('p', 'Recibido: ' + row.incomingHours + ' h · Actual: ' + (row.currentHours === null ? 'sin marca' : row.currentHours + ' h')));
                    if (row.selectable) {
                        const incoming = button('Aplicar ' + row.incomingHours + ' h', () => { row.selected = true; paint(); repaint(); }, 'check'), keep = button('Conservar actual', () => { row.selected = false; paint(); repaint(); }, 'document');
                        const paint = () => { incoming.setAttribute('aria-pressed', String(row.selected)); keep.setAttribute('aria-pressed', String(!row.selected)); line.dataset.selected = String(row.selected); };
                        paints.push(paint);
                        line.append(incoming, keep);
                        paint();
                    }
                    else
                        line.append(node('p', row.reason));
                    day.append(line);
                }
                review.append(day);
            }
            const discard = button('Conservar todo y cerrar revisión', () => { void o.run(async () => { check(c, g); for (const entry of entries)
                if (!entry.previous)
                    receipts.put(scope(c), entry.shareId, 'discarded'); await acknowledge(); }); }, 'check');
            discard.id = 'cloud-members-discard';
            const later = button('Revisar después', () => { review.hidden = true; });
            later.id = 'cloud-members-later';
            const footer = node('div');
            footer.className = 'mini-connection-footer';
            footer.append(apply, discard, later);
            review.append(footer);
            (_a = review.scrollIntoView) === null || _a === void 0 ? void 0 : _a.call(review, { block: 'nearest' });
        }
        return { async open(shareId) { await load(); if (shareId) {
                const item = items.find(x => x.shareId === shareId);
                if (!item)
                    throw new Error('El envío ya no está disponible.');
                await showReview(context(), generation, [item]);
            } }, reset() { generation++; content.replaceChildren(); review.replaceChildren(); review.hidden = true; hint.textContent = 'Elige otro Mini de tu obra o revisa la asistencia que te han compartido.'; } };
    }
    return { presentMembers, createReviewModel, applyReview, applyReviewBatch, validateReviewItems, createReceipts, mount };
});
