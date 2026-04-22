import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, ModelRole, TaskEntry } from '../../src/config/schema.js';
import { openMemoryDb } from '../../src/memory/db.js';
import * as retrievalModule from '../../src/memory/retrieval/index.js';
import { MemoryStore } from '../../src/memory/store.js';
import * as writeModule from '../../src/memory/write/index.js';
import { loadState, saveState } from '../../src/mcp/state-io.js';
import * as routerModule from '../../src/orchestrator/router.js';
import * as runnerModule from '../../src/orchestrator/runner.js';

const runPhaseMock = vi.fn();
const routeMock = vi.fn();
const retrieveMemoryContextMock = vi.fn();
const writePhaseMemoriesMock = vi.fn();

function makeTmpDir(): string {
  return join(tmpdir(), `fa-orch-memory-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  const config = defaultConfig('orch-memory-test');
  config.memory.enabled = true;
  config.memory.dbPath = '.project-state/memory.db';
  return config;
}

function makeTask(id: string): TaskEntry {
  return {
    id,
    title: id,
    status: 'pending',
    progress: [],
  };
}

async function writeState(tmpDir: string, tasks: TaskEntry[]): Promise<void> {
  await saveState(
    {
      version: 1,
      currentTask: null,
      tasks,
      lastUpdated: new Date().toISOString(),
    },
    undefined,
    tmpDir,
  );
}

async function appendCompletion(tmpDir: string, taskId: string, phase: ModelRole, verdict?: 'pass' | 'warn' | 'fail'): Promise<void> {
  const state = await loadState(undefined, tmpDir);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Missing task ${taskId}`);
  }

  task.phaseCompletions = [
    ...(task.phaseCompletions ?? []),
    {
      phase,
      summary: `${phase} complete`,
      completedAt: new Date().toISOString(),
      ...(verdict ? { verdict } : {}),
    },
  ];

  await saveState(state, undefined, tmpDir);
}

describe('orchestrator memory integration', () => {
  let tmpDir: string;
  let previousCwd: string;
  let seedMemoryId: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();

    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(makeConfig(), null, 2) + '\n', 'utf8');
    process.chdir(tmpDir);

    const seededDb = openMemoryDb(join(tmpDir, '.project-state', 'memory.db'));
    const store = new MemoryStore(seededDb);
    seedMemoryId = store.insert({
      title: 'Router rewrite',
      content: 'Keep the phase prompt memory-aware.',
      type: 'semantic',
      scope: 'repo',
    });
    seededDb.close();

    runPhaseMock.mockReset();
    routeMock.mockReset();
    retrieveMemoryContextMock.mockReset();
    writePhaseMemoriesMock.mockReset();
    vi.spyOn(runnerModule, 'runPhase').mockImplementation((...args) => runPhaseMock(...args));
    vi.spyOn(routerModule, 'routeCriticResult').mockImplementation((...args) => routeMock(...args));
    vi.spyOn(retrievalModule, 'retrieveMemoryContext').mockImplementation((...args) => retrieveMemoryContextMock(...args));
    vi.spyOn(writeModule, 'writePhaseMemories').mockImplementation((...args) => writePhaseMemoriesMock(...args));

    routeMock.mockResolvedValue('advance');
    retrieveMemoryContextMock.mockResolvedValue({
      block: '[semantic:repo] Router rewrite — keep the phase prompt memory-aware.',
      trace: {
        tokenBudget: 2000,
        used: 24,
        included: [{
          memoryId: seedMemoryId,
          title: 'Router rewrite',
          score: 1,
          reasons: ['fts:router rewrite'],
          usedTokens: 24,
        }],
        dropped: [],
      },
    });
    writePhaseMemoriesMock.mockImplementation(async (db: Parameters<typeof writeModule.writePhaseMemories>[0], _output, _task, phase) => {
      if (phase === 'build') {
        const store = new MemoryStore(db);
        store.insert({
          title: 'Build memory',
          content: 'The build phase wrote a persistent memory.',
          type: 'semantic',
          scope: 'repo',
        });
      }

      return [];
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousCwd) {
      process.chdir(previousCwd);
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('retrieves memory before each phase, passes a memory block to the runner, and writes memories after successful phases', async () => {
    await writeState(tmpDir, [makeTask('MEM-D-1')]);

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      if (phase === 'frame') {
        task.sessionId = 'session-123';
      }

      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: `${phase} output`, stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), undefined, { once: true });

    expect(retrieveMemoryContextMock).toHaveBeenCalledTimes(4);
    expect(runPhaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'MEM-D-1' }),
      'frame',
      expect.any(Function),
      expect.objectContaining({ memory: expect.objectContaining({ enabled: true }) }),
      '<memory>\n[semantic:repo] Router rewrite — keep the phase prompt memory-aware.\n</memory>',
    );
    expect(writePhaseMemoriesMock).toHaveBeenCalledTimes(4);
    expect(writePhaseMemoriesMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      'frame output',
      expect.objectContaining({ id: 'MEM-D-1', sessionId: 'session-123' }),
      'frame',
      expect.objectContaining({ memory: expect.objectContaining({ enabled: true }) }),
    );
    const db = openMemoryDb(join(tmpDir, '.project-state', 'memory.db'));
    expect((db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count).toBeGreaterThan(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_access_log').get()).toEqual({ count: 4 });
    expect(
      db.prepare('SELECT memory_id, actor, reason FROM memory_access_log ORDER BY accessed_at ASC LIMIT 1').get(),
    ).toEqual({
      memory_id: seedMemoryId,
      actor: 'memory-read:session-123',
      reason: 'orchestrator:frame:MEM-D-1',
    });
    db.close();

    const traces = JSON.parse(await readFile(join(tmpDir, '.project-state', 'memory-traces', 'MEM-D-1.json'), 'utf8'));
    expect(traces).toHaveLength(4);
    expect(traces[0].phase).toBe('frame');
    expect(traces[3].phase).toBe('sync');
    expect(traces[3].trace.included[0].memoryId).toBe(seedMemoryId);
  });

  it('skips all memory integration code paths when memory is disabled', async () => {
    const config = makeConfig();
    config.memory.enabled = false;
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
    await writeState(tmpDir, [makeTask('MEM-D-2')]);

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: `${phase} output`, stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(config, undefined, { once: true });

    expect(retrieveMemoryContextMock).not.toHaveBeenCalled();
    expect(writePhaseMemoriesMock).not.toHaveBeenCalled();
    const db = openMemoryDb(join(tmpDir, '.project-state', 'memory.db'));
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_access_log').get()).toEqual({ count: 0 });
    db.close();
  });
});
