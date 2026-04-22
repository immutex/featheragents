# featheragents

## FeatherKit Workflow

This project uses FeatherKit for multi-model coordination.
4-stage loop: **Frame → Build → Critic → Sync**

### Roles & Models
- **frame**: anthropic/claude-sonnet-4-6
- **build**: openai/gpt-5.4
- **critic**: openrouter/z-ai/glm-5.1
- **sync**: openai/gpt-5.4-mini

### MCP Tools Available
Use `mcp__featherkit__*` tools for project state:

**Task & state**
- `get_project_brief` — project summary and active focus
- `get_active_focus` — current focus file
- `get_task` — task details and progress
- `start_task` — register/activate a task
- `list_tasks` — all tasks and statuses
- `append_progress` — log progress to current task
- `write_handoff` — write handoff between roles
- `record_review_notes` — write review findings
- `record_decision` — record an architectural decision

**Phase gating**
- `verify_phase` — deterministic gate: scope check, tsc, tests — call before write_handoff
- `mark_phase_complete` — signal phase completion to the orchestrator (call at end of every phase)
- `get_diff` — scoped git diff for the current task's files (use in critic sessions)
- `prepare_context_pack` — single-call context bundle for a specific role (frame/build/critic/sync)

**Memory** *(only available when `config.memory.enabled = true`)*
- `retrieve_memory` — query memory store by keyword/vector/scope
- `write_memory` — commit a memory directly
- `list_memories` — browse memories by scope and type

### Skills
- `/frame` — plan a task (read context, produce summary + done criteria)
- `/build` — implement a task (follow task file, commit small)
- `/critic` — review changes (diff + task goal only)
- `/sync` — handoff notes and state sync

### Integrations
- **GitHub** — link issues in commits, post findings on PRs
- **Context7** — fetch live library docs during frame and build
- **Web search (Tavily)** — validate technical decisions during frame and build
- **Playwright** — browser-verify UI changes during build; smoke-test during critic

### Conventions
- Read task file before acting: `project-docs/tasks/<id>.md`
- Project state: `.project-state/state.json` (via MCP — don't edit directly)
- Keep context tight. Only read files relevant to the current task.
- Call `mark_phase_complete` as the final step of every phase — this is how the orchestrator knows to advance.
