# Task: mem-d

> **Status: Done**

## Goal
Wire memory into the orchestrator loop (inject retrieved context into phase prompts, write memories after each phase) and expose memory operations as MCP tools so agents can explicitly read and write memories during their runs.

## Files
- **`src/orchestrator/loop.ts`** — before calling `runClaudeCodePhase()`, call `retrieveMemoryContext(db, task, config)` and prepend the returned `block` to the phase system prompt (append as a `<memory>` XML block after the skill prompt). After the phase completes, call `writePhaseMemories(db, phaseOutput, task, role, config)`.
- **`src/orchestrator/runner.ts`** — add optional `memoryBlock?: string` parameter to `runClaudeCodePhase()`. If provided, append it to the system prompt before spawning `claude --print`.
- **`src/mcp/tools/retrieve-memory.ts`** *(new)* — MCP tool `mcp__featherkit__retrieve_memory`. Input: `{ query: string, scope?: string, type?: string, limit?: number }`. Calls `retrieveKeyword` + `retrieveVector` + `retrieveScoped`, reranks, returns top results as a formatted list.
- **`src/mcp/tools/write-memory.ts`** *(new)* — MCP tool `mcp__featherkit__write_memory`. Input: `{ type, title, content, scope, entities? }`. Runs worthiness check → dedup → commit. Returns `{ action, memoryId }`.
- **`src/mcp/tools/list-memories.ts`** *(new)* — MCP tool `mcp__featherkit__list_memories`. Input: `{ scope?, type?, isActive? }`. Returns paginated list from `MemoryStore.query()`.
- **`src/mcp/tools/index.ts`** — register the three new tools (if memory is enabled in config; skip tool registration otherwise).
- **`src/server/routes/memory.ts`** *(new)* — `GET /api/memory/graph?scope=<scope>` → returns `{ nodes, edges }` for dashboard. `GET /api/memory/trace/:taskId` → returns last retrieval trace for a task. `GET /api/memory/:id` → full memory detail.
- **`test/orchestrator/memory-integration.test.ts`** *(new)* — mock `retrieveMemoryContext` and `writePhaseMemories`, verify they're called at the right points in the loop and that `memoryBlock` is passed to the runner.

## Done Criteria
- [ ] Running `feather orchestrate --task <id>` with `config.memory.enabled = true` injects a `<memory>...</memory>` block into the frame phase prompt (visible in the TUI output).
- [ ] After the frame phase, `memory_access_log` has at least one row for the task's session.
- [ ] After the build phase, `memories` table has at least one new row (the worthiness filter may drop some — that's fine; at least one should pass on a real build).
- [ ] `mcp__featherkit__retrieve_memory({ query: "router rewrite" })` returns memories about the router task when called from within a Claude session.
- [ ] `mcp__featherkit__write_memory({ type: "semantic", title: "...", content: "...", scope: "repo" })` inserts a memory and returns its id.
- [ ] `GET /api/memory/graph?scope=repo` returns a valid `{ nodes: [...], edges: [...] }` structure.
- [ ] `config.memory.enabled = false` (default) — none of the new loop code paths execute; no `better-sqlite3` import at runtime.
- [ ] `bun run build` + `bun test` pass.

## Risks
- Injecting memory into the system prompt increases token consumption per phase. The retrieval budget (default 2000 tokens) must be respected. Monitor that the total prompt + memory stays under the model's context window.
- `writePhaseMemories` uses `claude --print` inside `extractCandidates` (from mem-c). This means the orchestrator spawns two Claude subprocesses per phase (one for the phase, one for memory extraction). This is acceptable but must be clearly documented.
- The MCP tools must check `config.memory.enabled` before opening the DB — tools should return a clear error if memory is disabled, not silently succeed with no data.

## Constraints
- Memory block is prepended to the system prompt, never the user prompt. Agents must not be confused by memory appearing as "user instructions."
- MCP tools are only registered when `config.memory.enabled = true`.
- `GET /api/memory/graph` must return within 500ms for graphs up to 500 nodes — use a single JOIN query, not N+1.
- The loop changes must not alter the existing phase completion recording logic.

## Depends on
- `mem-a` (MemoryStore)
- `mem-b` (retrieval pipeline)
- `mem-c` (write path)
- `dash-b` (for `/api/memory/*` routes)
