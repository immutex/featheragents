# Conventions

## Code Style

- **TypeScript strict mode.** All files in `src/` use `"strict": true`. No `any` without a comment explaining why.
- **ESM only.** Every import specifier ends in `.js` (even when the source file is `.ts`). No CommonJS `require`.
- **`zod/v4`.** Import Zod from `zod/v4`, never from `zod`. The MCP SDK requires Standard Schema compliance.
- **No `console.log` in `src/mcp/`.** stdout is the JSON-RPC transport. Use `console.error` for MCP server logs.
- **No heavy frameworks.** Node standard library (`node:http`, `node:fs`, `node:path`) for the server layer. No Express, Fastify, or Hono.
- **Minimal dependencies.** Every new runtime dep needs justification. Check if an existing dep or stdlib already covers the need.

## Module Boundaries

```
src/cli.ts          → commands/* only
src/commands/*      → config/*, orchestrator/*, mcp/state-io, utils/*, integrations/*
src/orchestrator/*  → config/*, mcp/state-io, workflow/*, memory/*, utils/*  (NOT src/mcp/tools)
src/mcp/tools/*     → config/*, mcp/state-io, memory/*
src/memory/*        → config/schema only (no circular deps)
src/workflow/*      → config/schema only
src/integrations/*  → config/schema, mcp/tools/mark-phase-complete
```

The orchestrator must never import from `src/mcp/tools/` — use `state-io.ts` directly for state access.

## File Naming

- One command group per file in `src/commands/`.
- One MCP tool per file in `src/mcp/tools/`. File name matches tool name (`get-diff.ts` → `get_diff` tool).
- One template function per file in `src/templates/` (or grouped if tightly related).
- Test files mirror source structure: `test/orchestrator/runner.test.ts` tests `src/orchestrator/runner.ts`.

## Templates

Templates are pure functions: `(config: FeatherConfig) => string`. No side effects, no file I/O, no async. Every template lives in `src/templates/` and is exported from `src/templates/index.ts`.

## State & Atomicity

- **`saveState` is the only way to write `state.json`.** Never use `fs.writeFile` directly. `saveState` writes to a temp file then `fs.rename` — atomic on POSIX.
- **`loadState` / `loadConfig` are the only reads.** Don't open `state.json` or `featherkit/config.json` with `fs.readFile` in command code.
- **`.project-state/events.jsonl`** is append-only. Only `EventLogger` (orchestrator) writes it. Everything else reads.
- **`memory.db`** is accessed only through `MemoryStore` and `openMemoryDb`. Never open the SQLite file directly from command code.

## Error Handling

- The orchestrator loop must never throw. Wrap all phase invocations in try/catch; emit `phase:failed` events, then continue to the next task.
- MCP tools return structured errors (non-null `error` field in the response) rather than throwing.
- CLI commands exit with `process.exit(1)` on fatal errors after printing a human-readable message via `log.error`.
- Never swallow errors silently. If you catch an error you can't handle, log it (with `console.error` in MCP context, `log.error` in CLI context) before continuing.

## Testing

- **vitest** for all unit tests. No Jest.
- Tests live in `test/` mirroring `src/` structure.
- Test files end in `.test.ts`.
- Use dependency injection (pass deps as a parameter) rather than module mocking for the orchestrator and runner — this keeps tests deterministic without `vi.mock`.
- Integration tests (server routes, state round-trips) use real file system operations against temp directories.
- Dashboard tests live in `featherkit-dashboard/test/`.

## Git

- Commits are small and logical. One concept per commit.
- Commit messages: imperative, present tense (`add`, `fix`, `update`, `remove` — not `added`, `fixed`).
- No `Co-Authored-By` trailers.
- Never commit `node_modules/`, `dist/`, `.env`, or any credential file.
- `.project-state/` is gitignored (state is local, not shared).

## Naming

- **Files:** `kebab-case.ts` for all source files.
- **Exports:** `camelCase` for functions and variables, `PascalCase` for classes and Zod schemas, `SCREAMING_SNAKE_CASE` for module-level constants.
- **MCP tool names:** `snake_case` matching the tool registration name.
- **Task IDs:** `<area>-<letter>` (e.g. `dash-b`, `mem-c`, `orch-f2`). Use descriptive area prefixes.
- **Config fields:** `camelCase` in JSON and TypeScript.
