const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const policy = require(path.join(root, 'app-version.js'));
const source = fs.readFileSync(path.join(root, 'src/app-version.ts'), 'utf8');
const canonical = /const APP_VERSION = '([^']+)'/.exec(source)?.[1];
const manifest = { version: policy.APP_VERSION, changelog: policy.CHANGELOG };
if (canonical !== manifest.version || !policy.isReleaseManifest(manifest)) throw new Error('Compila app-version.ts y comprueba versión/CHANGELOG.');
const output = JSON.stringify(manifest, null, 2) + '\n';
const target = path.join(root, 'app-release.json');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) throw new Error('Ejecuta npm run build para actualizar app-release.json.');
} else fs.writeFileSync(target, output);
