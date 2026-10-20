// Legacy decideVersion export retained for consumers; CLI synchronizes the canonical version.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function decideVersion({ current, base }) {
  if (!SEMVER.test(String(current))) throw new Error(`Version "${current}" is not semver (x.y.z).`);
  if (!base) return current;
  if (!SEMVER.test(String(base))) throw new Error(`Base version "${base}" is not semver (x.y.z).`);
  if (current !== base) return current;
  const [, major, minor, patch] = SEMVER.exec(current);
  return `${major}.${minor}.${Number(patch) + 1}`;
}

// Compatibility entry point: release versions now belong to the changelog.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await import('./sync-app-version.mjs');
}
