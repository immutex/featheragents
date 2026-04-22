# FeatherKit Web Dashboard — Design Brief

> Hand-off document for the design agent. Self-contained — the design agent does not have access to the rest of the repo. Every fact the designer needs to produce layouts, flows, and component specs is in this file.

---

## 1. Product north star

**FeatherKit** is a lean CLI + MCP server that orchestrates multi-model coding agents through a structured pipeline: **frame → build → critic → sync**. It runs real Claude Code subprocesses (via `claude --print`) for TOS compliance and full MCP tool parity, and uses the **pi** library family (`pi-tui`, `pi-ai`) as the agentic core.

We are adding a **web dashboard** that turns FeatherKit into "OpenClaw for coding agents": a single pane of glass so the user never has to touch a terminal. The CLI stays — the dashboard is a first-class UI over the same state.

**Tone / feel:** lightweight, confident, calm. Operator-grade tooling, not a consumer app. Dense-but-scannable. Dotted-grid engineering aesthetic. Dark mode first, light mode parity.

**Non-goals:**
- Not a multi-tenant SaaS. Single local user, localhost-only, bearer-token auth.
- Not a replacement for the CLI or the TUI — they coexist.
- Not a chat interface. The dashboard orchestrates agents; it does not converse with them.

---

## 2. Who uses it

**Primary persona:** a software engineer running one to three active projects through FeatherKit on their own machine. They already use Claude Code and want a control surface to:

- See what every agent is doing right now, across tasks, without tailing logs.
- Approve/reject gated phases (after `frame`, before `sync`).
- Edit the workflow visually — reorder phases, add/remove agents, wire verification gates.
- Manage provider connections (OAuth into Anthropic / OpenAI Codex / GitHub Copilot / Gemini CLI / Antigravity) and MCP servers.
- Glance at progress when context-switching back to the machine.

They value: terseness, keyboard-driven navigation, no modal dialogs for frequent actions, live data over manual refresh.

---

## 3. Information architecture

Left-side vertical nav, persistent across the app. Three top-level tabs. No nav tree collapsing — flat and fast.

```
┌───────────┬───────────────────────────────────────────────┐
│           │                                               │
│  ▸ Home   │                                               │
│  ▸ Proj.  │                 main canvas                   │
│  ▸ Conn.  │                                               │
│           │                                               │
│  —————    │                                               │
│  ⚙ Settings                                               │
│  ◐ Theme  │                                               │
└───────────┴───────────────────────────────────────────────┘
```

### 3.1 Home

The "is anything on fire" tab. Scannable in under 3 seconds.

Sections (top-to-bottom):
1. **Status bar** — orchestrator status (`idle` / `running` / `paused` / `awaiting-approval`), lock-holder PID, heartbeat freshness dot.
2. **Active task card** — current task title, current phase with spinner, elapsed time, last stdout line ticker, inline "Approve" / "Pause" / "Stop" controls when gated.
3. **Today counters** — tasks done / in progress / blocked / pending. Small sparkline of phase events over last 24h.
4. **Recent event feed** — reverse-chronological, last 20 `OrchestratorEvent`s with one-line formatting, filter by event type (pill row above).
5. **Pinned tasks** — user-pinned subset of tasks with mini progress bars (4 dots for the 4 phases, filled as they complete).

### 3.2 Projects

Master-detail layout. Left rail: project list (in MVP just the one current project, but the rail must be built for N). Right pane: selected project's sub-sections accessed via a **secondary tab strip** across the top:

| Sub-tab | What it shows |
|---|---|
| **Overview** | Project metadata (name, paths, git branch, commit), active task, stats |
| **Tasks** | Table of all tasks with filters (status, dependency, phase) and bulk actions |
| **Workflow** | Node-view editor (see §4) — this is the hero feature |
| **Agents** | Per-role (frame/build/critic/sync + any custom) cards: assigned model, last run, avg duration, recent verdicts |
| **Verification** | List of verification checks, last run + pass/fail, "Re-run" button |
| **History** | Full timeline of all phase completions and approvals for the project |
| **Files** | Read-only viewer for `project-docs/tasks/*.md` and `state.json` excerpts |

The task row, expanded, shows: progress entries grouped by role, phase completions with verdicts, approvals log, handoff notes, review notes, verification results.

### 3.3 Connections

Two sub-sections, side-by-side on wide screens, stacked on narrow.

**Model providers** — card grid. Each card:
- Provider name + logo
- OAuth status chip: `Connected` / `Not connected` / `Expired`
- "Login" or "Reconnect" button that triggers `pi-ai` OAuth flow (opens system browser, polls for callback)
- Models available under this provider (fetched from pi-ai)
- Which roles in the current workflow use this provider (tiny badges)

