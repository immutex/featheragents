# Task: dash-c

> **Status: Done**

## Goal
Wire the already-built `featherkit-dashboard/` frontend to the real `feather serve` backend — replace all mock `FK_DATA` imports with TanStack Query REST calls and a live WebSocket subscription. The UI is done; this task makes it real.

## Context
`featherkit-dashboard/` already has: full component tree, all views (Home, Projects, Kanban, Connections, Settings, Workflow), @dnd-kit kanban, @xyflow/react workflow canvas. Everything runs against `FK_DATA` mock. This task swaps that mock for real API calls and makes the kanban drag persist to state.json.

## Files
- **`featherkit-dashboard/src/lib/api.ts`** *(new)* — typed fetch helpers: `apiGet<T>(path)`, `apiPatch<T>(path, body)`, `apiPut<T>(path, body)`, `apiPost<T>(path, body)`. Reads base URL + token from `VITE_API_URL` env var (default `http://localhost:7721`) and `VITE_API_TOKEN` (or reads from `.project-state/dashboard.token` via a startup script — see constraints).
- **`featherkit-dashboard/src/lib/ws.ts`** *(new)* — `useOrchestratorEvents(onEvent)` React hook: opens `ws://localhost:7721/events?token=<token>`, reconnects on disconnect, calls `onEvent` for each message. Exposes `connected: boolean` state.
- **`featherkit-dashboard/src/lib/queries.ts`** *(new)* — TanStack Query query/mutation definitions: `useStateQuery()`, `usePatchTask()`, `useWorkflowQuery()`, `usePutWorkflow()`.
- **`featherkit-dashboard/src/store/events.ts`** *(new)* — Zustand slice: `EventStore { events: EventEntry[], push(e) }`. Populated by `useOrchestratorEvents`.
- **`featherkit-dashboard/src/App.tsx`** — wrap with `QueryClientProvider`. Remove `FK_DATA` import from top-level; pass real query data down.
- **`featherkit-dashboard/src/data/mock.ts`** — keep as dev fallback only. Add `USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'` guard; mock data used only when env var set.
- **`featherkit-dashboard/src/views/Home.tsx`** — replace `FK_DATA.tasks/events/stats` with `useStateQuery()` data + event store.
- **`featherkit-dashboard/src/views/Projects.tsx`** — replace mock project/task data with query data.
- **`featherkit-dashboard/src/views/Kanban.tsx`** — kanban `onEnd` calls `usePatchTask()` mutation; on server rejection (409) roll back optimistic state.
- **`featherkit-dashboard/src/views/Workflow.tsx`** — Save button calls `usePutWorkflow()`; initial nodes/edges loaded from `useWorkflowQuery()`.
- **`featherkit-dashboard/.env.example`** *(new)* — `VITE_API_URL=http://localhost:7721`, `VITE_API_TOKEN=`, `VITE_USE_MOCK=false`.
- **`featherkit-dashboard/src/components/ui/ConnectionStatus.tsx`** *(new)* — small WS indicator in sidebar (green dot = connected, grey = reconnecting).

## Done Criteria
- [x] `feather serve` in one terminal, `bun run dev` in `featherkit-dashboard/` in another — Home tab shows real tasks from state.json, not mock data.
- [x] Kanban drag of a task from `pending → active` with satisfied deps persists to `state.json` on disk.
- [x] Kanban drag with unmet deps shows a brief error toast and card snaps back to original column.
- [x] WS event from orchestrator (e.g. `feather orchestrate --task <id> --once`) appears as a new row in the Home event stream within 1s, without a page reload.
- [x] Workflow tab Save button issues `PUT /api/workflow` and the sidebar shows a success toast.
- [x] `VITE_USE_MOCK=true bun run dev` still works against mock data (dev convenience).
- [x] No TypeScript errors. `bun run build` in `featherkit-dashboard/` passes.

## Risks
- Token distribution: the dashboard needs the token to authenticate. Cleanest for dev: user copies from `.project-state/dashboard.token` into `.env.local`. Add a helper script `scripts/dev-token.sh` that tails the token file and sets `VITE_API_TOKEN`. Production: the CLI could open the browser with the token in the URL (`?token=<token>`) — note as a TODO.
- TanStack Query + Zustand event store can diverge if WS events arrive before the initial query resolves. Strategy: events are appended to the event store independently; state queries refresh on WS events via `queryClient.invalidateQueries(['state'])` inside `useOrchestratorEvents`.
- CORS: the dev Vite server runs on a different port than `feather serve`. Add CORS headers to the HTTP server (`Access-Control-Allow-Origin: http://localhost:5173`) in `src/server/index.ts` — this is a one-liner.

## Constraints
- No SSR, no server components. This is a pure SPA.
- `FK_DATA` must not be imported in production builds. Enforce with a lint rule or the `VITE_USE_MOCK` guard.
- Optimistic updates on kanban drag must roll back cleanly — never leave the UI in a broken state on server rejection.
- TanStack Query v5 API (already installed in featherkit-dashboard).

## Depends on
- `dash-b` (server must be running to wire against)
