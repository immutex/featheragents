# Task: orch-e

> **Status: Done**

> TUI Dashboard — Orchestrator Layer Phase E

## Goal
Replace the plain `stderr` event log with a live pi-tui dashboard showing the current task, phase progress, and a streaming ring-buffer of Claude Code output. Add a `--no-tui` flag to `feather orchestrate` for headless/CI use. The headless path (`plainLogEvent`) already works and must not regress.

## Files

**Created:**
- `src/orchestrator/tui/dashboard.ts` — `createDashboard(config)` factory
- `src/orchestrator/tui/stream.ts` — ring-buffer `StreamView` component
- `test/orchestrator/tui.test.ts` — focused unit test for the ring-buffer stream view

**Modified:**
- `src/commands/orchestrate.ts` — add `--no-tui` flag; conditionally mount dashboard or fall back to `plainLogEvent`; thread `stop/start` hooks into gate calls for terminal hand-off
- `src/orchestrator/gates.ts` — accept optional suspend/resume hooks and suspend interactive gates for terminal hand-off
- `test/orchestrator/gates.test.ts` — verify editor gate suspend/resume hooks fire
- `package.json` — add `@mariozechner/pi-tui` runtime dep
- `bun.lock` — record the installed pi-tui dependency in Bun’s lockfile

## Done Criteria
- [x] `bun add @mariozechner/pi-tui` succeeds and the package appears in `dependencies`
- [x] `bun run build` passes with no type errors
- [x] Running `feather orchestrate --dry-run` renders the TUI dashboard without flickering (manual verify)
- [x] `phase:stdout` events populate the stream view live; only the last `config.orchestrator.tui.maxStreamLines` lines are visible
- [x] `phase:start` event updates the phase indicator (shows current phase as `⋯`)
- [x] `phase:complete` event marks the completed phase as `✓` in the phase indicator
- [x] `task:done` event updates the header to show the task as done
- [x] `--no-tui` flag skips dashboard entirely and writes the existing `plainLogEvent` lines to stderr — no regression on headless behavior
- [x] TUI is suspended (`tui.stop()`) before the editor gate spawns and resumed (`tui.start()`) after — no terminal corruption

## Dependencies

Install: `@mariozechner/pi-tui` (currently at `0.68.0`, ESM, `"type": "module"`, main entry `dist/index.js`).

API reference (confirmed from source):
```ts
import { TUI, ProcessTerminal, Container, Box, Text } from '@mariozechner/pi-tui';

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
tui.addChild(component);
tui.start();   // begins render loop
tui.stop();    // stops render loop, restores terminal
```
- `Text(content, paddingX?, paddingY?, bgFn?)` — `text.setText(newContent)` to update
- `Loader(tui, spinnerColorFn, msgColorFn, msg?)` — `loader.start()` / `loader.stop()`
- All updates via setter methods — pi-tui diffs and only redraws changed lines

## Dashboard Interface

```ts
// src/orchestrator/tui/dashboard.ts
export interface Dashboard {
  onEvent: (event: OrchestratorEvent) => void;
  stop: () => void;
  start: () => void;
  cleanup: () => void;   // final teardown
}

export function createDashboard(config: FeatherConfig): Dashboard
```

`orchestrate.ts` wires it:
```ts
const useTui = !options.noTui && config.orchestrator.tui.enabled && process.stdout.isTTY;
const dashboard = useTui ? createDashboard(config) : null;

// hooks:
hooks = {
  onEvent: dashboard ? dashboard.onEvent : plainLogEvent,
  onGateRequired: makeGateHook(config, {
    onSuspend: () => dashboard?.stop(),
    onResume:  () => dashboard?.start(),
  }),
};
```

Update `makeGateHook` signature in `gates.ts` to accept optional suspend/resume callbacks:
```ts
export function makeGateHook(
  config: FeatherConfig,
  terminalHooks?: { onSuspend?: () => void; onResume?: () => void },
): (task: TaskEntry, phase: 'frame' | 'sync') => Promise<void>
```

## Dashboard Layout

Four `Text` regions stacked in a root `Container`:

