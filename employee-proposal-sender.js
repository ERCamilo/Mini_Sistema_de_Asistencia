"use strict";
(function exposeEmployeeSender(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniEmployeeSender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    const attached = new Map();
    let getChannel = () => null;
    let ensureChannel = async () => { };
    const id = () => { var _a, _b; return `personal-${((_b = (_a = root.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) || Date.now() + '-' + Math.random().toString(36).slice(2)}`; };
    const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\x00-\x1f]/.test(value);
    const esc = (value) => String(value !== null && value !== void 0 ? value : '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
    const storageKey = (peerId) => `miniEmployeeProposal:${peerId}`;
    function status(message) {
        var _a, _b;
        const element = (_a = root.document) === null || _a === void 0 ? void 0 : _a.querySelector('[data-employee-send-status]');
        if (element)
            element.textContent = message;
        else
            (_b = root.showToast) === null || _b === void 0 ? void 0 : _b.call(root, message);
    }
    function createSender(options) {
        const { channel, peer, core, repository, storage } = options;
        const contract = root.MiniEmployeeProposal;
        const report = options.status || status;
        const choose = options.choose || showSelector;
        let stagedId = '', closed = false, busy = false, offer = null;
        let selectionController = null;
        function send(value) { if (closed || channel.readyState !== 'open' || !core.isChannelAuthenticated(channel))
            throw new Error('SA no está conectado.'); channel.send(JSON.stringify(value)); }
        function readPending() {
            const saved = storage.getItem(storageKey(peer.peerId));
            if (!saved)
                return null;
            try {
                return contract.validateProposal(JSON.parse(saved));
            }
            catch (_) {
                return null;
            }
        }
        async function requested(request) {
            if (busy)
                return;
            busy = true;
            try {
                selectionController = new AbortController();
                const selected = await choose({ ...request, selected: (offer === null || offer === void 0 ? void 0 : offer.id) === request.offerId ? offer.selected : undefined, signal: selectionController.signal }, peer, repository);
                if (!selected.length)
                    throw new Error('Envío de personal cancelado en Mini.');
                if (closed || !core.isChannelAuthenticated(channel))
                    throw new Error('La conexión se cerró. Vuelve a enviar el personal.');
                const employees = repository.getAll().filter(e => selected.includes(String(e.id)));
                if (employees.length !== selected.length || employees.some(e => e.saProjectId && e.saProjectId !== request.saProjectId))
                    throw new Error('Un empleado cambió o pertenece a otra obra de SA. Revisa la selección.');
                let proposal = contract.createProposal(employees, { proposalId: id(), requestId: request.requestId, saProjectId: request.saProjectId, generatedAt: new Date().toISOString() });
                const previous = readPending();
                if ((previous === null || previous === void 0 ? void 0 : previous.saProjectId) === proposal.saProjectId && JSON.stringify(previous.employees) === JSON.stringify(proposal.employees))
                    proposal = { ...previous, requestId: request.requestId };
                storage.setItem(storageKey(peer.peerId), JSON.stringify(proposal));
                report('Enviando personal a SA…');
                await core.sendPayload(channel, { kind: 'roster', schema: proposal.schema, text: JSON.stringify(proposal) });
                if (stagedId !== proposal.proposalId)
                    report('Personal enviado. SA debe revisarlo antes de aceptar.');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'No se pudo enviar el personal.';
                report(message);
                try {
                    send({ schema: 'mini-roster-error/v1', requestId: request.requestId, message: message.slice(0, 240) });
                }
                catch (_) { }
            }
            finally {
                busy = false;
                offer = null;
                selectionController = null;
            }
        }
        const handler = (event) => {
            var _a, _b;
            if (closed || !core.isChannelAuthenticated(channel) || typeof event.data !== 'string')
                return;
            let raw;
            try {
                raw = JSON.parse(event.data);
            }
            catch (_) {
                return;
            }
            if (!raw || typeof raw !== 'object' || Array.isArray(raw))
                return;
            const message = raw;
            if (message.schema === 'mini-roster-hello/v1') {
                send({ schema: 'mini-roster-ready/v1' });
                return;
            }
            if (message.schema === 'mini-roster-request/v1' && validId(message.requestId) && validId(message.saProjectId) && typeof message.offerId === 'string') {
                const projectName = typeof message.projectName === 'string' ? message.projectName.slice(0, 120) : '';
                void requested({ requestId: message.requestId, saProjectId: message.saProjectId, offerId: message.offerId, projectName });
                return;
            }
            const pending = readPending();
            if (message.schema === 'mini-roster-staged/v1' && pending && message.proposalId === pending.proposalId) {
                stagedId = pending.proposalId;
                report('Personal recibido en SA. Pendiente de revisión.');
                return;
            }
            if (message.schema === 'mini-roster-error/v1') {
                if (message.discarded === true && pending && message.proposalId === pending.proposalId)
                    storage.setItem(storageKey(peer.peerId), '');
                report(String(message.message || 'SA no pudo recibir el personal.'));
                return;
            }
            if (message.schema === 'mini-roster-result/v1' && pending && message.proposalId === pending.proposalId && message.saProjectId === pending.saProjectId) {
                try {
                    const result = contract.validateResult(message, pending);
                    repository.applySaEmployeeBindings(result, pending);
                    report(`${result.mappings.length} empleados vinculados con SA. Se conserva tu asistencia.`);
                    send({ schema: 'mini-roster-result-applied/v1', proposalId: pending.proposalId, saProjectId: pending.saProjectId, count: result.mappings.length });
                    (_a = root.renderUsers) === null || _a === void 0 ? void 0 : _a.call(root);
                    (_b = root.renderDashboard) === null || _b === void 0 ? void 0 : _b.call(root);
                }
                catch (error) {
                    report(error instanceof Error ? error.message : 'No se pudieron aplicar los vínculos. Puedes reenviar la propuesta.');
                }
            }
        };
        const detach = () => {
            var _a;
            if (closed)
                return;
            closed = true;
            selectionController === null || selectionController === void 0 ? void 0 : selectionController.abort();
            channel.removeEventListener('message', handler);
            channel.removeEventListener('close', detach);
            (_a = options.onDetached) === null || _a === void 0 ? void 0 : _a.call(options);
        };
        channel.addEventListener('message', handler);
        channel.addEventListener('close', detach);
        if (core.isChannelAuthenticated(channel))
            send({ schema: 'mini-roster-ready/v1' });
        return {
            offer(selected) { if (selected && (!selected.length || selected.length > 500))
                throw new Error('Selecciona entre 1 y 500 empleados.'); offer = { id: id(), selected: selected ? [...selected] : undefined }; send({ schema: 'mini-roster-offer/v1', offerId: offer.id }); report('Esperando que SA indique la obra de destino…'); },
            detach
        };
    }
    function showSelector(request, peer, repository) {
        return new Promise(resolve => {
            var _a, _b;
            const doc = root.document, overlay = doc.createElement('div');
            overlay.className = 'employee-send-overlay';
            const employees = repository.getAll().filter(e => e.paused !== true && (!e.saProjectId || e.saProjectId === request.saProjectId || !request.saProjectId));
            overlay.innerHTML = `<section class="employee-send-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-send-title"><h2 id="employee-send-title">Enviar personal a SA</h2><p><strong>Obra: ${esc(request.projectName || peer.displayName || 'Seleccionada en SA')}</strong></p><p>Nombre, ficha, puesto principal y salario por día. SA revisará las altas y los posibles duplicados.</p><p data-employee-send-status role="status"></p><div class="employee-send-list">${employees.map((e, i) => `<label class="employee-send-row"><input type="checkbox" data-employee-send-index="${i}" ${(request.selected ? request.selected.includes(String(e.id)) : !e.saEmployeeId) ? 'checked' : ''}><span><strong>${esc(e.name)} · ${esc(e.number)}</strong><small>${esc(e.position || 'Sin puesto')} · ${esc(e.sueldo || 'Sin salario')} por día</small></span></label>`).join('') || '<p>No hay personal disponible para enviar.</p>'}</div><footer><button type="button" data-employee-send-cancel>Cancelar</button><button type="button" class="primary" data-employee-send-confirm>Enviar seleccionados</button></footer></section>`;
            const cancel = () => finish([]);
            const finish = (ids) => { var _a; (_a = request.signal) === null || _a === void 0 ? void 0 : _a.removeEventListener('abort', cancel); overlay.remove(); resolve(ids); };
            (_a = request.signal) === null || _a === void 0 ? void 0 : _a.addEventListener('abort', cancel, { once: true });
            if ((_b = request.signal) === null || _b === void 0 ? void 0 : _b.aborted) {
                cancel();
                return;
            }
            overlay.querySelector('[data-employee-send-cancel]').onclick = () => finish([]);
            overlay.querySelector('[data-employee-send-confirm]').onclick = () => {
                const ids = [...overlay.querySelectorAll('[data-employee-send-index]:checked')].map(el => String(employees[Number(el.dataset.employeeSendIndex)].id));
                if (!ids.length || ids.length > 500) {
                    overlay.querySelector('[role="status"]').textContent = 'Selecciona entre 1 y 500 empleados.';
                    return;
                }
                finish(ids);
            };
            doc.body.appendChild(overlay);
        });
    }
    function attach(channel, peer) {
        if (peer.peerApp !== 'sa')
            return;
        const current = attached.get(peer.peerId);
        if ((current === null || current === void 0 ? void 0 : current.channel) === channel)
            return;
        current === null || current === void 0 ? void 0 : current.sender.detach();
        attached.set(peer.peerId, { channel, sender: createSender({ channel, peer, core: root.SaMiniP2P, repository: root.employeeRepository, storage: root.localStorage, onDetached: () => { var _a; if (((_a = attached.get(peer.peerId)) === null || _a === void 0 ? void 0 : _a.channel) === channel)
                    attached.delete(peer.peerId); } }) });
    }
    async function openOffer(peer) {
        try {
            await ensureChannel(peer);
            let channel = getChannel(peer.peerId);
            const deadline = Date.now() + 10000;
            while ((!channel || !root.SaMiniP2P.isChannelAuthenticated(channel)) && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 100));
                channel = getChannel(peer.peerId);
            }
            if (!channel || !root.SaMiniP2P.isChannelAuthenticated(channel))
                throw new Error('Abre SA y espera a que aparezca en línea antes de enviar personal.');
            attach(channel, peer);
            attached.get(peer.peerId).sender.offer();
        }
        catch (error) {
            status(error instanceof Error ? error.message : 'No se pudo conectar con SA.');
        }
    }
    function configure(options) { getChannel = options.getChannel; ensureChannel = options.ensureChannel; }
    return { createSender, attach, openOffer, configure };
});
