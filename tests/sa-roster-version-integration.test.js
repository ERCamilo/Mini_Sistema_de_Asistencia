const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const Guard = require('../sa-roster-version-guard.js');
const SaRosterImport = require('../sa-roster-import.js');

const T1 = '2026-09-07T00:00:00.000Z';
const T2 = '2026-09-08T00:00:00.000Z';

function createMemoryStorage(initialState = {}) {
  const map = new Map(Object.entries(initialState));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    __map: map
  };
}

function rosterText(project, generatedAt, rosterVersion, employees) {
  const envelope = {
    schema: 'sa-roster/v1',
    version: 1,
    saProjectId: project,
    employees: employees || [{ saEmployeeId: 'e1', number: '1', name: 'Ana' }]
  };
  if (generatedAt !== undefined) envelope.generatedAt = generatedAt;
  if (rosterVersion !== undefined) envelope.rosterVersion = rosterVersion;
  return JSON.stringify(envelope);
}

function rosterObj(project, generatedAt, rosterVersion) {
  const out = { schema: 'sa-roster/v1', version: 1, saProjectId: project, employees: [{ saEmployeeId: 'e1', number: '1', name: 'Ana' }] };
  if (generatedAt !== undefined) out.generatedAt = generatedAt;
  if (rosterVersion !== undefined) out.rosterVersion = rosterVersion;
  return out;
}

// --- Load order / precache ---

test('version guard loads before P2P roster UI and is precached', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const core = html.indexOf('./p2p-core.js');
  const pairing = html.indexOf('./p2p-pairing.js');
  const aliases = html.indexOf('./p2p-peer-alias-store.js');
  const guard = html.indexOf('./sa-roster-version-guard.js');
  const ui = html.indexOf('./p2p-roster-ui.js');
  assert.ok(core > 0 && pairing > 0 && aliases > 0 && guard > 0 && ui > 0, 'all P2P scripts must be present');
  assert.ok(core < pairing && pairing < aliases && aliases < guard && guard < ui, 'guard must load after alias store and before roster UI');
  assert.ok(sw.includes("'./sa-roster-version-guard.js'"), 'guard must be precached');
  for (const asset of ['./p2p-core.js', './p2p-pairing.js', './p2p-peer-alias-store.js', './p2p-roster-ui.js']) {
    assert.ok(sw.includes(asset), asset + ' must stay precached');
  }
});

// --- UI labels / shell / icons ---

