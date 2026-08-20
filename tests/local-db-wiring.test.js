const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const html = readFileSync(require.resolve('../index.html'), 'utf8');

test('loads local-first modules before the production coordinator', () => {
  const localDb = html.indexOf('<script src="./local-db.js"></script>');
  const envelope = html.indexOf('<script src="./mini-sa-envelope.js"></script>');
  const roster = html.indexOf('<script src="./roster-package.js"></script>');
  const coordinator = html.indexOf('<script>', roster);
  assert.ok(localDb > 0 && envelope > localDb && roster > envelope);
  assert.ok(coordinator > roster);
});

test('starts migration in the background and reads the authoritative snapshot', () => {
  assert.match(html, /initLocalPersistence\(\);/);
  assert.match(html, /await localDb\.migrateLegacyData\(\)/);
  assert.match(html, /const stored = await localDb\.readState\(\)/);
  assert.match(html, /applyLocalSnapshot\(stored\)/);
});

test('saveData keeps the legacy mirror and queues one atomic IndexedDB snapshot', () => {
  const saveData = html.slice(html.indexOf('function saveData()'), html.indexOf('function getRecord'));
  assert.match(saveData, /writeLegacyMirror\(captureLocalSnapshot\(\)\)/);
  assert.match(saveData, /queueLocalSnapshot\(\)/);
  assert.match(html, /localDb\.writeState\(snapshot\)/);
  assert.match(html, /MiniLocalDb\.isEnabled\(localStorage\)/);
});

test('all persisted settings use the shared snapshot boundary', () => {
  for (const key of ['appTheme', 'iconStyle', 'checkMode', 'reminderConfig', 'expectedHoursPerDay']) {
    assert.match(html, new RegExp(`saveLocalSetting\\('${key}'`));
  }
});

test('Solicitudes UI routes request/template storage through its repository facade', () => {
  assert.match(html, /src="\.\/field-requests-repository\.js"/);
  assert.match(html, /fieldRequestsRepository\.load\(\)/);
  assert.match(html, /fieldRequestsRepository\.save\(requests, requestTemplates\)/);
  assert.match(html, /fieldRequestsRepository\.exportCollections/);
  assert.match(html, /fieldRequestsRepository\.importCollections/);
  assert.doesNotMatch(html, /localStorage\.getItem\('requests'\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\('requests'/);
  assert.doesNotMatch(html, /localStorage\.getItem\('requestTemplates'\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\('requestTemplates'/);
});
