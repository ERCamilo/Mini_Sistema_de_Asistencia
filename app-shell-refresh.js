"use strict";
(function exposeAppShellRefresh(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.AppShellRefresh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    let refreshedUntil = 0, refreshedCache = '';
    async function getFreshShellResponse(request, storage, cacheName, now = Date.now()) {
        if (cacheName !== refreshedCache || now >= refreshedUntil)
            return undefined;
        return (await storage.open(cacheName)).match(request, { ignoreSearch: request.mode === 'navigate' });
    }
    async function refreshAppShell(options) {
        var _a, _b;
        const scope = new URL(options.scope);
        const urls = [...new Set(options.assets.map(asset => {
                const url = new URL(asset, scope);
                if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))
                    throw new Error('Asset outside app scope');
                return url.href;
            }))];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (_a = options.timeoutMs) !== null && _a !== void 0 ? _a : 60000);
        const stamp = (_b = options.stamp) !== null && _b !== void 0 ? _b : Date.now();
        try {
            // Download everything before changing a working offline cache.
            const responses = await Promise.all(urls.map(async (canonical) => {
                const fresh = new URL(canonical);
                fresh.searchParams.set('__v', String(stamp));
                const fetchAsset = options.fetcher;
                const response = await fetchAsset(fresh.href, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
                if (!response.ok)
                    throw new Error('Shell download failed: ' + canonical);
                const type = response.headers.get('Content-Type') || '';
                if ((fresh.pathname.endsWith('.js') && !/(?:java|ecma)script/i.test(type)) ||
                    (fresh.pathname.endsWith('.css') && !/text\/css/i.test(type)))
                    throw new Error('Invalid shell content: ' + canonical);
                await response.clone().arrayBuffer();
                return response;
            }));
            const cache = await options.storage.open(options.cacheName);
            for (let i = 0; i < urls.length; i++)
                await cache.put(urls[i], responses[i]);
            const keep = new Set(urls);
            for (const request of await cache.keys())
                if (!keep.has(request.url))
                    await cache.delete(request);
            // Keep this reload on the verified shell, even if the CDN's canonical URL is stale.
            refreshedCache = options.cacheName;
            refreshedUntil = Date.now() + 60000;
            return urls.length;
        }
        catch (error) {
            controller.abort();
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    return { refreshAppShell, getFreshShellResponse };
});
