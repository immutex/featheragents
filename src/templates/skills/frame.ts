import type { FeatherConfig } from '../../config/schema.js';
import { integrationSteps } from '../integration-steps.js';

export function renderFrameSkill(config: FeatherConfig): string {
  return `---
name: frame
description: Plan a task — load context, produce a tight task file with verifiable done criteria, then stop.
---

# /frame — Frame a Task

Plan before you build. A sharp frame prevents scope creep, duplicate work, and wasted critic cycles.

> **Stop at the end of this skill.** Do not begin implementing. Hand off to the builder.

## Role boundary

| Allowed | Prohibited |
|---|---|
| Read files and run read-only commands | Write or modify source files |
| Create/update task files in \`project-docs/tasks/\` | Implement any logic, even "just to verify" |
| Call \`start_task\`, \`append_progress\`, \`record_decision\` | Commit code changes |
| Call \`mark_phase_complete\` | Start a build phase |

---

## Step-by-step

### 1. Load project context

Single call:

\`\`\`
mcp__featherkit__prepare_context_pack { forRole: "frame", taskId: "<id>" }
\`\`\`

This gives you the project brief, active focus, existing task state, and latest handoff. Read what comes back before doing anything else.

> If \`prepare_context_pack\` is unavailable, call these in order:
> \`\`\`
> mcp__featherkit__get_project_brief
> mcp__featherkit__get_active_focus
> \`\`\`
> Then read the task file at \`project-docs/tasks/<id>.md\` if it exists.

### 2. Resolve ambiguities before writing

Answer these before touching any file:

- What exactly changes? (be specific — "refactor the handler" is not specific)
- Which files are most likely affected?
- What does "done" look like — something anyone can verify without asking?
- What could go wrong or regress?
- Are there dependencies on other tasks? On external systems?

If critical information is missing and you cannot resolve it from context, surface it as an open question in the task file rather than guessing.

### 3. Register the task

\`\`\`
mcp__featherkit__start_task { taskId: "<id>", title: "<short title, ≤60 chars>" }
\`\`\`

Do this before writing the task file so the task appears in state.

### 4. Write the task file

Create or update \`project-docs/tasks/<id>.md\`:

\`\`\`markdown
# Task: <id>

## Goal
<What needs to be done and why. Two sentences max. Be ruthlessly specific.>

## Context
<Key background the builder needs: which module, what invariants, what prior decisions apply.>

## Files
<Exhaustive list of files to create or modify. The critic scopes its diff to this list — be accurate.>
- \`src/path/to/file.ts\` — <what changes here>

## Done Criteria
- [ ] <Specific, binary outcome. Someone can run a command or read a line and confirm this.>
- [ ] <Another outcome — one per line, no compound criteria>
- [ ] Tests pass with \`bun test\` (or whichever test command applies)
- [ ] TypeScript compiles with no errors (\`tsc --noEmit\` or \`bun run build\`)

## Risks
<What could break. What assumptions you're making. What the builder should double-check.>

## Constraints
<Hard requirements: must not break X, must match Y pattern, must stay under Z size, must not touch W.>

## Open questions
<Anything unresolved. Delete this section if none.>
\`\`\`

Done criteria rules:
- Every criterion must be binary (pass/fail) — no "looks good", "seems correct"
- At least one criterion must be mechanically verifiable (test, build, grep)
- No criterion should require reading the implementer's mind

### 5. Record key decisions

If you made a non-obvious scoping choice or ruled out an approach, document it:

\`\`\`
mcp__featherkit__record_decision {
  taskId: "<id>",
  decision: "<what was decided and why — one paragraph>"
}
\`\`\`

### 6. Confirm and stop

Print a single paragraph: what will be built, why, and what the builder should read first. Then stop. Do not start implementing.

${integrationSteps(config, 'frame')}

### Final step — signal completion

\`\`\`
mcp__featherkit__mark_phase_complete {
  taskId: "<id>",
  phase: "frame",
  summary: "<1–3 sentences: what was framed, any open questions, what the builder needs to know>"
}
\`\`\`

---

## Hard rules

- Do not write implementation code — not even "just to test the approach"
- Do not enumerate every file in the repo; list only files the task will touch
- Do not produce a full technical spec; the task file should fit on one screen
- Do not ask more than one clarifying question at a time if interaction is available
- If something is genuinely unclear, say so in Open Questions rather than guessing
`;
}
