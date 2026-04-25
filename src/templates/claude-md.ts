import type { FeatherConfig } from '../config/schema.js';
import { integrationHint } from './integration-steps.js';

export function renderClaudeMd(config: FeatherConfig): string {
  const integrationLines = Object.entries(config.integrations)
    .filter(([, enabled]) => enabled)
    .map(([name]) => `- ${integrationHint(name)}`)
    .join('\n');

  const modelLines = config.models
    .map((m) => `- **${m.role}**: ${m.provider}/${m.model}`)
    .join('\n');

  const memoryTools = config.memory?.enabled
    ? `\n**Memory** *(enabled — use these to recall and persist knowledge across sessions)*\n- \`retrieve_memory\` — query memory by keyword before starting work\n- \`write_memory\` — commit a decision, pattern, or lesson after completing work\n- \`list_memories\` — browse memories by scope and type`
    : '';

  return `# ${config.projectName}

## FeatherKit Workflow

This project uses FeatherKit for multi-model coordination.
4-stage loop: **Frame → Build → Critic → Sync**

### Roles & Models
${modelLines}

### MCP Tools Available

**Task & state** *(call these — don't edit state files directly)*
- \`get_project_brief\` — project summary and active focus
- \`get_active_focus\` — current focus file and priorities
- \`get_task\` — task details, progress log, and phase completions
- \`start_task\` — register/activate a task in state
- \`list_tasks\` — all tasks and their statuses
- \`append_progress\` — log progress to current task (one sentence, factual)
- \`write_handoff\` — write handoff between roles (updates latest-handoff.md)
- \`record_review_notes\` — write critic review findings
- \`record_decision\` — record a non-obvious architectural decision

**Phase gating**
- \`verify_phase\` — deterministic gate: scope check, tsc, tests — builder calls before write_handoff
- \`mark_phase_complete\` — signal phase completion to the orchestrator — **call at the end of every phase**
- \`get_diff\` — scoped git diff for the current task's files (critic uses this)
- \`prepare_context_pack\` — single-call context bundle for a role (recommended over calling tools individually)
${memoryTools}

### Skills
- \`/frame\` — plan a task (load context → write task file → stop before implementing)
- \`/build\` — implement a task (load context → code → gate → handoff)
- \`/critic\` — review changes (read diff → evaluate criteria → record verdict → never fix)
- \`/sync\` — write handoff so the next role can resume without losing context
${integrationLines ? `\n### Integrations\n${integrationLines}\n` : ''}
### Role boundaries (enforced)

| Role | Can write code | Can call verify_phase | Can fix bugs | Calls mark_phase_complete |
|---|---|---|---|---|
| frame | task files only | no | no | yes |
| build | yes (in scope) | yes | yes | yes |
| critic | no | no | **NEVER** | yes |
| sync | no | no | no | yes |

**The critic never fixes code.** If the critic finds a bug, it records it in review notes and sets verdict to "fail". The router sends the task back to the builder. This is not optional.

### Conventions
- Read task file before acting: \`${config.docsDir}/tasks/<id>.md\`
- Project state: \`${config.stateDir}/state.json\` (via MCP — never edit directly)
- Use \`prepare_context_pack\` as your first call; it replaces multiple individual tool calls
- Keep context tight: only read files relevant to the current task
- \`mark_phase_complete\` is the final step of every phase — the orchestrator waits for it
- Log blockers immediately with \`append_progress\` — do not work around them silently
`;
}
