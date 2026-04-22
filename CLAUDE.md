# FeatherKit

Autonomous multi-model coding pipeline — orchestrates frontier models through a Frame → Build → Critic → Sync loop, backed by a local MCP server, SQLite memory system, and a live web dashboard.

## Stack
- **Runtime:** Bun (dev), Node 22+ (production)
- **Language:** TypeScript (strict, ESM-only)
- **CLI:** commander + @inquirer/prompts
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **Validation:** zod v4 (Standard Schema — import from `zod/v4`)
- **Build:** tsup (two entries: cli + mcp server)
- **Test:** vitest
- **Dashboard:** React 18, Vite, TanStack Query v5, React Flow, @dnd-kit

## Commands
```bash
bun install          # install deps
bun run build        # build dist/cli.js + dist/server.js
bun test             # run tests
bun run dev          # watch mode
cd featherkit-dashboard && bun run dev   # dashboard dev server
```

## Conventions
- ESM only. Use `.js` extensions in all import specifiers.
- Use `zod/v4` everywhere (not `zod` — the MCP SDK requires Standard Schema).
- No `console.log` in `src/mcp/` — stdout is the JSON-RPC transport. Use `console.error` for server logs.
- Templates are pure functions: `(config: FeatherConfig) => string`. No side effects.
- Config generators must deep-merge with existing files, never overwrite.
- Atomic writes for state.json (temp file + rename) — never `fs.writeFile` directly.
- The orchestrator must never throw — catch per-phase, emit `phase:failed` events.
- Memory tools check `config.memory.enabled` before touching the DB.

## Structure
```
src/
  cli.ts              # CLI entry point (commander)
  commands/           # One file per command group
  config/             # Zod schemas, defaults, loader
  templates/          # Template functions (TS → string)
  generators/         # Client config generators (claude-code, opencode)
  integrations/       # pi-loader.ts — Pi agent runtime wrapper
  orchestrator/       # Autonomous pipeline: loop, runner, lock, gates, router, TUI
  workflow/           # Phase DAG schema + engine
  memory/             # SQLite memory: db, store, retrieval/, write/
  mcp/
    server.ts         # MCP server entry (separate bundle)
    state-io.ts       # Shared state read/write
    tools/            # One file per MCP tool
  server/             # feather serve HTTP+WS backend
  utils/              # fs helpers, logger, git, handoff, verify
test/                 # vitest tests (mirrors src/ structure)
featherkit-dashboard/ # React SPA (Vite)
project-docs/         # Task files, architecture, conventions, decisions
```

## Key Files
- `src/config/schema.ts` — source of truth for all types
- `src/mcp/state-io.ts` — shared between CLI and MCP server
- `src/orchestrator/loop.ts` — main orchestrator loop logic
- `src/orchestrator/runner.ts` — spawns claude --print or pi harness per role
- `src/memory/store.ts` — MemoryStore class
- `src/workflow/engine.ts` — nextStep() pure function
- `src/server/index.ts` — feather serve HTTP+WS server
- `featherkit-dashboard/src/` — dashboard React SPA source
