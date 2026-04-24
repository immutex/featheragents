# Task: dash-agents-b

## Goal
Upgrade the Agents view with model dropdowns (replacing free-text inputs), system prompt editing per agent, and a "New agent" button — giving users real control over their agent configurations without touching JSON files.

## Context
`featherkit-dashboard/src/views/Agents.tsx` currently has plain `<input>` fields for provider and model, no way to edit system prompts, and no way to create new agents beyond the hardcoded four roles (frame/build/critic/sync). The `src/server/routes/agents.ts` GET/PUT only handles `models: ApiModelConfig[]` (role + provider + model) — it doesn't expose system prompts or allow new agent creation. The config schema at `src/config/schema.ts` likely needs extending to support system prompts per role.

## Files
- **`featherkit-dashboard/src/views/Agents.tsx`** — replace provider/model text inputs with dropdowns; add system prompt textarea per agent; add "New agent" button with role name field; add per-agent "Delete" button (for custom roles only — frame/build/critic/sync are protected)
- **`src/server/routes/agents.ts`** — extend PUT to accept `systemPrompt?: string` per agent; extend GET to return system prompts; add POST `/api/agents` to create a new agent entry
- **`src/config/schema.ts`** — add `systemPrompt?: string` field to `ModelConfigSchema`; the config writer must merge system prompts on save
- **`featherkit-dashboard/src/lib/queries.ts`** — update `ApiModelConfig` type to include `systemPrompt?: string`; add `useCreateAgentMutation()`

## Provider + Model Dropdowns
The dropdown should offer known options but also allow typing a custom value (combobox pattern). Suggested provider options: `anthropic`, `openai`, `openrouter`, `zai`, `google`. Model options should be filtered by provider. Example model lists:
- anthropic: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- openai: `gpt-5.4`, `gpt-5.4-mini`, `gpt-4o`
- openrouter: free text (too many options)
- zai: `glm-4-plus`, `glm-4-flash`, `glm-4-long`

Use a `<select>` with an "Other..." option that reveals a text input, or a simple combobox with datalist.

## Done Criteria
- [x] Provider field is a `<select>` dropdown with known providers + "Other" free-text fallback
- [x] Model field updates its options when provider changes; falls back to free text for unknown providers
- [x] Each agent card has a collapsible "System prompt" section with a `<textarea>` that saves on blur/save button
- [x] "New agent" button opens an inline form (role name required, provider + model required); saving adds it to config and refreshes the grid
- [x] Built-in roles (frame/build/critic/sync) cannot be deleted; custom agents show a delete button
- [x] `PUT /api/agents` saves system prompts alongside model config
- [x] `bun run build` passes, `cd featherkit-dashboard && bun run build` passes

## Risks
- System prompts can be long — the textarea should auto-grow or have a min-height of ~4 rows; don't truncate
- Custom agent roles must not conflict with built-in names — validate uniqueness on create
- The config `systemPrompt` field must be optional and default to `undefined` — existing configs without it must still load cleanly
- MCP and Skills tabs in Agents are post-alpha scope — do NOT implement them here; leave the tab stubs with a "Coming soon" placeholder

## Constraints
- Keep the 4-role grid layout for built-in agents; custom agents appear below or in a separate "Custom" section
- Do not remove the BUILTIN_AGENTS fallback — it's still used for mock mode and error states
- Do not touch `featherkit-dashboard/src/lib/builtin-agents.ts` exports (other components depend on them)
