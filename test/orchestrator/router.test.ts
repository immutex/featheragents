import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, ModelRole, TaskEntry } from '../../src/config/schema.js';
import { loadState, saveState } from '../../src/mcp/state-io.js';
import { routeCriticResult } from '../../src/orchestrator/router.js';
import { runOrchestrator } from '../../src/orchestrator/loop.js';

const execaMock = vi.fn();
const runnerMock = vi.fn();
const warnMock = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}));

vi.mock('../../src/orchestrator/runner.js', () => ({
  runPhase: (...args: unknown[]) => runnerMock(...args),
  runClaudeCodePhase: (...args: unknown[]) => runnerMock(...args),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: {
    warn: (message: string) => warnMock(message),
    info: () => undefined,
    success: () => undefined,
    error: () => undefined,
    dim: () => undefined,
    bold: () => undefined,
    blank: () => undefined,
  },
}));

function makeTmpDir(): string {
  return join(tmpdir(), `fa-orch-router-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  return defaultConfig('orch-router-test');
}

function makeTask(id = 'ORCH-F-1', overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id,
    title: id,
    status: 'active',
    progress: [],
    ...overrides,
  };
}

async function writeState(tmpDir: string, task: TaskEntry): Promise<void> {
  await saveState(
    {
      version: 1,
      currentTask: task.id,
      tasks: [task],
      lastUpdated: new Date().toISOString(),
      orchestrator: {
        status: 'running',
        pid: process.pid,
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      },
    },
    undefined,
    tmpDir,
  );
}

async function recordPhaseCompletion(
  config: FeatherConfig,
  taskId: string,
  phase: ModelRole,
  verdict?: 'pass' | 'warn' | 'fail',
): Promise<void> {
  const state = await loadState(config.stateDir, process.cwd());
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.phaseCompletions = [
    ...(task.phaseCompletions ?? []),
    {
      phase,
      verdict,
      summary: `${phase} complete`,
      completedAt: new Date().toISOString(),
    },
  ];

  await saveState(state, config.stateDir, process.cwd());
}

describe('routeCriticResult', () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    execaMock.mockReset();
    runnerMock.mockReset();
    warnMock.mockReset();
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('returns advance from the last valid JSON line and strips ANSI from the prompt', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-ADVANCE', {
      phaseCompletions: [{ phase: 'critic', verdict: 'pass', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      stdout: 'Telemetry line\n```json\n{"verdict":"advance","reason":"Tests pass."}\n```\n',
      stderr: '',
    });

    const verdict = await routeCriticResult(task, '\u001b[32mtests pass\u001b[0m\nall green', config);

    expect(verdict).toBe('advance');
    expect(execaMock).toHaveBeenCalledWith(
      config.orchestrator.claudeCodeBinary,
      expect.arrayContaining(['--print', '--model', config.orchestrator.router.model, '--system-prompt']),
      expect.objectContaining({ reject: false, timeout: config.orchestrator.router.timeoutMs }),
    );
    expect(execaMock.mock.calls[0]?.[1]?.at(-1)).toContain('tests pass\nall green');
    expect(execaMock.mock.calls[0]?.[1]?.at(-1)).not.toContain('\u001b[32m');

    const state = await loadState(config.stateDir, tmpDir);
    expect(state.tasks[0]?.progress.at(-1)?.message).toContain('Router decision: advance');
  });

  it('returns loopback for clear fixable critic output', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-LOOPBACK', {
      phaseCompletions: [{ phase: 'critic', verdict: 'fail', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      stdout: '{"verdict":"loopback","reason":"Missing error handling."}\n',
      stderr: '',
    });

    const verdict = await routeCriticResult(task, 'Missing error handling in the API path.', config);

    expect(verdict).toBe('loopback');
    const state = await loadState(config.stateDir, tmpDir);
    expect(state.tasks[0]?.progress.at(-1)?.message).toContain('Router decision: loopback');
  });

  it('uses the fallback verdict without making any subprocess call when disabled', async () => {
    const config = makeConfig();
    config.orchestrator.router.enabled = false;
    const task = makeTask('ORCH-F-DISABLED', {
      phaseCompletions: [{ phase: 'critic', verdict: 'warn', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);

    const verdict = await routeCriticResult(task, 'Minor warnings only.', config);

    expect(verdict).toBe('advance');
    expect(execaMock).not.toHaveBeenCalled();
    const state = await loadState(config.stateDir, tmpDir);
    expect(state.tasks[0]?.progress.at(-1)?.message).toContain('Router fallback: disabled');
  });

  it('falls back and logs a warning on non-zero exit', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-NONZERO', {
      phaseCompletions: [{ phase: 'critic', verdict: 'warn', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockResolvedValue({ exitCode: 1, timedOut: false, stdout: '', stderr: 'bad exit' });

    const verdict = await routeCriticResult(task, 'Looks okay.', config);

    expect(verdict).toBe('advance');
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('Router failed for ORCH-F-NONZERO'));
  });

  it('falls back and logs a warning on timeout', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-TIMEOUT', {
      phaseCompletions: [{ phase: 'critic', verdict: 'fail', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockResolvedValue({ exitCode: undefined, timedOut: true, stdout: '', stderr: '' });

    const verdict = await routeCriticResult(task, 'Need more review.', config);

    expect(verdict).toBe('loopback');
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('falls back and logs a warning on bad JSON', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-BADJSON', {
      phaseCompletions: [{ phase: 'critic', verdict: 'warn', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: 'not json\n```\nignored\n```\n', stderr: '' });

    const verdict = await routeCriticResult(task, 'Looks okay.', config);

    expect(verdict).toBe('advance');
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('no valid JSON verdict'));
  });

  it('falls back and logs a warning on spawn error', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-SPAWN', {
      phaseCompletions: [{ phase: 'critic', verdict: 'warn', summary: 'critic', completedAt: new Date().toISOString() }],
    });
    await writeState(tmpDir, task);
    execaMock.mockRejectedValue(new Error('spawn failed'));

    const verdict = await routeCriticResult(task, 'Looks okay.', config);

    expect(verdict).toBe('advance');
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
  });
});

describe('runOrchestrator router integration', () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    execaMock.mockReset();
    runnerMock.mockReset();
    warnMock.mockReset();
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('advances to sync when the router returns advance', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-ROUTE-ADVANCE', {
      phaseCompletions: [
        { phase: 'frame', summary: 'frame', completedAt: new Date().toISOString() },
        { phase: 'build', summary: 'build', completedAt: new Date().toISOString() },
      ],
    });
    await writeState(tmpDir, task);

    const runnerCalls: ModelRole[] = [];
    execaMock.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: '{"verdict":"advance","reason":"Ready."}\n', stderr: '' });
    runnerMock.mockImplementation(async (_task: TaskEntry, phase: ModelRole) => {
      runnerCalls.push(phase);
      await recordPhaseCompletion(config, task.id, phase, phase === 'critic' ? 'fail' : undefined);
      return { status: 'ok' as const, stdout: `${phase} output`, stderr: '', durationMs: 1 };
    });

    await runOrchestrator(config, undefined, { once: true, taskId: task.id });

    const state = await loadState(config.stateDir, tmpDir);
    expect(runnerCalls).toEqual(['critic', 'sync']);
    expect(state.tasks[0]?.status).toBe('done');
  });

  it('re-runs build when the router returns loopback', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-ROUTE-LOOPBACK', {
      phaseCompletions: [
        { phase: 'frame', summary: 'frame', completedAt: new Date().toISOString() },
        { phase: 'build', summary: 'build', completedAt: new Date().toISOString() },
      ],
    });
    await writeState(tmpDir, task);

    const runnerCalls: ModelRole[] = [];
    execaMock
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: '{"verdict":"loopback","reason":"Retry build."}\n', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: '{"verdict":"blocked","reason":"Needs human help."}\n', stderr: '' });
    runnerMock.mockImplementation(async (_task: TaskEntry, phase: ModelRole) => {
      runnerCalls.push(phase);
      await recordPhaseCompletion(config, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok' as const, stdout: `${phase} output`, stderr: '', durationMs: 1 };
    });

    await runOrchestrator(config, undefined, { once: true, taskId: task.id });

    const state = await loadState(config.stateDir, tmpDir);
    expect(runnerCalls.slice(0, 3)).toEqual(['critic', 'build', 'critic']);
    expect(state.tasks[0]?.status).toBe('blocked');
  });

  it('blocks the task and stops when the router returns blocked', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-F-ROUTE-BLOCKED', {
      phaseCompletions: [
        { phase: 'frame', summary: 'frame', completedAt: new Date().toISOString() },
        { phase: 'build', summary: 'build', completedAt: new Date().toISOString() },
      ],
    });
    await writeState(tmpDir, task);

    const runnerCalls: ModelRole[] = [];
    execaMock.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: '{"verdict":"blocked","reason":"Human intervention required."}\n', stderr: '' });
    runnerMock.mockImplementation(async (_task: TaskEntry, phase: ModelRole) => {
      runnerCalls.push(phase);
      await recordPhaseCompletion(config, task.id, phase, 'pass');
      return { status: 'ok' as const, stdout: `${phase} output`, stderr: '', durationMs: 1 };
    });

    await runOrchestrator(config, undefined, { once: true, taskId: task.id });

    const state = await loadState(config.stateDir, tmpDir);
    expect(runnerCalls).toEqual(['critic']);
    expect(state.tasks[0]?.status).toBe('blocked');
  });
});
