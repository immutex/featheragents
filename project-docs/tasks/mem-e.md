# Task: mem-e

> **Status: Done**

## Goal
Build the dashboard Memory tab: an Obsidian-inspired graph view, a timeline view, and a detail inspector panel — all reading from `/api/memory/*` (built in mem-d). This makes memory a first-class visible system in the dashboard.

## Files
- **`featherkit-dashboard/src/views/Memory.tsx`** *(new)* — top-level Memory view with three sub-tabs: Graph / Timeline / Inspector.
- **`featherkit-dashboard/src/views/memory/MemoryGraph.tsx`** *(new)* — React Flow canvas. Custom node types:
  - `MemoryNode` — colored by type: semantic=accent, episodic=info, procedural=ok, summary=warn. Dimmed if `is_active=false`. Shows title + scope badge.
  - `EntityNode` — outlined, shows entity name + kind.
  - `ScopeNode` — large background cluster (repo, branch, session).
  - Edges colored by type (`supersedes`=err, `related_to`=muted, `caused_by`=warn, `derived_from`=accent/dim).
  Toolbar: filter by type, scope, agent, model. "Fit" button. Toggle superseded memories on/off.
- **`featherkit-dashboard/src/views/memory/MemoryTimeline.tsx`** *(new)* — vertical timeline sorted by `created_at`. Each row: timestamp, type badge, scope, title. Click opens Inspector. Shows `invalid_at` as a strikethrough entry.
- **`featherkit-dashboard/src/views/memory/MemoryInspector.tsx`** *(new)* — right-side drawer. Fields: content, normalized content, entities, edges list, confidence, salience, source, retrieval history from `memory_access_log`, supersession chain. Action buttons: Pin (increase salience), Invalidate, Merge (stub for v2).
- **`featherkit-dashboard/src/views/memory/RetrievalDebug.tsx`** *(new)* — shown per-task (in the Projects view task detail or as a Memory sub-tab). Reads `/api/memory/trace/:taskId`. Shows: memories included, per-memory reason (channel + score), memories excluded (top 3 near-misses), token budget used.
- **`featherkit-dashboard/src/lib/queries.ts`** — add `useMemoryGraph(scope)`, `useMemoryTimeline(scope)`, `useMemoryDetail(id)`, `useRetrievalTrace(taskId)`.
- **`featherkit-dashboard/src/App.tsx`** — add Memory to sidebar nav (below Connections). Only show if `config.memory.enabled` (read from `/api/state` which includes config).
- **`featherkit-dashboard/src/components/Sidebar.tsx`** — add Memory nav item (conditionally rendered).

## Done Criteria
- [x] Memory tab appears in the sidebar when `config.memory.enabled = true`; hidden otherwise.
- [x] Graph view loads and renders memory nodes + entity nodes from `/api/memory/graph?scope=repo`.
- [x] Clicking a memory node opens the Inspector panel with correct fields populated.
- [x] Timeline shows memories in reverse-chronological order; superseded memories appear dimmed with `invalid_at` date.
- [x] Filter by `type=semantic` hides episodic and procedural nodes from the graph without a page reload.
- [x] RetrievalDebug for an active task shows which memories were included and the per-memory reason string from `RetrievalTrace`.
- [x] `bun run build` in `featherkit-dashboard/` passes with no TS errors.

## Risks
- Large graphs (>200 nodes) will be slow with React Flow's default renderer. Implement a `maxNodes=200` truncation on the server response for graph view, with a "showing top 200 by salience" notice. Full export is v2.
- `RetrievalDebug` requires `memory_access_log` to be populated by mem-d. If mem-d isn't complete, this panel will be empty. Render gracefully: "No retrieval trace yet for this task."
- The Memory tab sidebar item must not render if the server returns `config.memory.enabled = false` — otherwise users see a broken tab.

## Constraints
- Reuse the existing React Flow instance setup from `featherkit-dashboard/src/views/Workflow.tsx` for visual consistency (same background, same zoom controls style).
- No new npm packages — React Flow, Zustand, TanStack Query, lucide-react are already installed.
- Graph view is read-only in v1. Edit operations (pin, invalidate) are button-triggered API calls, not drag-to-edit.

## Depends on
- `mem-d` (API routes `/api/memory/*`)
- `dash-b` (HTTP server)
- `dash-c` (query hooks infrastructure)
