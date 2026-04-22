# Task: mem-b

> **Status: Done**

## Goal
Build the hybrid retrieval pipeline on top of the `MemoryStore` from mem-a: scope-first, FTS5, vector similarity (via Ollama), and graph-neighborhood channels — then rerank and assemble a token-budgeted context block. This is the read side of the memory system.

## Files
- **`src/memory/retrieval/intent.ts`** *(new)* — `buildRetrievalIntent(task, config): RetrievalIntent`. Extracts `{ repo, branch, files, packages, agentRole, modelRole, taskCategory }` from the current `TaskEntry` + config. Pure function.
- **`src/memory/retrieval/channels.ts`** *(new)* — Four parallel channel functions:
  - `retrieveScoped(db, intent): MemoryRow[]` — scope-filter query, returns pinned summaries + recent active memories.
  - `retrieveKeyword(db, intent): MemoryRow[]` — FTS5 `memories_fts` query built from intent identifiers (files, packages, ids).
  - `retrieveVector(db, intent, ollamaUrl): Promise<MemoryRow[]>` — embed the intent description via Ollama `/api/embeddings`, `sqlite-vec` cosine similarity query. Returns empty array + logs warning if Ollama unreachable.
  - `retrieveGraph(db, rootIds): MemoryRow[]` — BFS over `memory_edges` up to depth 2, expand entity links from seed memories.
- **`src/memory/retrieval/rerank.ts`** *(new)* — `rerankMemories(candidates, intent): ScoredMemory[]`. Scores each by: scope match (0–3), entity overlap (count/10), semantic score (from vector channel), keyword score (FTS rank), recency (`updated_at` decay), salience, confidence, helpfulness (`avg(was_helpful)`). Returns sorted descending.
- **`src/memory/retrieval/assemble.ts`** *(new)* — `assembleContext(scored, tokenBudget): { block: string; used: number; trace: RetrievalTrace }`. Greedily packs memories up to budget. Each memory formats as `[type:scope] title — content`. Stores which memories were included + why (trace).
- **`src/memory/retrieval/index.ts`** *(new)* — `retrieveMemoryContext(db, task, config): Promise<{ block: string; trace: RetrievalTrace }>`. Orchestrates all four channels in parallel, dedupes by id, reranks, assembles. Default budget: 2000 tokens (~1500 chars × 4).
- **`src/memory/embeddings.ts`** *(new)* — `embedText(text, ollamaUrl): Promise<Float32Array | null>`. POST to `ollamaUrl/api/embeddings`. Returns null on any error — callers must handle gracefully. Also: `storeEmbedding(db, memoryId, vec, model)`.
- **`test/memory/retrieval.test.ts`** *(new)* — tests for each channel function (with mock db fixtures), rerank scoring, and assemble token budget enforcement.

## Done Criteria
- [ ] `retrieveMemoryContext(db, task, config)` returns a `{ block, trace }` without throwing when Ollama is unreachable (vector channel returns `[]` silently).
- [ ] Scope channel returns only memories matching the task's repo + branch scopes.
- [ ] FTS channel returns memories whose `title` or `content` contains a file name from `task.files`.
- [ ] Reranker orders a memory with scope=repo above one with scope=global for a repo-scoped task.
- [ ] `assembleContext` with `tokenBudget=500` includes at most ~125 words of memory content.
- [ ] Retrieval trace records `reason` per included memory (e.g. `"scope:repo match"`, `"fts:package.json"`, `"graph:depth-1"`).
- [ ] `bun test test/memory/retrieval.test.ts` passes.

## Risks
- Ollama may not be running. Vector channel must catch all network errors and return `[]` — never throw. The rest of retrieval (scope + FTS + graph) must remain fully functional without it.
- sqlite-vec's cosine function API differs from standard SQL. Confirm exact query syntax (`vec_distance_cosine` or `vec_search`) against the installed version during build.
- FTS5 rank function requires careful query construction — avoid SQL injection by parameterizing all user-derived values.
- Token budget estimation is approximate (chars / 4). For v1 this is acceptable; exact counting via tiktoken is v2.

## Constraints
- `retrieveMemoryContext` is the only async function in `src/memory/`. All channel functions that don't call Ollama are synchronous.
- Default token budget: 2000 tokens. Max memories returned: 8. Configurable via `config.memory`.
- No AI calls inside retrieval — pure SQLite + Ollama embeddings only.
- `RetrievalTrace` must be serializable to JSON (stored in `memory_access_log`).

## Depends on
- `mem-a` (MemoryStore, DB schema, FTS5 table, sqlite-vec stub)
