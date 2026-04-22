import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { execa } from 'execa';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { AgentSessionEvent, Skill as PiSkill, ToolDefinition } from '@mariozechner/pi-coding-agent';
import { z } from 'zod/v4';
import type { FeatherConfig, ModelRole } from '../config/schema.js';
import { FeatherConfigSchema, ModelRoleSchema } from '../config/schema.js';
import { appendPhaseCompletion, type PhaseCompletionVerdict } from '../mcp/tools/mark-phase-complete.js';

type PiCommandRunner = typeof execa;

interface PiSettingsManagerLike {
  reload: () => Promise<void>;
}

interface PiResourceLoaderLike {
  reload: () => Promise<void>;
  getSkills: () => { skills: PiSkill[] };
}

interface PiModelLike {
  provider: string;
  id: string;
}

interface PiModelRegistryLike {
  getAll: () => PiModelLike[];
  find: (provider: string, model: string) => PiModelLike | undefined;
}

interface PiSessionLike {
  subscribe: (listener: (event: AgentSessionEvent) => void) => () => void;
  setModel: (model: PiModelLike) => Promise<void>;
  prompt: (prompt: string, options: { source: 'extension' }) => Promise<void>;
  dispose: () => void;
}

export interface PiAgentRuntime {
  AuthStorage: { create: (path: string) => unknown };
  createAgentSession: (options: {
    cwd: string;
    settingsManager: PiSettingsManagerLike;
    resourceLoader: PiResourceLoaderLike;
    sessionManager: unknown;
    modelRegistry: PiModelRegistryLike;
    model: PiModelLike;
    customTools: ToolDefinition[];
  }) => Promise<{ session: PiSessionLike }>;
  DefaultResourceLoader: new (options: {
    cwd: string;
    agentDir: string;
    settingsManager: PiSettingsManagerLike;
  }) => PiResourceLoaderLike;
  getAgentDir: () => string;
  ModelRegistry: { create: (authStorage: unknown, modelPath: string) => PiModelRegistryLike };
  SessionManager: { inMemory: (cwd: string) => unknown };
  SettingsManager: { create: (cwd: string, agentDir: string) => PiSettingsManagerLike };
}

const defaultPiAgentRuntime: PiAgentRuntime = {
  AuthStorage: AuthStorage as PiAgentRuntime['AuthStorage'],
  createAgentSession: createAgentSession as unknown as PiAgentRuntime['createAgentSession'],
  DefaultResourceLoader: DefaultResourceLoader as unknown as PiAgentRuntime['DefaultResourceLoader'],
  getAgentDir,
  ModelRegistry: ModelRegistry as PiAgentRuntime['ModelRegistry'],
  SessionManager: SessionManager as PiAgentRuntime['SessionManager'],
  SettingsManager: SettingsManager as PiAgentRuntime['SettingsManager'],
};

export interface PiProviderInfo {
  provider: string;
  models: string[];
}

export interface PiSkillInfo {
  id: string;
  name: string;
  description: string;
  source: 'pi' | 'builtin';
}

export interface PiMcpServerInfo {
  name: string;
  source: 'pi' | 'builtin';
}

export interface PiInvokeResult {
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface PiLoader {
  listProviders: () => Promise<PiProviderInfo[]>;
  listSkills: () => Promise<PiSkillInfo[]>;
  listMcpServers: () => Promise<PiMcpServerInfo[]>;
  invokeProvider: (role: ModelRole, prompt: string, onLine?: (line: string) => void) => Promise<PiInvokeResult>;
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, '.pi', 'settings.json');
}

function getProjectMcpConfigPath(cwd: string): string {
  return join(cwd, '.pi', 'mcp.json');
}

function getGlobalMcpConfigPath(agentDir: string): string {
  return join(agentDir, 'mcp.json');
}

const PiProjectSettingsSchema = z.object({
  packages: z.array(z.string()).default([]),
});

const PiMcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.object({}).passthrough()).default({}),
});

async function readPiMcpServers(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = PiMcpConfigSchema.parse(JSON.parse(raw));
    return Object.keys(parsed.mcpServers);
  } catch {
    return [];
  }
}

