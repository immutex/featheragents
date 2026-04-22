---
name: build
description: Implement a task — read the task file, write code, commit small, log progress.
---

# /build — Implement a Task

Read first. Build second. Log as you go.

## When to use

Use `/build` when a task has been framed and is ready for implementation. The task file at `project-docs/tasks/<id>.md` should exist and have done criteria.

## Step-by-step

### 1. Load the task

```
mcp__featherkit__get_task  { taskId: "<id>" }
```

Read the goal, files list, done criteria, and risks. If there are open questions, resolve them before writing code — don't guess.

### 2. Read only what you need

Read the specific files listed in the task. If you need conventions, check `project-docs/context/conventions.md`. Do not read the entire codebase.

### 3. Implement

- Follow existing code patterns. Match the style of surrounding code.
- Write tests alongside code for any non-trivial logic.
- Make small, focused commits — one logical change per commit.
- If you hit an unexpected blocker, stop and surface it rather than working around it silently.

### 4. Log progress at each significant step

After completing a meaningful chunk (a module, a test suite, a tricky function):

```
mcp__featherkit__append_progress  {
  taskId: "<id>",
  role: "build",
  message: "<one sentence: what was done>"
}
```

Keep messages factual and brief: "Implemented state-io atomicWrite", not "Made great progress on the file writing system".

### 5. Verify before handing off

Before writing the handoff, run the mechanical phase gate:

```
mcp__featherkit__verify_phase  { phase: "build", taskId: "<id>" }
```

- **FAIL** → fix the issues before calling `write_handoff`. TypeScript errors and test failures must be resolved — don't send broken code to a critic session.
- **PASS WITH WARNINGS** → review each warning. Scope creep warnings (files changed outside the task) should be acknowledged in the handoff notes or the task's Files list updated.
- **PASS** → proceed to `write_handoff`.

This catches mechanical problems (TypeScript, test failures, scope creep) before they waste tokens on a critic review.

---

## Integration steps

**GitHub**
- Reference the issue in commit messages: `Fixes #123` or `Relates to #456`.
- Open a draft PR when the implementation is ready for early review.

**Context7**
- Before implementing with any external library, call Context7 (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`) for current docs. Prefer this over training knowledge for version-specific APIs.

**Web search**
- Use web search to investigate unfamiliar errors or library behaviours before spending time on guesswork.

**Playwright**
- After implementing UI changes, use Playwright to verify the affected pages render correctly:
  1. `mcp__playwright__browser_navigate` to the relevant page
  2. `mcp__playwright__browser_snapshot` to inspect the accessibility tree
  3. `mcp__playwright__browser_click` / `mcp__playwright__browser_fill` to exercise interactive elements
  Include a brief note in your progress log confirming the browser check passed.

---

## Hard rules

**Do NOT:**
- Restate the plan at every step
- Read files unrelated to the task
- Refactor code outside the task scope ("while I'm here...")
- Skip tests for logic that can fail in non-obvious ways
- Make a large "everything" commit at the end

**Do:**
- Match the existing code style exactly
- Ask before changing scope
- Commit frequently
- Surface blockers early

---

## Token efficiency

- `get_task` gives you everything you need — don't also load the entire project brief
- For a single-call context bundle: `prepare_context_pack { forRole: "build", taskId: "<id>" }` replaces `get_task` + conventions reading with one call
- Read source files surgically: the specific files named in the task, plus direct imports
- `append_progress` keeps notes compact — one sentence per entry
- Don't summarize what you're about to do; just do it
