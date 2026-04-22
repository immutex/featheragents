# Task: dash-f

## Goal
Expand the verification system from `tsc + test` to seven distinct checks (lint, format, build, git-clean, deps-drift) and integrate them as gating nodes in the workflow DAG. The Verification tab in the dashboard shows real check results with a Re-run button.

## Files
- **`src/verification/checks/typecheck.ts`** *(extract from existing verify_phase tool)* — `runTypecheck(cwd): CheckResult`.
- **`src/verification/checks/test.ts`** *(extract)* — `runTests(cwd): CheckResult`.
- **`src/verification/checks/lint.ts`** *(new)* — detect `eslint`/`biome` in project, run whichever is present. If neither found, return `{ status: 'skipped' }`.
- **`src/verification/checks/format.ts`** *(new)* — detect `prettier`/`biome format`, run check (not write). Skip if none found.
- **`src/verification/checks/build.ts`** *(new)* — run `npm run build` / `bun run build` if `scripts.build` in nearest `package.json`. Skip if not present.
- **`src/verification/checks/git-clean.ts`** *(new)* — `git status --porcelain` scoped to `task.files` if available, else full repo. Fail if uncommitted changes exist outside expected paths.
- **`src/verification/checks/deps-drift.ts`** *(new)* — compare `package.json` dependencies against lockfile. Fail if they differ (using `bun install --frozen-lockfile --dry-run` or equivalent).
- **`src/verification/runner.ts`** *(new)* — `runChecks(names: string[], cwd): CheckSummary`. Runs named checks in parallel, collects results.
- **`src/verification/index.ts`** *(new)* — exports all check functions + `AVAILABLE_CHECKS` map.
- **`src/workflow/schema.ts`** — add `requires?: string[]` optional field to `WorkflowNodeSchema`. Example: `{ id: 'sync', role: 'sync', requires: ['typecheck', 'test', 'lint'] }`.
- **`src/workflow/engine.ts`** — before returning a role from `nextStep()`, check if the node has `requires`. If so, call `runChecks(node.requires, cwd)` — if any check fails, return a new `'blocked'` signal instead of the role (caller handles it).
- **`src/mcp/tools/verify-phase.ts`** — expand to use `runChecks()` instead of inline tsc/test calls.
- **`src/server/routes/verification.ts`** *(new)* — `GET /api/verification/:taskId` → last check results from state. `POST /api/verification/:taskId/run` → run all enabled checks, return results + persist to state.
- **`featherkit-dashboard/src/views/Projects.tsx` (VerificationTable)** — wire to `useQuery(['verification', taskId])` + Re-run button calls `apiPost('/api/verification/:id/run')`.
- **`test/verification/checks.test.ts`** *(new)* — unit tests for each check using temp dirs with known pass/fail conditions.

## Done Criteria
- [ ] `runChecks(['typecheck', 'test'], cwd)` on this repo returns `{ typecheck: 'pass', test: 'pass' }`.
- [ ] `runChecks(['lint'], cwd)` returns `skipped` if biome/eslint not found, `pass`/`fail` if found.
- [ ] A workflow node with `requires: ['typecheck', 'test']` blocks the agent spawn if typecheck fails — confirmed by introducing a deliberate TS error and running the orchestrator.
- [ ] `POST /api/verification/:id/run` returns check results and persists them to state.json.
- [ ] Verification tab in the dashboard shows real check results with last-run timestamp and Re-run button.
- [ ] Re-run button issues the POST and updates the table within 10s.
- [ ] `bun run build` passes. `bun test test/verification/checks.test.ts` passes.

## Risks
- `git-clean` scoped to task files requires `task.files` to be populated — this field may not exist on all tasks. Fall back to full repo diff if `task.files` is empty.
- `deps-drift` check must not run `bun install` — read-only. Use `bun install --frozen-lockfile --dry-run` and check exit code. If bun doesn't support this flag, use direct lockfile parse comparison.
- Running checks in parallel may cause output interleaving in logs. Each check must write to its own isolated result struct, never to stdout directly.
- The `engine.ts` change (check `requires` before returning a role) is the trickiest part — it makes `nextStep()` potentially async. If the engine stays sync, checks must be sync too (no async child processes inside `nextStep`). Alternative: move the check invocation to the caller in `loop.ts` and pass the result back in. Clarify architecture before building.

## Constraints
- Each check is a pure subprocess call — no AI, no network.
- `CheckResult = { status: 'pass' | 'fail' | 'skipped'; output?: string; durationMs: number }`.
- Checks must not mutate files (`--check` mode only for formatters).
- `requires` in the workflow JSON is optional. Nodes without it behave exactly as before.

## Depends on
- `dash-a` (workflow node schema with `requires` field)
- `dash-b` (verification API routes)
- `dash-c` (dashboard query hooks)