async function syncPackagesIntoConfig(cwd: string): Promise<void> {
  const configPath = join(cwd, 'featherkit', 'config.json');
  const packages = await listPiPackages(cwd);

  const raw = await readFile(configPath, 'utf8');
  const parsed = FeatherConfigSchema.parse(JSON.parse(raw));
  const next = { ...parsed, packages };
  await writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

export async function addPiPackage(
  source: string,
  cwd = process.cwd(),
  runCommand: PiCommandRunner = execa,
): Promise<void> {
  const result = await runCommand('pi', ['install', '-l', source], {
    cwd,
    reject: false,
    stdio: 'inherit',
    env: { ...process.env },
  });

  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(result.stderr || `pi install failed with exit code ${result.exitCode}`);
  }

  await syncPackagesIntoConfig(cwd);
}

export async function removePiPackage(
  source: string,
  cwd = process.cwd(),
  runCommand: PiCommandRunner = execa,
): Promise<void> {
  const result = await runCommand('pi', ['remove', '-l', source], {
    cwd,
    reject: false,
    stdio: 'inherit',
    env: { ...process.env },
  });

  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(result.stderr || `pi remove failed with exit code ${result.exitCode}`);
  }

  await syncPackagesIntoConfig(cwd);
}

export async function listPiPackages(cwd = process.cwd()): Promise<string[]> {
  const settingsPath = getProjectSettingsPath(cwd);
  try {
    const raw = await readFile(settingsPath, 'utf8');
    return PiProjectSettingsSchema.parse(JSON.parse(raw)).packages;
  } catch {
    return [];
  }
}

async function appendPhaseCompletionViaPiTool(
  config: FeatherConfig,
  taskId: string,
  phase: ModelRole,
  summary: string,
  verdict?: PhaseCompletionVerdict,
): Promise<void> {
  const wasMarked = await appendPhaseCompletion(
    {
      taskId,
      phase,
      summary,
      verdict,
    },
    { stateDir: config.stateDir },
  );

  if (!wasMarked) {
    throw new Error(`Task ${taskId} not found. Cannot mark ${phase} as complete.`);
  }
}

interface MarkPhaseCompleteParams {
  taskId: string;
  phase: ModelRole;
  summary: string;
  verdict?: PhaseCompletionVerdict;
}

function createMarkPhaseCompleteTool(config: FeatherConfig): ToolDefinition {
  return {
    name: 'mcp__featherkit__mark_phase_complete',
    label: 'Mark phase complete',
    description: 'Record a completed phase on a FeatherKit task and append a progress note.',
    parameters: Type.Object({
      taskId: Type.String({ description: 'The task identifier' }),
      phase: Type.Union([
        Type.Literal('frame'),
        Type.Literal('build'),
        Type.Literal('critic'),
        Type.Literal('sync'),
      ]),
      verdict: Type.Optional(Type.Union([
        Type.Literal('pass'),
        Type.Literal('warn'),
        Type.Literal('fail'),
      ])),
      summary: Type.String({ description: 'Short summary of what was completed' }),
    }),
    execute: async (_toolCallId, params) => {
      const typed = params as MarkPhaseCompleteParams;
      const phase = ModelRoleSchema.parse(typed.phase);
      const verdict = typed.verdict;
      await appendPhaseCompletionViaPiTool(config, typed.taskId, phase, typed.summary, verdict);
      return {
        content: [{ type: 'text', text: `Marked ${phase} complete for ${typed.taskId}.` }],
        details: {},
      };
    },
  };
}

function getModelForRole(config: FeatherConfig, role: ModelRole): { provider: string; model: string } {
  const modelConfig = config.models.find((entry) => entry.role === role);
  if (!modelConfig) throw new Error(`No model configured for role ${role}`);
  return { provider: modelConfig.provider, model: modelConfig.model };
}

function mapSkills(skills: PiSkill[]): PiSkillInfo[] {
  return skills.map((skill) => ({
    id: skill.name,
    name: skill.name,
    description: skill.description,
    source: skill.sourceInfo.origin === 'package' ? 'pi' : 'builtin',
  }));
}

