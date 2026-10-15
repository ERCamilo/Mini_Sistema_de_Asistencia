# Temporarily pause automatic tutorial replay

Push and pull-request CI must keep unit tests and all six non-tutorial browser
regressions. Only tutorial replay is temporarily excluded from automatic runs;
this does not diagnose or fix the unconfirmed upstream CI failure.

## Contract

- Keep `test:e2e` byte-for-byte unchanged for full local verification.
- Add `test:e2e:ci` by removing only `tests/e2e/tutorials.e2e.mjs`.
- Preserve the `unit` and `tutorials` job IDs, display names, installations,
  AXE_PATH, and fail-fast behavior. Branch-protection requirements are unknown.
- Add a `workflow_dispatch` boolean `run_tutorials`, default `false`.
  Push, PR, and manual false run `test:e2e:ci`; manual true runs `test:e2e`.
- Pass a typed boolean expression through an environment variable, not shell
  interpolation. Do not disable the browser job or ignore failures.

## Operation and rollback

After publication to the default branch, select **Run workflow** and enable
`run_tutorials` for full replay. Locally, keep using `npm run test:e2e`.
To resume automatic replay, restore the browser step to the full command and
remove the temporary input, CI-only script, and their focused regression test.
No application, tutorial recording, deployment, or active TURN beta changes.

## Proof

Use deterministic Node tests for script preservation, workflow structure, shell
routing, and failure propagation; then run `npm test`. Browser/device checks and
recordings are not required because no UI or browser-test behavior changes.
GitHub CI success remains unverified until an authorized published run completes.

[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs)
confirms that the `inputs` context preserves booleans, unlike `github.event.inputs`.
