# Task: mem-c

> **Status: Done**

## Goal
Build the write path: extract candidate memories from agent output, score worthiness, deduplicate against existing memories, and commit the correct action (ignore / update / create / supersede / compact). This is what runs after every phase completes.

## Files
- **`src/memory/write/extract.ts`** *(new)* — `extractCandidates(phaseOutput: string, task: TaskEntry, role: ModelRole): CandidateMemory[]`. Calls `claude --print` with a compact extraction prompt (≤200 tokens) that returns a JSON array of `{ type, title, content, scope, entities[] }`. Max 5 candidates per phase. Returns `[]` on parse failure — never throws.
- **`src/memory/write/worthiness.ts`** *(new)* — `scoreWorthiness(candidate, existingContext): number` (0–1). Heuristic scoring:
  - +0.4 if type is `procedural` or `semantic`
  - +0.2 if entities non-empty
  - +0.2 if scope is `repo` or narrower
  - −0.3 if content length < 20 chars
  - −0.3 if matches known low-signal patterns (status updates, "I did X", "completed Y")
  - Threshold to store: ≥ 0.5. Configurable via `config.memory.worthinessThreshold`.
- **`src/memory/write/dedup.ts`** *(new)* — `findRelated(db, candidate): MemoryRow[]`. Runs FTS + scope filter to find similar existing memories. `decideAction(candidate, related): WriteAction` where `WriteAction = { kind: 'ignore'|'update'|'create'|'supersede'|'compact', targetId?: string }`.
- **`src/memory/write/commit.ts`** *(new)* — `commitAction(db, action, candidate)`. Executes the decided action atomically: insert + entity links + edges + supersession metadata. For `compact`: inserts a new `summary` memory, sets `supersedes_memory_id` on each source, deactivates sources.
- **`src/memory/write/index.ts`** *(new)* — `writePhaseMemories(db, phaseOutput, task, role, config)`. Orchestrates extract → worthiness filter → dedup → commit for each candidate. Logs each decision to `memory_compactions` or `memory_access_log` as appropriate.
- **`test/memory/write.test.ts`** *(new)* — tests for worthiness scorer (pass/fail cases), `decideAction` (update vs supersede vs ignore), and `commitAction` transaction atomicity.

## Done Criteria
- [ ] `extractCandidates` with a sample critic output returns 1–3 structured `CandidateMemory` objects without throwing on malformed JSON from Claude.
- [ ] Candidate with `content: "done"` scores below worthiness threshold and is not stored.
- [ ] Candidate whose title/scope/type closely matches an existing memory triggers `update` action, increasing confidence by 0.05 and merging content.
- [ ] Candidate that contradicts an existing fact (detected by FTS match + manual test) triggers `supersede` action: old memory deactivated, new memory stored with `supersedes_memory_id`.
- [ ] Three episodic memories with identical entities and similar content compact into one `summary` memory, all sources deactivated.
- [ ] `writePhaseMemories` is a no-op (returns immediately) when `config.memory.enabled = false`.
- [ ] `bun test test/memory/write.test.ts` passes.

## Risks
- `extractCandidates` calls `claude --print` — this adds latency after every phase. Keep the extraction prompt under 200 tokens and the output schema minimal. If it takes > 5s, skip silently (abort + warn).
- The dedup decision (`update` vs `supersede`) is heuristic. False positives (incorrectly superseding a valid fact) are worse than false negatives. Default to `create` when similarity is ambiguous; only `supersede` on strong FTS match + same scope + same type.
- Compaction of multiple episodic memories into a summary also calls `claude --print`. Gate this: only compact when ≥ 5 episodic memories share the same entity and scope; compact at most once per orchestrator run.

## Constraints
- `extractCandidates` uses `claude --print` — same harness as the orchestrator runner. 60s timeout, fallback to `[]`.
- All DB writes are transactional (`db.transaction()`).
- No memory is ever hard-deleted — only `is_active = 0` + `invalid_at` set.
- `writePhaseMemories` runs after phase completes, never before — it must not block the orchestrator's next phase selection.

## Depends on
- `mem-a` (MemoryStore, DB schema)
- `mem-b` (FTS retrieval used in dedup channel to find related memories)
