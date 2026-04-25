import type { FeatherConfig } from '../../config/schema.js';
import { integrationSteps } from '../integration-steps.js';

export function renderSyncSkill(config: FeatherConfig): string {
  const steps = integrationSteps(config, 'sync');
  return `---
name: sync
description: Close out a session — write a complete handoff so the next role can resume without losing a single bit of context.
---

# /sync — Sync State and Hand Off

> The handoff you write is the only thing the next role will have. If you omit something, it stays lost.
> Write as if you're handing off to someone who has never seen this project.

## Role boundary

| Allowed | Prohibited |
|---|---|
| Read files and state | Modify source files |
| Write handoff and progress notes | Make code changes or commits |
| Update task status via MCP tools | Make architectural decisions (document them, don't make them) |
| Call \`mark_phase_complete\` | Start implementation work |

---

## Step-by-step

### 1. Load current state

\`\`\`
mcp__featherkit__get_task        { taskId: "<id>" }
mcp__featherkit__get_active_focus
\`\`\`

Read the task goal, progress log, phase completions, and any existing review notes. Build a mental model of exactly where things stand.

### 2. Assess completeness honestly

Answer these before writing anything:

- Which done criteria are fully met? Which are not?
- What is the single most important next action?
- Are there blockers, deferred decisions, or open questions?
- Did the critic have any findings that weren't addressed?
- Is the task actually done, or does it need another build pass?

If the task is done (all criteria met, critic approved, no blockers): mark it done in your handoff and advance.
If work remains: be explicit about what remains — do not suggest the task is further along than it is.

### 3. Write the handoff

\`\`\`
mcp__featherkit__write_handoff {
  from: "<your role>",
  to: "<next role>",
  taskId: "<id>",
  notes: "<handoff content — use the required format below>"
}
\`\`\`

Required format:

\`\`\`markdown
## What was done
- <Specific action> — <file or system> — <outcome>
- ... (bullet per logical unit, not per tool call)

## Status against done criteria
- [x] <criterion fully met>
- [ ] <criterion NOT met — what remains>

## What is next
**Immediate action:** <one specific thing the next role should do first>

Remaining items (in priority order):
1. <item>
2. <item>

## Blockers / open questions
<Anything that must be resolved before work can continue. Be precise: who needs to decide what. "None" if clean.>

## Key decisions made this session
<Non-obvious choices and the rationale. Omit if nothing notable.>

## Files changed
<List of files modified. Helps the next role orient quickly.>

## Environment / setup notes
<Branch name, migration state, env vars, anything needed to resume. Omit if standard.>
\`\`\`

Keep it under 400 words. If you find yourself writing more, you're documenting instead of handing off.

### 4. Log a progress note

\`\`\`
mcp__featherkit__append_progress {
  taskId: "<id>",
  role: "sync",
  message: "Handoff written: <from> → <to>. <One sentence on task status.>"
}
\`\`\`

${steps}

### Final step — signal completion

\`\`\`
mcp__featherkit__mark_phase_complete {
  taskId: "<id>",
  phase: "sync",
  summary: "<1–3 sentences: what the session accomplished, what remains, who picks up next>"
}
\`\`\`

---

## Hard rules

- Do not omit blockers to make the task look cleaner than it is
- Do not write vague next actions like "continue implementation" — be specific
- Do not use sync to avoid completing work that can be done now
- Do not assume the next role has read this session's conversation — they haven't
- Handoff notes must be self-contained; never reference "what we discussed" or "as mentioned above"
- If the task is genuinely done, say so explicitly — do not leave the next role guessing
`;
}
