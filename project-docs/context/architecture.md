# Architecture

## Overview

featherkit is a local-first coding workflow that moves work through a four-stage **Frame → Build → Critic → Sync** loop. The CLI bootstraps project files, the orchestrator picks runnable tasks from shared state, each phase runs through a real model harness, and results are written back to disk so the next role can continue from the same source of truth. The loop is intentionally explicit: Frame plans, Build implements, Critic checks against done criteria, and Sync prepares the next handoff.

Everything is stored inside the repo. Runtime coordination lives in `.project-state/`, project configuration lives in `featherkit/config.json`, and client integrations are written to files like `.mcp.json`. Anthropic roles run through `claude --print`; other providers go through the Pi loader wrapper. The optional dashboard server exposes the same local state over HTTP and WebSocket so the SPA can observe and edit it without introducing a separate hosted backend.

---

## Key Components

### CLI (`dist/cli.js`)
The `featherkit` binary is built from `src/cli.ts` with commander. It wires together the user-facing commands for setup, orchestration, review, verification, MCP installation, package inspection, and dashboard serving. The CLI reads the package version at build time and remains ESM-only.

### MCP Server (`dist/server.js`)
A stdio MCP server built from `src/mcp/server.ts`. It is spawned per session by external clients, not run as a long-lived daemon. Tool handlers use shared state I/O from `src/mcp/state-io.ts`, which validates data with `zod/v4` and writes `state.json` atomically so CLI commands, MCP tools, and the dashboard all observe the same task graph safely.

### Orchestrator (`src/orchestrator/`)
The orchestrator is the runtime core. `loop.ts` loads config and workflow state, picks runnable tasks, applies gates, retrieves memory context when enabled, runs each phase, and records events. `runner.ts` chooses between Claude Code and the Pi integration per role, streams stdout back into the event pipeline, and persists discovered Claude session IDs for follow-up phases. Critic results can loop a task back to Build instead of always advancing.

### Memory System (`src/memory/`)
Memory is optional and SQLite-backed. `db.ts` opens and migrates the database, `store.ts` manages inserts/query/supersede/deactivate operations, and the retrieval/write pipelines assemble context or persist phase learnings. When `config.memory.enabled` is false, runtime code skips database access rather than silently pretending memory exists.

### Workflow Engine (`src/workflow/`)
Workflow shape is configurable instead of hard-coded. `schema.ts` defines the DAG, `default.ts` provides the default four-role loop with critic fail loopback, and `engine.ts` walks completions to determine the next role without mutating state.

### Dashboard Server + SPA
`src/server/index.ts` starts a local HTTP server bound to `127.0.0.1`, writes a short-lived bearer token into `.project-state/dashboard.token`, and mounts routes for `/api/state`, `/api/tasks/:id/run`, `/api/workflow`, `/api/workflow/validate`, and `/api/connections`. `ws.ts` upgrades `/events` connections and tails the orchestrator event log so the React dashboard can update live. The frontend in `featherkit-dashboard/` is a Vite-built React SPA using TanStack Query, React Flow, and related UI tooling.

### Pi Integration (`src/integrations/pi-loader.ts`)
For non-Anthropic roles, the runner uses the Pi loader wrapper to discover providers, skills, and MCP servers, then invokes the selected provider through a common interface.

---

## Data Flow

```
featherkit/config.json
  │
  ├── tells the orchestrator where state/workflow/memory live
  └── tells the dashboard server which files to expose

.project-state/state.json
  │
  ├── read/written by CLI commands and MCP tools
  ├── updated by the orchestrator as phases advance
  └── read by the dashboard API for live task state

.project-state/events.jsonl
  │
  └── appended by orchestrator events, then tailed by /events WebSocket

.mcp.json
  │
  └── managed by install/generator flows and the dashboard connections route
```

`state.json` is the main coordination primitive. Shared helpers write it with a temp-file-plus-rename pattern so multiple local processes can cooperate without partial writes.

---

## Conventions

- ESM only: source imports use `.js` specifiers even when targeting `.ts` files.
- Use `zod/v4` rather than `zod` so schemas remain compatible with the MCP SDK.
- Never use `console.log` inside `src/mcp/`; stdout is reserved for JSON-RPC transport.
- Template generators are pure and config writers deep-merge instead of clobbering user edits.
- Mutable shared state uses atomic writes, especially for `.project-state/state.json`.
- The orchestrator handles failures per phase and emits failure events instead of crashing the whole run.
- Memory-aware code must check `config.memory.enabled` before touching SQLite.
