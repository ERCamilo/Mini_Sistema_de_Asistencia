# TypeScript Pilot — employee-number-rules

## Status
- Result: Complete; tsc-only pilot, verified safe (tsc build clean, 20/20 tests green before and after)
- Decision: TypeScript IS worth adopting **incrementally for new code** (write the OCR feature in TS). Type value is currently CAPPED until the `index.html` call sites are also type-checked.
- Date: 2026-06-21

## What was done
- Ported `employee-number-rules.js` -> `src/employee-number-rules.ts` (typed domain model, UMD wrapper kept intact).
- Added `tsconfig.json` (tsc-only: `module:"none"`, `strict`, `esModuleInterop:false`, `rootDir:src`, `outDir:.`).
- `package.json`: added `typescript` devDependency, scripts `build: tsc` and `pretest: tsc`.
- Emitted `employee-number-rules.js` at repo root is functionally identical: same filename, same `window.EmployeeNumberRules` global, same `module.exports`, no `__esModule`/ESM shim. `index.html` and `sw.js` untouched.

## Toolchain decision (why tsc-only, not esbuild/vite)
esbuild/vite default to ESM + hashed filenames, which would force changes to `index.html` (`type=module`), the `sw.js` precache list, and `node --test` imports. tsc-only with `module:"none"` + the hand-written UMD wrapper keeps the emitted output a classic browser-global script AND CommonJS, preserving offline precache, zero-runtime-deps, and the "git push = deploy" model.

## Verdict (is it worth it?)
- Friction: LOW (1 devDep, ~14-line tsconfig, deploy unchanged). Cost: maintain `.ts` source + commit the generated `.js`; the UMD wrapper is hand-maintained.
- Value: REAL but CAPPED — types protect the module internals, not the callers, because the `index.html` inline script is still untyped. Full value needs the call sites under `// @ts-check` or extracted to `.ts` (incremental, not big-bang).
- Recommendation: write the OCR import feature (#3/#4) in TS from the start; the pilot proved low friction and the domain types catch exactly the import-feature failure modes.

## Invariants surfaced by the types (pre-existing, preserved with documented casts)
1. `saveEmployeeDraft` create-path id: `draft.id || newEmployeeId` can be `undefined` if a caller omits `newEmployeeId` on the create path. Safe today (the only call site, `index.html:2252`, passes `Date.now().toString()`). MUST be guaranteed by the OCR import for every imported employee.
2. `resolveEmployeeNumberConflict` swap-path: `editedEmployeeId` cast non-null; provably safe (`operation==='edit'` implies a non-null `editedEmployeeId` via `createConflict`).

## Maintenance gotcha
`typescript` resolved to v6.0.3, which deprecates `module:"none"` and `esModuleInterop:false` (silenced via `ignoreDeprecations:"6.0"`). A future TS major may remove `module:"none"`; revisit then — the hand-written UMD wrapper is the controlled part, only the emit-mode flag would need changing.
