# Task: orch-d

> **Status: Done**

> Approval Gates — Orchestrator Layer Phase D

## Goal
Implement the two blocking approval gates (after `frame`, before `sync`) and the `feather approve` command for async approval, then wire them into the `feather orchestrate` command via the existing `OrchestratorHooks.onGateRequired` injection point. This is the user-control layer — everything else in the orchestrator runs automatically; these gates are the explicit stops.

## Files

**Created:**
- `src/orchestrator/gates.ts` — `makeGateHook(config)` factory + gate implementations
- `src/commands/approve.ts` — `feather approve <task-id>` command
- `test/orchestrator/gates.test.ts` — unit tests for gate logic

**Modified:**
- `src/orchestrator/loop.ts` — allow `GatePauseError` to bubble to the command layer instead of being swallowed as a normal gate failure
- `src/commands/orchestrate.ts` — wire `makeGateHook(config)` as `hooks.onGateRequired`
- `src/cli.ts` — register `approveCommand`
- `test/orchestrator/loop.test.ts` — update existing orchestrate command dependency injection for the new `makeGateHook` parameter

## Done Criteria
- [x] `editor` gate mode spawns `$EDITOR` (or `config.orchestrator.approvalGate.editor` if set) on the task file, blocks until the editor process exits, detects whether the file was modified (mtime comparison), and writes an `ApprovalRecord` to state.json
- [x] `prompt` gate mode (sync gate default) prints a `git diff --stat HEAD` summary, asks "Proceed with sync? (y/N)" via `@inquirer/prompts confirm`, blocks until answered; `n` or Ctrl-C aborts the orchestrator run gracefully (not an error — task stays at pre-sync state, lock released)
- [x] `pause` gate mode writes `state.orchestrator.status = 'awaiting-approval'` and throws a `GatePauseError` that `orchestrate.ts` catches, releases the lock cleanly, and exits 0
- [x] `auto` gate mode writes an `ApprovalRecord` with `modified: false` and returns immediately — no user interaction
- [x] `feather approve <task-id>` writes an `ApprovalRecord` for the awaiting phase, prints "Approval recorded. Resume with: feather orchestrate --task <task-id>", exits 0
- [x] `feather approve <task-id> --reject` sets task status to `blocked` in state.json and prints a rejection message
- [x] `feather orchestrate` with default config (`approvalGate.frame: 'editor'`) calls the gate hook for both `frame` and `sync` phases
- [x] Approval records appear in `state.json` under `task.approvals[]` after each gate completes
- [x] `bun run build` passes, `bun test test/orchestrator/gates.test.ts` passes

## Interfaces

```ts
// gates.ts
export class GatePauseError extends Error {
  constructor(public readonly taskId: string, public readonly phase: 'frame' | 'sync') {
    super(`Gate paused for task ${taskId} phase ${phase}`);
    this.name = 'GatePauseError';
  }
}

export function makeGateHook(
  config: FeatherConfig,
): (task: TaskEntry, phase: 'frame' | 'sync') => Promise<void>
```

The factory returns the function that matches `OrchestratorHooks['onGateRequired']`. `orchestrate.ts` calls:
```ts
hooks: { onGateRequired: makeGateHook(config), onEvent: plainLogEvent }
```

## Gate Implementation Details

### Editor gate (`approvalGate.frame === 'editor'`)

```
1. Resolve task file path: path.join(config.docsDir, 'tasks', task.id + '.md')
2. Stat the file → record mtime before
3. Resolve editor binary: config.orchestrator.approvalGate.editor ?? process.env.EDITOR ?? 'vi'
4. execa(editorBinary, [taskFilePath], { stdio: 'inherit', reject: false })
   — stdio: 'inherit' so the editor gets the real terminal
5. Await subprocess exit
6. Stat the file again → compare mtime
7. Write ApprovalRecord { phase: 'frame', approvedAt: now, modified: mtimeAfter > mtimeBefore, mode: 'editor' }
8. saveState(...)
```

### Prompt gate (`approvalGate.sync === 'prompt'`)

