// Serve the complete published release, not current code relabeled as old code.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PUBLISHED_RELEASE = '0ed98ddc3e48c23d260cba39e8b42382d17c91b5';
export const hashAsset = bytes => createHash('sha256').update(bytes).digest('hex');
export async function servePublishedRelease(root) {
  const archived = new Map();
  function oldAsset(file) {
    if (!archived.has(file)) archived.set(file, execFileSync('git', ['show', `${PUBLISHED_RELEASE}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }));
    return archived.get(file);
  }
  // Fail visibly when a shallow checkout lacks the pinned release.
  oldAsset('app-version.js');
  const state = { published: false, stalePolicy: false };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!path.resolve(root, file).startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = !state.published || state.stalePolicy && file === 'app-version.js'
        ? oldAsset(file) : fs.readFileSync(path.join(root, file));
      res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store'); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, oldAsset, base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}