Providers to support at launch: **Anthropic (Claude Pro/Max)**, **OpenAI Codex (ChatGPT Plus/Pro)**, **GitHub Copilot**, **Gemini CLI**, **Antigravity**. Gemini is OAuth-hostile for third-party tools — show a warning chip but still allow manual key entry as a fallback.

Note: Claude agents are invoked through the `claude` CLI harness, which owns its own auth — the "Anthropic" card shows the CLI's login status (via `claude /status` or equivalent probe), not an OAuth button.

**MCP servers** — table:
- Name, command, args summary, transport (stdio/http), status dot (reachable / not)
- Add / Edit / Delete (CRUD over `.mcp.json`)
- "Test" button runs a tools/list ping

### 3.4 Settings (footer item)

- Appearance (theme, density, grid size for node editor)
- Defaults (default models per role, default gate mode, default timeouts)
- Keyboard shortcuts reference
- Dashboard token (show/regenerate)
- Export / import config

---

## 4. Hero feature — Node-view workflow editor

This is the visual centerpiece and must feel great. It lives under **Projects → Workflow**.

### 4.1 Canvas

- Infinite pannable / zoomable canvas (mouse wheel + drag; trackpad pinch; keyboard pan).
- **Dotted grid background**, grid size ~24px, dots ~1.5px, low-contrast against canvas bg.
- Snap-to-grid on drag (toggleable).
- Minimap in bottom-right corner (toggleable).
- Zoom controls bottom-left (+, −, fit, 1:1).

### 4.2 Node types

Start with four built-in roles, pluggable to N. Each node is a rounded rectangle (~220×110) with:
- **Header stripe** color-coded by role (frame=amber, build=green, critic=purple, sync=blue, custom=neutral)
- Role icon + role name
- Model badge (e.g. `anthropic/claude-sonnet-4-6`)
- Gate indicator (small lock icon if this node is gated)
- Status dot (idle / running / last-run-pass / last-run-fail / skipped)
- Drag handle (top) and four connection ports (top/right/bottom/left) that appear on hover

**Special nodes:**
- **Orchestrator** — the must-have root node. Visually distinct (thicker border, different shape — hexagonal or circular).
- **Verification gate** — diamond shape; configures which non-AI checks run (typecheck / test / lint / format / build / git-clean / deps-drift).
- **Approval gate** — a small pill with a person icon; configures `editor` / `prompt` / `pause` / `auto` modes.
- **Loopback arrow** — distinguished visually (dashed line or curved arrow) when an edge goes "backwards" in the flow.

### 4.3 Edges

- Bezier curves by default, orthogonal as an option.
- Arrow heads indicate direction.
- Hovering an edge shows its condition label (e.g. `on verdict=fail` for the critic→build loopback).
- Clicking an edge opens a condition editor in the side panel.

### 4.4 Side panel (right drawer)

Opens when a node or edge is selected. Sections depending on selection:
- **Node settings**: role, assigned model (dropdown populated from Connections tab), timeout, gate config, prompt template (code editor), requires (list of verification checks), retry policy.
- **Edge settings**: from, to, condition (`always` / `on verdict=X` / custom expression).

Saving writes to `project-docs/workflows/<name>.json` via `PUT /api/workflow`. An "unsaved changes" pill appears in the top bar until saved.

### 4.5 Toolbar (top of canvas)

Left to right:
- Workflow name selector (dropdown + rename)
- Validate button (runs schema + reachability check)
- Save button (disabled unless dirty)
- Run button (kicks the orchestrator for the currently-selected task using this workflow)
- Undo / redo
- Layout → auto-arrange (left-to-right DAG) / align / distribute
- Export (JSON)

### 4.6 Live overlay

While the orchestrator is running, nodes animate:
- Running node: pulsing border, header stripe glows, live stdout ticker at the bottom of the card.
- Completed node: header stripe filled, verdict badge appears.
- Failed/blocked node: red stripe, error summary in card footer.

The edge being traversed lights up briefly as the transition happens.

### 4.7 Keyboard shortcuts

- `N` new node (opens palette), `Del` delete selection, `Cmd/Ctrl+D` duplicate, `Cmd/Ctrl+Z/Y` undo/redo, `F` fit to view, `Space+drag` pan, `Cmd/Ctrl+S` save, `Cmd/Ctrl+Enter` run workflow.

---

## 5. Live data model (what the UI binds to)

The dashboard reads from the `feather serve` HTTP+WS server. All domain types below are the real TypeScript shapes from `src/config/schema.ts`.

### 5.1 Project state
```ts
type ProjectState = {
  version: 1;
  currentTask: string | null;
  tasks: TaskEntry[];
  lastUpdated: string;          // ISO
  orchestrator?: {
    status: 'idle' | 'running' | 'paused' | 'awaiting-approval';
    pid?: number;
    startedAt?: string;
    heartbeatAt?: string;
  };
};
```