test('P2P review shows concise Spanish version labels in the same morphing shell', () => {
  const ui = read('p2p-roster-ui.js');
  for (const label of ['Primera versión', 'Más reciente', 'Ya aplicada', 'Versión anterior', 'Versión dudosa']) {
    assert.ok(ui.includes(label), 'review must show label: ' + label);
  }
  assert.ok(ui.includes('mini-roster-version'), 'review must render version banner');
  assert.ok(ui.includes('mini-roster-version is-'), 'banner must vary per outcome');
  assert.ok(ui.includes('function reviewPendingRoster'), 'review stays in dedicated function');
  assert.ok(ui.includes('morphShell(() => { body().innerHTML'), 'review must morph in the same shell');
  assert.ok(ui.includes("vectorIcon(versionIcon("), 'version banner must use vector icons');
  assert.doesNotMatch(ui, /👥|🕒|💾|📄|⇄|✎|←|✓|❌|⚠️|✅/, 'version UI must not use emoji');
  assert.equal((ui.match(/style=/g) || []).length, 0, 'no inline styles in P2P UI');
  assert.doesNotMatch(ui, /\balert\s*\(/, 'no native alert');
  assert.doesNotMatch(ui, /\bconfirm\s*\(/, 'no native confirm');
});

test('blocked rosters still allow review and details', () => {
  const ui = read('p2p-roster-ui.js');
  const start = ui.indexOf('function reviewPendingRoster()');
  const end = ui.indexOf('async function applyReviewedRoster', start);
  assert.ok(start > 0 && end > start);
  const body = ui.slice(start, end);
  assert.ok(body.includes('mini-roster-details'), 'details must render even when blocked');
  assert.ok(body.includes('Ver detalle de cambios'), 'detail toggle must stay visible');
  assert.ok(body.includes('mini-roster-conflicts') || body.includes('Resolver vínculos'), 'conflict resolution must stay visible');
  assert.ok(body.includes('versionCanApply') || body.includes('versionOutcome'), 'review must compute version gate');
  assert.ok(body.includes("data-apply-roster"), 'apply control must stay in the shell');
  assert.ok(body.includes('disabled'), 'blocked outcomes must disable apply');
});

test('P2P UI delegates only through window.applyReviewedSaRoster and never writes the repository directly', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('root.applyReviewedSaRoster'), 'must delegate through app-owned seam');
  assert.doesNotMatch(ui, /employeeRepository\./, 'must not touch employee repository directly');
  assert.doesNotMatch(ui, /\.importSaRoster\s*\(/, 'must not call canonical import directly');
});

// --- Dynamic guard outcomes through the real guard (per saProjectId) ---

function classifyWithFreshGuard(roster, storage) {
  const guard = Guard.createSaRosterVersionGuard(storage ? { storage } : {});
  return guard.classifyIncoming(roster);
}

test('first incoming per saProjectId is applyable', () => {
  const storage = createMemoryStorage();
  const guard = Guard.createSaRosterVersionGuard({ storage });
  const decision = guard.classifyIncoming(rosterObj('proj-1', T1, 'v1'));
  assert.equal(decision.outcome, 'first');
  assert.ok(decision.outcome === 'first' || decision.outcome === 'newer', 'first must be applyable');
  assert.equal(guard.getLastApplied('proj-1'), null, 'classify must not persist');
});

test('newer incoming is applyable', () => {
  const storage = createMemoryStorage();
  const guard = Guard.createSaRosterVersionGuard({ storage });
  guard.markApplied(rosterObj('proj-1', T1, 'v1'));
  const decision = guard.classifyIncoming(rosterObj('proj-1', T2, 'v1'));
  assert.equal(decision.outcome, 'newer');
  assert.ok(decision.outcome === 'first' || decision.outcome === 'newer');
});

test('equal incoming is shown as already applied and cannot apply', () => {
  const storage = createMemoryStorage();
  const guard = Guard.createSaRosterVersionGuard({ storage });
  guard.markApplied(rosterObj('proj-1', T1, 'v1'));
  const decision = guard.classifyIncoming(rosterObj('proj-1', T1, 'v1'));
  assert.equal(decision.outcome, 'equal');
  assert.ok(!(decision.outcome === 'first' || decision.outcome === 'newer'), 'equal must not be applyable');
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('Ya aplicada'), 'equal label must be Ya aplicada');
  assert.ok(ui.includes("outcome === 'equal'") || ui.includes('equal'), 'UI must handle equal explicitly');
});

test('older incoming is visibly blocked', () => {
  const storage = createMemoryStorage();
  const guard = Guard.createSaRosterVersionGuard({ storage });
  guard.markApplied(rosterObj('proj-1', T2, 'v1'));
  const decision = guard.classifyIncoming(rosterObj('proj-1', T1, 'v1'));
  assert.equal(decision.outcome, 'older');
  assert.ok(!(decision.outcome === 'first' || decision.outcome === 'newer'));
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('Versión anterior'), 'older label must be Versión anterior');
});

test('ambiguous incoming is visibly blocked fail-closed', () => {
  const storage = createMemoryStorage();
  const guard = Guard.createSaRosterVersionGuard({ storage });
  guard.markApplied(rosterObj('proj-1', T1, 'v1'));
  const conflict = guard.classifyIncoming(rosterObj('proj-1', T1, 'v9'));
  assert.equal(conflict.outcome, 'ambiguous');
  const missing = guard.classifyIncoming(rosterObj('proj-1', undefined, 'v1'));
  assert.equal(missing.outcome, 'ambiguous');
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('Versión dudosa'), 'ambiguous label must be Versión dudosa');
});

