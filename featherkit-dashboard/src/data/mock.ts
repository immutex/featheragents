import { BUILTIN_AGENTS } from '@/lib/builtin-agents';

export type Role = 'frame' | 'build' | 'critic' | 'sync';
export type TaskStatus = 'pending' | 'active' | 'blocked' | 'done';
export type Phase = 'frame' | 'build' | 'critic' | 'sync';

export interface TaskEntry {
  id: string;
  title: string;
  status: TaskStatus;
  phase?: Phase;
  role?: Role;
  model?: string;
  progress?: string;
  blockReason?: string;
  dependsOn?: string[];
  updatedAt?: string;
  uiOrder?: number;
  waitingForInput?: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  branch: string;
  commit: string;
  status: 'active' | 'idle' | 'error';
  tasks: TaskEntry[];
  verificationTools: VerificationTool[];
  verificationNotes: string;
  pendingInputs: AgentInteraction[];
}

export interface Connection {
  provider: string;
  label: string;
  source: 'pi' | 'builtin';
  status: 'connected' | 'disconnected' | 'expired';
  authType: 'cli' | 'oauth';
  connectedAt?: string;
  models: string[];
  usedByRoles: Role[];
  warning?: string;
}

export interface McpServer {
  name: string;
  source: 'pi' | 'builtin';
  command: string;
  args: string[];
  transport: 'stdio' | 'http' | 'sse';
  tools: number;
  status: 'reachable' | 'down';
}

export interface Skill {
  id: string;
  name: string;
  source: 'pi' | 'builtin';
  version: string;
  author: string;
  desc: string;
  installed: boolean;
  enabled: boolean;
}

export interface EventEntry {
  id: string;
  ts: string;
  kind: 'phase' | 'gate' | 'orchestrator' | 'verification' | 'input';
  tone: 'info' | 'ok' | 'warn' | 'err' | 'accent';
  task?: string;
  message: string;
}

export interface WorkflowNode {
  id: string;
  type: 'orchestrator' | 'agent' | 'verification';
  agentId?: string;
  label: string;
  model?: string;
  gate?: string;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: 'pass' | 'fail' | 'default';
  animated?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  builtIn: boolean;
  roleColor: string;
  systemPrompt: string;
  model: string;
  skills: string[];
  mcpServers: string[];
}

export interface VerificationTool {
  id: string;
  name: string;
  command: string;
  enabled: boolean;
  lastStatus?: 'ok' | 'warn' | 'err' | 'idle';
  duration?: string;
}

export interface AgentInteraction {
  id: string;
  agentId: string;
  agentName: string;
  taskId: string;
  taskTitle: string;
  question: string;
  options?: string[];
  timestamp: string;
  status: 'pending' | 'answered';
}

export type MemoryType = 'semantic' | 'episodic' | 'procedural' | 'summary';
export type MemoryScope = 'global' | 'user' | 'workspace' | 'repo' | 'branch' | 'agent' | 'model_role' | 'session';
export type EntityType = 'repo' | 'file' | 'function' | 'package' | 'issue' | 'tool' | 'model' | 'agent' | 'concept' | 'preference';
export type EdgeType = 'about' | 'related_to' | 'depends_on' | 'caused_by' | 'resolved_by' | 'derived_from' | 'uses_tool' | 'preferred_for' | 'belongs_to_scope' | 'supersedes' | 'contradicts';

export interface Memory {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  workspaceId: string;
  repoId?: string;
  branchName?: string;
  agentId?: string;
  modelRole?: string;
  title: string;
  content: string;
  salience: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  validAt: string;
  invalidAt?: string;
  sourceKind: string;
  sourceRef?: string;
  isActive: boolean;
  supersedesMemoryId?: string;
  entityIds: string[];
  sizeBytes: number;
}

export interface Entity {
  id: string;
  name: string;
  kind: EntityType;
}

export interface MemoryEdge {
  id: string;
  fromId: string;
  toId: string;
  edgeType: EdgeType;
  weight: number;
}

export const orchestrator = {
  pid: 48231,
  status: 'running' as const,
  uptime: '00:42:18',
  cpu: 12,
  mem: 184,
};