### 5.2 Task
```ts
type TaskEntry = {
  id: string;                   // e.g. "orch-f"
  title: string;
  status: 'pending' | 'active' | 'blocked' | 'done';
  assignedRole?: 'frame' | 'build' | 'critic' | 'sync';
  dependsOn?: string[];
  progress: { timestamp: string; role: Role; message: string }[];
  handoff?: { from: Role; to: Role; notes: string; timestamp: string };
  reviewNotes?: string;
  verifications?: VerificationResult[];
  sessionId?: string;           // claude CLI session uuid
  phaseCompletions?: PhaseCompletion[];
  approvals?: ApprovalRecord[];
  orchestratorLock?: { holderPid: number; acquiredAt: string; heartbeatAt: string };
};
```

### 5.3 Phase completion
```ts
type PhaseCompletion = {
  phase: 'frame' | 'build' | 'critic' | 'sync';
  verdict?: 'pass' | 'warn' | 'fail';
  summary: string;
  completedAt: string;
  durationSeconds?: number;
};
```

### 5.4 Approval
```ts
type ApprovalRecord = {
  phase: 'frame' | 'sync';
  approvedAt: string;
  modified: boolean;            // was the task file edited during editor gate
  mode: 'editor' | 'inline' | 'pause' | 'prompt' | 'auto';
};
```

### 5.5 Orchestrator events (WS stream)
```ts
type OrchestratorEvent =
  | { type: 'phase:start';  taskId: string; phase: Role }
  | { type: 'phase:stdout'; line: string }
  | { type: 'phase:complete'; taskId: string; phase: Role; status: 'ok'|'timeout'|'failed'|'stuck'; durationMs: number }
  | { type: 'phase:failed'; taskId: string; phase: Role; reason: string }
  | { type: 'gate:awaiting'; taskId: string; phase: 'frame'|'sync' }
  | { type: 'gate:approved'; taskId: string; phase: 'frame'|'sync' }
  | { type: 'task:done'; taskId: string }
  | { type: 'orchestrator:lock-acquired'; pid: number }
  | { type: 'orchestrator:lock-released' }
  | { type: 'orchestrator:stale-lock-cleared'; stalePid: number };
```

### 5.6 Workflow
```ts
type Workflow = {
  id: string;                                // "default"
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
type WorkflowNode = {
  id: string;
  type: 'orchestrator' | 'agent' | 'verification' | 'approval-gate';
  role?: Role;                               // for agent nodes
  label: string;
  model?: { provider: string; name: string };
  gate?: { mode: 'editor'|'prompt'|'pause'|'auto' };
  requires?: VerificationCheckName[];
  promptTemplate?: string;
  position: { x: number; y: number };
};
type WorkflowEdge = {
  id: string;
  from: string;                              // node id
  to: string;
  condition?: 'always' | { onVerdict: 'pass'|'warn'|'fail' };
  label?: string;
};
type VerificationCheckName =
  | 'typecheck' | 'test' | 'lint' | 'format' | 'build' | 'git-clean' | 'deps-drift';
```

### 5.7 Connections
```ts
type Connection = {
  provider: 'anthropic' | 'openai-codex' | 'github-copilot' | 'gemini-cli' | 'antigravity';
  status: 'connected' | 'not-connected' | 'expired';
  connectedAt?: string;
  availableModels: string[];
  usedByRoles: Role[];
};

type McpServer = {
  name: string;
  command: string;
  args: string[];
  transport: 'stdio' | 'http';
  status: 'reachable' | 'unreachable' | 'unknown';
};
```

---

## 6. Interactions & flows (must be designed)

1. **First-run onboarding** — dashboard opens, no project yet → onboarding wizard: pick project dir, confirm default workflow, log into at least one provider, ready state.
2. **Kick a task** — Projects → Tasks → select pending task → "Run" button → live event stream starts, Home's active-task card lights up.
3. **Approve a gated phase** — gate fires → toast + pulsing status bar → click through to task detail → side panel shows the task file diff (for frame) or git diff stat (for sync) → Approve / Reject / Edit.
4. **Edit workflow live** — user reorders nodes while orchestrator is idle → Save → next task uses the new workflow.
5. **Add a verification check** — drop a `verification` node in front of `sync` → select `typecheck, test, lint` → Save → next sync run shows check results inline.
6. **Connect a new provider** — Connections → OpenAI Codex → Login → browser OAuth → returns → card flips to Connected → drop-downs in node side panels now include Codex models.
7. **Recover from a blocked task** — Tasks filter = blocked → inspect reason → Retry phase / Edit task file / Mark done manually.
8. **Headless user is away** — returns to the machine, glances at Home: "3 tasks done, 1 awaiting approval, 0 blocked, current task: orch-f build phase 4m in". No digging required.

