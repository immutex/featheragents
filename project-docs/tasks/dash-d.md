# Task: dash-d

> **Status: Done**

## Goal
Make the already-built workflow canvas editor functional end-to-end: load the live workflow from `GET /api/workflow`, save edits via `PUT /api/workflow`, and verify that `feather orchestrate` picks up the new ordering. The React Flow canvas and node types are already scaffolded — this task wires them to the real backend.

## Context
`featherkit-dashboard/src/views/Workflow.tsx` already has: React Flow canvas, OrchestratorNode/AgentNode/VerificationNode custom types, side panel with form fields, Save/Validate buttons. It currently renders from `FK_DATA.workflowNodes/Edges`. This task makes Save real, Load real, and verifies the orchestrator honors the persisted workflow.

## Files
- **`featherkit-dashboard/src/views/Workflow.tsx`** — wire Save to `usePutWorkflow()` (from dash-c queries). Wire initial `nodes`/`edges` to `useWorkflowQuery()` instead of `FK_DATA`. On load: convert `Workflow` JSON (from `src/workflow/schema.ts`) to React Flow node/edge format. On save: convert back and PUT.
- **`featherkit-dashboard/src/lib/workflow-convert.ts`** *(new)* — `workflowToFlow(w: Workflow): { nodes, edges }` and `flowToWorkflow(nodes, edges): Workflow`. Pure functions, no I/O.
- **`featherkit-dashboard/src/views/Workflow.tsx`** — side panel: hook up model field, gate field, prompt template textarea to actually mutate the local node state (currently they're uncontrolled). Add an "Add node" button that appends a new agent node to the canvas (role defaults to `build`).
- **`featherkit-dashboard/src/views/Workflow.tsx`** — Validate button: call `POST /api/workflow/validate` (or do client-side Zod parse against `WorkflowSchema`) and show a toast with the result.
- **`src/server/routes/workflow.ts`** — add `POST /api/workflow/validate` (optional, can do client-side instead — decide during build).

## Done Criteria
- [x] Opening the Workflow tab loads nodes from the real `project-docs/workflows/default.json` via `GET /api/workflow` — not from `FK_DATA`.
- [x] Dragging nodes to a new position and clicking Save issues `PUT /api/workflow`, returns 200, and a success toast appears.
- [x] After Save, running `feather orchestrate --task <id>` honors the new node ordering (e.g. if critic is removed, orchestrator goes frame→build→sync).
- [x] Editing a node's model in the side panel and saving persists the change to `default.json` on disk.
- [x] Clicking Validate with a disconnected graph (no path from start to any terminal node) shows an error toast.
- [x] `bun run build` in `featherkit-dashboard/` passes with no TS errors.

## Risks
- React Flow's internal node representation uses `x,y` pixel positions. The `Workflow` JSON schema (`src/workflow/schema.ts`) may not store positions — add optional `x?: number, y?: number` to `WorkflowNodeSchema` so round-tripping preserves layout. Without this, every save resets node positions to defaults.
- The `flowToWorkflow` converter must handle edges with no `condition` (default) and edges with `condition: 'fail'` (loopback). The converter must not drop these — they drive orchestrator behavior.
- The orchestrator reads `config.workflow` path at startup (after dash-a). If the user edits via the dashboard while the orchestrator is running, the in-memory workflow won't update mid-run. This is acceptable for v1 — document it.

## Constraints
- `workflowToFlow` and `flowToWorkflow` must be pure functions with no side effects — testable in isolation.
- Do not change `src/workflow/schema.ts` in a breaking way. Any additions (x/y fields) must be `z.number().optional()`.
- The Validate step must not make an AI call. Parse the workflow with Zod + check that every node is reachable from the start node using a simple BFS. That's sufficient for v1.

## Depends on
- `dash-a` (WorkflowSchema)
- `dash-b` (PUT /api/workflow endpoint)
- `dash-c` (query hooks)