export const stats = { done: 7, active: 2, blocked: 1, pending: 4 };
export const sparkline = [3, 4, 2, 5, 7, 6, 8, 9, 7, 10, 8, 11, 9, 12, 10, 13];

export const agents: AgentConfig[] = [
  ...BUILTIN_AGENTS,
  {
    id: 'agent-custom-1',
    name: 'Security Reviewer',
    builtIn: false,
    roleColor: 'accent',
    systemPrompt: 'You are a specialized security review agent. Analyze code changes for injection vulnerabilities, authentication issues, authorization bypasses, and cryptographic weaknesses. Follow OWASP guidelines.',
    model: 'anthropic/claude-sonnet-4-6',
    skills: ['diff-review'],
    mcpServers: ['filesystem'],
  },
];

export const tasks: TaskEntry[] = [
  { id: 'orch-f', title: 'Claude-harness router rewrite', status: 'active', phase: 'build', role: 'build', model: 'openai/gpt-5.4', progress: 'Spawning claude --print (PID 48231)…', updatedAt: '2m ago', uiOrder: 0 },
  { id: 'orch-f2', title: 'Router fallback + tests', status: 'active', phase: 'frame', role: 'frame', model: 'anthropic/claude-sonnet-4-6', progress: 'Reading src/orchestrator/router.ts', updatedAt: 'just now', uiOrder: 1, waitingForInput: true },
  { id: 'orch-g', title: 'Workflow engine (DAG)', status: 'pending', dependsOn: ['orch-f'], uiOrder: 0 },
  { id: 'orch-h', title: 'Local HTTP+WS server', status: 'pending', dependsOn: ['orch-g'], uiOrder: 1 },
  { id: 'orch-i', title: 'Dashboard Home + Projects', status: 'pending', dependsOn: ['orch-h'], uiOrder: 2 },
  { id: 'orch-j', title: 'Node-view workflow editor', status: 'pending', dependsOn: ['orch-i'], uiOrder: 3 },
  { id: 'orch-k', title: 'Connections + OAuth', status: 'blocked', blockReason: 'pi-ai OAuth credential storage unverified', dependsOn: ['orch-i'], uiOrder: 0 },
  { id: 'orch-a', title: 'Bootstrap CLI + commander', status: 'done', updatedAt: 'yesterday', uiOrder: 0 },
  { id: 'orch-b', title: 'Zod v4 schema + defaults', status: 'done', updatedAt: 'yesterday', uiOrder: 1 },
  { id: 'orch-c', title: 'Template functions', status: 'done', updatedAt: '2d ago', uiOrder: 2 },
  { id: 'orch-d', title: 'MCP stdio server', status: 'done', updatedAt: '3d ago', uiOrder: 3 },
  { id: 'orch-e', title: 'Claude harness runner', status: 'done', updatedAt: '4d ago', uiOrder: 4 },
];

export const projects: Project[] = [
  {
    id: 'feather',
    name: 'feather-core',
    path: '~/Projects/featheragents',
    branch: 'main',
    commit: 'f673649',
    status: 'active',
    tasks,
    verificationTools: [
      { id: 'vt1', name: 'typecheck', command: 'tsc --noEmit', enabled: true, lastStatus: 'ok', duration: '3.2s' },
      { id: 'vt2', name: 'test', command: 'bun test', enabled: true, lastStatus: 'ok', duration: '8.1s' },
      { id: 'vt3', name: 'lint', command: 'biome check .', enabled: true, lastStatus: 'warn', duration: '1.4s' },
      { id: 'vt4', name: 'build', command: 'bun run build', enabled: true, lastStatus: 'ok', duration: '12.0s' },
    ],
    verificationNotes: 'TypeScript strict mode, Biome for linting, bun for testing and bundling.',
    pendingInputs: [
      {
        id: 'inp1',
        agentId: 'agent-frame',
        agentName: 'Frame',
        taskId: 'orch-f2',
        taskTitle: 'Router fallback + tests',
        question: 'Should the fallback router use a round-robin strategy or priority-based selection when multiple Claude instances are available?',
        options: ['Round-robin across all instances', 'Priority-based with failover', 'Let me specify my own strategy'],
        timestamp: 'just now',
        status: 'pending',
      },
    ],
  },
  {
    id: 'api',
    name: 'api-gateway',
    path: '~/Projects/api-gateway',
    branch: 'feat/rate-limit',
    commit: '8a2d19c',
    status: 'idle',
    tasks: [
      { id: 'api-a', title: 'Rate limit middleware', status: 'done', updatedAt: '1w ago' },
      { id: 'api-b', title: 'Redis adapter', status: 'pending' },
    ],
    verificationTools: [
      { id: 'vt5', name: 'typecheck', command: 'tsc --noEmit', enabled: true, lastStatus: 'ok', duration: '2.8s' },
      { id: 'vt6', name: 'test', command: 'jest --coverage', enabled: true, lastStatus: 'ok', duration: '15.3s' },
      { id: 'vt7', name: 'lint', command: 'eslint . --ext .ts', enabled: true, lastStatus: 'ok', duration: '1.1s' },
    ],
    verificationNotes: 'Node.js project with TypeScript, Jest for testing, ESLint.',
    pendingInputs: [],
  },
];