---

## 7. Visual & motion direction

- **Aesthetic:** engineering control panel. Think Linear × Retool × Figma's node canvas. Precision over decoration.
- **Grid:** dotted grid is the connective visual motif — appears subtly as a background in Home's event feed panel too.
- **Color:** neutral charcoal base (dark) or near-white (light); one accent per role; single action accent (e.g. electric cyan) for primary CTAs.
- **Typography:** geometric sans for UI, monospaced for all log/code/JSON surfaces. Tight line-height, generous letter-spacing in small caps labels.
- **Density:** comfortable default, compact mode available for power users (toggle in Settings).
- **Motion:** sparse but meaningful. Node run-state pulse, edge-traversal flash, toast slide-in, tab change cross-fade ≤150ms. No parallax, no scroll-jacking.
- **Empty states:** each tab has a considered empty state with one clear next action.
- **Error states:** inline, typed (what went wrong / how to fix), never a generic red box.

---

## 8. Technical constraints the design must respect

- **Local-only:** dashboard binds to `127.0.0.1`, auth via bearer token in `.project-state/dashboard.token`. No login UI beyond the token handshake on first load.
- **WebSocket as first-class source of truth** for live data; REST for snapshots and mutations. Design must assume events can arrive at any time and multiple panels reflect the same event.
- **State comes from `state.json`** — designer should not invent new data fields without checking §5.
- **Workflow schema is the contract** between visual editor and orchestrator engine. Every visual affordance must round-trip through §5.6.
- **Orchestrator lock:** only one active orchestrator per project. Dashboard must clearly indicate when it's "driving" vs "observing".
- **No chat UI.** Prompts are edited as structured templates in the node side panel, not as a message thread.
- **Keyboard-first:** every frequent action has a shortcut, visible via `?` overlay.
- **Accessibility:** WCAG AA contrast, all interactive elements focusable, canvas has a keyboard-navigable alternative list view.

---

## 9. Tech stack (confirmed)

- **Frontend:** Vite + React 18 + TypeScript + Tailwind
- **Node editor:** `@xyflow/react` (React Flow)
- **Data:** TanStack Query for REST, native `WebSocket` for events, Zustand for local UI state
- **Icons:** lucide-react
- **Charts/sparklines:** `recharts` or hand-rolled SVG (TBD — designer can specify)
- **Code/markdown rendering:** `@codemirror/view` for task file viewer, `shiki` for syntax highlighting in stdout panes
- **Backend:** Node `http` + `ws`, reading `state.json` via the existing `src/mcp/state-io.ts`. Bearer-token middleware.
- **Agentic core:** `@mariozechner/pi-ai` (OAuth + provider abstraction) and the `claude` CLI harness (`claude --print`) for all Claude-powered roles.

---

## 10. Out of scope for MVP (design can reference, do not fully spec)

- Multi-user / remote access
- Project templates marketplace
- Custom agent authoring UI (beyond picking a role + model + prompt — no code execution surface)
- Billing, usage telemetry
- Mobile layout (tablet-responsive is enough; phone is v2)
- Real-time collaboration on the workflow canvas

---

## 11. What we want from the design agent

Produce, in order:

1. **Design system primitives** — color tokens (dark + light), type ramp, spacing scale, elevation, radii, icon conventions, motion tokens.
2. **Core component library** — buttons, inputs, selects, chips, tables, cards, tabs, toasts, drawers, empty states, skeleton loaders, status dots, verdict badges.
3. **Layout shell** — left nav, top bar, main content scaffold, settings footer; responsive behavior at md / lg / xl.
4. **Screens (high-fidelity):**
   - Home (idle + live)
   - Projects → Overview
   - Projects → Tasks (list + expanded row)
   - Projects → Workflow (node editor at rest, mid-run, with side panel open, with edge selected)
   - Projects → Agents
   - Projects → Verification
   - Projects → History
   - Connections (providers + MCP)
   - Settings
5. **Key interactions as annotated flows:**
   - Approval gate resolution
   - Workflow edit + save
   - Provider OAuth
   - Kick task + live overlay
6. **Node editor spec** — node anatomy (all types), edge anatomy (all conditions), toolbar, side panel, minimap, live overlay states, empty canvas, validation error surface.
7. **Micro-interactions & motion spec** — node run pulse, edge traversal flash, toast entrance, tab transitions, drawer open.
8. **Accessibility spec** — focus rings, keyboard nav for canvas, contrast for status colors, reduced-motion behavior.
9. **Empty & error states** — every screen, explicitly.
10. **Deliverable format:** Figma file (or equivalent) + exported design tokens as JSON/CSS, ready for Tailwind + CSS var ingestion.

If the designer has open questions, they should list them with recommended defaults rather than block — we will answer and update.
