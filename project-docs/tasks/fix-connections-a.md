# Task: fix-connections-a

## Goal
Fix five UX/logic bugs in the Connections dashboard view reported from the first 1.0.0-alpha test run: shared login button state, wrong Pi auth command, card layout inconsistency, OpenAI auth not detected, and Skills tab always showing mock data.

## Context
`featherkit-dashboard/src/views/Connections.tsx` has a single shared `loginMutation` at component level. When any login is triggered, `loginMutation.isPending` becomes true for ALL cards simultaneously, disabling all buttons and playing the loading animation on every card at once. The server returns `Run: pi login ${provider}` as the auth instruction, but `pi login openai` is not a valid Pi CLI command — the agent must web search the correct Pi CLI login syntax. OpenAI shows as "unauthenticated" even when logged in — investigate if `authStorage.hasAuth('openai')` reads the right key from `~/.pi/auth.json`. Cards have inconsistent heights because some have more content (model badges, "used by" chips) — this breaks the grid alignment.

## Files
- **`featherkit-dashboard/src/views/Connections.tsx`** — fix shared mutation state, fix card grid alignment, update instruction display
- **`src/server/routes/connections.ts`** — fix Pi login instruction string, fix auth status key lookup
- **`featherkit-dashboard/src/lib/queries.ts`** — may need per-provider mutation or status tracking

## Research Required
- **Web search:** Correct Pi CLI command to authenticate a provider. Try searching "pi-coding-agent pi login provider command" or "mariozechner pi-coding-agent auth CLI". The correct command is likely `pi auth <provider>` or `pi <provider> login` — verify before writing instruction string.
- **Inspect** `~/.pi/auth.json` key format to confirm what key OpenAI credentials are stored under — the server code reads `authStorage.hasAuth(provider)` where provider is lowercase from config. Confirm the key name matches.

## Done Criteria
- [x] Clicking login on one provider card shows loading state only on that card's button — other cards remain interactive
- [x] The instruction shown to users for Pi providers uses the correct CLI command (verified via web search)
- [x] OpenAI shows "connected" when `~/.pi/auth.json` contains valid OpenAI credentials
- [x] All provider cards in the grid are the same height (use `items-stretch` + `h-full` on cards, or `min-h` to normalize)
- [x] `bun run build` passes, `cd featherkit-dashboard && bun run build` passes

## Risks
- Pi CLI auth command format may vary by version — web search is mandatory before changing the instruction string
- Auth key name in `auth.json` may not be lowercase `openai` — read the actual file on the user's machine if possible, or handle case-insensitive lookup
- Skills tab in Connections is always mock (FK_DATA.skills) — this is post-alpha scope (`dash-e`), do NOT wire it up; just leave a `// TODO: dash-e` comment

## Constraints
- Do not change the provider list itself (providers come from config.models, that's correct)
- Do not add new providers or change the OpenRouter → Z.AI migration (separate task)
- Do not touch MCP servers section of Connections