export const connections: Connection[] = [
  { provider: 'anthropic', label: 'Anthropic (Claude Code CLI)', source: 'builtin', status: 'connected', authType: 'cli', connectedAt: '2026-04-21 08:14', models: ['sonnet-4-6', 'opus-4-7', 'haiku-4-5'], usedByRoles: ['frame', 'build', 'critic', 'sync'] },
  { provider: 'openai-codex', label: 'OpenAI Codex', source: 'pi', status: 'connected', authType: 'oauth', connectedAt: '2026-04-19 22:03', models: ['gpt-5.4', 'gpt-5.4-mini'], usedByRoles: ['build', 'sync'] },
  { provider: 'github-copilot', label: 'GitHub Copilot', source: 'pi', status: 'expired', authType: 'oauth', models: ['claude-sonnet-4-6', 'gpt-5.4'], usedByRoles: [], warning: 'Token expired 2d ago — reconnect to resume' },
  { provider: 'gemini-cli', label: 'Gemini CLI', source: 'pi', status: 'disconnected', authType: 'oauth', models: [], usedByRoles: [] },
  { provider: 'antigravity', label: 'Antigravity (Anthropic zero-retention)', source: 'pi', status: 'disconnected', authType: 'oauth', models: [], usedByRoles: [] },
];

export const mcpServers: McpServer[] = [
  { name: 'filesystem', source: 'builtin', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], transport: 'stdio', tools: 8, status: 'reachable' },
  { name: 'github', source: 'builtin', command: 'docker', args: ['run', '-i', 'ghcr.io/github/github-mcp-server'], transport: 'stdio', tools: 64, status: 'reachable' },
  { name: 'feather-state', source: 'builtin', command: 'node', args: ['dist/server.js'], transport: 'stdio', tools: 13, status: 'reachable' },
  { name: 'playwright', source: 'builtin', command: 'npx', args: ['@playwright/mcp@latest'], transport: 'stdio', tools: 23, status: 'down' },
];

export const skills: Skill[] = [
  { id: 'deep-plan', name: 'deep-plan', source: 'builtin', version: '1.2.0', author: 'featherkit', desc: 'Long-horizon planning with context analysis and done criteria', installed: true, enabled: true },
  { id: 'incremental-code', name: 'incremental-code', source: 'builtin', version: '1.2.0', author: 'featherkit', desc: 'Small-commit implementation with co-located tests', installed: true, enabled: true },
  { id: 'diff-review', name: 'diff-review', source: 'builtin', version: '1.1.3', author: 'featherkit', desc: 'Structured review of changes against task criteria', installed: true, enabled: true },
  { id: 'handoff-notes', name: 'handoff-notes', source: 'builtin', version: '1.1.0', author: 'featherkit', desc: 'State sync + handoff notes between phases', installed: true, enabled: true },
  { id: 'ultraplan', name: 'ultraplan', source: 'pi', version: '0.4.0', author: 'community', desc: 'Deep planning with external tool calls and multi-step reasoning', installed: false, enabled: false },
];

