interface MiniSelectedShell { owner: string; version: string; cacheName: string; pins: {id: string; cacheName: string}[]; }
interface MiniShellPrepareData { version: string; token: string; force?: boolean; reuseInstalled?: boolean; }
interface MiniShellActivateData { version: string; cacheName: string; previousCacheName?: string | null; }
interface MiniShellMessageEvent {
 data: unknown; ports: readonly MessagePort[]; source?: {id?: string} | null; waitUntil(promise: Promise<unknown>): void;
}
interface MiniPreparedShellOptions {
 build: string; cacheName: string; scope: string; assets: string[]; storage: CacheStorage; fetcher: typeof fetch;
 refresh(options: MiniShellRefreshOptions): Promise<number>; skipWaiting(): Promise<void>;
 clients: {matchAll(options: {type: 'window'; includeUncontrolled: boolean}): Promise<{id: string; url: string}[]>};
}

(function exposeMiniPreparedShell(root: any, factory: () => unknown) {
 const api = factory();
 if (typeof module === 'object' && module && module.exports) module.exports = api;
 if (root) root.MiniPreparedShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
function createPreparedShell(options: MiniPreparedShellOptions) {
const SHELL_STATE_CACHE = 'mini-shell-state-v1';

let selectedShellState: MiniSelectedShell | null = null, selectedShellLoaded = false;
const shellMetaUrl = () => new URL('./__sa_shell_state__', options.scope).href;
const shellMarkerUrl = () => new URL('./__sa_prepared_shell__', options.scope).href;
const shellUrls = () => options.assets.map(asset => new URL(asset, options.scope).href);
const ownsShellName = (name: unknown): name is string => typeof name === 'string' && (name.startsWith('asistencia-v') || name === options.cacheName || name.startsWith(options.cacheName + '-prepared-'));

async function readSelectedShell() {
    if (selectedShellLoaded) return selectedShellState;
    try {
        const response = await (await options.storage.open(SHELL_STATE_CACHE)).match(shellMetaUrl());
        selectedShellState = response ? JSON.parse(await response.text()) : null;
    } catch (_) { selectedShellState = null; }
    selectedShellLoaded = true;
    return selectedShellState;
}
async function writeSelectedShell(value: MiniSelectedShell) {
    await (await options.storage.open(SHELL_STATE_CACHE)).put(shellMetaUrl(),
        new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
    selectedShellState = value; selectedShellLoaded = true;
}
function hasValidShellContent(url: string, response: Response) {
    const pathname = new URL(url, options.scope).pathname;
    const type = response.headers.get('Content-Type') || '';
    return !((pathname.endsWith('.js') && !/(?:java|ecma)script/i.test(type))
        || (pathname.endsWith('.css') && !/text\/css/i.test(type)));
}
async function isCompleteShell(cacheName: string, version: string) {
    if (!ownsShellName(cacheName)) return false;
    const cache = await options.storage.open(cacheName);
    const release = await cache.match(new URL('./app-release.json', options.scope).href);
    if (!release) return false;
    try { if (JSON.parse(await release.text()).version !== version) return false; } catch (_) { return false; }
    for (const url of shellUrls()) {
        const response = await cache.match(url);
        if (!response || !hasValidShellContent(url, response)) return false;
    }
    return true;
}
async function getSelectedShellResponse(request: Request, event?: {clientId?: string}) {
    const state = await readSelectedShell();
    if (!state || state.owner !== options.build) return undefined;
    const pin = request.mode === 'navigate' ? null : state.pins?.find(item => item.id === event?.clientId);
    const cache = await options.storage.open(pin?.cacheName || state.cacheName);
    return cache.match(request, { ignoreSearch: request.mode === 'navigate' });
}
async function prepareApplicationShell(data: MiniShellPrepareData, port: Pick<MessagePort, "postMessage">, signal: AbortSignal) {
    if (!/^\d+\.\d+\.\d+$/.test(data.version)) throw new Error('Versión inválida.');
    if (signal.aborted) throw new Error('Preparación cancelada.');
    let cacheName;
    if (!data.force && data.reuseInstalled && await isCompleteShell(options.cacheName, data.version)) {
        cacheName = options.cacheName;
    } else {
        cacheName = options.cacheName + '-prepared-' + data.version + '-' + String(data.token).replace(/[^a-zA-Z0-9-]/g, '');
        let lastProgress = -1;
        try {
            await options.refresh({
                assets: options.assets, scope: options.scope, cacheName, storage: options.storage, fetcher: options.fetcher,
                timeoutMs: 40000, activate: false, signal, stamp: options.build + '-' + data.token,
                onProgress: (completed, total) => {
                    const step = Math.floor(completed * 10 / total);
                    if (step !== lastProgress) {
                        lastProgress = step;
                        port.postMessage({ type: 'progress', completed, total, message: 'Preparando archivos: ' + completed + ' de ' + total + '…' });
                    }
                }
            });
            if (signal.aborted || !await isCompleteShell(cacheName, data.version)) throw new Error('Los archivos aún no corresponden a esta versión.');
        } catch (error) { await options.storage.delete(cacheName); throw error; }
    }
    if (signal.aborted) throw new Error('Preparación cancelada.');
    await (await options.storage.open(cacheName)).put(shellMarkerUrl(),
        new Response(JSON.stringify({ version: data.version, owner: options.build }), { headers: { 'Content-Type': 'application/json' } }));
    return { ok: true, version: data.version, cacheName };
}
async function activateApplicationShell(data: MiniShellActivateData) {
    if (!(data.cacheName === options.cacheName || data.cacheName?.startsWith(options.cacheName + '-prepared-'))) throw new Error('Archivos de otra actualización.');
    const marker = await (await options.storage.open(data.cacheName)).match(shellMarkerUrl());
    const prepared = marker ? JSON.parse(await marker.text()) : null;
    if (!prepared || prepared.owner !== options.build || prepared.version !== data.version
        || !await isCompleteShell(data.cacheName, data.version)) throw new Error('La copia preparada ya no está disponible. Reintenta.');
    const previous = await readSelectedShell();
    const clients = typeof options.clients.matchAll === 'function' ? await options.clients.matchAll({ type: 'window', includeUncontrolled: true }) : [];
    const pins = clients.filter(client => {
        try { return client.url.startsWith(options.scope); } catch (_) { return false; }
    }).map(client => ({
        id: client.id, cacheName: previous?.pins?.find(pin => pin.id === client.id)?.cacheName
            || (ownsShellName(data.previousCacheName) ? data.previousCacheName : null)
    })).filter((pin): pin is {id: string; cacheName: string} => !!pin.cacheName && pin.cacheName !== data.cacheName);
    await writeSelectedShell({ owner: options.build, version: data.version, cacheName: data.cacheName, pins });
    return { ok: true };
}
function isUiAsset(url: string) {
    const scope = new URL(options.scope), target = new URL(url, scope);
    if (target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)) return false;
    if (shellUrls().some(asset => new URL(asset).pathname === target.pathname)) return true;
    const relative = target.pathname.slice(scope.pathname.length);
    return /^(?:[^/]+\\.js|[^/]+\\.css|js\/.*\.js|css\/.*\.css|screenshots\/.*|__sa_prepared_shell__)$/.test(relative);
}
async function confirmApplicationShell(version: string, sourceId?: string) {
    const state = await readSelectedShell();
    if (!state || state.owner !== options.build || state.version !== version) return { ok: true };
    const clients = typeof options.clients.matchAll === 'function' ? await options.clients.matchAll({ type: 'window', includeUncontrolled: true }) : [];
    const liveIds = new Set(clients.map(client => client.id));
    const pins = (state.pins || []).filter(pin => pin.id !== sourceId && liveIds.has(pin.id));
    await writeSelectedShell({ ...state, pins });
    const keep = new Set([state.cacheName, ...pins.map(pin => pin.cacheName)]);
    for (const name of await options.storage.keys()) {
        if (!ownsShellName(name) || keep.has(name)) continue;
        const cache = await options.storage.open(name);
        // Preserve runtime media even if an old worker placed it in its UI cache.
        for (const request of await cache.keys()) if (isUiAsset(request.url)) await cache.delete(request);
        if (!(await cache.keys()).length) await options.storage.delete(name);
    }
    return { ok: true };
}



    async function previousCache(state: MiniSelectedShell | null): Promise<string | null> {
        const names = await options.storage.keys();
        if (state?.cacheName && names.includes(state.cacheName)) return state.cacheName;
        for (const name of names.slice().reverse()) {
            if (!ownsShellName(name) || name === options.cacheName || name.startsWith(options.cacheName + '-prepared-')) continue;
            if (await (await options.storage.open(name)).match(new URL('./index.html', options.scope).href)) return name;
        }
        return null;
    }
    async function initialize() {
        const state = await readSelectedShell();
        if (!state || state.owner !== options.build) {
            const response = await (await options.storage.open(options.cacheName)).match(new URL('./app-release.json', options.scope).href);
            const release = response ? JSON.parse(await response.text()) as {version?: string} : null;
            if (release?.version && await isCompleteShell(options.cacheName, release.version)) {
                const old = await previousCache(state);
                const clients = await options.clients.matchAll({type: 'window', includeUncontrolled: true});
                const pins = old ? clients.filter(client => client.url.startsWith(options.scope))
                    .map(client => ({id: client.id, cacheName: state?.pins?.find(pin => pin.id === client.id)?.cacheName || old})) : [];
                await writeSelectedShell({owner: options.build, version: release.version, cacheName: options.cacheName, pins});
            }
        }
    }
    async function refreshLegacyApplication() {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
        try {
            const url = new URL('./app-release.json', options.scope); url.searchParams.set('__incoming', String(Date.now()));
            const fetcher = options.fetcher;
            const response = await fetcher(url.href, {cache: 'no-store', signal: controller.signal});
            if (!response.ok) throw new Error('Release unavailable');
            const release = await response.json() as {version: string};
            const previous = await readSelectedShell();
            const ready = await prepareApplicationShell({version: release.version, token: 'legacy-' + Date.now() + '-' + Math.random(), force: true},
                {postMessage: () => {}}, controller.signal);
            if (controller.signal.aborted) throw new Error('Shell preparation cancelled');
            await activateApplicationShell({version: ready.version, cacheName: ready.cacheName, previousCacheName: previous?.cacheName});
            return {ok: true, updated: options.assets.length};
        } finally { clearTimeout(timer); }
    }
    const preparations = new Map<string, AbortController>();
    function handleMessage(event: MiniShellMessageEvent): boolean {
        const data = event.data as MiniShellPrepareData & MiniShellActivateData & {type?: string};
        const port = event.ports?.[0];
        if (data?.type === 'REFRESH_APP_SHELL' && port) {
            event.waitUntil(refreshLegacyApplication().then(result => port.postMessage(result))
                .catch(error => port.postMessage({ok: false, message: error.message})));
            return true;
        }
        if (event.data === 'GET_VERSION' && port) {
            event.waitUntil(readSelectedShell().then(state => port.postMessage({version: options.build, cacheName: state?.owner === options.build ? state.cacheName : options.cacheName})));
            return true;
        }
        if (data?.type === 'CANCEL_APP_PREPARATION') { preparations.get(data.token)?.abort(); return true; }
        if (data?.type === 'PREPARE_APP_UPDATE' && port) {
            const controller = new AbortController(); preparations.set(data.token, controller);
            event.waitUntil(prepareApplicationShell(data, port, controller.signal)
                .then(result => port.postMessage(result)).catch(error => port.postMessage({ok: false, message: error.message}))
                .finally(() => { if (preparations.get(data.token) === controller) preparations.delete(data.token); }));
            return true;
        }
        if (data?.type === 'ACTIVATE_APP_UPDATE' && port) {
            event.waitUntil(activateApplicationShell(data).then(async result => { port.postMessage(result); await options.skipWaiting(); })
                .catch(error => port.postMessage({ok: false, message: error.message})));
            return true;
        }
        if (data?.type === 'CONFIRM_APP_UPDATE' && port) {
            event.waitUntil(confirmApplicationShell(data.version, event.source?.id).then(result => port.postMessage(result))
                .catch(error => port.postMessage({ok: false, message: error.message})));
            return true;
        }
        return false;
    }
    return {initialize, handleMessage, getResponse: getSelectedShellResponse, hasValidContent: hasValidShellContent};

}
return {createPreparedShell};
});
