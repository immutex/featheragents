# Context Pack — critic role / mem-a

---

_Generated at 2026-04-22T03:45:26.937Z_

---

## Task Goal

Lay the SQLite foundation for the featheragents long-term memory system: migrations, a thin synchronous `MemoryStore` class, and config wiring. This is infrastructure only — no retrieval logic, no write gating, no dashboard UI yet. Every subsequent memory task (`mem-b` retrieval, `mem-c` write path, `mem-d` dashboard graph) builds on this.

---

## Done Criteria

- [ ] `bun add better-sqlite3 @types/better-sqlite3` succeeds; `bun run build` still passes.
- [ ] `openMemoryDb('.project-state/memory.db')` creates the file and all 7 tables on first call; subsequent calls are idempotent (migration guard).
- [ ] FTS5 virtual table `memories_fts` exists and a `SELECT` against it returns correct rows.
- [ ] `MemoryStore.insert()` accepts a valid `MemoryInsert`, writes atomically (memory row + entity links in a single transaction), returns the new `id`.
- [ ] `MemoryStore.supersede(oldId, newId)` sets `is_active = 0` and `invalid_at` on the old row and sets `supersedes_memory_id` on the new row.
- [ ] `MemoryStore.query({ scope: 'repo', type: 'semantic' })` returns only active rows matching both filters.
- [ ] `config.memory.enabled = false` (default) means `openMemoryDb` is never called by the orchestrator — zero-cost when disabled.
- [ ] `bun test test/memory/store.test.ts` passes; no other tests regress.

---

## Diff (HEAD)

Scoped to: - **`src/memory/db.ts`** *(new)* — `openMemoryDb(dbPath)`: opens SQLite, runs pending migrations, returns `Database` handle. Exports a `MemoryDb` type alias., - **`src/memory/migrations/001_initial.sql`** *(new)* — all 7 core tables:, `memories`, `memory_embeddings`, `memory_edges`, `entities`, `memory_entity_links`, `memory_access_log`, `memory_compactions`, Plus `schema_migrations` tracking table. Enable FTS5 virtual table on `memories(title, content)`., - **`src/memory/store.ts`** *(new)* — `MemoryStore` class: `insert(memory)`, `getById(id)`, `query({ scope, type, isActive })`, `supersede(oldId, newId)`, `deactivate(id)`. Synchronous, no retrieval ranking yet., - **`src/memory/types.ts`** *(new)* — Zod schemas (using `zod/v4`) matching the canonical schema: `MemoryType`, `MemoryScope`, `MemoryRow`, `EntityRow`, `MemoryEdge`, `MemoryInsert`., - **`src/config/schema.ts`** — add `memory` block: `{ enabled: boolean, dbPath: string, ollamaUrl?: string }`. Default `dbPath` = `.project-state/memory.db`. Default `enabled` = `false` (opt-in)., - **`package.json`** — add `better-sqlite3` + `@types/better-sqlite3`., - **`test/memory/store.test.ts`** *(new)* — unit tests for `MemoryStore`: insert, query by scope/type, supersede, deactivate, FTS search.

```diff
(no changes)
```

---

## Recent Progress

- [build] Validated the backend memory path with a passing Bun-targeted store test suite, a successful tsup build, and a Node smoke test for the better-sqlite3-backed openMemoryDb path.
- [build] Ran the FeatherKit build phase gate: it passed with warnings only, with TypeScript and scoped vitest checks green and scope warnings caused by unrelated pre-existing working-tree changes outside mem-a.
- [build] Handoff written to critic
- [build] Re-prepared the mem-a review handoff by generating a critic context pack on disk and reactivating the task for critic review so the next agent sees the correct task context.
- [build] Handoff written to critic