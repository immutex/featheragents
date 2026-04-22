# Task: orch-c

> **Status: Done**

> State Loop & Lock — Orchestrator Layer Phase C

## Goal
Implement the orchestrator's main loop (task-picking, phase sequencing, critic loopback) and the project lock (PID-based, heartbeat, stale-lock detection), then wire a minimal `feather orchestrate` CLI command so the loop can be invoked end-to-end for smoke testing. No TUI, no approval gates yet — those are Phase D and E.

## Files

**Created:**
- `src/orchestrator/loop.ts` — `runOrchestrator(config, hooks, opts)` main loop
- `src/orchestrator/lock.ts` — `acquireLock(config)` → returns async release fn
- `src/commands/orchestrate.ts` — `feather orchestrate [--task <id>] [--once] [--dry-run]` command
- `test/orchestrator/loop.test.ts` — unit tests with a mock runner

**Modified:**
- `src/orchestrator/events.ts` — add gate + task events missing from orch-b
- `src/cli.ts` — register `orchestrateCommand`
- `test/generators.test.ts` — refresh stale MCP config expectations so the full suite matches the current generator behavior
- `test/templates.test.ts` — refresh stale OpenCode template expectations so the full suite matches the current template behavior

## Done Criteria
- [x] `runOrchestrator` with a mock runner that returns `'ok'` for all phases drives a task all the way from `frame` → `build` → `critic` (pass) → `sync` and marks it `done`
- [x] Critic `fail` verdict correctly loops back to `build`; after build re-runs and critic subsequently passes, advances to `sync`
- [x] Task-picking prefers `currentTask` in state.json; falls back to oldest `pending` task with satisfied dependencies
- [x] `acquireLock` writes `state.orchestrator = { status: 'running', pid, startedAt, heartbeatAt }` and starts heartbeat interval
- [x] Second call to `acquireLock` on same project (PID alive) throws with a clear message including the existing PID
- [x] Stale lock (PID not in process table via `process.kill(pid, 0)`) is cleared and acquisition succeeds with a logged warning
- [x] `release()` returned by `acquireLock` clears heartbeat interval and writes `status: 'idle'` to state
- [x] SIGINT (Ctrl-C) in `orchestrate.ts` calls `release()` before exiting — no stale lock left behind
- [x] `--dry-run` flag logs what would run without calling `runClaudeCodePhase`
- [x] `feather orchestrate --help` shows the flag descriptions
- [x] `bun run build` passes, `bun test test/orchestrator/loop.test.ts` passes

## Interfaces (implement these exactly)

```ts
// events.ts additions
export type OrchestratorEvent =
  // existing from orch-b (keep):
  | { type: 'phase:start';    taskId: string; phase: string }
  | { type: 'phase:stdout';   line: string }
  | { type: 'phase:complete'; taskId: string; phase: string; status: PhaseRunStatus; durationMs: number }
  | { type: 'phase:failed';   taskId: string; phase: string; reason: string }
  // new in orch-c:
  | { type: 'gate:awaiting';  taskId: string; phase: 'frame' | 'sync' }
  | { type: 'gate:approved';  taskId: string; phase: 'frame' | 'sync' }
  | { type: 'task:done';      taskId: string }
  | { type: 'orchestrator:lock-acquired'; pid: number }
  | { type: 'orchestrator:lock-released' }
  | { type: 'orchestrator:stale-lock-cleared'; stalePid: number };

// loop.ts
export interface OrchestratorHooks {
  // Called before advancing after 'frame' or before starting 'sync'.
  // If undefined, loop auto-proceeds (no gate).
  onGateRequired?: (task: TaskEntry, phase: 'frame' | 'sync') => Promise<void>;
  // Event bus — all orchestrator events routed here.
  onEvent?: (event: OrchestratorEvent) => void;
}

export interface OrchestratorRunOpts {
  taskId?: string;  // target a specific task; otherwise auto-pick
  once?: boolean;   // run one task then exit (default: loop until no pending tasks)
  dryRun?: boolean; // log what would run, don't spawn Claude Code
}

export async function runOrchestrator(
  config: FeatherConfig,
  hooks?: OrchestratorHooks,
  opts?: OrchestratorRunOpts,
): Promise<void>

// lock.ts
export async function acquireLock(config: FeatherConfig): Promise<() => Promise<void>>
```

