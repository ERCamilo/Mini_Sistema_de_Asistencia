# Employee Number Conflict Resolution Specification

## Purpose

Define unique employee-number behavior and assisted conflict resolution for manual employee creation and editing.

## Requirements

### Requirement: Normalized Number Uniqueness

The system MUST compare employee numbers by numeric value and MUST NOT save a manual create or edit operation when another employee has the equivalent number.

#### Scenario: Equivalent numbers conflict

- GIVEN employee Ana has number `7`
- WHEN a user attempts to save another employee with number `007`
- THEN the system MUST report a number conflict
- AND MUST NOT mutate employee data

#### Scenario: Current employee is excluded

- GIVEN employee Ana already has number `7`
- WHEN Ana is edited without changing that number
- THEN the system MUST allow the save

### Requirement: Assisted Creation Conflict

When creation conflicts with an existing employee, the system MUST identify that employee and MUST offer recovery without automatically saving data.

#### Scenario: Show conflicting employee

- GIVEN employee Ana has number `7`
- WHEN a new employee is submitted with number `7`
- THEN the conflict UI MUST identify Ana and number `7`
- AND MUST offer editing Ana or returning to change the new number

#### Scenario: Suggest next sequential number

- GIVEN the highest normalized employee number is `20`
- WHEN a creation conflict is shown
- THEN the system MUST offer `21` as the suggested number
- AND selecting it MUST only fill the form field

### Requirement: Assisted Editing Conflict

When an edited employee requests another existing employee's number, the system MUST identify both employees and MAY offer an explicitly confirmed number swap.

#### Scenario: Cancel edit conflict

- GIVEN Ana has number `10` and Bruno has number `20`
- WHEN Ana is edited to number `20` and the conflict is cancelled
- THEN both employees MUST retain their original numbers

#### Scenario: Confirm two-employee swap

- GIVEN Ana has number `10` and Bruno has number `20`
- WHEN Ana requests `20` and the user confirms the swap
- THEN Ana MUST have number `20`
- AND Bruno MUST have number `10`

### Requirement: Identity and Attendance Preservation

Conflict resolution MUST preserve employee IDs and MUST NOT reassign, delete, or duplicate attendance records.

#### Scenario: Swap preserves history

- GIVEN Ana and Bruno have distinct IDs and attendance histories
- WHEN their employee numbers are swapped
- THEN both IDs MUST remain unchanged
- AND each attendance history MUST remain attached to its original ID

### Requirement: First-Slice Boundaries

The system MUST apply this behavior only to manual create/edit operations. It MUST NOT alter existing duplicates or import/restore behavior in this change.

#### Scenario: Existing duplicates remain untouched

- GIVEN persisted data already contains duplicate employee numbers
- WHEN the application loads
- THEN this capability MUST NOT automatically renumber either employee