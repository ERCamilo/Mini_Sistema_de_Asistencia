"use strict";
(function exposeMiniUpdates(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniUpdates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    let manager = null, config = null;
    const callbacks = new Map();
    function status(message) {
        const active = document.querySelector('#update-modal.active [data-release-status]');
        if (active)
            active.textContent = message;
        const inline = document.getElementById('app-update-status');
        if (inline)
            inline.textContent = message;
    }
    async function fetchRelease() {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch('./app-release.json?__incoming=' + Date.now(), { cache: 'no-store', signal: controller.signal });
            if (!response.ok)
                throw new Error('Release unavailable');
            const content = await response.text();
            if (content.length > 150000)
                throw new Error('Release too large');
            return JSON.parse(content);
        }
        finally {
            clearTimeout(timer);
        }
    }
    async function refreshWorker() {
        if (!('serviceWorker' in navigator))
            return;
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration)
            return;
        await registration.update();
        const pending = registration.installing || registration.waiting;
        if (pending && pending.state !== 'activated') {
            await new Promise((resolve, reject) => {
                const done = (error) => { clearTimeout(timer); pending.removeEventListener('statechange', check); error ? reject(error) : resolve(); };
                const check = () => { if (pending.state === 'activated')
                    done();
                else if (pending.state === 'redundant')
                    done(new Error('Update failed')); };
                const timer = setTimeout(() => done(new Error('Update timeout')), 60000);
                pending.addEventListener('statechange', check);
                pending.postMessage('SKIP_WAITING');
                check();
            });
        }
        const active = registration.active || navigator.serviceWorker.controller;
        if (!active)
            throw new Error('No active worker');
        // An unchanged, already active worker can still contain stale cached bytes.
        await new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            const done = (error) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); error ? reject(error) : resolve(); };
            const timer = setTimeout(() => done(new Error('Shell refresh timeout')), 90000);
            channel.port1.onmessage = event => { var _a; ((_a = event.data) === null || _a === void 0 ? void 0 : _a.ok) === true ? done() : done(new Error('Shell refresh failed')); };
            channel.port1.onmessageerror = () => done(new Error('Invalid worker response'));
            try {
                active.postMessage({ type: 'REFRESH_APP_SHELL' }, [channel.port2]);
            }
            catch (error) {
                done(error instanceof Error ? error : new Error('Worker unavailable'));
            }
        });
    }
    function show(kind, releases, version, onClose, apply) {
        const id = kind === 'news' ? 'whats-new-modal' : 'update-modal';
        const modal = document.getElementById(id);
        if (!modal || !config)
            return false;
        modal.querySelector('[data-release-title]').textContent = kind === 'news' ? `Novedades · v${version}` : `Actualización disponible · v${version}`;
        const list = modal.querySelector('[data-release-list]');
        list.replaceChildren();
        for (const release of releases) {
            const section = document.createElement('section'), title = document.createElement('h3'), date = document.createElement('p'), items = document.createElement('ul');
            title.textContent = `${release.title} · v${release.version}`;
            date.textContent = release.date.split('-').reverse().join('/');
            for (const text of release.items) {
                const item = document.createElement('li');
                item.textContent = text;
                items.appendChild(item);
            }
            section.append(title, date, items);
            list.appendChild(section);
        }
        modal.querySelector('[data-release-status]').textContent = '';
        const button = modal.querySelector('[data-release-apply]');
        if (button)
            button.onclick = () => { button.disabled = true; void apply().finally(() => { button.disabled = false; }); };
        callbacks.set(id, onClose);
        config.openModal(id);
        return true;
    }
    function init(options) {
        var _a;
        if (manager)
            return;
        config = options;
        manager = window.AppUpdateManager.createReleaseManager({
            policy: window.MiniAppVersion, prefix: 'mini',
            read: key => localStorage.getItem(key), write: (key, value) => localStorage.setItem(key, value),
            now: () => Date.now(), online: () => navigator.onLine !== false,
            fetchRelease, canShow: () => !options.isBusy() && !document.querySelector('.modal.active, .mini-p2p-overlay, .mini-welcome-overlay'),
            show, beforeReload: options.beforeReload, prepareUpdate: refreshWorker, reload: () => location.reload(), status
        });
        manager.boot();
        let hadController = !!((_a = navigator.serviceWorker) === null || _a === void 0 ? void 0 : _a.controller);
        if ('serviceWorker' in navigator)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                const previous = hadController;
                hadController = true;
                void manager.controllerChanged(previous);
            });
        const check = () => { if (document.visibilityState !== 'hidden')
            void manager.check(); };
        window.addEventListener('online', () => { void manager.check(false, true); });
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        setInterval(check, 60000);
        setInterval(() => manager.flush(), 1000);
        check();
        document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = 'v' + window.MiniAppVersion.APP_VERSION; });
    }
    function onModalClosed(id) { const callback = callbacks.get(id); callbacks.delete(id); callback === null || callback === void 0 ? void 0 : callback(); }
    return {
        init, showNews: () => manager === null || manager === void 0 ? void 0 : manager.showNews(true), check: () => (manager === null || manager === void 0 ? void 0 : manager.check(true)) || Promise.resolve(),
        close: (id) => config === null || config === void 0 ? void 0 : config.closeModal(id), onModalClosed
    };
});