## Phase Sequencing Logic

The loop determines the next phase from `task.phaseCompletions[]` using timestamp comparison, not a simple "what's missing" check. This correctly handles the critic-fail loopback:

```ts
const PHASE_ORDER = ['frame', 'build', 'critic', 'sync'] as const;

function nextPhase(task: TaskEntry): ModelRole | null {
  const completions = task.phaseCompletions ?? [];

  const done = (phase: ModelRole) => completions.some(c => c.phase === phase);
  const lastOf = (phase: ModelRole) =>
    [...completions].reverse().find(c => c.phase === phase);

  if (!done('frame')) return 'frame';

  const lastBuild = lastOf('build');
  if (!lastBuild) return 'build';

  const lastCritic = lastOf('critic');
  if (!lastCritic) return 'critic';

  // critic ran after latest build
  if (lastCritic.completedAt > lastBuild.completedAt) {
    if (lastCritic.verdict === 'fail') return 'build';  // loop back
    if (!done('sync')) return 'sync';
    return null;  // all done
  }

  // build ran after latest critic (re-build after fail) → run critic again
  return 'critic';
}
```

## Gate Handling in the Loop

The loop should call `hooks.onGateRequired` before advancing past `frame` and before starting `sync`. If the hook is undefined (Phase C default), log a note and proceed automatically:

```ts
if (phase === 'frame' || phase === 'sync') {
  emit({ type: 'gate:awaiting', taskId: task.id, phase });
  if (hooks?.onGateRequired) {
    await hooks.onGateRequired(task, phase);
  }
  emit({ type: 'gate:approved', taskId: task.id, phase });
}
```

## `orchestrate.ts` Command (minimal)

```ts
feather orchestrate [--task <id>] [--once] [--dry-run]
```

- Loads config via `loadConfig()`.
- Calls `acquireLock(config)`.
- Registers SIGINT handler → `release()` → `process.exit(130)`.
- Calls `runOrchestrator(config, { onEvent: plainLogEvent }, opts)`.
- `plainLogEvent` writes to `process.stderr` as `[feather] <type> ...` — no color, just enough for smoke testing. (TUI replaces this in Phase E.)
- Calls `release()` on normal exit.

## Constraints
- ESM only, `.js` import extensions
- `runOrchestrator` must not throw — catch errors per-phase and emit `phase:failed`; let the loop continue to the next task
- Lock heartbeat interval: use `config.orchestrator.timeouts.idleHeartbeatMinutes * 60_000` ms
- `runClaudeCodePhase` is injected via a parameter in tests (dependency injection) — the real loop imports it directly; the test overrides it via a module mock or a `runPhase` parameter on `runOrchestrator`
- Do not import from `src/mcp/` in the loop or lock — those are server-side; use `loadState`/`saveState` from `src/mcp/state-io.ts` directly (already done in runner.ts)
- The `--dry-run` flag must be clearly distinguishable in the log output from a real run

## Risks
- `process.kill(pid, 0)` throws `EPERM` if the PID exists but is owned by a different user — treat EPERM as "process exists" (lock is live), not as "no process". Only `ESRCH` means stale.
- Phase completion timestamp comparison relies on ISO string lexicographic ordering — this is correct as long as all timestamps come from `new Date().toISOString()` (they do, per existing code).
- SIGINT handler must call `release()` synchronously-enough that the process doesn't hard-exit before writing `status: 'idle'`. Use `process.exitCode = 130` + await release + then `process.exit()` to ensure the write completes.
- Infinite critic-loopback: v1 has no loop count limit. Document this; add a `maxLoopbacks` config option as a follow-up if needed.

## Next Action
1. Read `src/orchestrator/runner.ts` for the `runClaudeCodePhase` signature.
2. Read `src/mcp/state-io.ts` for `loadState`/`saveState`/`loadConfig`.
3. Implement `lock.ts` first (simplest, no runner dependency).
4. Then `loop.ts`.
5. Then `commands/orchestrate.ts` + `cli.ts` wire-up.
6. Tests last.