// --- P2P UI seam uses the same guard outcomes dynamically ---

function loadUiWithRealGuard(storage) {
  const uiCode = read('p2p-roster-ui.js');
  const ctx = {
    window: {},
    addEventListener: () => {},
    showToast: () => {},
    showConfirm: async () => true,
    document: {
      readyState: 'complete',
      getElementById: () => null,
      createElement: () => ({ style: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} }),
      body: { appendChild: () => {} },
      addEventListener: () => {}
    },
    location: { hash: '', pathname: '/', search: '', href: 'https://mini.invalid/' },
    history: { replaceState: () => {} },
    setTimeout, clearTimeout, Date, JSON, String, Array, Math, Number, Error, TypeError, TextEncoder, console,
    localStorage: storage
  };
  ctx.window = ctx;
  ctx.SaMiniP2P = {
    makeIdentityStore: () => ({ getSelf: async () => ({ deviceId: 'm1', displayName: 'Mini norte' }), listPeers: async () => [], getPeer: async () => null, renameSelf: async () => {}, removePeer: async () => {} }),
    deriveTrustedRoute: async () => ({ room: 'r', proof: 'p' }),
    SignalingClient: function () {},
    createRtcSession: async () => ({ close() {} }),
    createTransferReceiver: () => () => {},
    parseControl: () => null,
    parsePairHash: () => null,
    pairDescriptorFromManual: async () => { throw new Error('no manual'); },
    decodePairDescriptor: async () => { throw new Error('no descriptor'); }
  };
  ctx.SaMiniP2PPairing = { attachTrusted: () => {}, attachPairing: () => {} };
  ctx.SaMiniP2PPeerAliases = {
    createPeerAliasStore: () => ({ getAlias: () => '', setAlias: () => {}, removeAlias: () => {}, resolveName: p => p?.displayName || 'SA' })
  };
  ctx.IconSet = { iconSvg: () => '<svg></svg>' };
  ctx.SaRosterVersionGuard = Guard;
  ctx.SaRosterImport = SaRosterImport;
  vm.createContext(ctx);
  vm.runInContext(uiCode, ctx);
  return ctx;
}

test('P2P UI seam classifies first/newer as applyable and equal/older/ambiguous as blocked', () => {
  const storage = createMemoryStorage();
  const ctx = loadUiWithRealGuard(storage);
  assert.ok(ctx.MiniP2PRosterVersions, 'UI must expose version seam for integration');
  const classify = ctx.MiniP2PRosterVersions.classify;
  assert.equal(classify(rosterObj('proj-1', T1, 'v1')).outcome, 'first');
  assert.equal(ctx.MiniP2PRosterVersions.labelFor('first'), 'Primera versión');
  assert.equal(ctx.MiniP2PRosterVersions.labelFor('newer'), 'Más reciente');
  assert.equal(ctx.MiniP2PRosterVersions.labelFor('equal'), 'Ya aplicada');
  assert.equal(ctx.MiniP2PRosterVersions.labelFor('older'), 'Versión anterior');
  assert.equal(ctx.MiniP2PRosterVersions.labelFor('ambiguous'), 'Versión dudosa');

  ctx.MiniP2PRosterVersions.getGuard().markApplied(rosterObj('proj-1', T1, 'v1'));
  assert.equal(classify(rosterObj('proj-1', T2, 'v1')).outcome, 'newer');
  assert.equal(classify(rosterObj('proj-1', T1, 'v1')).outcome, 'equal');
  assert.equal(classify(rosterObj('proj-1', T1, 'v9')).outcome, 'ambiguous');
  ctx.MiniP2PRosterVersions.getGuard().markApplied(rosterObj('proj-1', T2, 'v1'));
  assert.equal(classify(rosterObj('proj-1', T1, 'v1')).outcome, 'older');
});

