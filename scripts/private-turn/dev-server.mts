import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PrivateTurnDevOptions {
    forwardPort: number;
    port?: number;
    tls?: { key: Buffer; cert: Buffer };
    httpForTests?: boolean;
    appRoot?: string;
    assets?: readonly string[];
    maxRequestBytes?: number;
    maxResponseBytes?: number;
    timeoutMs?: number;
}
class PrivateTurnProxyError extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
}
const extensions: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function limit(value: number, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('TURN_DEV_CONFIGURATION_INVALID');
    return value;
}
function sendError(res: ServerResponse, status: number, code: string): void {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: code }));
}
function readRequest(req: IncomingMessage, max: number, timeout: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let bytes = 0, finished = false;
        const timer = setTimeout(() => finish(new PrivateTurnProxyError(408, 'TURN_REQUEST_TIMEOUT')), timeout);
        const onData = (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > max) finish(new PrivateTurnProxyError(413, 'TURN_REQUEST_TOO_LARGE'));
            else chunks.push(chunk);
        };
        const onEnd = () => finish();
        const onError = () => finish(new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID'));
        function finish(error?: Error): void {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            req.off('data', onData).off('end', onEnd).off('error', onError).off('aborted', onError);
            if (error) { req.once('error', () => {}); req.resume(); reject(error); }
            else resolve(Buffer.concat(chunks));
        }
        req.on('data', onData).once('end', onEnd).once('error', onError).once('aborted', onError);
    });
}
function validateToken(body: Buffer): string {
    try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        const record = value as Record<string, unknown>;
        if (Object.keys(record).length !== 1 || typeof record.idToken !== 'string' || !record.idToken || record.idToken.length > 16384 || /\s/.test(record.idToken)) throw new Error();
        return record.idToken;
    } catch { throw new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID'); }
}
function normalizeResponse(body: Buffer): string {
    try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        const row = value as Record<string, unknown>;
        for (const [key, max] of [['username', 256], ['credential', 1024]] as const) {
            if (typeof row[key] !== 'string' || !row[key] || row[key].length > max || /[\x00-\x20\x7f]/.test(row[key])) throw new Error();
        }
        if (!Number.isSafeInteger(row.ttl) || Number(row.ttl) <= 0 || !(Number.isSafeInteger(row.expiresAt) || (typeof row.expiresAt === 'string' && row.expiresAt.length <= 32))) throw new Error();
        if (!Array.isArray(row.iceServers) || !row.iceServers.length || row.iceServers.length > 8) throw new Error();
        for (const server of row.iceServers) {
            if (!server || typeof server !== 'object' || Array.isArray(server) || Object.keys(server).some(key => !['urls', 'username', 'credential', 'credentialType'].includes(key))) throw new Error();
            const urls: unknown[] = Array.isArray(server.urls) ? server.urls : [server.urls];
            if (!urls.length || urls.length > 8 || urls.some(url => typeof url !== 'string' || url.length > 512 || !/^(stun|stuns|turn|turns):/.test(url))) throw new Error();
            for (const key of ['username', 'credential', 'credentialType']) if (server[key] !== undefined && (typeof server[key] !== 'string' || server[key].length > 1024)) throw new Error();
        }
        // Strip unrelated upstream fields; clients enforce the explicit expiry contract.
        return JSON.stringify({ username: row.username, credential: row.credential, ttl: row.ttl, expiresAt: row.expiresAt, iceServers: row.iceServers });
    } catch { throw new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE'); }
}
function forward(idToken: string, port: number, max: number, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ idToken });
        let finished = false;
        const request = http.request({ hostname: '127.0.0.1', port, path: '/turn-creds', method: 'POST', agent: false,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' } }, response => {
            if (response.statusCode !== 200 || !/^application\/json(?:;|$)/i.test(String(response.headers['content-type'] || ''))) {
                response.resume(); finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')); return;
            }
            const declared = response.headers['content-length'];
            if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) {
                response.destroy(); finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')); return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on('data', (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > max) { response.destroy(); finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')); }
                else chunks.push(chunk);
            });
            response.once('end', () => {
                try { finish(undefined, normalizeResponse(Buffer.concat(chunks))); }
                catch { finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')); }
            });
            response.once('error', () => finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')));
            response.once('aborted', () => finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')));
        });
        const timer = setTimeout(() => finish(new PrivateTurnProxyError(504, 'TURN_UPSTREAM_TIMEOUT')), timeout);
        function finish(error?: Error, value?: string): void {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (error) { request.destroy(); reject(error); }
            else resolve(value!);
        }
        request.once('error', () => finish(new PrivateTurnProxyError(502, 'TURN_UPSTREAM_UNAVAILABLE')));
        request.end(body);
    });
}
async function serveAsset(req: IncomingMessage, res: ServerResponse, root: string | undefined, assets: ReadonlySet<string>): Promise<void> {
    if (req.method !== 'GET' || !root) throw new PrivateTurnProxyError(404, 'TURN_ASSET_UNAVAILABLE');
    let name: string;
    try { name = decodeURIComponent((req.url || '').split('?')[0]); } catch { throw new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID'); }
    if (name === '/') name = '/index.html';
    name = name.slice(1);
    if (!assets.has(name) || name.split('/').some(part => !part || part.startsWith('.') || part === 'node_modules') || !extensions[path.extname(name)]) throw new PrivateTurnProxyError(404, 'TURN_ASSET_UNAVAILABLE');
    try {
        const canonicalRoot = await realpath(root), file = await realpath(path.resolve(canonicalRoot, name));
        if (!file.startsWith(canonicalRoot + path.sep)) throw new Error();
        const info = await stat(file);
        if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error();
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': extensions[path.extname(name)], 'Cache-Control': 'no-store' }); res.end(body);
    } catch { throw new PrivateTurnProxyError(404, 'TURN_ASSET_UNAVAILABLE'); }
}
export async function startDevServer(options: PrivateTurnDevOptions) {
    const forwardPort = limit(options.forwardPort, 1, 65535), port = limit(options.port ?? 9443, 0, 65535);
    const maxRequest = limit(options.maxRequestBytes ?? 20000, 1, 20000), maxResponse = limit(options.maxResponseBytes ?? 32768, 1, 32768), timeout = limit(options.timeoutMs ?? 10000, 1, 30000);
    if ((!options.tls && options.httpForTests !== true) || (options.tls && options.httpForTests)) throw new Error('TURN_DEV_CONFIGURATION_INVALID');
    const assets = new Set(options.assets || []), appRoot = options.appRoot;
    let origin = '';
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        try {
            if (!origin || req.headers.host !== new URL(origin).host) throw new PrivateTurnProxyError(403, 'TURN_ORIGIN_DENIED');
            if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('#')) throw new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID');
            if (req.url.split('?')[0] !== '/api/turn-creds') { await serveAsset(req, res, appRoot, assets); return; }
            if (req.url !== '/api/turn-creds') throw new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID');
            if (req.headers.origin !== origin) throw new PrivateTurnProxyError(403, 'TURN_ORIGIN_DENIED');
            if (req.method !== 'POST') throw new PrivateTurnProxyError(405, 'TURN_METHOD_DENIED');
            if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) throw new PrivateTurnProxyError(415, 'TURN_CONTENT_TYPE_DENIED');
            if (req.headers.cookie !== undefined || req.headers.authorization !== undefined) throw new PrivateTurnProxyError(400, 'TURN_REQUEST_INVALID');
            const idToken = validateToken(await readRequest(req, maxRequest, timeout));
            const body = await forward(idToken, forwardPort, maxResponse, timeout);
            if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(body); }
        } catch (error) {
            if (error instanceof PrivateTurnProxyError) sendError(res, error.status, error.code);
            else sendError(res, 500, 'TURN_DEV_UNAVAILABLE');
        }
    };
    const server = options.tls ? https.createServer(options.tls, (req, res) => { void handler(req, res); }) : http.createServer((req, res) => { void handler(req, res); });
    server.requestTimeout = timeout;
    server.headersTimeout = timeout;
    await new Promise<void>((resolve, reject) => {
        const failed = () => reject(new Error('TURN_DEV_UNAVAILABLE'));
        server.once('error', failed);
        server.listen(port, '127.0.0.1', () => { server.off('error', failed); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') { server.close(); throw new Error('TURN_DEV_UNAVAILABLE'); }
    origin = `${options.tls ? 'https' : 'http'}://127.0.0.1:${address.port}`;
    return { origin, close: () => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function cli(): Promise<void> {
    const args = process.argv.slice(2), values: Record<string, string> = {}, assets: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
        if (!['--root', '--asset', '--forward-port', '--port', '--cert', '--key'].includes(args[i]) || !args[i + 1]) throw new Error('TURN_DEV_CONFIGURATION_INVALID');
        if (args[i] === '--asset') assets.push(args[i + 1]); else values[args[i]] = args[i + 1];
    }
    if (!values['--cert'] || !values['--key'] || !values['--forward-port']) throw new Error('TURN_DEV_CONFIGURATION_INVALID');
    const tls = { cert: await readFile(values['--cert']), key: await readFile(values['--key']) };
    const dev = await startDevServer({ forwardPort: Number(values['--forward-port']), port: values['--port'] ? Number(values['--port']) : 9443, tls, appRoot: values['--root'], assets });
    const stop = () => { void dev.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log('private-turn-dev:ready');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    void cli().catch(() => { console.error('private-turn-dev:unavailable'); process.exitCode = 1; });
}