export const events: EventEntry[] = [
  { id: 'e1', ts: '10:42:18', kind: 'phase', tone: 'accent', task: 'orch-f', message: 'build phase started (model: openai/gpt-5.4)' },
  { id: 'e2', ts: '10:42:11', kind: 'orchestrator', tone: 'info', message: 'Router decision: advance (reason: critic passed)' },
  { id: 'e3', ts: '10:41:58', kind: 'verification', tone: 'ok', task: 'orch-f', message: 'typecheck ✓ · test ✓ · lint ✓' },
  { id: 'e4', ts: '10:40:03', kind: 'input', tone: 'warn', task: 'orch-f2', message: 'Frame agent is waiting for user input' },
  { id: 'e5', ts: '10:38:42', kind: 'phase', tone: 'ok', task: 'orch-e', message: 'sync phase complete' },
  { id: 'e6', ts: '10:35:11', kind: 'orchestrator', tone: 'info', message: 'orchestrator spawned (pid 48231)' },
];

export const workflowNodes: WorkflowNode[] = [
  { id: 'start', type: 'orchestrator', label: 'Orchestrator', x: 80, y: 220 },
  { id: 'n1', type: 'agent', agentId: 'agent-frame', label: 'Frame', model: 'sonnet-4-6', x: 260, y: 140 },
  { id: 'n2', type: 'agent', agentId: 'agent-build', label: 'Build', model: 'gpt-5.4', x: 460, y: 140 },
  { id: 'v1', type: 'verification', label: 'Verify', gate: 'project tools', x: 660, y: 140 },
  { id: 'n3', type: 'agent', agentId: 'agent-critic', label: 'Critic', model: 'glm-5.1', x: 860, y: 140 },
  { id: 'n4', type: 'agent', agentId: 'agent-sync', label: 'Sync', model: 'gpt-5.4-mini', x: 1060, y: 220 },
];

export const workflowEdges: WorkflowEdge[] = [
  { id: 'e-s-1', from: 'start', to: 'n1' },
  { id: 'e-1-2', from: 'n1', to: 'n2' },
  { id: 'e-2-v', from: 'n2', to: 'v1' },
  { id: 'e-v-3', from: 'v1', to: 'n3', condition: 'pass' },
  { id: 'e-v-2', from: 'v1', to: 'n2', condition: 'fail' },
  { id: 'e-3-2', from: 'n3', to: 'n2', condition: 'fail', animated: true },
  { id: 'e-3-4', from: 'n3', to: 'n4', condition: 'pass', animated: true },
];

