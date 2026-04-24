# Latest Handoff

**From:** build
**To:** sync
**Time:** 2026-04-24T04:46:21.592Z
**Task:** fix-connections-a

## Notes

Applied all 3 critic suggestions on top of the merged fix-connections-a work:

1. **Typed `list()` on `PiAuthStorage`** — Added `list: () => string[]` to the local type definition. Removed both `(authStorage as any).list?.()` casts. Mock objects in tests updated with `list: () => []`.

2. **Shared `resolveAuthProvider()` helper** — Extracted to a top-level function `(provider: string, authStorage: PiAuthStorage) => string`. Both `listConnectionProviders()` and the login handler now call the same function instead of duplicating the logic or creating a second `authStorage` instance.

3. **Separator-aware prefix matching** — Changed from `key.startsWith(provider)` to `key.startsWith(provider + '-')`. This prevents `"open"` from matching `"openrouter"` — only hyphen-suffixed aliases like `"openai-codex"` are matched.

Added a test case for alias resolution (`openai` → `openai-codex` in auth.json).

Results: 442 tests pass, 0 fail. Both root and dashboard builds pass. Phase gate: PASS WITH WARNINGS (scope warnings are from the prior merged worktree diff, not new changes).
