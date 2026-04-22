# Task: orch-f2

> **Status: Done**

> Meta-Router — rewrite on the `claude --print` harness (drop pi-ai API-key dependency)

## Goal
The current `src/orchestrator/router.ts` uses `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai`, which require `ANTHROPIC_API_KEY` (or equivalent) in `process.env`. Standing project direction is to route entirely through the `claude` CLI (`claude --print`) for TOS compliance and Claude Pro/Max plan usage. Rewrite the router to shell out to `claude`, parse a one-line JSON verdict, and keep the existing fallback behavior intact.

## Files

**Modified:**
- `src/orchestrator/router.ts` — full rewrite; keep the public signature `routeCriticResult(task, criticStdout, config)` and the exported `RouterVerdict` type.
- `src/config/schema.ts` — simplify `OrchestratorRouterSchema`: remove `provider`, `apiKeyEnv`; keep `enabled` (default `true`), `model` (default `'haiku'`); add `timeoutMs` (default `60000`).
- `test/orchestrator/router.test.ts` — replace pi-ai mocks with `execa` subprocess mocks.
- `package.json` — drop `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` iff no remaining imports (verify with grep).

**Created (optional refactor):**
- Helper `invokeClaudePrint(prompt, { model, systemPrompt, timeoutMs, signal })` inside `src/orchestrator/runner.ts` (export it) so both `runClaudeCodePhase` and the router share one subprocess entry point.

## Done Criteria
- [ ] `src/orchestrator/router.ts` contains no `@mariozechner/pi-*` imports
- [ ] With `ANTHROPIC_API_KEY` unset, `feather orchestrate --task <id>` completes the critic phase and routes (advance/loopback/blocked) correctly
- [ ] Router parses the last non-empty stdout line as JSON: `{"verdict":"advance|loopback|blocked","reason":"..."}`, validated with zod (`zod/v4`)
- [ ] Router timeout (configurable, default 60s) kills the subprocess and falls back to `fallbackFromTask()` without throwing
- [ ] Router fallback still fires on: disabled config, non-zero exit, bad/missing JSON, timeout, spawn error
- [ ] Both router decisions and fallback paths continue to append a `progress` entry to `state.json`
- [ ] `bun run build` passes with no type errors
- [ ] `bun test test/orchestrator/router.test.ts` passes; `execa` is mocked — no real `claude` binary invoked during tests
- [ ] `package.json` no longer lists `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai` unless another module still imports them (run `grep -r "pi-agent-core\|pi-ai" src/` to verify)

## Risks
- `@mariozechner/pi-ai` may be transitively required by `@mariozechner/pi-tui` — **verify before removing from package.json** (pi-tui is used by the dashboard phase; do not break it).
- Older `claude` builds may emit auth prompts or telemetry lines before JSON output. Parser must scan from the end of stdout for the last line that validates as JSON, not assume the full stdout is JSON.
- `--system-prompt` is supported on the current CLI (confirmed via `claude --help`: `--system-prompt <prompt>`). Pass system + user via separate flags; do not concatenate.
- `--model haiku` uses the alias resolver; config default should be the alias `haiku` not a pinned model id, so it auto-tracks upstream.
- Router runs after every critic phase → hot path. Keep it lean: no MCP, no plugins, no session. Consider passing `--bare` or `--disable-slash-commands` to minimize startup overhead (verify these flags don't suppress the JSON output).
- Claude CLI may occasionally emit output wrapped in markdown code fences despite the "JSON only" instruction. Parser should strip ```…``` fences as a pre-pass before JSON.parse.
- Concurrency: the router currently runs while the orchestrator lock is held by the same pid — no contention issue, but the subprocess should inherit the environment cleanly (no stray `ANTHROPIC_API_KEY` expectation).

## Constraints
- ESM only, `.js` import extensions.
- Use `zod/v4`, not `zod`.
- Router must never throw to the caller — every error path returns a `RouterVerdict` via `fallbackFromTask()`.
- Keep the public surface backward-compatible: `routeCriticResult(task, criticStdout, config): Promise<RouterVerdict>`.
- Do not add new runtime dependencies. `execa` is already in deps.
- Subprocess invocation: `execa('claude', ['--print', '--model', model, '--system-prompt', sysPrompt, userPrompt], { reject: false, timeout: timeoutMs, env: { ...process.env } })` — match the shape in `src/orchestrator/runner.ts`.
- Keep `sanitizeCriticOutput` (ANSI-strip + 4000-char cap) and `fallbackFromTask` unchanged — they're correct.
- Progress logging via `appendRouterProgress` stays; keep messages in the same shape so log consumers don't break.

## GitHub
Relates to the orch-f rework flagged by the user: "It needs an anthropic api key for some reason, but I asked you to make it use claude -p instead of api keys."
