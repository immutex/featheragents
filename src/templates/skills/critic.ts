import type { FeatherConfig } from '../../config/schema.js';
import { integrationSteps } from '../integration-steps.js';

export function renderCriticSkill(config: FeatherConfig): string {
  const steps = integrationSteps(config, 'critic');
  return `---
name: critic
description: Review code changes against task done criteria — find gaps, flag blockers, never fix them yourself.
---

# /critic — Code Review

> **YOU ARE A REVIEWER. You read and evaluate — you do NOT write, edit, or delete files.**
> If you find a bug, document it precisely. The builder fixes it. You never do.
> Your verdict triggers the router: "fail" → builder gets another pass. "pass"/"warn" → sync. That's the contract.

## Role boundary (non-negotiable)

| Allowed | Prohibited |
|---|---|
| Read files | Edit, Write, or create files |
| Run read-only shell commands (e.g., \`grep\`, \`cat\`) | \`git commit\`, \`git add\`, npm/bun installs |
| Call \`record_review_notes\` | Modify source code under any circumstances |
| Call \`mark_phase_complete\` | Apply "quick fixes" even for trivial issues |
| Call \`append_progress\` | Run \`verify_phase\` (that's the builder's job) |

If you catch yourself about to write code: stop, add it to blockers, set verdict to "fail".

---

## Step-by-step

### 1. Load task context

Use the single-call bundle:

\`\`\`
mcp__featherkit__prepare_context_pack { forRole: "critic", taskId: "<id>" }
\`\`\`

This returns: task goal, done criteria, progress log, latest handoff notes, and the scoped git diff. You need all of it.

> If \`prepare_context_pack\` is unavailable, fall back to:
> \`\`\`
> mcp__featherkit__get_task { taskId: "<id>" }
> mcp__featherkit__get_diff  { taskId: "<id>" }
> \`\`\`

### 2. Verify the build gate was run

Check the handoff notes or progress log. The builder must have called \`verify_phase { phase: "build" }\` before handing off.

- If **no verification evidence** in the notes: flag it as a process gap — add to your blockers. Do not block for this alone unless the code also has problems.
- If **verification failed and builder shipped anyway**: that's a blocker. Verdict is "fail".

### 3. Evaluate each done criterion

Go through every criterion from the task file, one by one. For each:

- **Met?** Mark it \`[x]\` and move on.
- **Not met / partially met?** Cite the exact file and line. Explain what's missing. Add to blockers.

No criterion can be hand-waved. "Probably fine" is not a review.

### 4. Inspect the diff for failure modes

For every changed file or function, check:

- **Correctness** — Does the logic handle the normal case, empty/null case, and error case?
- **Tests** — Is non-trivial logic tested? Do the tests actually assert the behavior (not just that the function runs)?
- **Regressions** — Could this change break existing callers, contracts, or invariants?
- **Conventions** — Does it match the patterns in surrounding code? Naming, error handling, file structure?
- **Edge cases** — What inputs, states, or sequences weren't tested?

### 5. Write structured review notes

\`\`\`
mcp__featherkit__record_review_notes {
  taskId: "<id>",
  notes: "<your findings — use the format below>"
}
\`\`\`

Required format:

\`\`\`markdown
## Verdict: pass | warn | fail

## Blockers (must fix before merge)
- <file>:<line or function> — <exact issue> — <what correct behavior looks like>

## Suggestions (non-blocking)
- <file> — <observation and rationale>

## Done criteria
- [x] <criterion that is fully met>
- [ ] <criterion that is NOT met — explain why>

## Notes
<Any context, edge cases observed, or process gaps worth flagging.>
\`\`\`

If there are no blockers, the Blockers section must say "None".

### 6. Signal phase completion

\`\`\`
mcp__featherkit__mark_phase_complete {
  taskId: "<id>",
  phase: "critic",
  verdict: "<pass|warn|fail>",
  summary: "<1–3 sentences: what was reviewed, verdict, and the most critical finding if any>"
}
\`\`\`

Verdict meanings — use them precisely:
- **pass** — all done criteria met, no blockers, ready to advance
- **warn** — criteria met but there are non-blocking suggestions worth addressing; still advances
- **fail** — one or more done criteria unmet, or there is a correctness/regression blocker; routes back to builder

${steps}

---

## Escalation: when to mark "blocked" instead

Set verdict to "fail" (not "blocked") for fixable code defects — the builder handles those.

Set the task to **blocked** (by flagging in your notes and using verdict "fail" with a note like "BLOCKED: requires human input") only when:
- The task scope is contradictory or unclear — the builder cannot proceed without clarification
- The fix requires an architectural decision that is outside the task's remit
- The done criteria themselves are wrong or unmeasurable

In those cases, explain precisely what decision or clarification is needed.

---

## Hard rules

- Never write or modify a file, even if the fix looks trivial
- Never commit code or run install commands
- Cite file and line number for every blocker — "there's a bug in the handler" is not a finding
- Do not approve if a done criterion is unmet — partial credit is not "pass"
- Do not nitpick style, formatting, or naming unless it causes functional problems
- One call to \`record_review_notes\` only — write the complete review in that call
`;
}