function groupProviders(models: Array<{ provider: string; id: string }>): PiProviderInfo[] {
  const grouped = new Map<string, Set<string>>();
  for (const model of models) {
    const set = grouped.get(model.provider) ?? new Set<string>();
    set.add(model.id);
    grouped.set(model.provider, set);
  }

  return [...grouped.entries()]
    .map(([provider, ids]) => ({ provider, models: [...ids].sort() }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function createStdoutCollector(onLine?: (line: string) => void): {
  push: (chunk: string) => void;
  flush: () => string;
  text: () => string;
} {
  let buffer = '';
  const lines: string[] = [];

  return {
    push: (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        lines.push(line);
        onLine?.(line);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
      }
    },
    flush: () => {
      if (buffer.length > 0) {
        const line = buffer.replace(/\r$/, '');
        lines.push(line);
        onLine?.(line);
        buffer = '';
      }
      return lines.join('\n');
    },
    text: () => [...lines, ...(buffer ? [buffer] : [])].join('\n'),
  };
}

export async function createPiLoader(
  config: FeatherConfig,
  cwd = process.cwd(),
  runtime: PiAgentRuntime = defaultPiAgentRuntime,
): Promise<PiLoader> {
  const agentDir = runtime.getAgentDir();
  const settingsManager = runtime.SettingsManager.create(cwd, agentDir);
  await settingsManager.reload();

  const resourceLoader = new runtime.DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
  });
  await resourceLoader.reload();

  async function bootSession(role?: ModelRole) {
    const authStorage = runtime.AuthStorage.create(join(agentDir, 'auth.json'));
    const modelRegistry = runtime.ModelRegistry.create(authStorage, join(agentDir, 'models.json'));
    const selected = role ? getModelForRole(config, role) : undefined;
    const initialModel = selected
      ? modelRegistry.find(selected.provider, selected.model)
      : modelRegistry.getAll()[0];
    if (!initialModel) {
      throw new Error('No pi models are available for this project.');
    }

    const { session } = await runtime.createAgentSession({
      cwd,
      settingsManager,
      resourceLoader,
      sessionManager: runtime.SessionManager.inMemory(cwd),
      modelRegistry,
      model: initialModel,
      customTools: [createMarkPhaseCompleteTool(config)],
    });
    return { session, modelRegistry };
  }

  return {
    listProviders: async () => {
      const { session, modelRegistry } = await bootSession();
      try {
        return groupProviders(modelRegistry.getAll().map((model) => ({ provider: model.provider, id: model.id })));
      } finally {
        session.dispose();
      }
    },
    listSkills: async () => mapSkills(resourceLoader.getSkills().skills),
    listMcpServers: async () => {
      const globalServers = await readPiMcpServers(getGlobalMcpConfigPath(agentDir));
      const projectServers = await readPiMcpServers(getProjectMcpConfigPath(cwd));
      const names = [...new Set([...globalServers, ...projectServers])].sort();
      return names.map((name) => ({ name, source: 'pi' as const }));
    },
    invokeProvider: async (role, prompt, onLine) => {
      const startedAt = Date.now();
      const { provider, model } = getModelForRole(config, role);
      const { session, modelRegistry } = await bootSession(role);
      const output = createStdoutCollector(onLine);
      const errors: string[] = [];

      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
          output.push(event.assistantMessageEvent.delta);
        }
        if (event.type === 'tool_execution_end' && event.isError) {
          errors.push(`Tool ${event.toolName} failed`);
        }
      });

      try {
        const selectedModel = modelRegistry.find(provider, model) ?? modelRegistry.getAll().find((entry) => entry.id === model);
        if (!selectedModel) {
          throw new Error(`Pi model not found for ${provider}/${model}`);
        }

        await session.setModel(selectedModel);
        await session.prompt(prompt, { source: 'extension' });

        return {
          stdout: output.flush(),
          stderr: errors.join('\n'),
          durationMs: Date.now() - startedAt,
        };
      } finally {
        unsubscribe();
        session.dispose();
      }
    },
  };
}

export async function ensureProjectPiSettings(cwd = process.cwd()): Promise<string> {
  const settingsPath = getProjectSettingsPath(cwd);
  await mkdir(dirname(settingsPath), { recursive: true });
  try {
    await readFile(settingsPath, 'utf8');
  } catch {
    await writeFile(settingsPath, JSON.stringify({ packages: [] }, null, 2) + '\n', 'utf8');
  }
  return settingsPath;
}
