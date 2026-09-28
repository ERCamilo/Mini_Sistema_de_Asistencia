// scripts/bump-version.mjs
// Automatic patch bump for each release: when this branch still carries the
// same version as main, bump the patch once (2.13.0 -> 2.13.1). A version that
// was already bumped in this branch, or set by hand (minor/major), is kept.
// Runs from the pre-commit hook before stamp-build. Skip with MINI_SKIP_BUMP=1.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function decideVersion({ current, base }) {
  if (!SEMVER.test(String(current))) throw new Error(`Version "${current}" is not semver (x.y.z).`);
  if (!base) return current;
  if (!SEMVER.test(String(base))) throw new Error(`Base version "${base}" is not semver (x.y.z).`);
  if (current !== base) return current;
  const [, major, minor, patch] = SEMVER.exec(current);
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// Version on main: origin/main for feature branches; the previous commit when
// committing on main itself (every direct commit on main is a release).
function readBaseVersion(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const ref = branch === 'main' ? 'HEAD' : 'origin/main';
  const source = git(root, ['show', `${ref}:package.json`]);
  if (!source) return null;
  try { return JSON.parse(source).version || null; } catch { return null; }
}

function writeVersion(root, version) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const lockPath = path.join(root, 'package-lock.json');
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages && lock.packages['']) lock.packages[''].version = version;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  } catch { /* no lockfile: nothing to align */ }
}

function main() {
  if (process.env.MINI_SKIP_BUMP === '1') return;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const current = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const next = decideVersion({ current, base: readBaseVersion(root) });
  if (next !== current) {
    writeVersion(root, next);
    console.log(`bumped version ${current} -> ${next}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
