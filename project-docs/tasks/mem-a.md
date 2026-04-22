# Task: mem-a

> **Status: Done**

## Goal
Lay the SQLite foundation for the featheragents long-term memory system: migrations, a thin synchronous `MemoryStore` class, and config wiring. This is infrastructure only — no retrieval logic, no write gating, no dashboard UI yet. Every subsequent memory task (`mem-b` retrieval, `mem-c` write path, `mem-d` dashboard graph) builds on this.

## Context: Memory Architecture
The memory system is a **hybrid local-first** layer:
- SQLite (canonical truth) + FTS5 (keyword) + sqlite-vec (vector) + graph tables
- `better-sqlite3` (sync, fast, reliable — fits the orchestrator's synchronous execution model)
- Embeddings via Ollama (optional; system must degrade gracefully without them)
- Dashboard graph via React Flow (already scaffolded in `featherkit-dashboard/`)
- **Strict write gating** — memory is opt-in by policy, never append-only

This task ships the database layer only. No agent prompting, no MCP tools yet.

## Files
- **`src/memory/db.ts`** *(new)* — `openMemoryDb(dbPath)`: opens SQLite, runs pending migrations, returns `Database` handle. Exports a `MemoryDb` type alias.
- **`src/memory/migrations/001_initial.sql`** *(new)* — all 7 core tables:
  `memories`, `memory_embeddings`, `memory_edges`, `entities`, `memory_entity_links`, `memory_access_log`, `memory_compactions`
  Plus `schema_migrations` tracking table. Enable FTS5 virtual table on `memories(title, content)`.
- **`src/memory/store.ts`** *(new)* — `MemoryStore` class: `insert(memory)`, `getById(id)`, `query({ scope, type, isActive })`, `supersede(oldId, newId)`, `deactivate(id)`. Synchronous, no retrieval ranking yet.
- **`src/memory/types.ts`** *(new)* — Zod schemas (using `zod/v4`) matching the canonical schema: `MemoryType`, `MemoryScope`, `MemoryRow`, `EntityRow`, `MemoryEdge`, `MemoryInsert`.
- **`src/config/schema.ts`** — add `memory` block: `{ enabled: boolean, dbPath: string, ollamaUrl?: string }`. Default `dbPath` = `.project-state/memory.db`. Default `enabled` = `false` (opt-in).
- **`package.json`** — add `better-sqlite3` + `@types/better-sqlite3`.
- **`test/memory/store.test.ts`** *(new)* — unit tests for `MemoryStore`: insert, query by scope/type, supersede, deactivate, FTS search.

## Done Criteria
- [ ] `bun add better-sqlite3 @types/better-sqlite3` succeeds; `bun run build` still passes.
- [ ] `openMemoryDb('.project-state/memory.db')` creates the file and all 7 tables on first call; subsequent calls are idempotent (migration guard).
- [ ] FTS5 virtual table `memories_fts` exists and a `SELECT` against it returns correct rows.
- [ ] `MemoryStore.insert()` accepts a valid `MemoryInsert`, writes atomically (memory row + entity links in a single transaction), returns the new `id`.
- [ ] `MemoryStore.supersede(oldId, newId)` sets `is_active = 0` and `invalid_at` on the old row and sets `supersedes_memory_id` on the new row.
- [ ] `MemoryStore.query({ scope: 'repo', type: 'semantic' })` returns only active rows matching both filters.
- [ ] `config.memory.enabled = false` (default) means `openMemoryDb` is never called by the orchestrator — zero-cost when disabled.
- [ ] `bun test test/memory/store.test.ts` passes; no other tests regress.

## Design Notes
- Use `better-sqlite3` synchronously — do not introduce async here. The orchestrator loop is synchronous and memory reads must be inline, not awaited.
- `memory_embeddings.embedding` stores a `BLOB` (raw float32 array). Leave the column in schema but do not compute embeddings in this task — that's `mem-b`.
- `entities` and `memory_entity_links` are created now; entity extraction logic is `mem-c`.
- `schema_migrations` table: `id TEXT PRIMARY KEY, applied_at INTEGER`. Run each `.sql` file once. Never re-run.
- sqlite-vec extension loading: add `loadSqliteVec(db)` stub in `db.ts` that tries `db.loadExtension('vec0')` and catches — logs a warning, does not throw. Vector column is unused until `mem-b`.
- Memory scopes in order of specificity (for future retrieval layering): `session < branch < repo < workspace < user < global`. Store as `TEXT`, validate with Zod enum.
- Dashboard: `featherkit-dashboard/` already has React Flow and Zustand installed. No dashboard changes in this task — the graph view is `mem-d`. But ensure the `MemoryRow` type is exported cleanly from `src/memory/types.ts` so `mem-d` can import it directly via the future HTTP server.

## Risks
- `better-sqlite3` requires native compilation (node-gyp). On some systems (especially ARM Macs or musl Linux), this can fail. Document the workaround (`bun add better-sqlite3 --build-from-source`) in the task handoff.
- FTS5 may not be compiled into the system SQLite on some Linux distros. `better-sqlite3` ships its own SQLite, so this should not be an issue — but confirm in tests.
- sqlite-vec extension availability varies by platform. The stub must be defensive; failing to load vec0 must never crash the process.
- `src/config/schema.ts` is shared between CLI and MCP server bundles. The `memory` config block must be Zod-only (no `better-sqlite3` import) — the `db.ts` import must stay in `src/memory/` only, never in `src/config/`.

## Constraints
- Use `zod/v4` (not `zod`) for all schemas — matches the rest of the codebase.
- No `console.log` in `src/memory/` — use `console.error` for warnings (same rule as `src/mcp/`).
- Atomic writes: every `MemoryStore` write method must use `db.transaction()`.
- Default `enabled: false` — memory must be a zero-cost no-op when not configured.
- Do not touch `src/orchestrator/` in this task — memory integration into the loop is `mem-b`.
- Do not add `sqlite-vec` to `package.json` in this task — the loadExtension approach is sufficient for v1.
