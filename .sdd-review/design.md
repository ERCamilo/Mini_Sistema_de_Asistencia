# Design: Prevent Duplicate Employee Numbers

## Technical Approach

Keep the completed employee-number domain/coordinator work unchanged, then add a second, dependency-free UI verification seam. Move only the conflict-dialog focus and keyboard behavior currently embedded in `index.html` into `employee-number-modal.js`, a small browser/CommonJS factory that receives a DOM-compatible `document`. Production and tests call the same implementation. Tests use a purpose-built in-repo minimal DOM harness; they do not inspect source strings or reimplement keyboard decisions.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Preserve completed rules/coordinator work as Work Unit 1 | Rewrite the feature | The implementation passes 17 tests and remains within scope; remediation must add evidence, not erase history. |
| Extract real dialog behavior into `employee-number-modal.js` | Extract functions from HTML text in tests; test only pure keyboard actions | A shared production module lets Node execute the exact focus entry/restoration, Escape close, and Tab/Shift+Tab trapping code without fragile source-string assertions. |
| Inject `document` into a browser/CommonJS factory | jsdom/happy-dom; browser automation | The behavior uses a narrow DOM surface. A local test double is smaller, deterministic, offline, and adds no supply-chain dependency. If the DOM surface expands materially, reconsider a standards-complete DOM library. |
| Add `tests/helpers/minimal-dom.js` only for used APIs | Pretend to implement a complete DOM | The harness covers element lookup/query, visibility, class state, active element/focus, attributes, and keyboard-event prevention—nothing more. |
| Assert attendance ownership at runtime by stable ID | Infer preservation from unchanged schema/manual evidence | A fixture with attendance keyed/referenced by employee IDs proves a number swap changes numbers only. |
| Report missing legacy safety nets honestly | Reconstruct retroactive RED evidence | `index.html` and `sw.js` had no pre-existing automated coverage; remediation tests establish a regression net from this point forward. |

## Data Flow

    index.html -> employee-number-modal.js -> injected document
                       ^                         |
                       |                         v
             Node test suite <- minimal DOM harness

    swap coordinator -> new users array
    attendance fixture --unchanged, still resolved by employee ID-->

## File Changes

| File | Action | Description |
|---|---|---|
| `employee-number-rules.js` | Keep | Existing rules/coordinator; no architectural expansion. |
| `employee-number-modal.js` | Create | Shared production focus, Escape, and Tab-trap behavior. |
| `index.html` | Modify | Delegate conflict-dialog DOM behavior to the shared module. |
| `sw.js` | Modify | Precache the new module and bump cache version. |
| `tests/helpers/minimal-dom.js` | Create | Narrow dependency-free DOM test harness. |
| `tests/employee-conflict-modal-dom.test.js` | Create | Execute production dialog behavior against the harness. |
| `tests/employee-conflict-ui.test.js` | Modify | Add runtime attendance ownership assertion for a confirmed swap. |
| `package.json` | Keep | Existing `node --test` command discovers the new tests. |

## Interfaces / Contracts

```js
createEmployeeNumberModal({ document, modalId })
  // { open(returnFocus), close(), handleKeydown(event), getFocusableElements() }
```

The module owns only dialog focus/keyboard mechanics. Conflict state, messages, suggestions, swaps, persistence, and attendance remain in their current layers.

## Testing Strategy

| Layer | Evidence |
|---|---|
| Domain/runtime | Confirmed swap changes two employee numbers while attendance fixture and ID ownership remain unchanged. |
| DOM integration | Execute the production modal module: first visible control receives focus; Escape closes and restores origin; Tab and Shift+Tab wrap; disabled/hidden controls are excluded. |
| Regression | Run the complete `node --test` suite plus syntax and service-worker asset checks. Manual browser checks remain supplementary, never substitutes for executable assertions. |

## Migration / Rollout

No data migration. Work Unit 2 changes verification structure only and preserves feature scope. Cache version changes deploy the added production module.

## Open Questions

None. The user selected `feature-branch-chain` for remediation delivery.