# Task: orch-b

> **Status: Done**

> Claude Code Runner — Orchestrator Layer Phase B

## Goal
Implement the subprocess runner that spawns Claude Code for a given task + phase, streams output line-by-line, detects completion via state.json, and manages session ID continuity across phases. No loop logic, no TUI, no approval gates — pure runner + session helpers.

## Files

**Created:**
- `src/orchestrator/runner.ts` — `runClaudeCodePhase(task, phase, onLine, config)` implementation
- `src/orchestrator/session.ts` — session ID discovery helpers
- `src/orchestrator/events.ts` — event type definitions (used by runner; loop and TUI wire them later)
- `src/orchestrator/index.ts` — public surface re-exports for the orchestrator module
- `test/orchestrator/runner.test.ts` — unit tests with a mock `claude` binary

**Modified:**
- `project-docs/tasks/orch-b.md` — update runner task notes to match the actual Claude Code CLI (`--session-id`) and confirmed session directory encoding

## Done Criteria
- [ ] `runClaudeCodePhase` spawns `claude --print -p "<prompt>"` (first run) or `claude --print --session-id <id> -p "<prompt>"` (subsequent runs) using `execa`
- [ ] `onLine` callback receives each stdout line as it streams — not buffered until exit
- [ ] On subprocess exit: re-reads state.json; if `phaseCompletions` contains an entry for this phase → returns `{ status: 'ok' }`; otherwise → returns `{ status: 'stuck' }`
- [ ] Hard timeout (from `config.orchestrator.timeouts.phaseMinutes`) kills the subprocess and returns `{ status: 'timeout' }`
- [ ] Non-zero exit code with no phase completion → returns `{ status: 'failed', stderr }`
- [ ] `session.ts` discovers the Claude Code session UUID after first run by scanning `~/.claude/projects/<encoded-cwd>/` for the newest `.jsonl` session file
- [ ] On successful session discovery, the runner persists `sessionId` to `task.sessionId` in state.json before returning
- [ ] `bun test test/orchestrator/runner.test.ts` passes using a mock `claude` script on PATH
- [ ] `bun run build` passes with no type errors

## Investigation Required (do first, before coding)

**Session ID discovery:** Claude Code stores sessions in `~/.claude/projects/`. On this machine, the directory name is the absolute cwd with `/` replaced by `-` (for example `/home/mutex/Projects/featheragents` → `-home-mutex-Projects-featheragents`). Session files are UUIDs with `.jsonl` extension. After the first subprocess exits, the runner should:
1. Resolve the project directory key under `~/.claude/projects/`
2. Find the newest `.jsonl` file in that directory (by mtime)
3. Extract the UUID from the filename (strip `.jsonl`)
4. This is the session ID to persist

Implementation note:

```ts
const key = process.cwd().replace(/\//g, '-');
const sessionsDir = path.join(os.homedir(), '.claude', 'projects', key);
```

**Session flag format:** Verified locally: use `claude --session-id <uuid>` with a bare UUID.

## Constraints
- Use `execa` (already in deps) — not raw `child_process.spawn`
- ESM only, `.js` extensions in all import specifiers
- No `console.log` — runner output goes through the `onLine` callback; errors/warnings use `console.error` only if inside `src/mcp/`; elsewhere use the existing `src/utils/logger.ts`
- The prompt passed to Claude Code must always end with a reference to calling `mcp__featherkit__mark_phase_complete` — this is the completion contract
- Working directory for the subprocess must be the project root (`process.cwd()` at invocation time), not the FeatherKit package dir
- `runClaudeCodePhase` must not throw — always return a `PhaseRunResult` with a `status` field; callers should not need try/catch

## Interfaces (implement these exactly)

```ts
// events.ts
export type OrchestratorEvent =
  | { type: 'phase:start';    taskId: string; phase: string }
  | { type: 'phase:stdout';   line: string }
  | { type: 'phase:complete'; taskId: string; phase: string; status: PhaseRunStatus; durationMs: number }
  | { type: 'phase:failed';   taskId: string; phase: string; reason: string };

// runner.ts
export type PhaseRunStatus = 'ok' | 'timeout' | 'failed' | 'stuck';

export interface PhaseRunResult {
  status: PhaseRunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runClaudeCodePhase(
  task: TaskEntry,
  phase: ModelRole,
  onLine: (line: string) => void,
  config: FeatherConfig,
): Promise<PhaseRunResult>
```

## Prompt Template

The prompt injected into `claude --print -p "..."`:

```
Run the /<phase> skill on task <taskId>.
Task file: project-docs/tasks/<taskId>.md
When done, call mcp__featherkit__mark_phase_complete with taskId="<taskId>", phase="<phase>", and a 1–3 sentence summary.
```

For the critic phase, also add:
```
Include a verdict field: "pass" if the changes meet all done criteria, "fail" if there are blocking issues, "warn" if there are minor concerns.
```

## Risks
- `~/.claude/projects/` encoding scheme may differ from what's assumed (URL encoding, base64, hash). Investigate before coding session.ts.
- Claude Code CLI behavior could drift in future releases; this phase is intentionally pinned to the locally verified `--session-id <uuid>` form.
- Session file mtime-based discovery is racy if multiple Claude Code processes run concurrently (acceptable for v1, document the assumption).
- Timeout kill on Windows differs from POSIX (`SIGKILL` vs task kill) — Node 22 on Linux (current platform) is fine; add a `// TODO: Windows` comment if relevant.
- `execa` streaming: use the async iterable stdout interface, not `.stdout.pipe()`, to avoid backpressure issues on long agent runs.

## Next Action
1. Read `src/config/schema.ts` (for `TaskEntry`, `FeatherConfig`, `ModelRole`) and `src/utils/logger.ts` (for the logger API).
2. Implement `session.ts` first (pure file-system logic, easy to unit test).
3. Then implement `runner.ts`.
4. Write the test last.