export const memories: Memory[] = [
  {
    id: 'mem-1',
    type: 'semantic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    branchName: 'main',
    title: 'Project uses Pi agent orchestration',
    content: 'This project uses the Pi orchestration pattern with Frame → Build → Verify → Critic → Sync phases. Each phase has a dedicated agent.',
    salience: 0.95,
    confidence: 0.98,
    createdAt: '2026-04-18T09:00:00Z',
    updatedAt: '2026-04-18T09:00:00Z',
    validAt: '2026-04-18T09:00:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-frame/orch-a',
    isActive: true,
    entityIds: ['ent-1', 'ent-7', 'ent-8'],
    sizeBytes: 220,
  },
  {
    id: 'mem-2',
    type: 'semantic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Stack: TypeScript + Bun + React',
    content: 'Runtime is Bun for dev, Node 22+ for prod. Language is TypeScript strict ESM-only. Dashboard uses React + Vite + Tailwind.',
    salience: 0.92,
    confidence: 0.99,
    createdAt: '2026-04-17T14:00:00Z',
    updatedAt: '2026-04-17T14:00:00Z',
    validAt: '2026-04-17T14:00:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-frame/orch-a',
    isActive: true,
    entityIds: ['ent-2', 'ent-3', 'ent-4'],
    sizeBytes: 180,
  },
  {
    id: 'mem-3',
    type: 'procedural',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Run bun test before handoff',
    content: 'Always run `bun test` before syncing phase. If tests fail, do not advance to sync — loop back to build.',
    salience: 0.88,
    confidence: 0.95,
    createdAt: '2026-04-19T11:30:00Z',
    updatedAt: '2026-04-19T11:30:00Z',
    validAt: '2026-04-19T11:30:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-build/orch-e',
    isActive: true,
    entityIds: ['ent-5'],
    sizeBytes: 150,
  },
  {
    id: 'mem-4',
    type: 'semantic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Package manager is pnpm',
    content: 'The project uses pnpm as its package manager. Do not use npm or yarn.',
    salience: 0.80,
    confidence: 0.90,
    createdAt: '2026-04-15T10:00:00Z',
    updatedAt: '2026-04-15T10:00:00Z',
    validAt: '2026-04-15T10:00:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-frame/orch-a',
    isActive: true,
    entityIds: ['ent-6'],
    sizeBytes: 100,
  },
  {
    id: 'mem-4a',
    type: 'semantic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Package manager is bun',
    content: 'The project migrated from pnpm to bun. Use bun for all package operations.',
    salience: 0.85,
    confidence: 0.95,
    createdAt: '2026-04-19T16:00:00Z',
    updatedAt: '2026-04-19T16:00:00Z',
    validAt: '2026-04-19T16:00:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-build/orch-d',
    isActive: true,
    supersedesMemoryId: 'mem-4',
    entityIds: ['ent-6'],
    sizeBytes: 110,
  },
  {
    id: 'mem-5',
    type: 'episodic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Vitest config was broken',
    content: 'Test generation failed because vitest.config.ts had an invalid import path. Fixed by correcting the alias in the config.',
    salience: 0.70,
    confidence: 0.85,
    createdAt: '2026-04-20T08:15:00Z',
    updatedAt: '2026-04-20T08:15:00Z',
    validAt: '2026-04-20T08:15:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-build/orch-c',
    isActive: true,
    entityIds: ['ent-2', 'ent-5'],
    sizeBytes: 200,
  },
  {
    id: 'mem-6',
    type: 'procedural',
    scope: 'global',
    workspaceId: '*',
    title: 'User prefers low-token workflows',
    content: 'The user prefers concise, low-token workflows. Minimize verbose explanations and prefer action over description.',
    salience: 0.90,
    confidence: 0.92,
    createdAt: '2026-04-16T22:00:00Z',
    updatedAt: '2026-04-16T22:00:00Z',
    validAt: '2026-04-16T22:00:00Z',
    sourceKind: 'user_instruction',
    isActive: true,
    entityIds: ['ent-9'],
    sizeBytes: 160,
  },
  {
    id: 'mem-7',
    type: 'episodic',
    scope: 'repo',
    workspaceId: 'api',
    repoId: 'api',
    branchName: 'feat/rate-limit',
    title: 'Rate limiter Redis adapter design',
    content: 'Chose sliding window counter over token bucket for the rate limiter. Redis key format: `rl:{ip}:{window}`. TTL matches window size.',
    salience: 0.75,
    confidence: 0.88,
    createdAt: '2026-04-14T15:30:00Z',
    updatedAt: '2026-04-14T15:30:00Z',
    validAt: '2026-04-14T15:30:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-frame/api-a',
    isActive: true,
    entityIds: ['ent-10', 'ent-11'],
    sizeBytes: 240,
  },
  {
    id: 'mem-8',
    type: 'summary',
    scope: 'session',
    workspaceId: 'feather',
    title: 'Current session: dashboard build',
    content: 'Working on featherkit-dashboard: Home view, Projects view, Agents, Connections, Settings. All using mock data. Sidebar with project dropdown. Chat tab with agent interactions.',
    salience: 0.60,
    confidence: 0.70,
    createdAt: '2026-04-21T10:38:00Z',
    updatedAt: '2026-04-21T10:42:00Z',
    validAt: '2026-04-21T10:38:00Z',
    sourceKind: 'auto_summary',
    isActive: true,
    entityIds: ['ent-1', 'ent-2', 'ent-3'],
    sizeBytes: 280,
  },
  {
    id: 'mem-9',
    type: 'semantic',
    scope: 'global',
    workspaceId: '*',
    title: 'Claude Sonnet preferred for planning',
    content: 'Claude Sonnet produces better plans and architecture decisions than GPT-5.4 for this workspace. Use Sonnet for frame phase.',
    salience: 0.82,
    confidence: 0.80,
    createdAt: '2026-04-20T14:00:00Z',
    updatedAt: '2026-04-20T14:00:00Z',
    validAt: '2026-04-20T14:00:00Z',
    sourceKind: 'agent_feedback',
    sourceRef: 'agent-critic/orch-e',
    isActive: true,
    entityIds: ['ent-8', 'ent-12'],
    sizeBytes: 190,
  },
  {
    id: 'mem-10',
    type: 'procedural',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Use biome for linting',
    content: 'Biome is configured for linting and formatting. Do not introduce ESLint or Prettier.',
    salience: 0.78,
    confidence: 0.93,
    createdAt: '2026-04-18T10:00:00Z',
    updatedAt: '2026-04-18T10:00:00Z',
    validAt: '2026-04-18T10:00:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-frame/orch-b',
    isActive: true,
    entityIds: ['ent-13'],
    sizeBytes: 120,
  },
  {
    id: 'mem-11',
    type: 'episodic',
    scope: 'repo',
    workspaceId: 'feather',
    repoId: 'feather',
    title: 'Zod v4 required for MCP SDK',
    content: 'The MCP SDK requires Standard Schema. Must import from `zod/v4` not `zod`. This caused a build failure that took 30 minutes to diagnose.',
    salience: 0.85,
    confidence: 0.97,
    createdAt: '2026-04-19T09:45:00Z',
    updatedAt: '2026-04-19T09:45:00Z',
    validAt: '2026-04-19T09:45:00Z',
    sourceKind: 'agent_extraction',
    sourceRef: 'agent-build/orch-b',
    isActive: true,
    entityIds: ['ent-2', 'ent-14'],
    sizeBytes: 210,
  },
];