```
┌──────────────────────────────────────────────────────────────┐
│  FeatherKit Orchestrator — <projectName>                     │
│  Task: <id> — <title>   Session: <sessionId | 'none'>        │
├──────────────────────────────────────────────────────────────┤
│  frame  ▶  build  ▶  critic  ▶  sync                         │
│   ✓           ⋯         ·          ·                         │
├──────────────────────────────────────────────────────────────┤
│  (last maxStreamLines lines of stdout)                       │
│  > <line 1>                                                  │
│  > <line N>                                                  │
├──────────────────────────────────────────────────────────────┤
│  History                                                     │
│  ✓ frame   12:14  45s   approved (edited)                    │
│  ⋯ build   12:15  running…                                   │
└──────────────────────────────────────────────────────────────┘
```

- Header `Text`: updated on `phase:start` (task/session info), `task:done`
- Phase indicator `Text`: updated on `phase:start`, `phase:complete`, `phase:failed`
- Stream `Text` (backed by `StreamView` ring buffer): updated on every `phase:stdout`
- History `Text`: one line appended per `phase:complete` / `phase:failed`

Dashboard state is a plain object (not in state.json) — it's display-only and ephemeral.

## StreamView (ring buffer)

```ts
// src/orchestrator/tui/stream.ts
export class StreamView {
  private lines: string[] = [];
  private maxLines: number;

  constructor(maxLines: number) { this.maxLines = maxLines; }

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) this.lines.shift();
  }

  render(): string {
    return this.lines.map(l => `> ${l}`).join('\n');
  }
}
```

Dashboard holds a `StreamView` instance; on `phase:stdout` event calls `stream.push(line)` then `streamText.setText(stream.render())`.

## `orchestrate.ts` Changes

1. Add `--no-tui` option to the command.
2. Add `noTui` to `OrchestrateCommandOptions`.
3. Move `makeGateHook` invocation after dashboard creation so `onSuspend`/`onResume` callbacks can reference the dashboard.
4. Call `dashboard?.cleanup()` in the `finally` block after `releaseLock()`.
5. `tui.stop()` must be called in the SIGINT handler too — before `releaseLock()`.

## Constraints
- ESM only, `.js` import extensions
- Dashboard must never throw — wrap all `tui.*` calls in try/catch; on error fall back to `plainLogEvent` silently
- TUI must not start if `process.stdout.isTTY` is false — detect before calling `tui.start()`
- Do not add color/ANSI to the `plainLogEvent` path — it must remain clean for pipe consumers
- `StreamView` is a plain class, not a pi-tui component — it owns the data, pi-tui `Text` owns the rendering
- Keep `dashboard.ts` under ~120 lines — if it grows beyond that, it's doing too much

## Risks
- `tui.stop()` / `tui.start()` around the editor gate: if the gate throws before `tui.start()` is called, the terminal is left stopped. The `onResume` callback must be called in a `finally` block inside `makeGateHook`'s editor path.
- pi-tui `ProcessTerminal` writes to stdout, but the orchestrator's event log currently writes to stderr. Verify these don't interfere — pi-tui should own stdout for rendering; `plainLogEvent` and other logging should remain on stderr.
- `@mariozechner/pi-tui` uses `"main": "dist/index.js"` (no `exports` field). ESM import via `import ... from '@mariozechner/pi-tui'` should work with Node 22 but verify that tsup bundles it correctly (may need `noExternal: ['@mariozechner/pi-tui']` in `tsup.config.ts`).
- If pi-tui requires `process.stdin` in raw mode, the SIGINT handler in `orchestrate.ts` will no longer fire via the default Node signal. After `tui.start()`, verify SIGINT still triggers the handler (pi-tui may intercept Ctrl-C for its own use).

## Next Action
1. Run `bun add @mariozechner/pi-tui` and verify it installs cleanly.
2. Read `src/commands/orchestrate.ts` (full file) and `src/orchestrator/gates.ts` to understand the current wiring.
3. Write `stream.ts` first (pure data, no pi-tui dep, easy to reason about).
4. Then `dashboard.ts`.
5. Then modify `orchestrate.ts` and `gates.ts`.
6. Manual smoke test: `feather orchestrate --dry-run` with a pending task.
