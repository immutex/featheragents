import type { FeatherConfig } from '../../config/schema.js';
import { integrationSteps } from '../integration-steps.js';

export function renderBuildSkill(config: FeatherConfig): string {
  return `---
name: build
description: Implement a task — load context, write code, commit small, run the gate, hand off.
---

# /build — Implement a Task

Read first. Build second. Gate before handoff.

> **Stay in scope.** If you find an unrelated bug, log it as a separate task — do not fix it here.
> **Commit small.** One logical change per commit. Never one giant "implement everything" commit at the end.

## Role boundary

| Allowed | Prohibited |
|---|---|
| Write, modify, delete files within the task scope | Modify files not listed in the task's Files section without noting it |
| Run tests, builds, linters, formatters | Fix bugs found during review (those come back as loopbacks) |
| Call all featherkit MCP tools | Silently expand scope |
| Commit code changes | Skip \`verify_phase\` before handoff |

---

## Step-by-step

### 1. Load context (one call)

\`\`\`
mcp__featherkit__prepare_context_pack { forRole: "build", taskId: "<id>" }
\`\`\`

This returns the task goal, done criteria, files list, risks, constraints, latest handoff notes, and any prior review findings. Read all of it before writing a line of code.

> If \`prepare_context_pack\` is unavailable:
> \`\`\`
> mcp__featherkit__get_task { taskId: "<id>" }
> \`\`\`
> Then read the task file and any files listed in it.

### 2. Resolve blockers before starting

Check the handoff and review notes (if this is a loopback from critic):
- Are there specific file:line blockers from the critic? Resolve those first.
- Are there open questions in the task file? Surface them as a progress note rather than guessing.
- Do the constraints conflict with what needs to be built? Log it, don't silently work around it.

### 3. Implement

Follow this discipline:

- **Match the existing patterns.** Read two or three nearby files before writing the first line. Match naming, error handling, import style, and file structure.
- **Small commits.** After each logical unit (a function, a module, a test suite), commit. Message format: \`<type>(<scope>): <what>\` — e.g., \`feat(auth): add token refresh handler\`.
- **Tests alongside code.** For any logic that can fail in non-obvious ways, write the test in the same commit as the implementation.
- **Surface blockers early.** If you hit something that blocks progress, log it immediately:
  \`\`\`
  mcp__featherkit__append_progress {
    taskId: "<id>",
    role: "build",
    message: "BLOCKED: <precise description of what's blocking and what's needed>"
  }
  \`\`\`
  Then stop and let the orchestrator handle it. Do not work around architectural blockers silently.

### 4. Log progress at meaningful checkpoints

After completing each significant unit of work:

\`\`\`
mcp__featherkit__append_progress {
  taskId: "<id>",
  role: "build",
  message: "<what was done — one precise sentence>"
}
\`\`\`

Precision matters: "Implemented \`atomicWrite\` in \`src/utils/fs.ts\` with temp-file + rename" is useful. "Made progress on file writing" is not.

### 5. Run the phase gate

Before writing any handoff, run:

\`\`\`
mcp__featherkit__verify_phase { phase: "build", taskId: "<id>" }
\`\`\`

- **FAIL** — fix the reported issues. Do not hand off with TypeScript errors or failing tests.
- **PASS WITH WARNINGS** — review each warning. Scope creep warnings (files changed outside the task) must be acknowledged in the handoff or the Files list updated in the task file.
- **PASS** — proceed to handoff.

The critic will check whether you ran this gate. Missing verification evidence is a process gap that will be flagged.

### 6. Write the handoff

\`\`\`
mcp__featherkit__write_handoff {
  from: "build",
  to: "critic",
  taskId: "<id>",
  notes: "<structured handoff — use the format below>"
}
\`\`\`

Required handoff format:

\`\`\`markdown
## What was done
- <File or function> — <what changed and why>
- ... (one bullet per logical unit)

## Verification
- verify_phase result: pass | pass-with-warnings | (list warnings)
- Tests run: <command and outcome>
- Build: <command and outcome>

## Files changed (outside task scope)
<List any files touched beyond the task's Files section, or "None".>

## Known gaps / open questions
<Anything the critic should pay special attention to, or decisions that were deferred. "None" if clean.>
\`\`\`

${integrationSteps(config, 'build')}

### Final step — signal completion

\`\`\`
mcp__featherkit__mark_phase_complete {
  taskId: "<id>",
  phase: "build",
  summary: "<1–3 sentences: what was built, verify_phase result, and any notable gaps>"
}
\`\`\`

---

## Hard rules

- Run \`verify_phase\` before every handoff — no exceptions
- Do not send broken code to the critic (TypeScript errors, failing tests)
- Do not refactor code outside the task scope — "while I'm here" changes break scope tracking
- Do not make a large final commit; commit at each logical unit
- Do not ignore critic loopback notes — if this is a second+ pass, address all blockers first
`;
}