// --- index.html apply seam: defense in depth ---

function extractApplySlice(html) {
  const start = html.indexOf('window.applyReviewedSaRoster =');
  assert.ok(start > 0, 'apply seam must exist');
  const end = html.indexOf('window.confirmSaIdentityLink', start);
  assert.ok(end > start);
  return html.slice(start, end);
}

test('apply seam re-classifies before canonical import and only first/newer proceed', () => {
  const html = read('index.html');
  const slice = extractApplySlice(html);
  assert.ok(slice.includes('SaRosterVersionGuard'), 'must reference the version guard');
  assert.ok(slice.includes('classifyIncoming'), 'must classify again');
  assert.ok(slice.includes('employeeRepository.importSaRoster'), 'must use canonical import');
  const classifyAt = slice.indexOf('classifyIncoming');
  const importAt = slice.indexOf('employeeRepository.importSaRoster');
  assert.ok(classifyAt > 0 && importAt > classifyAt, 'classify must happen before canonical import');
  assert.match(slice, /outcome !== 'first' && outcome !== 'newer'|outcome === 'first' \|\| outcome === 'newer'/, 'only first/newer must proceed');
  assert.ok(slice.includes('Ya aplicada'), 'equal must surface Ya aplicada');
  assert.ok(slice.includes('Versión anterior'), 'older must surface Versión anterior');
  assert.ok(slice.includes('Versión dudosa'), 'ambiguous must surface Versión dudosa');
});

test('apply seam marks applied only after successful canonical apply/save/history/render', () => {
  const html = read('index.html');
  const slice = extractApplySlice(html);
  const importAt = slice.indexOf('employeeRepository.importSaRoster');
  const markAt = slice.indexOf('markApplied');
  assert.ok(markAt > importAt, 'mark must happen after canonical import');
  for (const token of ['recordImport', 'saveData()', 'renderList()', 'renderEmployeesList()', 'updateUndoImportButton()']) {
    const at = slice.indexOf(token);
    assert.ok(at > 0, token + ' must stay in the apply path');
    assert.ok(at < markAt, token + ' must happen before markApplied');
  }
  assert.ok(slice.includes('markApplied(roster)'), 'must mark the normalized roster');
});

function makeApplyHarness({ importImpl, initialGuardEntries } = {}) {
  const storage = createMemoryStorage();
  if (initialGuardEntries) storage.setItem(Guard.STORAGE_KEY, JSON.stringify(initialGuardEntries));
  const calls = { imports: 0, saves: 0, renders: 0 };
  let usersArr = [];
  const employeeRepository = {
    getAll: () => [...usersArr],
    importSaRoster: (roster, opts) => {
      calls.imports += 1;
      if (importImpl) return importImpl(roster, opts);
      usersArr = [{ id: 'u1', name: 'Ana', number: '1' }];
      return { totalValid: 1, createdCount: 1, updatedCount: 0, skippedCount: 0, reconciliationCandidates: [] };
    }
  };
  const sandbox = {
    employeeRepository,
    importHistoryRepository: { recordImport: () => {} },
    users: usersArr,
    saveData: () => { calls.saves += 1; },
    renderList: () => { calls.renders += 1; },
    renderEmployeesList: () => {},
    updateUndoImportButton: () => {},
    console, JSON, Error,
    localStorage: storage
  };
  sandbox.window = sandbox;
  sandbox.window.SaRosterImport = SaRosterImport;
  sandbox.window.SaRosterVersionGuard = Guard;
  sandbox.window.localStorage = storage;
  vm.createContext(sandbox);
  const html = read('index.html');
  const slice = extractApplySlice(html);
  vm.runInContext(slice, sandbox);
  assert.equal(typeof sandbox.window.applyReviewedSaRoster, 'function');
  return { sandbox, storage, calls };
}

