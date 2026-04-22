# Task: pi-a

> **Status: Done**

## Goal
Adopt the pi-mono extension/package ecosystem so FeatherKit ships community-authored providers, skills, and MCP servers via `pi install` instead of hand-rolling each integration. This unblocks dash-e (Connections OAuth), orch-g (workflow nodes), and Skills UI by reusing pi's registry, loader, and OAuth flows.

## Files
- `package.json` — add `@mariozechner/pi-coding-agent` (the extension host) alongside existing `pi-tui`; confirm version.
- `src/integrations/pi-loader.ts` *(new)* — thin wrapper that boots pi's extension loader against FeatherKit's project root, exposes `listProviders()`, `listSkills()`, `listMcpServers()`, `invokeProvider(role, prompt)`.
- `src/config/schema.ts` — add `packages: string[]` (matches pi's `settings.json.packages`), drop the custom `connections`/`skills` sub-schemas we were about to define.
- `src/commands/packages.ts` *(new)* — `feather pkg add|remove|list` that shells out to `pi install`/updates `.pi/settings.json`, so dashboard CRUD maps 1:1.
- `src/orchestrator/runner.ts` — route non-Claude roles (build=gpt, critic=glm, sync=gpt-mini) through `pi-loader.invokeProvider()` instead of writing per-provider harnesses. Claude roles stay on the `claude --print` harness.
- `src/server/routes/connections.ts` *(planned, dash-b)* — back it with `pi-loader` instead of reinventing OAuth state.
- `project-docs/decisions/pi-adoption.md` *(new)* — ADR capturing scope, security stance, and fallback.
- `featherkit-dashboard/src/data/mock.ts` — tag provider/skill/MCP entries with a `source: 'pi' | 'builtin'` field so the UI can show a "pi package" badge once live.

## Done Criteria
- [ ] `pi-coding-agent` loader boots inside FeatherKit CLI without spawning pi's own TUI.
- [ ] `feather pkg add npm:@some/pi-provider-codex` writes to `.pi/settings.json` and the provider shows up in `feather pkg list`.
- [ ] A non-Claude role (e.g. build=gpt-5.4) can complete one phase end-to-end via a pi provider package, with OAuth flow delegated to pi — zero FeatherKit-specific OAuth code added.
- [ ] `src/integrations/pi-loader.ts` has a unit test that mocks pi's API and verifies provider/skill/MCP discovery.
- [ ] ADR in `project-docs/decisions/pi-adoption.md` records: what pi owns vs what FeatherKit owns, how sandboxing/trust is handled, rollback plan.
- [ ] `bun run build` + `bun test` pass.
- [ ] Planned dash-e scope is reduced: Connections tab becomes a thin view over `pi-loader.listProviders()` + a single "Install package" button that calls `feather pkg add`.

## Risks
- **Double agency:** pi-coding-agent is itself a full agent CLI. We only want the *extension host*, not the agent loop. Risk is pulling in a transport/TUI we don't need; mitigation is verifying pi exposes a headless `ExtensionLoader` export (docs at `pi-mono/packages/coding-agent/docs/extensions.md` suggest yes — confirm during frame→build).
- **Security:** pi packages run arbitrary code. FeatherKit must default `packages: []`, require explicit `feather pkg add`, and surface a clear warning in the dashboard before install.
- **API churn:** pi is pre-1.0. Pin exact version; add a compatibility shim layer so upgrades don't ripple.
- **Workflow ownership:** pi has its own skill/command model (slash-commands in pi's agent). FeatherKit's workflow engine (orch-g) must treat pi skills as callable *nodes*, not as replacements for workflow logic.
- **Fallback:** if pi-coding-agent can't be used headlessly, fall back to reading `~/.pi/` directly (read-only) and shelling out to `pi install` as a subprocess.

## Constraints
- Must not break existing `claude --print` harness for Claude roles. pi only handles non-Claude providers + skills + MCP.
- Must not bundle pi's TUI into FeatherKit builds.
- Keep `zod/v4` everywhere; pi may use `zod` — translate at the boundary.
- No API keys in env; OAuth-only, delegated to pi-ai (already the standing rule).
- Dashboard mock data (`featherkit-dashboard/`) stays decoupled — this task is CLI/backend only.

## GitHub
Relates to the pi-mono ecosystem at github.com/badlogic/pi-mono (upstream — not a FeatherKit issue yet).

## Sources
- [pi-mono extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [pi.dev packages](https://pi.dev/packages)
- [@mariozechner/pi-coding-agent (npm)](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
