# Task: dash-verification-b

## Goal
Build the Verification dashboard view — it doesn't exist yet despite the backend being fully implemented — with a list of checks, run triggers, and a one-click "auto-setup" button that reads the project tech stack and installs appropriate verification commands.

## Context
`src/server/routes/verification.ts` already implements `GET /api/verification/:id` (returns check results) and `POST /api/verification/:taskId/run` (triggers checks). But there is no `Verification.tsx` view in the dashboard — the tab is either missing or shows nothing. The original design intent (`dash-f`) was a UI where users could see verification results per task, trigger re-runs, and have an "auto-setup" button that inspects the project (reads `package.json`, detects bun/npm/vitest/tsc/eslint) and writes a default verification config.

The verification config lives in `featherkit/config.json` under a `verification` key (or similar). The auto-setup button should:
1. `GET /api/verification/setup-detect` — server reads the project's `package.json` scripts + devDependencies and returns a list of suggested checks (e.g., `{ typecheck: "tsc --noEmit", test: "bun test", lint: "eslint src" }`)
2. `POST /api/verification/setup` — save those checks to config

## Files
- **`featherkit-dashboard/src/views/Verification.tsx`** *(new)* — list of checks with status badges, "Run verification" button per check + global run-all, auto-setup panel
- **`featherkit-dashboard/src/App.tsx`** (or router) — add Verification route + nav tab
- **`src/server/routes/verification.ts`** — add `GET /api/verification/setup-detect` and `POST /api/verification/setup` endpoints
- **`featherkit-dashboard/src/lib/queries.ts`** — add `useVerificationQuery(taskId)`, `useRunVerificationMutation()`, `useSetupDetectQuery()`, `useSetupVerificationMutation()`

## Done Criteria
- [x] Verification tab appears in the dashboard nav and renders without errors
- [x] When a task is active, `GET /api/verification/:taskId` results are shown — each check as a row with pass/fail/skipped badge and output collapsible
- [x] "Run all" button calls `POST /api/verification/:taskId/run` and polls for updated results
- [x] "Auto-setup" button calls `GET /api/verification/setup-detect`, shows the detected commands in a preview panel, and lets the user confirm to save via `POST /api/verification/setup`
- [x] When no task is active or no checks configured, shows a clear empty state with the auto-setup CTA
- [x] `bun run build` passes, `cd featherkit-dashboard && bun run build` passes

## Risks
- `setup-detect` must read from the **project's** package.json (`cwd/package.json`), not featherkit's own — use `context.cwd`
- Detection heuristics: check `scripts` for `test`, `typecheck`, `lint`, `format` keys; check `devDependencies` for `eslint`, `vitest`, `typescript` — prefer `bun test` if bun is the runtime
- If `featherkit/config.json` doesn't have a `verification` section yet, the schema needs extending — add it as optional (`verification?: { checks: Record<string, string> }`)

## Constraints
- Do not auto-run verification on setup — require explicit user confirmation before running anything
- The auto-setup is a suggestion, not mandatory — user can dismiss and configure manually
- Do not block the tab render on a running task — show empty state if no active task
