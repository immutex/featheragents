# Latest Handoff

**From:** frame
**To:** build
**Time:** 2026-04-22T22:00:00.000Z
**Task:** mvp-polish / ipc-a / auth-a

## Notes

**MVP sprint status:** The bulk of the 1.0.0-alpha work is complete. dash-b (server), mem-d (memory wiring), dash-c (frontend wiring), dash-d (workflow canvas), mem-e (memory dashboard tab) are all done. Tests are 400/400 green.

**Three tasks remain active:**

1. **`ipc-a`** — Cross-process event relay. The orchestrator needs to append `OrchestratorEvent` JSON lines to `.project-state/events.jsonl`. The dashboard server needs to tail this file and relay events to WS clients. Task file: `project-docs/tasks/ipc-a.md`.

2. **`auth-a`** — `feather auth status/login/logout` CLI command + real provider status in the Connections tab. Claude uses `claude auth login`; non-Claude providers go through Pi's `AuthStorage`. Doctor command needs `claude`/`pi` binary checks added. Task file: `project-docs/tasks/auth-a.md`.

3. **`mvp-polish`** — Tests are already passing. Remaining items: verify architecture.md is complete (done as of this session), bump `package.json` version to `1.0.0-alpha`, commit. Task file: `project-docs/tasks/mvp-polish.md`.

**What is next:** Pick up `ipc-a` and `auth-a` in parallel (no dependency between them). `mvp-polish` is the final gate — do it after the other two are critic-approved.

**Blockers:** None.
