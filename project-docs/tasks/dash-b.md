# Task: dash-b

> **Status: Done**

## Goal
Build the `feather serve` local HTTP+WS server that the dashboard talks to. This is the backend spine for every dashboard feature — once it ships, the frontend can swap mock data for real API calls.

## Files
- **`src/server/index.ts`** *(new)* — `startServer(config, port)`: creates `node:http` server, generates a random bearer token, writes it to `.project-state/dashboard.token`, binds to `127.0.0.1` only.
- **`src/server/auth.ts`** *(new)* — `requireAuth(req, res, token)` middleware: reads `Authorization: Bearer <token>` header, returns 401 on mismatch.
- **`src/server/routes/state.ts`** *(new)* — `GET /api/state` → `loadState()` → JSON. `PATCH /api/tasks/:id` → validate transition, `saveState()`. Validates status transitions: `pending → active` only if deps are done; `active → blocked` always; `blocked → pending` always; `* → done` only via orchestrator (reject from dashboard).
- **`src/server/routes/workflow.ts`** *(new)* — `GET /api/workflow` → read `config.workflow` path → JSON. `PUT /api/workflow` → validate against `WorkflowSchema`, write atomically.
- **`src/server/routes/connections.ts`** *(new)* — `GET /api/connections` → read `.mcp.json` + pi-ai credential status stub (returns `{ connected: false }` for all non-Claude providers until dash-e). `PUT /api/connections` → write `.mcp.json`.
- **`src/server/routes/tasks.ts`** *(new)* — `POST /api/tasks/:id/run` → validate task is runnable, write `state.currentTask = id`, save — the orchestrator loop picks it up on next tick (or caller runs `feather orchestrate --task <id>` separately; TBD comment in code).
- **`src/server/ws.ts`** *(new)* — `createWsServer(httpServer)`: upgrades `/events` WebSocket connections, authenticates via `?token=` query param, subscribes to the orchestrator's `OrchestratorEvent` emitter, broadcasts JSON events to all connected clients.
- **`src/commands/serve.ts`** *(new)* — Commander command `feather serve [--port 7721]`. Checks no orchestrator lock is held (or warns + runs in read-only mode). Calls `startServer()`.
- **`src/cli.ts`** — register `serve` command.
- **`test/server/routes.test.ts`** *(new)* — integration-style tests using `node:http` client: auth rejection (401), GET /api/state round-trip, PATCH /api/tasks/:id valid + invalid transitions, GET/PUT /api/workflow.

## Done Criteria
- [x] `feather serve` starts without error, prints `Dashboard: http://localhost:7721 · token: <token>`.
- [x] `curl -H "Authorization: Bearer <token>" http://localhost:7721/api/state` returns current `state.json` as JSON.
- [x] `curl` without the token returns `401 Unauthorized`.
- [x] `PATCH /api/tasks/:id { "status": "active" }` with unmet dependencies returns `409 Conflict`.
- [x] `PATCH /api/tasks/:id { "status": "blocked" }` on an active task succeeds and persists to `state.json`.
- [x] `GET /api/workflow` returns the current workflow JSON.
- [x] `PUT /api/workflow` with invalid JSON (missing `nodes`) returns `400 Bad Request`.
- [x] A WebSocket client connecting to `ws://localhost:7721/events?token=<token>` receives a `ping` heartbeat within 5s.
- [x] `bun run build` passes. `bun test test/server/routes.test.ts` passes.

## Risks
- The `ws` npm package requires a compatible Node/Bun runtime. Confirm `bun` can import `ws` (it can as of Bun 1.x — but double-check `bun add ws @types/ws`).
- `feather serve` and `feather orchestrate` sharing state.json without coordination can cause write conflicts. For now: serve is read-mostly; the only writes are from PATCH. Document in code that PATCH and the orchestrator's `saveState()` both use the existing atomic temp-file-rename — this is safe if they don't race. Add a comment; a proper lock is v2.
- Server port conflicts: default 7721, expose `--port` flag. If busy, fail with a clear error (not a crash).
- The `OrchestratorEvent` emitter used by `ws.ts` must be accessible outside `loop.ts`. Check if the current emitter is module-scoped or instance-scoped; may need to extract to `src/orchestrator/events.ts` as a singleton emitter. Confirm before building.

## Constraints
- Use `node:http` + `ws` only. No Express, no Fastify, no Hono.
- `127.0.0.1` bind only — never `0.0.0.0`.
- Token is a 32-byte hex string from `crypto.randomBytes(32)`. Written to `.project-state/dashboard.token` on every start (rotates on restart — intentional).
- All routes use `src/mcp/state-io.ts` for state reads/writes. No direct `fs.readFile` of state.json in routes.
- `WorkflowSchema` validation in PUT /api/workflow uses the Zod schema from `src/workflow/schema.ts` (built in dash-a).

## Depends on
- `dash-a` (WorkflowSchema must exist for PUT /api/workflow validation)
