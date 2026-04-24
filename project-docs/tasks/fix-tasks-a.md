# Task: fix-tasks-a

## Goal
Add a "New task" button to the Kanban and Projects views so users can manually create tasks without depending on AI agents or the CLI.

## Context
Currently tasks can only be created via `feather task start <id>` (CLI) or `mcp__featherkit__start_task` (AI agent MCP tool). There is no REST endpoint to create tasks and no UI affordance in the dashboard. Users have no way to add tasks directly from the dashboard — blocking anyone who wants to manage their work without running a terminal command. The state.json format already supports tasks as a flat array; creating one just requires inserting a new entry with `status: 'pending'` atomically.

## Files
- **`src/server/routes/state.ts`** — add `POST /api/tasks` handler: accept `{ id, title, goal?, dependsOn? }`, validate, insert into state.json atomically, return the new task
- **`src/server/index.ts`** — ensure the new POST /api/tasks route is dispatched (may already be covered by the state route handler)
- **`featherkit-dashboard/src/views/Kanban.tsx`** — add "New task" button in the column header or board header; opens an inline form or modal with `id` + `title` fields; calls `POST /api/tasks`
- **`featherkit-dashboard/src/views/Projects.tsx`** — add "New task" button in the Tasks tab (similar inline form)
- **`featherkit-dashboard/src/lib/queries.ts`** — add `useCreateTaskMutation()` that POSTs to `/api/tasks` and invalidates the state query on success

## Done Criteria
- [ ] A "New task" button appears on the Kanban board (e.g., in the header or as a `+` in the pending column)
- [ ] Clicking it opens a form with at minimum: task ID and title fields (both required)
- [ ] Submitting creates the task in state.json and it immediately appears on the board without a page reload
- [ ] `POST /api/tasks` returns 400 if `id` is missing, duplicate, or contains spaces/invalid chars; returns 409 if the ID already exists
- [ ] `bun run build` passes

## Risks
- Task ID validation: must only allow `[A-Za-z0-9-_]+` — reject spaces and special chars with a clear error message
- Concurrent create: use the same atomic write pattern (temp-file + rename) as the rest of state.ts
- The Kanban board re-renders from `useStateQuery()` — invalidating that query after create should be sufficient

## Constraints
- Do not change the state.json schema — new tasks must conform to `TaskEntry` type
- Do not add a delete task endpoint in this task (separate concern)
- Keep the form minimal: id + title required, all other fields optional (goal, dependsOn)
