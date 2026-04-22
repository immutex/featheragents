# Task: dash-e

## Goal
Wire the Connections tab to real OAuth flows via pi-ai and make MCP server CRUD persist to `.mcp.json`. After this task a user can click Login on any provider, complete OAuth in a browser, and the dashboard reflects Connected status — no manual env var or API key needed.

## Context
`featherkit-dashboard/src/views/Connections.tsx` is fully built with provider cards, MCP table, Skills list, and action buttons — all against mock data. `pi-a` (adopt pi ecosystem) must be complete so `src/integrations/pi-loader.ts` exists and `feather pkg` is available.

## Files
- **`src/server/routes/connections.ts`** — replace stub with real implementation:
  - `GET /api/connections/providers` → call `pi-loader.listProviders()`, merge with config to return status + model list.
  - `POST /api/connections/providers/:provider/login` → trigger pi-ai OAuth flow for the provider (call appropriate `loginXxx()` from `@mariozechner/pi-coding-agent`'s auth module). Returns `{ url }` for browser redirect, or `{ status: 'connected' }` if already authenticated.
  - `GET /api/connections/providers/:provider/status` → poll credential storage, return `connected | disconnected | expired`.
  - `GET /api/connections/mcp` → read `.mcp.json`, return array.
  - `POST /api/connections/mcp` → append new server entry to `.mcp.json`, atomic write.
  - `PUT /api/connections/mcp/:name` → update entry.
  - `DELETE /api/connections/mcp/:name` → remove entry.
  - `POST /api/connections/mcp/:name/ping` → spawn the MCP server command, wait for stdio handshake, return `{ reachable: boolean, tools: number }`.
- **`src/integrations/pi-loader.ts`** *(from pi-a)* — ensure `listProviders()` returns `{ provider, status, models, authType }[]`.
- **`featherkit-dashboard/src/views/Connections.tsx`** — replace mock data with `useQuery(['connections'])` calls. Login button calls `apiPost('/api/connections/providers/:provider/login')` and opens the returned URL in a new tab. Poll `/status` every 3s after login click until `connected` or timeout. MCP Add/Edit/Delete buttons call the CRUD endpoints. Skills tab reads from `feather pkg list` output via `GET /api/connections/skills`.
- **`featherkit-dashboard/src/lib/queries.ts`** — add connection-related query/mutation hooks.

## Done Criteria
- [ ] `GET /api/connections/providers` returns at least the Anthropic (CLI, always connected) and any pi-managed providers.
- [ ] Clicking Login on OpenAI Codex opens a browser tab to the OAuth flow. After completing it, the provider card flips to `connected` within 5s (polling).
- [ ] `POST /api/connections/mcp` with a new server entry writes to `.mcp.json` and the MCP table updates without refresh.
- [ ] `POST /api/connections/mcp/:name/ping` for `feather-state` returns `{ reachable: true, tools: 13 }`.
- [ ] A build step configured with `provider: openai-codex` in the workflow runs successfully end-to-end after OAuth.
- [ ] `bun run build` passes.

## Risks
- pi-ai OAuth flow is browser-based and async. The server POST should return the auth URL immediately; the client polls `/status`. If pi-ai's OAuth blocks the server thread, it must be run in a child process or worker. Investigate during build — pi-ai's `loginXxx()` may already be non-blocking.
- MCP server ping by spawning the command is expensive and potentially dangerous if the command is malformed. Validate the command is an existing binary (use `which` or check PATH) before spawning. Hard timeout of 5s.
- `.mcp.json` is shared between the MCP stdio server and `feather serve`. Writes must use the same atomic temp-file-rename pattern as `state-io.ts`.

## Constraints
- No custom OAuth implementation. Delegate entirely to pi-ai's `loginXxx()` functions.
- Claude provider always shows as `connected` via CLI harness — never route it through OAuth.
- MCP ping subprocess must be killed on server shutdown (track child PID).

## Depends on
- `pi-a` (pi-loader, pkg install)
- `dash-b` (server routes)
- `dash-c` (query hooks)