test('apply seam dynamic: first and newer succeed and record markers; equal/older/ambiguous throw without importing', () => {
  const h1 = makeApplyHarness();
  const firstText = rosterText('proj-1', T1, 'v1');
  const r1 = h1.sandbox.window.applyReviewedSaRoster({ text: firstText, confirmedLinks: [] });
  assert.equal(r1.createdCount, 1);
  assert.equal(h1.calls.imports, 1);
  const stored1 = Guard.createSaRosterVersionGuard({ storage: h1.storage }).getLastApplied('proj-1');
  assert.deepEqual(stored1, { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T1 });

  const newerText = rosterText('proj-1', T2, 'v1');
  const r2 = h1.sandbox.window.applyReviewedSaRoster({ text: newerText, confirmedLinks: [] });
  assert.equal(h1.calls.imports, 2);
  assert.deepEqual(Guard.createSaRosterVersionGuard({ storage: h1.storage }).getLastApplied('proj-1'), { saProjectId: 'proj-1', rosterVersion: 'v1', generatedAt: T2 });
  assert.equal(r2.createdCount, 1);

  assert.throws(() => h1.sandbox.window.applyReviewedSaRoster({ text: newerText, confirmedLinks: [] }), /Ya aplicada/);
  assert.equal(h1.calls.imports, 2, 'equal must not reach canonical import');
  assert.throws(() => h1.sandbox.window.applyReviewedSaRoster({ text: firstText, confirmedLinks: [] }), /Versión anterior/);
  assert.equal(h1.calls.imports, 2, 'older must not reach canonical import');
  const ambiguousText = rosterText('proj-1', T2, 'v9-different');
  assert.throws(() => h1.sandbox.window.applyReviewedSaRoster({ text: ambiguousText, confirmedLinks: [] }), /Versión dudosa/);
  assert.equal(h1.calls.imports, 2, 'ambiguous must not reach canonical import');
});

test('apply seam dynamic: failed canonical apply never marks the roster', () => {
  const h = makeApplyHarness({
    importImpl: () => { throw new Error('canonical import failed'); }
  });
  const text = rosterText('proj-1', T1, 'v1');
  assert.throws(() => h.sandbox.window.applyReviewedSaRoster({ text, confirmedLinks: [] }), /canonical import failed/);
  assert.equal(h.calls.imports, 1);
  assert.equal(h.calls.saves, 0, 'save must not run after a failed import');
  assert.equal(Guard.createSaRosterVersionGuard({ storage: h.storage }).getLastApplied('proj-1'), null, 'failed apply must not mark');
});

test('legacy manual JSON import is unaffected by the version guard', () => {
  const html = read('index.html');
  const start = html.indexOf('window.doImportEmployeesFromText');
  assert.ok(start > 0, 'legacy manual import must still exist');
  const end = html.indexOf('window.clearAllData', start);
  assert.ok(end > start);
  const slice = html.slice(start, end);
  assert.doesNotMatch(slice, /SaRosterVersionGuard/, 'legacy path must not reference the version guard');
  assert.doesNotMatch(slice, /classifyIncoming/, 'legacy path must not classify versions');
  assert.doesNotMatch(slice, /markApplied/, 'legacy path must not mark versions');
  assert.ok(slice.includes("source: 'sa'") || slice.includes('source: "sa"') || slice.includes("source:'sa'") || slice.includes('employeeRepository.importSaRoster'), 'SA manual merge path must stay intact');
});

test('version banner has dedicated styles for every outcome', () => {
  const css = read('p2p-transfer.css');
  assert.ok(css.includes('.mini-roster-version'), 'banner style must exist');
  for (const variant of ['.mini-roster-version.is-first', '.mini-roster-version.is-newer', '.mini-roster-version.is-equal', '.mini-roster-version.is-older', '.mini-roster-version.is-ambiguous']) {
    assert.ok(css.includes(variant), variant + ' must be styled');
  }
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/, 'banner must use tokens, not raw colors');
});
