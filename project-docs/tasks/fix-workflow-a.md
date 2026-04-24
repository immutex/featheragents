# Task: fix-workflow-a

## Goal
Fix the Workflow view 500 error that occurs when `project-docs/workflows/default.json` doesn't exist in the user's project — return the built-in default workflow instead of crashing.

## Context
`src/server/routes/workflow.ts` catches all errors from `readFile` and sends a 500 with the raw error message. When the user opens a project that was never initialized with `feather init` (or whose workflow file was deleted), the dashboard shows an infinite loader and logs `ENOENT: no such file or directory, open '.../project-docs/workflows/default.json'`. The correct behavior is to fall back to the in-memory default workflow from `src/workflow/default.ts` — this is already what `feather orchestrate` does when the file is absent.

## Files
- **`src/server/routes/workflow.ts`** — catch ENOENT specifically, fall back to `DEFAULT_WORKFLOW` from `src/workflow/default.ts`
- **`featherkit-dashboard/src/views/Workflow.tsx`** — may need to handle a `isDefault: true` flag in the response to show a "no saved workflow — showing default" banner (optional, nice-to-have)

## Done Criteria
- [x] `GET /api/workflow` returns 200 with the default workflow JSON when `project-docs/workflows/default.json` does not exist (not 500)
- [x] The Workflow canvas loads and renders without errors when the file is missing
- [x] When the file exists, existing behavior is unchanged
- [x] `bun run build` passes

## Risks
- The default workflow import path: `src/workflow/default.ts` exports `DEFAULT_WORKFLOW` — confirm the export name before importing
- `POST /api/workflow` (save) should still create the file if it doesn't exist — verify the save path creates parent dirs with `mkdir -p`

## Constraints
- Do not return 404 — a missing workflow is not an error state, it just means "use the default"
- Do not change the workflow schema or default workflow content