export const entities: Entity[] = [
  { id: 'ent-1', name: 'feather-core', kind: 'repo' },
  { id: 'ent-2', name: 'TypeScript', kind: 'concept' },
  { id: 'ent-3', name: 'Bun', kind: 'tool' },
  { id: 'ent-4', name: 'React', kind: 'concept' },
  { id: 'ent-5', name: 'vitest', kind: 'package' },
  { id: 'ent-6', name: 'bun (pkg manager)', kind: 'tool' },
  { id: 'ent-7', name: 'Pi orchestration', kind: 'concept' },
  { id: 'ent-8', name: 'Frame', kind: 'agent' },
  { id: 'ent-9', name: 'concise-output', kind: 'preference' },
  { id: 'ent-10', name: 'api-gateway', kind: 'repo' },
  { id: 'ent-11', name: 'Redis', kind: 'tool' },
  { id: 'ent-12', name: 'Claude Sonnet', kind: 'model' },
  { id: 'ent-13', name: 'Biome', kind: 'tool' },
  { id: 'ent-14', name: 'zod/v4', kind: 'package' },
];

export const memoryEdges: MemoryEdge[] = [
  { id: 'me-1', fromId: 'mem-1', toId: 'mem-2', edgeType: 'related_to', weight: 0.8 },
  { id: 'me-2', fromId: 'mem-2', toId: 'mem-10', edgeType: 'related_to', weight: 0.7 },
  { id: 'me-3', fromId: 'mem-4', toId: 'mem-4a', edgeType: 'supersedes', weight: 1.0 },
  { id: 'me-4', fromId: 'mem-5', toId: 'mem-3', edgeType: 'caused_by', weight: 0.85 },
  { id: 'me-5', fromId: 'mem-3', toId: 'mem-11', edgeType: 'related_to', weight: 0.6 },
  { id: 'me-6', fromId: 'mem-9', toId: 'mem-1', edgeType: 'about', weight: 0.9 },
  { id: 'me-7', fromId: 'mem-6', toId: 'mem-9', edgeType: 'preferred_for', weight: 0.75 },
  { id: 'me-8', fromId: 'mem-7', toId: 'mem-11', edgeType: 'uses_tool', weight: 0.5 },
  { id: 'me-9', fromId: 'mem-8', toId: 'mem-1', edgeType: 'about', weight: 0.65 },
  { id: 'me-10', fromId: 'mem-8', toId: 'mem-2', edgeType: 'about', weight: 0.65 },
  { id: 'me-11', fromId: 'mem-11', toId: 'mem-2', edgeType: 'related_to', weight: 0.7 },
  { id: 'me-12', fromId: 'mem-10', toId: 'mem-2', edgeType: 'related_to', weight: 0.55 },
];
export const FK_DATA = {
  orchestrator, stats, sparkline, agents, tasks, projects, connections, mcpServers, skills, events, workflowNodes, workflowEdges, memories, entities, memoryEdges,
};
