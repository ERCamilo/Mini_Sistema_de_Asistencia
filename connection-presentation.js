"use strict";
(function exposeMiniPresentation(root, factory) { const api = factory(); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.MiniConnectionPresentation = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function describePage(s) {
        if (s.home)
            return { key: 'home', title: 'Conexiones', back: false };
        if ((s.task === 'invitation' || s.task === 'link') && s.linkPhase)
            return { key: s.linkPhase === 'linked' ? 'linked' : s.linkPhase === 'preview' ? 'confirm' : 'invitation', title: s.linkPhase === 'linked' ? 'Mini vinculado' : s.linkPhase === 'preview' ? 'Confirmar vínculo' : 'Vincular con mi obra', back: true };
        if (s.task)
            return { key: s.task, title: s.taskTitle || 'Conexiones', back: true };
        const titles = { 'personal-review': 'Actualizar personal', 'personal-result': 'Personal actualizado', 'personal-received': 'Personal recibido' };
        return { key: s.native || 'direct', title: titles[s.native || ''] || s.nativeTitle || 'Conexión directa', back: true };
    }
    function describeFeedback(state, pageChanged, open) { return { banner: state === 'success' || state === 'error', open: !pageChanged && open, busy: state === 'busy' }; }
    function icon(d, kind) {
        const paths = { send: 'M22 2L9 15M22 2l-7 20-4-9-9-4z', calendar: 'M8 2v4M16 2v4M3 10h18M3 4h18v18H3zM8 15h2M14 15h2', share: 'M6 12l12-7M6 12l12 7M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6', refresh: 'M3 12a9 9 0 0 1 15-7l3 3M21 3v5h-5M21 12a9 9 0 0 1-15 7l-3-3M3 21v-5h5', back: 'M15 18l-6-6 6-6', chevron: 'M9 6l6 6-6 6', building: 'M3 22V2h12v20M15 10h6v12M6 6h2M10 6h2M6 10h2M10 10h2M6 14h2M10 14h2M18 14h1M18 18h1M6 22v-4h6v4', phone: 'M7 2h10v20H7zM10 18h4', people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8', cloud: 'M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12z', qr: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z', document: 'M14 2H6v20h14V8l-6-6M14 2v6h6M9 13h8M9 17h8', clock: 'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', unlink: 'M9 15l-2 2a4 4 0 0 1-6-6l3-3M15 9l2-2a4 4 0 0 1 6 6l-3 3M3 3l18 18', tag: 'M3 3h8l10 10-8 8L3 11zM7 7h.01', check: 'M5 12l4 4L19 6' };
        const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('mini-connection-icon');
        const p = d.createElementNS(svg.namespaceURI, 'path');
        p.setAttribute('d', paths[kind] || paths.document);
        svg.append(p);
        return svg;
    }
    function mount(o) {
        const d = o.shell.ownerDocument, header = o.shell.querySelector('header'), heading = header === null || header === void 0 ? void 0 : header.querySelector('.mini-p2p-title,h2,h3'), subtitle = header === null || header === void 0 ? void 0 : header.querySelector('.mini-p2p-subtitle');
        if (!header || !heading)
            return { refresh() { }, dispose() { } };
        const originalTitle = heading.textContent || 'Conexiones';
        heading.dataset.miniPageTitle = '';
        heading.setAttribute('role', 'heading');
        heading.setAttribute('aria-level', '2');
        const back = d.createElement('button');
        back.type = 'button';
        back.className = 'mini-connection-header-back';
        back.dataset.miniHeaderBack = '';
        back.setAttribute('aria-label', 'Volver');
        back.append(icon(d, 'back'));
        const account = d.createElement('button');
        account.type = 'button';
        account.className = 'mini-connection-header-account';
        account.dataset.miniHeaderAccount = '';
        account.setAttribute('aria-label', 'Mi cuenta');
        const progress = d.createElement('p');
        progress.className = 'mini-connection-progress';
        progress.textContent = 'Un momento…';
        progress.hidden = true;
        progress.setAttribute('role', 'status');
        header.after(progress);
        header.prepend(back);
        header.append(account);
        back.onclick = () => { var _a; const review = o.task.querySelector('[data-organization-review]'); if (!o.task.hidden && review && !review.hidden) {
            const later = d.getElementById('cloud-members-later');
            if (later)
                later.click();
            else
                o.back.click();
        }
        else if (!o.task.hidden)
            o.back.click();
        else
            (_a = o.body.querySelector('[data-back],[data-finish-roster]')) === null || _a === void 0 ? void 0 : _a.click(); };
        account.onclick = () => o.account.click();
        const feedback = o.shell.querySelector('.connections-feedback'), details = d.createElement('details'), summary = d.createElement('summary');
        details.className = 'mini-connection-feedback';
        summary.textContent = 'Estado de conexión';
        details.append(summary);
        const banner = d.createElement('p');
        banner.className = 'mini-connection-operation';
        banner.dataset.connectionOperation = '';
        banner.hidden = true;
        banner.setAttribute('role', 'status');
        let stopped = false, queued = false, last = '', lastState = '', lastStatus = '';
        function refresh() {
            var _a, _b, _c, _d, _e, _f, _g;
            if (stopped)
                return;
            const home = !((_a = o.shell.querySelector('[data-connections-home]')) === null || _a === void 0 ? void 0 : _a.hidden);
            let snapshot = { home };
            if (!home && !o.task.hidden) {
                snapshot = { task: o.task.dataset.screen, taskTitle: o.title.textContent || '', linkPhase: o.task.querySelector('#firebase-link-code') ? (_b = d.getElementById('firebase-link-status')) === null || _b === void 0 ? void 0 : _b.dataset.linkPhase : undefined };
                const review = o.task.querySelector('[data-organization-review]');
                if (snapshot.task === 'members' && review && !review.hidden)
                    snapshot = { task: 'shared-review', taskTitle: 'Revisar asistencia' };
                if (((_c = d.getElementById('firebase-link-confirm')) === null || _c === void 0 ? void 0 : _c.hidden) === false && o.task.querySelector('#firebase-link-confirm'))
                    snapshot = { task: 'confirm', taskTitle: 'Confirmar vínculo' };
            }
            else if (!home) {
                const native = o.body.querySelector('.mini-roster-review:not(.mini-backup-review)') ? 'personal-review' : o.body.querySelector('.mini-roster-result') ? 'personal-result' : o.body.querySelector('[data-review-roster]') ? 'personal-received' : 'direct';
                snapshot = { native, nativeTitle: ((_d = o.body.querySelector('h3')) === null || _d === void 0 ? void 0 : _d.textContent) || '' };
            }
            const page = describePage(snapshot);
            o.shell.dataset.miniConnectionPage = page.key;
            if (heading.textContent !== page.title)
                heading.textContent = page.title;
            back.hidden = !page.back || (!home && o.task.hidden && !o.body.querySelector('[data-back],[data-finish-roster]'));
            account.hidden = page.key === 'home';
            account.disabled = !home && !!o.task.hidden;
            if (subtitle)
                subtitle.hidden = page.key !== 'home';
            const status = d.getElementById('firebase-link-status'), name = (status === null || status === void 0 ? void 0 : status.dataset.accountName) || (status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || 'Cuenta Google', initial = name.trim().slice(0, 1).toUpperCase() || 'G';
            const identity = o.task.querySelector('.mini-connection-confirm-account');
            if (identity) {
                const label = identity.querySelector('strong'), email = identity.querySelector('p'), avatar = identity.querySelector('.connections-avatar');
                if (label && label.textContent !== name)
                    label.textContent = name;
                if (email && email.textContent !== ((status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || ''))
                    email.textContent = (status === null || status === void 0 ? void 0 : status.dataset.accountEmail) || '';
                if (avatar && avatar.textContent !== initial)
                    avatar.textContent = initial;
            }
            if (account.textContent !== initial)
                account.textContent = initial;
            account.title = name;
            account.dataset.signedIn = String(!!(status === null || status === void 0 ? void 0 : status.dataset.accountEmail));
            const key = page.key + '|' + page.title;
            const cloud = d.getElementById('cloud-field-status'), state = (cloud === null || cloud === void 0 ? void 0 : cloud.dataset.operationState) || 'idle', message = ((_e = cloud === null || cloud === void 0 ? void 0 : cloud.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '', view = describeFeedback(state, key !== last, details.open), changed = state !== lastState || message !== lastStatus;
            if (feedback === null || feedback === void 0 ? void 0 : feedback.parentElement) {
                const parent = feedback.parentElement;
                if (parent !== details) {
                    parent.insertBefore(details, feedback);
                    details.append(feedback);
                }
                details.open = view.open;
                const hidden = !((_f = feedback.textContent) === null || _f === void 0 ? void 0 : _f.trim());
                if (details.hidden !== hidden)
                    details.hidden = hidden;
            }
            if (changed && view.banner && cloud) {
                banner.replaceChildren(cloud);
                banner.dataset.state = state;
                banner.setAttribute('role', state === 'error' ? 'alert' : 'status');
                if (banner.hidden !== !message)
                    banner.hidden = !message;
                const parent = !o.task.hidden ? (o.task.querySelector('.mini-connection-footer,.connections-task-content') || o.task) : o.shell.querySelector('[data-connections-home]');
                if (parent)
                    parent.prepend(banner);
            }
            else if (key !== last || state === 'busy' || state === 'idle') {
                if (!banner.hidden)
                    banner.hidden = true;
                if ((cloud === null || cloud === void 0 ? void 0 : cloud.parentElement) === banner && feedback)
                    feedback.append(cloud);
            }
            lastState = state;
            lastStatus = message;
            const busy = view.busy || ((_g = d.getElementById('firebase-link-status')) === null || _g === void 0 ? void 0 : _g.dataset.linkBusy) === 'true';
            if (progress.hidden === busy)
                progress.hidden = !busy;
            o.account.disabled = busy;
            back.disabled = busy;
            account.disabled = busy || (!home && !!o.task.hidden);
            const close = o.shell.querySelector('[data-p2p-close]');
            if (close)
                close.disabled = busy;
            if (key !== last) {
                last = key;
                if (page.back && d.activeElement === o.back)
                    back.focus();
            }
        }
        function schedule() { if (queued || stopped)
            return; queued = true; queueMicrotask(() => { queued = false; refresh(); }); }
        const observer = new MutationObserver(schedule);
        observer.observe(o.shell, { attributes: true, attributeFilter: ['data-connection-screen'] });
        observer.observe(o.task, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-screen'] });
        observer.observe(o.title, { childList: true });
        observer.observe(o.body, { childList: true, subtree: true });
        if (feedback)
            observer.observe(feedback, { childList: true, subtree: true });
        const status = d.getElementById('firebase-link-status');
        if (status)
            observer.observe(status, { attributes: true, attributeFilter: ['data-account-email', 'data-account-name', 'data-link-phase', 'data-link-busy'] });
        const confirm = d.getElementById('firebase-link-confirm');
        if (confirm)
            observer.observe(confirm, { attributes: true, attributeFilter: ['hidden'] });
        const cloud = d.getElementById('cloud-field-status');
        if (cloud)
            observer.observe(cloud, { childList: true, attributes: true, attributeFilter: ['data-operation-state'] });
        refresh();
        return { refresh, dispose() { stopped = true; observer.disconnect(); progress.remove(); o.account.disabled = false; if ((cloud === null || cloud === void 0 ? void 0 : cloud.parentElement) === banner && feedback)
                feedback.append(cloud); banner.remove(); if ((feedback === null || feedback === void 0 ? void 0 : feedback.parentElement) === details)
                details.before(feedback); details.remove(); back.remove(); account.remove(); heading.textContent = originalTitle; delete heading.dataset.miniPageTitle; delete o.shell.dataset.miniConnectionPage; if (subtitle)
                subtitle.hidden = false; } };
    }
    return { describePage, describeFeedback, icon, mount };
});
