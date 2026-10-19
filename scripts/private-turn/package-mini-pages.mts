import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const extras = ['private-turn.js', 'private-turn-bootstrap.js', 'private-turn-public-preview.js'];
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
async function packagePreview() {
    const args = process.argv.slice(2), values: Record<string, string> = {};
    let candidate = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--candidate') { candidate = true; continue; }
        if (!['--source-root', '--out', '--revision'].includes(args[i]) || values[args[i]] || !args[i + 1]) throw new Error('PACKAGE_ARGUMENT_INVALID');
        values[args[i]] = args[++i];
    }
    const revision = values['--revision'];
    if (!revision || !/^[a-f0-9]{7,40}$/.test(revision) || !values['--source-root'] || !values['--out']) throw new Error('PACKAGE_ARGUMENT_INVALID');
    const source = await realpath(values['--source-root']), output = resolve(values['--out']);
    const parent = await realpath(resolve(output, '..'));
    const rel = relative(source, parent);
    if (parent === source || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('PACKAGE_OUTPUT_MUST_BE_EXTERNAL');
    const git = (...argv: string[]) => execFileSync('git', ['-C', source, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    let outputInRepository = false;
    try { execFileSync('git', ['-C', parent, 'rev-parse', '--show-toplevel'], { stdio: 'ignore' }); outputInRepository = true; } catch { /* A non-repository output parent is required. */ }
    if (outputInRepository) throw new Error('PACKAGE_OUTPUT_MUST_BE_EXTERNAL');
    const tracked = new Set(git('ls-files').split('\n'));
    const head = git('rev-parse', 'HEAD');
    if (!candidate && (revision.length !== 40 || revision !== head)) throw new Error('PACKAGE_COMMIT_MISMATCH');
    const sw = await readFile(join(source, 'sw.js'), 'utf8');
    const list = /const PRECACHE_ASSETS = \[([\s\S]*?)\];/.exec(sw);
    if (!list) throw new Error('PACKAGE_PRECACHE_INVALID');
    const paths = [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1]).filter(value => value !== './').map(value => value.replace(/^\.\//, ''));
    const assets = [...new Set([...paths, 'sw.js', ...extras])];
    const content = new Map<string, Buffer>();
    for (const name of assets) {
        if (!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:html|js|css|json|webmanifest|svg|png|ico|webp|woff2)$/.test(name)
            || /(?:^|\/)(?:\.git|node_modules|coverage|credentials?)(?:\/|\.)/i.test(name)
            || (!tracked.has(name) && !(candidate && name === 'private-turn-public-preview.js'))) throw new Error('PACKAGE_ASSET_INVALID');
        const file = join(source, name), metadata = await lstat(file);
        if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(file) !== file) throw new Error('PACKAGE_ASSET_INVALID');
        const bytes = await readFile(file);
        if (!candidate) {
            const committed = execFileSync('git', ['-C', source, 'show', `${head}:${name}`], { stdio: ['ignore', 'pipe', 'pipe'] });
            if (!bytes.equals(committed)) throw new Error('PACKAGE_DIRTY_ASSET');
        }
        content.set(name, bytes);
    }
    const html = content.get('index.html')!.toString('utf8'), anchor = '<script src="./p2p-core.js"></script>';
    if (html.split(anchor).length !== 2 || html.includes('window.MiniPublicTurnPreview=') || /private-turn(?:-bootstrap|-public-preview)?\.js/.test(html)) throw new Error('PACKAGE_HTML_INVALID');
    const release = { label: 'beta 1.9', revision };
    const injected = '<script>window.MiniPublicTurnPreview=' + JSON.stringify({ enabled: true, ...release }) + ';</script>'
        + extras.map(name => '<script src="./' + name + '"></script>').join('');
    content.set('index.html', Buffer.from(html.replace(anchor, anchor + injected)));
    content.set('sw.js', Buffer.from(sw.replace(list[0], list[0].replace(/\s*\];$/, ',\n' + extras.map(name => "  './" + name + "',\n").join('') + '];'))
        .replace(/^const CACHE_VERSION = '[^']*';/m, `const CACHE_VERSION = 'mini-turn-${candidate ? 'candidate' : 'commit'}-${revision}';`)));
    // All input validation precedes the exclusive output-directory creation.
    await mkdir(output, { mode: 0o700 });
    const hashes: Record<string, string> = {};
    for (const [name, bytes] of content) {
        await mkdir(resolve(output, name, '..'), { recursive: true });
        await writeFile(join(output, name), bytes, { flag: 'wx' }); hashes[name] = sha(bytes);
    }
    await writeFile(join(output, 'preview-manifest.json'), JSON.stringify({ provenance: candidate ? 'unreviewed-candidate' : 'committed-assets',
        release, origin: 'https://mini-mini-review-20261009.mini-sistema-asistencia-preview.pages.dev', assets: hashes }, null, 2), { flag: 'wx' });
    console.log('mini-pages-package:created');
}
packagePreview().catch(() => { console.error('mini-pages-package:invalid'); process.exitCode = 1; });
