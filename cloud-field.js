"use strict";
(function exposeCloudField(root, factory) { const api = factory(); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.MiniCloudField = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getDeviceIdentity(storage, randomId = () => crypto.randomUUID()) {
        let deviceId = storage.getItem('mini-cloud-device-v1');
        if (!deviceId) {
            deviceId = randomId();
            storage.setItem('mini-cloud-device-v1', deviceId);
        }
        return { deviceId, deviceName: storage.getItem('mini-cloud-device-name-v1') || '' };
    }
    function requestError(error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError')
                return new Error('La conexión tardó demasiado. Reintenta; tus envíos pendientes se conservan.');
            if (error instanceof TypeError)
                return new Error('No se pudo conectar. Revisa internet y reintenta; tus envíos pendientes se conservan.');
            if (error instanceof SyntaxError)
                return new Error('No se pudo leer la respuesta. Reintenta; tus envíos pendientes se conservan.');
            return error;
        }
        return new Error('No se pudo completar. Revisa la conexión y reintenta.');
    }
    function resolveDeviceName(alias, user) { var _a; return (alias.trim() || ((_a = user === null || user === void 0 ? void 0 : user.displayName) === null || _a === void 0 ? void 0 : _a.trim()) || 'Mini').slice(0, 120); }
    function createOutbox(options) {
        let flushing = false;
        async function enqueueBatch(uid, scopeKey, payloads) {
            if (!payloads.length)
                throw new Error('No hay días con asistencia para enviar.');
            const pending = await options.store.list(), ids = payloads.map(p => p.submissionId);
            if (pending.length + payloads.length > 100)
                throw new Error('La cola admite 100 días pendientes. Reintenta antes de preparar otro envío.');
            if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length || pending.some(r => ids.includes(r.id)))
                throw new Error('Hay un envío repetido o no válido.');
            if (pending.some(row => row.uid === uid && row.scopeKey === scopeKey && payloads.some(payload => typeof payload.workDate === 'string' && payload.workDate === row.payload.workDate)))
                throw new Error('Hay días pendientes para este destino. Reintenta esos envíos antes de volver a compartirlos.');
            if (payloads.length > 1 && !options.store.putMany)
                throw new Error('No se pudieron guardar juntos los días. Reintenta.');
            const rows = [];
            for (const payload of payloads) {
                const sequence = await options.store.nextSequence(uid + '|' + scopeKey);
                rows.push({ id: String(payload.submissionId), uid, scopeKey, payload: { ...payload, clientSequence: sequence }, createdAt: Date.now() });
            }
            if (options.store.putMany)
                await options.store.putMany(rows);
            else
                await options.store.put(rows[0]);
            return rows;
        }
        async function enqueue(uid, scopeKey, payload) { return (await enqueueBatch(uid, scopeKey, [payload]))[0]; }
        async function flush(uid, scopeKey) { if (flushing)
            return; flushing = true; try {
            const rows = (await options.store.list()).filter(r => r.uid === uid && (scopeKey === undefined || r.scopeKey === scopeKey)).sort((a, b) => a.createdAt - b.createdAt || Number(a.payload.clientSequence) - Number(b.payload.clientSequence));
            for (const row of rows) {
                const result = await options.send(row);
                if (result.status !== 'received' || result.submissionId !== row.payload.submissionId)
                    throw new Error('SA no confirmó la recepción. El envío sigue pendiente.');
                await options.store.remove(row.id);
            }
        }
        finally {
            flushing = false;
        } }
        return { enqueue, enqueueBatch, flush, pending: async (uid) => (await options.store.list()).filter(r => r.uid === uid) };
    }
    function createIndexedStore(databaseName = "mini-firebase-outbox-v1") {
        const opened = new Promise((resolve, reject) => { const request = indexedDB.open(databaseName, 1); request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('pending', { keyPath: 'id' }); db.createObjectStore('counters'); }; request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(new Error('No se pudo abrir la cola de envíos.')); request.onblocked = () => reject(new Error('Cierra otras pestañas de Mini y vuelve a intentar.')); });
        async function write(storeName, action) { const db = await opened; return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error('No se pudo guardar el envío.')); action(tx.objectStore(storeName)); }); }
        return { list: async () => { const db = await opened; return new Promise((resolve, reject) => { const request = db.transaction('pending').objectStore('pending').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('No se pudo leer la cola.')); }); }, put: row => write('pending', s => { s.add(row); }), putMany: rows => write('pending', s => { for (const row of rows)
                s.add(row); }), remove: key => write('pending', s => { s.delete(key); }), nextSequence: async (key) => { const db = await opened; return new Promise((resolve, reject) => { const tx = db.transaction('counters', 'readwrite'), s = tx.objectStore('counters'); let value = 0; const request = s.get(key); request.onsuccess = () => { value = Number(request.result || 0) + 1; s.put(value, key); }; tx.oncomplete = () => resolve(value); tx.onerror = tx.onabort = () => reject(new Error('No se pudo preparar la secuencia.')); }); } };
    }
    function makeSendPreview(payload) {
        const result = { rows: [], present: 0, unmarked: 0, overtimeHours: 0 };
        if (!payload)
            return result;
        if (!Array.isArray(payload.rows))
            throw new Error('Vista previa no válida.');
        for (const value of payload.rows) {
            if (!value || typeof value !== 'object')
                throw new Error('Fila no válida.');
            const row = value, normal = row.normalHours, extra = row.overtimeHours;
            if (typeof normal !== 'number' || typeof extra !== 'number' || !Number.isFinite(normal) || !Number.isFinite(extra) || normal < 0 || extra < 0 || normal + extra > 24 || !['present', 'unmarked'].includes(String(row.status)) || row.status === 'unmarked' && normal + extra !== 0 || row.status === 'present' && normal + extra <= 0)
                throw new Error('Horas no válidas.');
            if (row.status === 'present') {
                result.present++;
                result.overtimeHours += extra;
            }
            else
                result.unmarked++;
            result.rows.push({ number: String(row.number || ''), name: String(row.name || ''), label: row.status === 'present' ? normal + ' h' + (extra ? ' + ' + extra + ' h extras' : '') : 'Sin marca' });
        }
        result.overtimeHours = Math.round(result.overtimeHours * 100) / 100;
        return result;
    }
    function batchFingerprint(payloads) { return JSON.stringify(payloads.map(p => [p.saProjectId, p.rosterVersion, p.workDate, p.deviceId, p.rows])); }
    function makeBatchPreview(payloads, dates) {
        const selected = MiniAttendanceDays.validateDates(dates), seen = new Set();
        const days = payloads.map(payload => { const workDate = String(payload.workDate); if (!selected.includes(workDate) || seen.has(workDate))
            throw new Error('Días de vista previa no válidos.'); seen.add(workDate); return { ...makeSendPreview(payload), workDate }; });
        return { workDate: selected[0], dates: selected, days, emptyDates: selected.filter(date => !seen.has(date)), present: days.reduce((n, d) => n + d.present, 0), unmarked: days.reduce((n, d) => n + d.unmarked, 0), overtimeHours: Math.round(days.reduce((n, d) => n + d.overtimeHours, 0) * 100) / 100, rows: days.flatMap(d => d.rows), fingerprint: batchFingerprint(payloads) };
    }
    function mount(options) {
        var _a, _b;
        const d = options.document, el = (id) => d.getElementById('cloud-field-' + id), select = el('binding'), date = el('date'), status = el('status');
        let bindings = [], roster = null, busy = false, epoch = 0;
        const waiters = [];
        date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const daySelector = MiniAttendanceDays.mount({ document: d, input: date, changed: () => { var _a, _b; (_a = d.getElementById('cloud-field-updates')) === null || _a === void 0 ? true : delete _a.dataset.preview; el('send').disabled = true; d.dispatchEvent(new CustomEvent('connection-send-preview')); if (!daySelector.multiple() && ((_b = d.querySelector('[data-connection-step="send"],[data-connection-step="members"]')) === null || _b === void 0 ? void 0 : _b.contains(daySelector.host)))
                void previewSend(); } });
        const identity = getDeviceIdentity(localStorage), deviceName = el('device-name');
        deviceName.value = identity.deviceName;
        deviceName.placeholder = 'Usar nombre de Google';
        const actions = ['refresh', 'roster', 'send', 'retry', 'leave', 'leave-confirm', 'device-save'].map(id => el(id));
        async function request(operation, body, uid) { var _a, _b; const generation = epoch, user = options.hooks.user(); if (!user || user.uid !== uid)
            throw new Error('Inicia sesión con la cuenta correspondiente.'); const token = await user.getIdToken(true); if (generation !== epoch || ((_a = options.hooks.user()) === null || _a === void 0 ? void 0 : _a.uid) !== uid)
            throw new Error('La cuenta cambió.'); const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000); try {
            const response = await fetch(options.endpoint + '/v1/field/' + operation, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
            const result = await response.json();
            if (generation !== epoch || ((_b = options.hooks.user()) === null || _b === void 0 ? void 0 : _b.uid) !== uid)
                throw new Error('La cuenta cambió.');
            if (!response.ok) {
                const code = result.error;
                if (code === 'ACCESS_REVOKED')
                    throw new Error('Este Mini ya no tiene acceso a la obra. Sus datos y envíos pendientes se conservan. Solicita autorización a SA.');
                if (code === 'SHARING_DISABLED')
                    throw new Error('SA debe permitir compartir a ambos Minis. La asistencia y los envíos pendientes se conservan.');
                if (code === 'STALE_ROSTER')
                    throw new Error('SA publicó personal nuevo. El envío anterior sigue pendiente; revisa el personal antes de preparar otro.');
                throw new Error('No se pudo completar. Revisa la conexión o solicita acceso a SA.');
            }
            return result;
        }
        catch (error) {
            throw requestError(error);
        }
        finally {
            clearTimeout(timer);
        } }
        const queue = createOutbox({ store: createIndexedStore(), send: async (row) => { const [orgId, projectId, groupId] = JSON.parse(row.scopeKey); return await request('submit', { orgId, projectId, groupId, submission: row.payload }, row.uid); } });
        const shareView = (_b = (_a = options.hooks).organization) === null || _b === void 0 ? void 0 : _b.call(_a, {
            context: () => { const user = options.hooks.user(), b = bindings[Number(select.value)]; return user && b ? { uid: user.uid, orgId: b.orgId, projectId: b.projectId, groupId: b.groupId, deviceId: b.deviceId } : null; },
            request: async (operation, body) => { const user = options.hooks.user(); if (!user)
                throw new Error('Inicia sesión con Google.'); return await request(operation, body, user.uid); },
            build: async () => { return (await buildBatch(true)).payloads[0] || null; },
            buildMany: async () => { return (await buildBatch(true)).payloads; },
            run: action,
            createQueue: send => createOutbox({ store: createIndexedStore('mini-org-share-outbox-v1'), send })
        });
        const updateHolder = d.createElement('div');
        updateHolder.id = 'cloud-field-updates';
        updateHolder.hidden = true;
        el('panel').append(updateHolder);
        const notices = ConnectionNotifications.createMonitor({
            uid: () => { var _a; return ((_a = options.hooks.user()) === null || _a === void 0 ? void 0 : _a.uid) || null; },
            available: () => !busy && bindings.length > 0 && d.visibilityState !== 'hidden' && navigator.onLine !== false,
            tracker: ConnectionNotifications.createTracker(localStorage),
            load: async (uid) => {
                var _a, _b;
                const result = await request('updates', { deviceId: identity.deviceId }, uid);
                if (!Array.isArray(result))
                    throw new Error('Novedades no válidas.');
                const events = [];
                for (const raw of result) {
                    const b = raw, scope = { orgId: String(b.orgId), projectId: String(b.projectId), groupId: String(b.groupId), deviceId: String(b.deviceId) };
                    const label = String(b.projectName) + ' · ' + String(b.groupName), applied = (_b = (_a = options.hooks).applied) === null || _b === void 0 ? void 0 : _b.call(_a, scope.projectId);
                    if ((applied === null || applied === void 0 ? void 0 : applied.rosterVersion) !== b.rosterVersion || (applied === null || applied === void 0 ? void 0 : applied.generatedAt) !== b.generatedAt)
                        events.push({ id: 'roster', kind: 'roster', revision: JSON.stringify([b.rosterVersion, b.generatedAt]), title: applied ? 'Personal actualizado disponible' : 'Personal disponible', description: label, count: 1, scope });
                    const shares = Array.isArray(b.shares) ? b.shares : [];
                    if (shares.length)
                        events.push({ id: 'attendance', kind: 'attendance', revision: JSON.stringify(shares.map(x => String(x.shareId)).sort()), title: shares.length + ' asistencia(s) compartida(s)', description: label, count: shares.length, scope: { ...scope, shareId: String(shares[0].shareId) } });
                }
                return events;
            },
            publish: events => { updateHolder.dataset.events = JSON.stringify(events); d.dispatchEvent(new CustomEvent('connection-updates', { detail: { app: 'mini', events } })); },
            announce: (event, review, later) => { var _a, _b; return ((_b = (_a = options.hooks).announce) === null || _b === void 0 ? void 0 : _b.call(_a, event, review, later)) || (() => { }); },
            open: event => { void openUpdate(event); }
        });
        async function openUpdate(event) {
            var _a, _b, _c;
            const user = options.hooks.user();
            if (!user)
                return;
            const generation = epoch;
            try {
                const present = notices.snapshot().find(e => e.kind === event.kind && e.scope.orgId === event.scope.orgId && e.scope.projectId === event.scope.projectId && e.scope.groupId === event.scope.groupId);
                if (!present)
                    throw new Error('Este pendiente ya no está disponible. Actualiza las novedades.');
                if (!await ((_b = (_a = options.hooks).openNotice) === null || _b === void 0 ? void 0 : _b.call(_a, present)))
                    return;
                // Menu activation starts member preparation; its review must wait for that work.
                while (busy)
                    await whenIdle();
                if (generation !== epoch || ((_c = options.hooks.user()) === null || _c === void 0 ? void 0 : _c.uid) !== user.uid)
                    return;
                const current = notices.snapshot().find(e => e.kind === present.kind && e.scope.orgId === present.scope.orgId && e.scope.projectId === present.scope.projectId && e.scope.groupId === present.scope.groupId);
                if (!current || current.revision !== present.revision || current.scope.shareId !== present.scope.shareId)
                    return;
                await action(async () => {
                    var _a;
                    const b = chosen();
                    if (b.orgId !== event.scope.orgId || b.projectId !== event.scope.projectId || b.groupId !== event.scope.groupId)
                        throw new Error('Selecciona la obra correspondiente.');
                    if (event.kind === 'roster') {
                        const data = await request('roster', { orgId: b.orgId, projectId: b.projectId, groupId: b.groupId, deviceId: b.deviceId }, user.uid);
                        await options.hooks.review(data.roster);
                    }
                    else
                        await ((_a = shareView === null || shareView === void 0 ? void 0 : shareView.open) === null || _a === void 0 ? void 0 : _a.call(shareView, present.scope.shareId));
                });
            }
            catch (e) {
                status.textContent = e instanceof Error ? e.message : 'No se pudo abrir el pendiente.';
                status.dataset.operationState = 'error';
            }
        }
        d.addEventListener('connection-open-notice', event => { const detail = event.detail; if ((detail === null || detail === void 0 ? void 0 : detail.app) === 'mini')
            void openUpdate(detail.event); });
        for (const type of ['online', 'focus', 'pageshow'])
            window.addEventListener(type, () => { void notices.poll(); });
        d.addEventListener('visibilitychange', () => { if (d.visibilityState !== 'hidden')
            void notices.poll(); });
        d.addEventListener('connection-data-applied', () => { void notices.poll(); });
        function whenIdle() { return busy ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); }
        function chosen() { const b = bindings[Number(select.value)]; if (!b)
            throw new Error('Selecciona una obra y un grupo.'); return b; }
        async function action(fn, reportResult = false) { if (busy)
            return; busy = true; const quiet = fn === refresh, previous = status.textContent; let failed = false; status.dataset.operationState = 'busy'; const generation = epoch; actions.forEach(b => b.disabled = true); d.querySelectorAll('#cloud-field-members button').forEach(b => b.disabled = true); select.disabled = true; daySelector.setDisabled(true); el('members').inert = true; try {
            await fn();
        }
        catch (e) {
            if (generation === epoch) {
                failed = true;
                status.textContent = e instanceof Error ? e.message : 'No se pudo completar.';
            }
        }
        finally {
            busy = false;
            status.dataset.operationState = failed ? 'error' : !quiet && (reportResult || status.textContent !== previous) ? 'success' : 'idle';
            waiters.splice(0).forEach(resolve => resolve());
            queueMicrotask(() => { void notices.poll(); });
            actions.forEach(b => b.disabled = false);
            select.disabled = false;
            daySelector.setDisabled(false);
            el('members').inert = false;
            el('send').disabled = !previewReady();
            d.querySelectorAll('#cloud-field-members button').forEach(b => { b.disabled = b.dataset.sharingDisabled === 'true'; });
            if (generation !== epoch)
                void action(refresh);
        } }
        async function refresh() { var _a, _b; const user = options.hooks.user(); if (!user) {
            status.textContent = 'Inicia sesión para consultar tus obras.';
            return;
        } const selected = bindings[Number(select.value)]; const generation = epoch; const resolvedName = resolveDeviceName(identity.deviceName, user); deviceName.dataset.resolvedName = resolvedName; const value = await request('bindings', { deviceId: identity.deviceId, deviceName: resolvedName }, user.uid); if (generation !== epoch)
            return; if (!Array.isArray(value))
            throw new Error('Respuesta no válida.'); shareView === null || shareView === void 0 ? void 0 : shareView.reset(); bindings = []; for (const raw of value) {
            const b = raw;
            if (!Array.isArray(b.groups))
                throw new Error('Permisos no válidos.');
            for (const g of b.groups) {
                const group = g;
                const entry = { orgId: String(b.orgId), ownerUid: String(b.ownerUid), projectId: String(b.projectId), projectName: String(b.projectName), groupId: String(group.id), groupName: String(group.name), devicePrefix: String(b.devicePrefix), deviceId: String(b.deviceId) };
                if (!entry.devicePrefix.startsWith('cloud-') || entry.deviceId !== entry.devicePrefix + identity.deviceId)
                    throw new Error('Permisos no válidos.');
                bindings.push(entry);
            }
        } el('leave-review').hidden = true; select.replaceChildren(...bindings.map((b, i) => { const o = d.createElement('option'); o.value = String(i); o.textContent = b.projectName + ' · ' + b.groupName; o.dataset.orgId = b.orgId; o.dataset.projectId = b.projectId; o.dataset.groupId = b.groupId; return o; })); if (selected) {
            const index = bindings.findIndex(b => b.orgId === selected.orgId && b.projectId === selected.projectId && b.groupId === selected.groupId);
            if (index >= 0)
                select.value = String(index);
        } roster = null; (_b = (_a = options.hooks).bindingsChanged) === null || _b === void 0 ? void 0 : _b.call(_a, user.uid, bindings.length); status.textContent = bindings.length ? bindings.length + ' grupo(s) autorizado(s). ' + (await queue.pending(user.uid)).length + ' envío(s) pendiente(s).' : 'No hay obras autorizadas para este dispositivo. Confirma una invitación o solicita autorización a SA.'; }
        options.hooks.subscribe(user => { var _a, _b; epoch++; delete updateHolder.dataset.preview; notices.reset(); shareView === null || shareView === void 0 ? void 0 : shareView.reset(); bindings = []; roster = null; select.replaceChildren(); el('leave-review').hidden = true; (_b = (_a = options.hooks).bindingsChanged) === null || _b === void 0 ? void 0 : _b.call(_a, (user === null || user === void 0 ? void 0 : user.uid) || null, 0); void action(refresh); });
        el('refresh').addEventListener('click', () => { void action(refresh); });
        select.addEventListener('change', () => { delete updateHolder.dataset.preview; d.dispatchEvent(new CustomEvent('connection-send-preview')); shareView === null || shareView === void 0 ? void 0 : shareView.reset(); roster = null; el('leave-review').hidden = true; });
        el('roster').addEventListener('click', () => { void action(async () => { const b = chosen(), user = options.hooks.user(); if (!user)
            throw new Error('Inicia sesión.'); const generation = epoch; const data = await request('roster', { orgId: b.orgId, projectId: b.projectId, groupId: b.groupId, deviceId: b.deviceId }, user.uid); if (generation !== epoch)
            return; roster = data.roster; await options.hooks.review(roster); status.textContent = 'Personal recibido. Revisa y aplica los cambios en Mini.'; }); });
        function previewReady() { try {
            const data = JSON.parse(updateHolder.dataset.preview || 'null');
            return !!(data === null || data === void 0 ? void 0 : data.days.length) && JSON.stringify(data.dates) === JSON.stringify(daySelector.dates());
        }
        catch {
            return false;
        } }
        async function buildBatch(requirePreview = false) {
            const b = chosen(), user = options.hooks.user();
            if (!user)
                throw new Error('Inicia sesión con Google.');
            const generation = epoch, dates = daySelector.dates(), scope = JSON.stringify([b.orgId, b.projectId, b.groupId]);
            const latest = await request('roster', { orgId: b.orgId, projectId: b.projectId, groupId: b.groupId, deviceId: b.deviceId }, user.uid);
            const payloads = [];
            for (const workDate of dates) {
                const payload = await options.hooks.build(b, latest.roster, workDate, b.deviceId);
                if (payload)
                    payloads.push(payload);
            }
            const actual = chosen();
            if (generation !== epoch || scope !== JSON.stringify([actual.orgId, actual.projectId, actual.groupId]) || JSON.stringify(dates) !== JSON.stringify(daySelector.dates()))
                throw new Error('La cuenta, la obra o los días cambiaron. Vuelve a revisar.');
            const preview = { ...makeBatchPreview(payloads, dates), orgId: b.orgId, projectId: b.projectId, groupId: b.groupId };
            if (requirePreview) {
                const shown = JSON.parse(updateHolder.dataset.preview || 'null');
                if (!shown || shown.orgId !== b.orgId || shown.projectId !== b.projectId || shown.groupId !== b.groupId || JSON.stringify(shown.dates) !== JSON.stringify(dates) || shown.fingerprint !== preview.fingerprint) {
                    delete updateHolder.dataset.preview;
                    d.dispatchEvent(new CustomEvent('connection-send-preview'));
                    throw new Error('Revisa la vista previa: los días o la asistencia cambiaron.');
                }
            }
            return { binding: b, user, payloads, preview };
        }
        async function previewSend() {
            delete updateHolder.dataset.preview;
            d.dispatchEvent(new CustomEvent('connection-send-preview'));
            await action(async () => {
                const batch = await buildBatch();
                updateHolder.dataset.preview = JSON.stringify(batch.preview);
                d.dispatchEvent(new CustomEvent('connection-send-preview', { detail: batch.preview }));
            });
        }
        async function openMembers() { await action(async () => { var _a; await ((_a = shareView === null || shareView === void 0 ? void 0 : shareView.open) === null || _a === void 0 ? void 0 : _a.call(shareView)); }); await previewSend(); }
        el('send').addEventListener('click', () => {
            void action(async () => {
                const batch = await buildBatch(true);
                if (!batch.payloads.length)
                    throw new Error('No hay asistencia registrada en los días seleccionados.');
                const scope = JSON.stringify([batch.binding.orgId, batch.binding.projectId, batch.binding.groupId]);
                await queue.enqueueBatch(batch.user.uid, scope, batch.payloads);
                status.textContent = batch.payloads.length + ' día(s) guardado(s) en este Mini. Enviando…';
                await queue.flush(batch.user.uid, scope);
                status.textContent = batch.payloads.length === 1 ? 'SA recibió la asistencia. Queda pendiente de revisión en SA.' : 'SA recibió ' + batch.payloads.length + ' días de asistencia. Quedan pendientes de revisión en SA.';
            }, true);
        });
        el('retry').addEventListener('click', () => { void action(async () => { const b = chosen(), user = options.hooks.user(); if (!user)
            throw new Error('Inicia sesión.'); await queue.flush(user.uid, JSON.stringify([b.orgId, b.projectId, b.groupId])); status.textContent = (await queue.pending(user.uid)).length + ' envío(s) pendiente(s).'; }, true); });
        el('device-save').addEventListener('click', () => {
            void action(async () => {
                const label = deviceName.value.trim();
                if (label.length > 120)
                    throw new Error('Escribe un nombre de hasta 120 caracteres.');
                localStorage.setItem('mini-cloud-device-name-v1', label);
                identity.deviceName = label;
                await refresh();
                status.textContent = 'Nombre del dispositivo guardado.';
            }, true);
        });
        el('leave').addEventListener('click', () => {
            try {
                const b = chosen();
                el('leave-title').textContent = 'Salir de ' + b.projectName;
                el('leave-review').hidden = false;
            }
            catch (e) {
                status.textContent = e instanceof Error ? e.message : 'Selecciona una obra.';
                status.dataset.operationState = 'error';
            }
        });
        el('leave-cancel').addEventListener('click', () => { el('leave-review').hidden = true; });
        el('leave-confirm').addEventListener('click', () => {
            void action(async () => {
                const b = chosen(), user = options.hooks.user();
                if (!user)
                    throw new Error('Inicia sesión.');
                await request('leave', { orgId: b.orgId, projectId: b.projectId, deviceId: b.deviceId }, user.uid);
                await refresh();
                status.textContent = 'Este Mini salió de la obra. El personal, la asistencia y los envíos pendientes se conservan.';
            }, true);
        });
        return { refresh: () => action(refresh), isBusy: () => busy, whenIdle, pollUpdates: () => notices.poll(), getUpdates: () => notices.snapshot(), openUpdate, previewSend, openMembers };
    }
    return { requestError, resolveDeviceName, createOutbox, createIndexedStore, getDeviceIdentity, makeSendPreview, makeBatchPreview, batchFingerprint, mount };
});
