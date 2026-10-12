# Private TURN proxy expiry compatibility

## Objective and authorization
Accept the operator-documented nested ICE-server expiry metadata without exposing it as a WebRTC property. Only the development proxy, its focused tests, this task document, and the existing private TURN spec may change. No remote requests, source publication, commits, server restart, or policy changes are authorized for this task.

## Scope and approach
One delegated work unit; forecast under 150 authored changed lines, delivery strategy ask-on-risk. Keep existing origin, token, limits, and root expiry behavior intact. Optional nested `expiresAt` must be a positive safe integer exactly matching root `expiresAt`; strip it from emitted ICE-server objects. Absent metadata remains compatible. Unknown keys remain rejected.

## Tasks and verification
- [x] E1: Add documented unix-seconds response regression and metadata negative controls; observe RED against unchanged proxy.
- [x] E2: Implement minimal acceptance/stripping; observe focused GREEN and check-only TypeScript compilation.
- [x] E3: Update spec, capture hashes and read-only native assessment; hand candidate to parent for independent review before restart.

Runner: compile only scripts/private-turn/tsconfig.json into a new /tmp directory with existing compiler/types; PRIVATE_TURN_TOOL_OUTPUT=<directory> node --test tests/private-turn-proxy.test.js. No app build or full suite.

## Status
Implementation and focused verification complete. RED: 33/34 passed; nested expiry success returned 502 instead of 200 against unchanged source. GREEN: 37/37 passed, zero skipped. Isolated tool compilation and --noEmit succeeded; git diff --check passed. Native mode on (global). Initial read-only assessment returned high/unassessable, review_due=true because the new task file requires explicit untracked inventory declaration. Parent attempted native preflight, which remained blocked on the undocumented intended-untracked selection schema. The user explicitly omitted native review for this candidate only; review mode was not changed and no native receipt exists. Independent verification found no blocker: unchanged source/test hashes, separately compiled tool exit 0, 37/37 focused tests passed, and whitespace clean. Owned server session 15226 was stopped and replaced by session 53713 using the same loopback/private HTTPS configuration. Static HTTPS index returned 200. Live acceptance and commit remain pending. No full npm test or stamping hooks run; repository policy requires full green tests before committing. Engram mirror pending because runtime memory attribution is unavailable.

## Rollback
Remove this isolated metadata normalization and its regression tests/spec paragraph; existing TURN integration is otherwise unchanged. Preserve Serve8443 and parent-owned tunnel. Runtime now uses the independently verified source fix in owned session 53713. Stop that session with Ctrl-C; remove only the private8443 handler with `sudo tailscale serve --https=8443 off` if rolling back the test circuit. Existing443 remains untouched.

## Exact evidence commands
```sh
node /home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin/tsc -p scripts/private-turn/tsconfig.json --typeRoots /home/ubuntu/worktrees/sa-firebase-live-test-20261003/node_modules/@types --outDir /tmp/private-turn-expiry-compat-build
PRIVATE_TURN_TOOL_OUTPUT=/tmp/private-turn-expiry-compat-build node --test tests/private-turn-proxy.test.js
node /home/ubuntu/worktrees/mini-firebase-live-test-20261003/node_modules/typescript/bin/tsc -p scripts/private-turn/tsconfig.json --typeRoots /home/ubuntu/worktrees/sa-firebase-live-test-20261003/node_modules/@types --noEmit
git diff --check
gentle-ai review mode status
gentle-ai review assess --cwd /home/ubuntu/worktrees/mini-private-turn-test-20261008 --json
```
RED and GREEN fixture logs: /tmp/private-turn-expiry-red.txt and /tmp/private-turn-expiry-green.txt; synthetic credentials only. Added negative controls include string, fraction, null, zero, negative, unsafe, mismatched and unrelated expiry metadata. The rollback is one behavior work unit, with tests and docs alongside it; no commit identity yet.

## Operational handoff
Private URL: https://a2.tail2a0a8e.ts.net:8443/. Server loopback19443 forwards through parent-owned tunnel19753; Serve configuration unchanged during restart. No upstream/API requests, real tokens, remote API start, publication, commits, or full suites were performed. Operator-controlled API window and two-device integrated relay/data acceptance remain pending.
