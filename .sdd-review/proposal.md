# Proposal: Prevent Duplicate Employee Numbers

## Intent

Prevent ambiguous employee identification caused by duplicate numbers while helping users resolve conflicts without losing attendance history.

## Scope

### In Scope
- Enforce uniqueness for manual employee creation and editing using numeric normalization (`007` equals `7`).
- Show the conflicting employee when a duplicate is detected.
- On creation, let the user return to the form, edit the existing employee, or fill the suggested `maximum + 1` number for review.
- On editing, allow an explicitly confirmed number swap between two existing employees.
- Preserve employee IDs and attendance ownership during every resolution.

### Out of Scope
- Repairing duplicates already stored.
- Duplicate handling during JSON import or backup restore.
- Automatically saving suggested numbers.
- Renumbering multiple employees.

## Capabilities

### New Capabilities
- `employee-number-conflict-resolution`: Unique normalized employee numbers with assisted create/edit conflict resolution and safe two-employee swaps.

### Modified Capabilities
- None.

## Approach

Add small validation helpers around the existing employee form submission. Resolve conflicts before mutating `users`. Use a dedicated modal to display the conflicting employee and context-specific actions. Suggestions use the highest normalized employee number plus one.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `index.html` employee modal | Modified | Display conflict and resolution actions. |
| `index.html` employee handlers | Modified | Normalize, detect duplicates, suggest, and swap safely. |
| Automated tests | New | Cover normalization and create/edit conflict behavior under Strict TDD. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Wrong employee changed during swap | Low | Use stable IDs and require explicit confirmation. |
| Suggestion saved unintentionally | Low | Fill the field only; require normal form submission. |
| Existing duplicates remain | Medium | Explicitly defer cleanup and avoid worsening stored data. |

## Rollback Plan

Remove the conflict modal and validation helpers, then restore the current create/edit submit handler. Stored employee and attendance schemas remain unchanged.

## Dependencies

- A lightweight automated test harness is required to provide Strict TDD evidence.

## Success Criteria

- [ ] Manual create/edit cannot save numerically equivalent duplicate numbers.
- [ ] Conflicts identify the existing employee and provide the approved resolution actions.
- [ ] Suggestions require user review and submission.
- [ ] Confirmed swaps exchange only the two numbers and preserve IDs and attendance.