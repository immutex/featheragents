# Architecture

## Overview

featherkit is an autonomous multi-model coding pipeline. It coordinates frontier models through a structured **Frame → Build → Critic → Sync** loop, driven by a local orchestrator that spawns real agent processes, injects memory context from prior sessions, and surfaces approval gates at human-meaningful checkpoints. A web dashboard (`feather serve`) provides a live view of everything.

The system is entirely local. No hosted service. State lives in `.project-state/` on disk. Models are invoked via the Claude CLI (Anthropic) or the Pi agent runtime (all other providers).

---

## Key Components

### CLI (`dist/cli.js`)
The `feather` binary. Entry point for all user-facing commands: `init`, `serve`, `orchestrate`, `approve`, `auth`, `task`, `verify`, `handoff`, `review`, `mcp`, `skills`, `pkg`, `doctor`.

Built as a single tsup bundle from `src/cli.ts`. ESM-only, Node 22+.

### MCP Server (`dist/server.js`)
A stdio-transport MCP server. Spawned by Claude Code or OpenCode per-session — never a background daemon. Exposes ~16 tools covering project state, memory, task management, and phase gating. Uses `state.json` and `memory.db` as its backing store.

### Orchestrator (`src/orchestrator/`)
The autonomous pipeline driver. Key modules:
- `loop.ts` — task picking, phase sequencing, critic loopback logic
- `runner.ts` — spawns `claude --print` (Anthropic) or `piLoader.invokeProvider` (other providers)
- `lock.ts` — PID-based project lock with heartbeat, prevents concurrent orchestrator runs
- `gates.ts` — approval gate implementations (editor / prompt / pause / auto)
- `router.ts` — LLM router: reads critic stdout, returns `advance | loopback | blocked` via `claude --print`
- `tui/` — terminal dashboard using `@mariozechner/pi-tui`
- `event-log.ts` — appends `OrchestratorEvent` JSON lines to `.project-state/events.jsonl` for cross-process relay

### Memory System (`src/memory/`)
SQLite-backed long-term memory with structured retrieval. Key modules:
- `db.ts` — opens `memory.db`, runs migrations, returns handle
- `store.ts` — `MemoryStore` class: insert, query, supersede, deactivate
- `retrieval/` — keyword (BM25-style), vector, and scoped channels; reranker; context assembler
- `write/` — extraction, worthiness scoring, deduplication, commit pipeline

Memory is opt-in: `config.memory.enabled = false` (default) means zero SQLite activity at runtime.

### Workflow Engine (`src/workflow/`)
Configurable phase DAG replacing the original hard-coded FSM.
- `schema.ts` — `WorkflowSchema` (Zod): nodes, edges, conditions
- `engine.ts` — `nextStep(task, workflow)`: pure function, returns the next role or null
- `default.ts` — `DEFAULT_WORKFLOW` constant (Frame → Build → Critic → Sync with loopback edge)

### Pi Integration (`src/integrations/pi-loader.ts`)
Wraps `@mariozechner/pi-coding-agent` into a `PiLoader` interface used by the runner for non-Anthropic providers. Handles provider/skill/MCP discovery, OAuth credential reading via `AuthStorage`, and agent session lifecycle.

### Dashboard Backend (`src/server/` — in progress)
HTTP + WebSocket server (Node `http` + `ws`). Binds to `127.0.0.1` only. Key routes:
- `GET/PATCH /api/state` — task state read/write
- `GET/PUT /api/workflow` — workflow DAG read/write
- `GET /api/connections/*` — provider auth status and MCP server management
- `GET /api/memory/*` — memory graph, timeline, trace (requires `memory.enabled`)
- `/events` WebSocket — tails `events.jsonl` and broadcasts to connected clients

### Dashboard Frontend (`featherkit-dashboard/`)
React SPA served as static files by `feather serve`. Stack: React 18, TanStack Query v5, Zustand, React Flow, `@dnd-kit`.

---

## Data Flow

```
feather orchestrate
  │
  ├── reads config from featherkit/config.json
  ├── reads/writes .project-state/state.json  (via state-io.ts)
  ├── appends .project-state/events.jsonl     (one JSON line per event)
  ├── spawns claude --print                   (Anthropic roles)
  └── calls piLoader.invokeProvider           (all other roles)

dist/server.js (MCP, per-session stdio)
  │
  ├── reads/writes .project-state/state.json
  └── reads/writes .project-state/memory.db

feather serve
  │
  ├── serves featherkit-dashboard/dist/ as static files
  ├── exposes HTTP API over /api/*
  ├── tails .project-state/events.jsonl → broadcasts over WebSocket
  └── reads/writes .mcp.json
```

`state.json` is the shared coordination primitive. Both the orchestrator and the MCP server use `saveState` (atomic temp-file + rename) — safe for concurrent access.

---

## Conventions

- ESM only — `.js` extensions in all import specifiers, even for `.ts` source files.
- `zod/v4` everywhere — not `zod`. The MCP SDK requires Standard Schema.
- No `console.log` in `src/mcp/` — stdout is the JSON-RPC transport. Use `console.error` for server-side logs.
- Templates are pure functions: `(config: FeatherConfig) => string`. No side effects, no I/O.
- Config generators deep-merge with existing files — never overwrite a file the user may have edited.
- Atomic writes for all mutable state: temp file + `fs.rename`. Never `fs.writeFile` directly on `state.json`.
- The orchestrator must not throw to its caller — all errors are caught per-phase and emitted as `phase:failed` events.
- Memory tools check `config.memory.enabled` before opening the database. If disabled, tools return a clear error rather than silently returning empty results.
