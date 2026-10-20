import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/app-version.ts'), 'utf8');
const version = /const APP_VERSION = '(\d+\.\d+\.\d+)'/.exec(source)?.[1];
if (!version) throw new Error('APP_VERSION debe ser una versión semántica.');
for (const name of ['package.json', 'package-lock.json']) {
  const file = path.join(root, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
