# Task: orch-a

> **Status: Done**

> Schema & Foundation — Orchestrator Layer Phase A

## Goal
Extend the existing Zod schemas, config defaults, and MCP tool registry to support the orchestrator layer. This is pure schema/config work — no orchestrator runtime logic. Everything added here must be backward-compatible: existing projects and manual workflows must continue to work unchanged.

## Files

**Modified:**
- `src/config/schema.ts` — add `OrchestratorConfigSchema`, `PhaseCompletionSchema`, `ApprovalRecordSchema`; extend `FeatherConfigSchema`, `TaskEntrySchema`, `ProjectStateSchema`
- `src/config/defaults.ts` — add `DEFAULT_ORCHESTRATOR_CONFIG` constant
- `src/config/loader.ts` — fill orchestrator defaults when block is absent from config file
- `src/mcp/tools/index.ts` — register `mark_phase_complete` tool
- `src/templates/featherkit-config.ts` — scaffold `orchestrator` block in generated `featherkit/config.json`
- `src/templates/skills/frame.ts` — append `mark_phase_complete` call to the skill's final step
- `src/templates/skills/build.ts` — same
- `src/templates/skills/critic.ts` — same
- `src/templates/skills/sync.ts` — same

**Created:**
- `src/mcp/tools/mark-phase-complete.ts` — new MCP tool

## Done Criteria
- [ ] `bun run build` passes with no type errors
- [ ] `bun test` passes (all existing tests green)
- [ ] `loadState` / `saveState` round-trips a `TaskEntry` containing the new optional fields (`sessionId`, `phaseCompletions`, `approvals`, `orchestratorLock`)
- [ ] `loadState` / `saveState` round-trips a `ProjectState` containing the new `orchestrator` block
- [ ] `loadConfig` on an existing config file without an `orchestrator` block returns a valid config with orchestrator defaults filled in
- [ ] `mark_phase_complete` MCP tool appears in the running server's tool listing
- [ ] `mark_phase_complete` writes a `PhaseCompletion` entry to the correct task in state.json and also appends a `ProgressEntry`
- [ ] Existing state.json files (no new fields) continue to parse without error
- [ ] All four skill templates (frame, build, critic, sync) include the `mark_phase_complete` instruction as their final step
- [ ] `feather init` generates a `featherkit/config.json` that includes the `orchestrator` block with defaults

## Constraints
- All imports from `zod/v4`, never from `zod` — project convention
- No `console.log` inside `src/mcp/` — stdout is JSON-RPC transport; use `console.error` for server logs
- New schema fields must all be `.optional()` — backward compat with existing state.json files
- `mark_phase_complete` must use atomic write (temp-file + rename) inherited from `saveState` — not a direct `writeFile`
- `OrchestratorConfigSchema` must use `.default({})` on nested objects so `z.infer` produces fully-resolved types, not `T | undefined` for sub-fields
- Do not add a new tsup entry — orchestrator code eventually lives inside `cli.ts` bundle, not a separate binary

## Risks
- Zod v4 `z.object().default({})` behavior for nested schemas with their own defaults: verify empirically that `FeatherConfigSchema.parse({ ...existing, orchestrator: undefined })` correctly fills in all nested defaults, not just the top-level `{}`.
- `mark_phase_complete` receives a `taskId` parameter but the state could have no matching task — tool must return a clear error message rather than silently failing or corrupting state.
- Skill template changes (adding `mark_phase_complete` step) affect every project that re-runs `feather skills install` — make sure the instruction is appended cleanly after existing content and does not duplicate if already present.

## Schema Shapes (reference from plan)

### `OrchestratorConfigSchema`
```ts
z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['auto', 'manual']).default('manual'),
  claudeCodeBinary: z.string().default('claude'),
  router: z.object({
    enabled: z.boolean().default(true),
    provider: z.string().default('anthropic'),
    model: z.string().default('claude-haiku-4-5-20251001'),
    apiKeyEnv: z.string().default('ANTHROPIC_API_KEY'),
  }).default({}),
  timeouts: z.object({
    phaseMinutes: z.number().default(30),
    idleHeartbeatMinutes: z.number().default(5),
  }).default({}),
  approvalGate: z.object({
    frame: z.enum(['editor', 'inline', 'pause', 'auto']).default('editor'),
    sync: z.enum(['prompt', 'pause', 'auto']).default('prompt'),
    editor: z.string().optional(),
  }).default({}),
  tui: z.object({
    enabled: z.boolean().default(true),
    maxStreamLines: z.number().default(40),
  }).default({}),
})
```

### `PhaseCompletionSchema`
```ts
z.object({
  phase: z.enum(['frame', 'build', 'critic', 'sync']),
  verdict: z.enum(['pass', 'warn', 'fail']).optional(),
  summary: z.string(),
  completedAt: z.string(),
  durationSeconds: z.number().optional(),
})
```

### `ApprovalRecordSchema`
```ts
z.object({
  phase: z.enum(['frame', 'sync']),
  approvedAt: z.string(),
  modified: z.boolean(),
  mode: z.enum(['editor', 'inline', 'pause', 'prompt', 'auto']),
})
```

### `TaskEntrySchema` additions (all `.optional()`)
- `sessionId: z.string().optional()`
- `phaseCompletions: z.array(PhaseCompletionSchema).optional()`
- `approvals: z.array(ApprovalRecordSchema).optional()`
- `orchestratorLock: z.object({ holderPid: z.number(), acquiredAt: z.string(), heartbeatAt: z.string() }).optional()`

### `ProjectStateSchema` addition
```ts
orchestrator: z.object({
  status: z.enum(['idle', 'running', 'paused', 'awaiting-approval']),
  pid: z.number().optional(),
  startedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
}).optional()
```

### `mark_phase_complete` MCP tool input
```ts
{
  taskId: z.string(),
  phase: z.enum(['frame', 'build', 'critic', 'sync']),
  verdict: z.enum(['pass', 'warn', 'fail']).optional(),
  summary: z.string(),
}
```

## Skill Template Addition

Each skill (frame, build, critic, sync) should gain this as its final numbered step, placed just before the closing `---` / hard rules section:

```
### Final step — signal completion

After all other steps are done, call:

\`\`\`
mcp__featherkit__mark_phase_complete {
  taskId: "<id>",
  phase: "<this-phase>",
  verdict: "<pass|warn|fail>",   // critic only; omit for other phases
  summary: "<1–3 sentence summary of what was done>"
}
\`\`\`
```

## Next Action
Read `src/config/schema.ts` and `src/config/defaults.ts` first to understand the existing patterns, then start with the schema additions before touching the skill templates.
