# featherkit-dashboard

Web dashboard for featherkit — live view of orchestrator state, task kanban, workflow editor, memory graph, and provider connections.

Served as static files by `feather serve`. Not a standalone app — it connects to the local featherkit HTTP+WS backend at `http://localhost:7721`.

## Stack

- **React 18** + TypeScript (strict)
- **Vite** — dev server + build
- **TanStack Query v5** — server state
- **Zustand** — client state (event store)
- **React Flow (`@xyflow/react`)** — workflow canvas and memory graph
- **`@dnd-kit`** — kanban drag-and-drop
- **`lucide-react`** — icons

## Development

```bash
# From featherkit-dashboard/
bun install
bun run dev          # dev server on :5173
bun run build        # build to dist/
bun run typecheck    # tsc --noEmit
```

**Requires `feather serve` running** in the project root. Set up the API token:

```bash
cp .env.example .env.local
# Paste the token from .project-state/dashboard.token into VITE_API_TOKEN
```

## Views

| View | Route | Description |
|------|-------|-------------|
| Home | `/` | Live orchestrator event stream + task summary stats |
| Projects | `/projects` | Task list with verification status |
| Kanban | `/kanban` | Drag-and-drop task board (persists to state.json) |
| Workflow | `/workflow` | React Flow canvas — edit the phase DAG, save to disk |
| Memory | `/memory` | Memory graph (React Flow), timeline, inspector panel |
| Connections | `/connections` | Provider auth status, MCP servers, Pi packages |
| Settings | `/settings` | Dashboard preferences |

## Key Source Files

```
src/
  App.tsx               # Root — router + QueryClientProvider
  lib/
    api.ts              # Typed fetch helpers (apiGet, apiPatch, apiPut, apiPost)
    ws.ts               # useOrchestratorEvents hook — WebSocket subscription
    queries.ts          # TanStack Query definitions for all API resources
    workflow-convert.ts # workflowToFlow / flowToWorkflow pure converters
    env.ts              # VITE_* env var helpers
  views/
    Home.tsx            # Event stream + stats
    Kanban.tsx          # @dnd-kit board with optimistic updates
    Workflow.tsx        # React Flow workflow canvas
    Memory.tsx          # Memory tab container
    memory/             # MemoryGraph, MemoryTimeline, MemoryInspector, RetrievalDebug
    Connections.tsx     # Provider + MCP + skills management
  components/
    ui/                 # Shared primitives (Badge, Button, Card, Toast, …)
    Sidebar.tsx         # Navigation sidebar
  store/
    events.ts           # Zustand event store (populated by WS)
  data/
    mock.ts             # Dev-only mock data (VITE_USE_MOCK=true)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:7721` | feather serve base URL |
| `VITE_API_TOKEN` | *(required)* | Bearer token from `.project-state/dashboard.token` |
| `VITE_USE_MOCK` | `false` | Use mock data instead of real API (dev convenience) |
