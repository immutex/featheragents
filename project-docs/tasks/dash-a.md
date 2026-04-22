# Task: dash-a

> **Status: Done**

## Goal
Replace the hardcoded `frame → build → critic → sync` FSM in `src/orchestrator/loop.ts:nextPhase()` with a configurable workflow DAG engine. Ship a `default.json` that reproduces the current behavior exactly — zero behavior change, but the orchestrator now reads its phase ordering from a file instead of hardcoded logic.

## Files
- **`src/workflow/schema.ts`** *(new)* — Zod schemas: `WorkflowNodeSchema` (`id`, `role: ModelRole`, `agent?`, `gate?`, `loopback?`), `WorkflowEdgeSchema` (`from`, `to`, `condition?: 'pass'|'fail'|'default'`), `WorkflowSchema` (array of nodes + edges). Export `Workflow` type.
- **`src/workflow/engine.ts`** *(new)* — `nextStep(task: TaskEntry, workflow: Workflow): ModelRole | null`. Reads `task.phaseCompletions`, walks the DAG from the start node, returns the next un-completed role. Preserves the loopback-on-fail logic that currently lives in `nextPhase()`.
- **`project-docs/workflows/default.json`** *(new)* — Encodes the current 4-phase DAG: `start → frame → build → verify → critic → sync`. Critic has a `loopback` edge to build on `verdict=fail`. This must be byte-for-byte equivalent to the current FSM behaviour.
- **`src/orchestrator/loop.ts`** — Replace the `nextPhase()` function body with a call to `engine.nextStep(task, workflow)`. Load the workflow from config (see below) before the loop starts. Keep the `nextPhase` function signature for now — rename the internal call only.
- **`src/config/schema.ts`** — Add optional `workflow: z.string().default('project-docs/workflows/default.json')` field to `FeatherConfigSchema`. The value is a path relative to `process.cwd()`.
- **`src/config/defaults.ts`** — Add `workflow: 'project-docs/workflows/default.json'` to defaults.
- **`test/orchestrator/workflow-engine.test.ts`** *(new)* — Unit tests for `nextStep()`: happy path (advance through all phases), loopback on `verdict=fail`, null return when sync is complete, custom 3-node workflow (frame → build → sync, no critic).

## Done Criteria
- [ ] `src/workflow/engine.ts` exists and exports `nextStep(task, workflow): ModelRole | null`.
- [ ] `project-docs/workflows/default.json` validates against `WorkflowSchema` and is loaded correctly.
- [ ] `feather orchestrate` on an existing task completes the same `frame → build → critic → sync` sequence as before — verified by running it on a real task or checking the state.json progression.
- [ ] `bun test test/orchestrator/workflow-engine.test.ts` passes all cases including the loopback and null-termination cases.
- [ ] A custom workflow with only 3 nodes (frame → build → sync, skipping critic) loaded via `config.workflow` runs correctly through those 3 phases.
- [ ] `bun run build` passes. No other tests regress.
- [ ] `nextPhase()` in `loop.ts` no longer contains any hardcoded `if (!done('frame'))` style logic.

## Risks
- The current FSM has a subtle tie-breaking rule when critic and build have the same `completedAt` timestamp (line 78–82 of loop.ts). The engine must replicate this exactly or use a monotonic index comparison — do not silently drop it.
- `project-docs/workflows/default.json` lives outside `src/` and won't be bundled by tsup. The engine must read it at runtime via `fs.readFileSync` relative to `cwd`, not via an import. Confirm this works when the CLI is run from any directory.
- The `WorkflowSchema` must allow future extension (verification nodes, custom agents) without breaking the current default.json — use `z.object().passthrough()` or explicit optional fields.
- Do not touch `src/orchestrator/router.ts` — the router (rewritten in orch-f/orch-f2) is a separate concern from the DAG walker.

## Constraints
- `nextStep()` must be a pure function — no I/O, no state mutation. The caller (`loop.ts`) owns loading and passing the workflow.
- Use `zod/v4` (not `zod`) for all schemas.
- The workflow file path is relative to `process.cwd()`, resolved at runtime — not bundled.
- Zero behavior change for the default workflow. This is a pure refactor at the orchestrator level.
- Do not wire the workflow to the HTTP server or dashboard in this task — that is `dash-b`.