```
1. Run: git diff --stat HEAD (via execa, capture stdout, reject: false)
2. Print the diff stat to stderr (so it shows alongside the event log)
3. const confirmed = await confirm({ message: 'Proceed with sync?' })
   — from @inquirer/prompts
4. If confirmed: write ApprovalRecord { phase: 'sync', ... mode: 'prompt' }, return
5. If not confirmed: write lock release to state, throw a GatePauseError
   (orchestrate.ts already catches GatePauseError from gate hook → releases lock → exit 0)
```

### Pause gate (`approvalGate.frame === 'pause'` or `approvalGate.sync === 'pause'`)

```
1. Save state with orchestrator.status = 'awaiting-approval'
2. throw new GatePauseError(task.id, phase)
```

### Auto gate

```
1. Write ApprovalRecord { modified: false, mode: 'auto' }
2. return immediately
```

## `GatePauseError` handling in `orchestrate.ts`

Add to the `try/finally` block:

```ts
try {
  await deps.runOrchestrator(config, hooks, opts);
} catch (error) {
  if (error instanceof GatePauseError) {
    deps.writeStderr(`[feather] gate:paused task=${error.taskId} phase=${error.phase}\n`);
    deps.writeStderr(`[feather] Resume with: feather orchestrate --task ${error.taskId}\n`);
    // fall through to finally (lock release)
    return;
  }
  throw error;
} finally {
  await releaseLock();
}
```

## `feather approve` command

```
feather approve <task-id> [--phase <frame|sync>] [--reject]
```

Behavior:
1. `loadConfig()` + `loadState()`
2. Find the task — error if not found
3. If `--reject`: set `task.status = 'blocked'`, save, print rejection message, exit
4. Otherwise: write `ApprovalRecord` with `mode: 'pause'` + current timestamp
5. Clear `state.orchestrator.status` from `awaiting-approval` back to `idle`
6. `saveState()`
7. Print "Approval recorded. Resume with: feather orchestrate --task <task-id>"

## Constraints
- `stdio: 'inherit'` is required for the editor spawn — otherwise vim/nano can't take over the terminal
- ESM only, `.js` import extensions
- `@inquirer/prompts` is already in deps — no new runtime deps needed
- `execa` is already in deps — use it for both the editor spawn and `git diff --stat`
- The gate hook must not leave state.json in a half-written state if the editor is killed mid-write — the mtime comparison is a best-effort heuristic; document that forced editor kills may leave modified: false
- `GatePauseError` must be exported from `gates.ts` so `orchestrate.ts` can `instanceof` check it without circular imports
- Do not import from `src/mcp/` — use `loadState`/`saveState` from `src/mcp/state-io.ts` directly

## Risks
- `stdio: 'inherit'` for the editor subprocess requires the process to be running in an interactive terminal; if `feather orchestrate` is piped or run in CI, the editor gate will fail. Detect `process.stdin.isTTY` and print a clear error if false (suggest switching to `approvalGate.frame: 'auto'`).
- `$EDITOR` may be unset on some systems. Default to `vi` as a last resort; document this in the `feather doctor` check (orch-g).
- `git diff --stat HEAD` may show nothing if no commits exist yet — handle gracefully, print "(no prior commits)" instead of erroring.
- `confirm()` from `@inquirer/prompts` throws on Ctrl-C — catch `ExitPromptError` and treat as "N" (abort gate, throw GatePauseError).
- The `pause` gate for `sync` produces a confusing UX because the user must re-run the orchestrator to get to sync again — the print message after `feather approve` should make this explicit.

## Next Action
1. Read `src/commands/orchestrate.ts` to understand the `OrchestratorHooks` wiring and the try/finally structure to modify.
2. Read `src/config/schema.ts` for `ApprovalRecordSchema` and `OrchestratorConfig` shapes.
3. Read `src/mcp/state-io.ts` for `loadState`/`saveState`.
4. Implement `gates.ts` first. Then `approve.ts`. Then modify `orchestrate.ts`. Then `cli.ts`. Tests last.
