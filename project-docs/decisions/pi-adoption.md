# ADR: Adopt pi-mono packages for providers, skills, and MCP adapters

## Status
Accepted

## Context

FeatherKit needs packaged provider and skill distribution, OAuth delegated to upstream tooling, and a path for future dashboard package management without re-implementing a second ecosystem. The earlier plan to hand-roll connections, skills, and provider harnesses would duplicate pi-mono's package, extension, and OAuth model.

## Decision

FeatherKit adopts `@mariozechner/pi-coding-agent` as a headless integration boundary for:

- package installation and removal via `pi install/remove -l`
- provider and skill discovery via pi's settings/resource loader
- non-Claude phase execution via pi-backed providers
- MCP server discovery/configuration via pi packages such as `pi-mcp-adapter`

FeatherKit continues to own:

- task/state files under `.project-state/`
- orchestrator logic, routing, gates, and phase sequencing
- the Claude CLI harness for Claude roles
- phase completion persistence semantics

Pi owns:

- package resolution and installation
- OAuth login/storage/refresh for non-Claude providers
- provider registration from installed packages
- skill discovery from installed packages
- MCP adapter packages and their `.pi/mcp.json` configuration model

## Security stance

- `packages` defaults to `[]`
- users must explicitly install packages with `feather pkg add` / `pi install -l`
- third-party pi packages are treated as trusted local code with full system access
- FeatherKit does not add custom OAuth code or handle provider secrets itself

## MCP scope

Current upstream pi core explicitly does not expose MCP as a first-class runtime surface, but the pi package ecosystem does via packages such as `pi-mcp-adapter`. FeatherKit therefore treats MCP as **package-owned** rather than **pi-core-owned**:

- FeatherKit discovers configured MCP servers from pi-owned config (`.pi/mcp.json` / `~/.pi/agent/mcp.json`)
- adapter packages such as `pi-mcp-adapter` own connection lifecycle, auth, caching, and tool exposure
- FeatherKit does not re-implement MCP transport, auth, or caching

This keeps MCP aligned with the pi ecosystem while preserving a thin FeatherKit wrapper.

## Dashboard impact

The planned Connections UI is intentionally reduced in scope:

- list providers via `pi-loader.listProviders()`
- list MCP servers via `pi-loader.listMcpServers()`
- expose a single package installation path via `feather pkg add`

FeatherKit should not build a separate provider/OAuth/MCP management stack when pi packages already own that responsibility.

## Rollback plan

If headless pi integration becomes unstable, FeatherKit can:

1. keep `.pi/settings.json` as the source of installed packages
2. keep `.pi/mcp.json` as the source of MCP server configuration
3. continue using `pi install/remove -l` as subprocesses
4. fall back to Claude-only execution for phases while retaining pi-based discovery as read-only metadata

This keeps the integration boundary thin and reversible.
