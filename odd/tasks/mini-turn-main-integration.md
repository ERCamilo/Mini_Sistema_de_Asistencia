# Integrate tested TURN with current Mini main

Integrate TURN commit `8b3ff3a42b0892d6967c9d62e3a30af1382ad6cc` into an independent feature branch based on main `91ef02340776e554ca8c3121bacdc9a3ef3bfc17`, preserving both sets of behavior before any future connections UX/UI redesign.

## Scope and authorization
- Local integration only; no source checkout writes, main updates, remote execution, accounts, backend calls, publication, push, or PR.
- Preserve main employee sending, durable report confirmation, manual WhatsApp confirmation, CI scripts and storage/theme fixes alongside TURN data, conflicts, session ownership, and existing connections behavior.
- Keep TURN bootstrap development-injected only; no automatic production activation.
- Resolve eight known conflict files without redesign or new dependencies. Generated JavaScript comes from TypeScript; build stamps come from existing hooks.
- Future connections UX/UI work is a separate, explicitly excluded phase.

## Work unit and routing
One coherent merge work unit with two stable tasks; parent owns the commit and native review. Delegated direct: multi-file merge/conflict resolution and executable verification require a bounded worker. Forecast 100–250 newly authored lines, excluding approximately 16k previously completed imported historical lines and generated normalization. Delivery is local only; no PR requested and no artificial re-slicing of completed history. Rollback boundary is this pending merge, not either source branch. Engram mirror pending: runtime identity attribution unavailable; no memory mutation authorized.

## Tasks and acceptance
- [x] T1: Add integration wiring regression, observe meaningful RED on main, merge pinned TURN, resolve conflicts additively, and observe GREEN. Both script/reset lists, independent employee/Firebase configuration paths and CSS groups must survive. Keep production bootstrap absent.
- [x] T2: Compile tools using existing compiler/types, normalize the existing hook twice with fixed UTC time, verify convergence, and run focused/full unit, CI browser, and local native TURN fixtures. Preserve all source repository/index/content fingerprints and record honest pending checks.

## Verification
RED/GREEN: `node --test tests/turn-main-integration.test.js`. Focused runner includes private-turn, session-manager, connections, employee, hardening, CI pause, and integration tests. Full closure: `npm test`, `npm run test:e2e:ci`, plus both private TURN browser fixtures with explicitly selected existing tools. These fixtures are local synthetic native-browser checks, not physical relay acceptance. No cataloged tutorial flow changed: the catalog contains attendance marking, employee addition and freeing storage, not connections. The full tutorial suite/recordings were not run; the upstream CI browser baseline was preserved. Check diff whitespace, conflict markers, exact imported blobs, generated-output scope, stamps, and read-only source fingerprints.

## Progress and next step
T1 complete: regression RED 0/4 on main, GREEN 4/4 after additive resolution of exactly eight conflict files. Both script families, reset keys, independent configuration paths, style families and development-only bootstrap preserved. Commit identity, risk assessment, native review, and memory mirror remain parent-owned/pending. Version baseline: TURN 2.17.1, main 2.17.2; normalize through the existing hook, never downgrade. Next phase after integration is separately authorized connections UX/UI design.

## Observed evidence
- T1 regression: `node --test tests/turn-main-integration.test.js`: RED 0/4 on main (missing TURN wiring), then GREEN 4/4.
- Focused command: `node --test tests/private-turn*.test.js tests/mini-peer-session-manager.test.js tests/connection-*.test.js tests/employee-*.test.js tests/p2p-hardening-v1.test.js tests/ci-tutorials-pause.test.js tests/turn-main-integration.test.js`: 366/366 passed, zero skipped.
- `npm test`: 1071/1071 passed, zero skipped; `npm run test:e2e:ci`: 30/30 passed, zero skipped. Each full command ran once.
- Existing TypeScript 6.0.3 app build and isolated development-tool compilation passed. Packager compilation passed with TS6 `--ignoreConfig`; the initial file-argument invocation refused without that required flag.
- `node tests/integration/private-turn.browser.cjs` and `node tests/integration/private-turn-mini-backup.browser.cjs`: initial supplied-wrapper runs failed at HTTPS page load because its hardcoded launch arguments discarded the fixture SPKI allowlist. Parent authorized one external tool-output compatibility wrapper retaining passed arguments and existing Chromium/offline/no-sandbox controls. One corrected configured run of each passed; no global certificate bypass or repository assertion change.
- Corrected fixtures: six synthetic app modes, host-only bidirectional SA/Mini exchange, six native host backup transfers, consent, shared bidirectional leases, simultaneous demand, retirement/expiry wake and menu focus passed. Both reported zero external requests and `liveTurnProof: false`.
- Existing hook ran twice byte-convergently with fixed `MINI_BUILD_TIME=2026-10-15T23:34:06.000Z`, after app compilation. Version 2.17.3 and both package versions agree; generated stamp/cache hashes remained unchanged through verification. Isolated `core.hooksPath` is `.githooks`.
- All main package scripts, script registrations and precache assets remain; 28 main employee/report/test files are byte-identical to main. Main additions in the three automatic core/storage/theme merges remain. TURN provider/proxy/session manager are byte-identical to the source pin.
- Delta before new documentation/tests: 129 imported/integrated tracked paths, 16254 additions and 337 deletions; 117 paths are exact TURN blobs. The other twelve are eight known conflicts, three automatic overlapping merges and removal of one imported test trailing space. No generated output expanded the authorized surfaces.
- Four protected Mini repositories and read-only SA fixture matched before/after fingerprints for HEAD, main ref (including absent ref), index entries, staged diff, status, dirty diff and tracked content. External recovery logs retain the comparisons and exact runner output.
- Whitespace and conflict-marker checks passed after staging. Main design section 8.9 remains; imported organization/notification sections are 8.10/8.11 with references updated.

## Handoff
Worker implementation and checks are complete; no commit was created. HEAD remains `91ef02340776e554ca8c3121bacdc9a3ef3bfc17`; MERGE_HEAD remains `8b3ff3a42b0892d6967c9d62e3a30af1382ad6cc`. Parent owns commit, independent verification/risk/native-review decisions, and recovery mirror synchronization. Physical/live TURN relay acceptance, remote publication and the separate future UX/UI redesign remain pending/out of scope.
