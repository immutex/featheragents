import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, TaskEntry } from '../../src/config/schema.js';
import { saveState } from '../../src/mcp/state-io.js';
import {
  addPiPackage,
  createPiLoader,
  ensureProjectPiSettings,
  listPiPackages,
  removePiPackage,
  type PiAgentRuntime,
} from '../../src/integrations/pi-loader.js';

const execaMock = vi.fn();
const mockState = {
  packages: [] as string[],
  models: [
    { provider: 'openai-codex', id: 'gpt-5.4' },
    { provider: 'github-copilot', id: 'claude-sonnet-4-6' },
  ],
  skills: [
    {
      name: 'community-plan',
      description: 'Plan tasks',
      sourceInfo: { origin: 'package' as const },
    },
    {
      name: 'builtin-review',
      description: 'Review changes',
      sourceInfo: { origin: 'top-level' as const },
    },
  ],
};

function createMockRuntime(): PiAgentRuntime {
  class MockSettingsManager {
    static create() {
      return new MockSettingsManager();
    }

    async reload(): Promise<void> {
      return;
    }
  }

  class MockResourceLoader {
    constructor(_options: unknown) {}
    async reload(): Promise<void> {
      return;
    }
    getSkills() {
      return { skills: mockState.skills };
    }
  }

  class MockModelRegistry {
    static create() {
      return new MockModelRegistry();
    }

    getAll() {
      return mockState.models;
    }

    find(provider: string, model: string) {
      return mockState.models.find((entry) => entry.provider === provider && entry.id === model);
    }
  }

  return {
    getAgentDir: () => '/tmp/mock-agent',
    SettingsManager: MockSettingsManager,
    DefaultResourceLoader: MockResourceLoader,
    AuthStorage: { create: () => ({}) },
    ModelRegistry: MockModelRegistry,
    SessionManager: { inMemory: () => ({}) },
    createAgentSession: async (options) => {
      const listeners: Array<(event: unknown) => void> = [];
      return {
        session: {
          subscribe(listener: (event: unknown) => void) {
            listeners.push(listener);
            return () => undefined;
          },
          async setModel() {
            return;
          },
          async prompt() {
            listeners.forEach((listener) => listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'line one\nline two' } }));
            await options.customTools[0]!.execute('tool', {
              taskId: 'PI-1',
              phase: 'build',
              summary: 'Pi completed build',
            }, undefined, undefined, undefined);
          },
          dispose() {
            return;
          },
        },
      };
    },
  };
}

function makeTmpDir(): string {
  return join(tmpdir(), `fa-pi-loader-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  const config = defaultConfig('pi-loader-test');
  config.models = config.models.map((entry) => entry.role === 'build' ? { ...entry, provider: 'openai-codex', model: 'gpt-5.4' } : entry);
  return config;
}

function makeTask(): TaskEntry {
  return {
    id: 'PI-1',
    title: 'pi loader task',
    status: 'active',
    progress: [],
  };
}

describe('pi-loader', () => {
  let tmpDir: string;
  let previousCwd: string;
  const mockAgentDir = '/tmp/mock-agent';

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    mockState.packages = [];
    execaMock.mockReset();
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    await mkdir(mockAgentDir, { recursive: true });
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(makeConfig(), null, 2) + '\n', 'utf8');
    await saveState({ version: 1, currentTask: 'PI-1', tasks: [makeTask()], lastUpdated: new Date().toISOString() }, undefined, tmpDir);
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(tmpDir, { recursive: true, force: true });
    await rm(mockAgentDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('discovers providers, skills, and MCP servers from pi config headlessly', async () => {
    await writeFile(join(mockAgentDir, 'mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'npx' } } }, null, 2) + '\n', 'utf8');
    await mkdir(join(tmpDir, '.pi'), { recursive: true });
    await writeFile(join(tmpDir, '.pi', 'mcp.json'), JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }, null, 2) + '\n', 'utf8');

    const loader = await createPiLoader(makeConfig(), tmpDir, createMockRuntime());

    await expect(loader.listProviders()).resolves.toEqual([
      { provider: 'github-copilot', models: ['claude-sonnet-4-6'] },
      { provider: 'openai-codex', models: ['gpt-5.4'] },
    ]);
    await expect(loader.listSkills()).resolves.toEqual([
      { id: 'community-plan', name: 'community-plan', description: 'Plan tasks', source: 'pi' },
      { id: 'builtin-review', name: 'builtin-review', description: 'Review changes', source: 'builtin' },
    ]);
    await expect(loader.listMcpServers()).resolves.toEqual([
      { name: 'github', source: 'pi' },
      { name: 'playwright', source: 'pi' },
    ]);
  });

  it('invokes a provider and persists phase completion through the bridged tool', async () => {
    const loader = await createPiLoader(makeConfig(), tmpDir, createMockRuntime());
    const lines: string[] = [];

    const result = await loader.invokeProvider('build', 'Run the build phase', (line) => lines.push(line));

    expect(result.stdout).toContain('line one');
    expect(lines).toEqual(['line one', 'line two']);

    const state = JSON.parse(await readFile(join(tmpDir, '.project-state', 'state.json'), 'utf8')) as { tasks: Array<{ phaseCompletions?: unknown[]; progress: Array<{ message: string }> }> };
    expect(state.tasks[0]?.phaseCompletions).toHaveLength(1);
    expect(state.tasks[0]?.progress.at(-1)?.message).toContain('Phase complete');
  });

  it('uses pi install/remove and syncs project packages into Feather config', async () => {
    execaMock.mockImplementation(async (_command: string, args: string[]) => {
      const settingsPath = join(tmpDir, '.pi', 'settings.json');
      if (args[0] === 'install') {
        mockState.packages = ['npm:@some/pi-provider-codex'];
        await writeFile(settingsPath, JSON.stringify({ packages: mockState.packages }, null, 2) + '\n', 'utf8');
      }
      if (args[0] === 'remove') {
        mockState.packages = [];
        await writeFile(settingsPath, JSON.stringify({ packages: [] }, null, 2) + '\n', 'utf8');
      }
      return { exitCode: 0, stderr: '' };
    });

    await ensureProjectPiSettings(tmpDir);
    await addPiPackage('npm:@some/pi-provider-codex', tmpDir, execaMock as typeof import('execa').execa);
    await expect(listPiPackages(tmpDir)).resolves.toEqual(['npm:@some/pi-provider-codex']);

    const configAfterAdd = JSON.parse(await readFile(join(tmpDir, 'featherkit', 'config.json'), 'utf8')) as { packages: string[] };
    expect(configAfterAdd.packages).toEqual(['npm:@some/pi-provider-codex']);

    await removePiPackage('npm:@some/pi-provider-codex', tmpDir, execaMock as typeof import('execa').execa);
    const configAfterRemove = JSON.parse(await readFile(join(tmpDir, 'featherkit', 'config.json'), 'utf8')) as { packages: string[] };
    expect(configAfterRemove.packages).toEqual([]);
  });
});
