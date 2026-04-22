import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execaMock = vi.fn();
const confirmMock = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, TaskEntry } from '../../src/config/schema.js';
import { loadState, saveState } from '../../src/mcp/state-io.js';
import { GatePauseError, makeGateHook } from '../../src/orchestrator/gates.js';
import { runApproveCommand } from '../../src/commands/approve.js';
import { runOrchestrateCommand } from '../../src/commands/orchestrate.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-orch-gates-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  return defaultConfig('orch-gates-test');
}

function makeTask(id = 'ORCH-D-1', overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id,
    title: id,
    status: 'active',
    progress: [],
    ...overrides,
  };
}

async function writeProjectConfig(tmpDir: string, config: FeatherConfig): Promise<void> {
  await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
  await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
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

describe('approval gates', () => {
  let tmpDir: string;
  let previousCwd: string;
  let originalIsTTY: PropertyDescriptor | undefined;
  let originalEditor: string | undefined;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    originalEditor = process.env.EDITOR;
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    process.chdir(tmpDir);
    execaMock.mockReset();
    confirmMock.mockReset();
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    if (originalEditor === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = originalEditor;
    if (originalIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalIsTTY);
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('editor gate opens the task file and records whether it was modified', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-D-EDITOR');
    const taskFile = join(tmpDir, 'project-docs', 'tasks', `${task.id}.md`);
    const terminalHooks = { onSuspend: vi.fn(), onResume: vi.fn() };
    await writeState(tmpDir, task);
    await writeFile(taskFile, '# Task\n', 'utf8');
    process.env.EDITOR = 'mock-editor';

    execaMock.mockImplementation(async (_command: string, args: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(args[0]!, '# Task\nEdited\n', 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await makeGateHook(config, terminalHooks)(task, 'frame');

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.approvals).toEqual([
      expect.objectContaining({ phase: 'frame', mode: 'editor', modified: true }),
    ]);
    expect(execaMock).toHaveBeenCalledWith('mock-editor', [taskFile], expect.objectContaining({ stdio: 'inherit', reject: false }));
    expect(terminalHooks.onSuspend).toHaveBeenCalledTimes(1);
    expect(terminalHooks.onResume).toHaveBeenCalledTimes(1);
  });

  it('prompt gate prints diff stat, confirms, and records approval', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-D-PROMPT');
    await writeState(tmpDir, task);

    execaMock.mockResolvedValue({ exitCode: 0, stdout: ' src/cli.ts | 2 +- ', stderr: '' });
    confirmMock.mockResolvedValue(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await makeGateHook(config)(task, 'sync');

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.approvals).toEqual([
      expect.objectContaining({ phase: 'sync', mode: 'prompt', modified: false }),
    ]);
    expect(stderrSpy).toHaveBeenCalledWith('[feather] src/cli.ts | 2 +-\n');
  });

  it('pause gate marks state awaiting approval and throws GatePauseError', async () => {
    const config = makeConfig();
    config.orchestrator.approvalGate.frame = 'pause';
    const task = makeTask('ORCH-D-PAUSE');
    await writeState(tmpDir, task);

    await expect(makeGateHook(config)(task, 'frame')).rejects.toBeInstanceOf(GatePauseError);

    const state = await loadState(undefined, tmpDir);
    expect(state.orchestrator?.status).toBe('awaiting-approval');
  });

  it('auto gate records approval immediately', async () => {
    const config = makeConfig();
    config.orchestrator.approvalGate.frame = 'auto';
    const task = makeTask('ORCH-D-AUTO');
    await writeState(tmpDir, task);

    await makeGateHook(config)(task, 'frame');

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.approvals).toEqual([
      expect.objectContaining({ phase: 'frame', mode: 'auto', modified: false }),
    ]);
  });

  it('feather approve records approval for the awaiting phase and can reject', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-D-APPROVE', {
      phaseCompletions: [
        { phase: 'frame', summary: 'Frame complete', completedAt: new Date().toISOString() },
      ],
    });
    await writeProjectConfig(tmpDir, config);
    await writeState(tmpDir, task);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runApproveCommand(task.id, {}, tmpDir);

    let state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.approvals).toEqual([
      expect.objectContaining({ phase: 'frame', mode: 'pause', modified: false }),
    ]);
    expect(state.orchestrator?.status).toBe('idle');
    expect(stdoutSpy).toHaveBeenCalledWith(`Approval recorded. Resume with: feather orchestrate --task ${task.id}\n`);

    await runApproveCommand(task.id, { reject: true, phase: 'frame' }, tmpDir);
    state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.status).toBe('blocked');
    expect(stdoutSpy).toHaveBeenCalledWith(`Approval rejected. Task ${task.id} blocked.\n`);
  });

  it('orchestrate handles prompt rejection gracefully and releases the lock', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-D-REJECT');
    const stderr: string[] = [];
    const release = vi.fn(async () => undefined);

    execaMock.mockResolvedValue({ exitCode: 0, stdout: ' src/loop.ts | 4 ++--', stderr: '' });
    confirmMock.mockResolvedValue(false);

    await expect(runOrchestrateCommand(
      { task: task.id },
      tmpDir,
      {
        loadConfig: async () => config,
        acquireLock: async () => release,
        makeGateHook,
        runOrchestrator: async (_config, hooks) => {
          await hooks?.onGateRequired?.(task, 'sync');
        },
        writeStderr: (message) => {
          stderr.push(message);
        },
        onSigint: () => undefined,
        offSigint: () => undefined,
        exit: (code) => process.exit(code),
      },
    )).resolves.toBeUndefined();

    expect(release).toHaveBeenCalledTimes(1);
    expect(stderr).toContain(`[feather] gate:paused task=${task.id} phase=sync\n`);
    expect(stderr).toContain(`[feather] Resume with: feather orchestrate --task ${task.id}\n`);
  });

  it('orchestrate wires the default gate hook for both frame and sync phases', async () => {
    const config = makeConfig();
    const task = makeTask('ORCH-D-WIRE');
    const release = vi.fn(async () => undefined);
    const gateSpy = vi.fn(async () => undefined);

    await runOrchestrateCommand(
      { task: task.id },
      tmpDir,
      {
        loadConfig: async () => config,
        acquireLock: async () => release,
        makeGateHook: () => gateSpy,
        runOrchestrator: async (_config, hooks) => {
          await hooks?.onGateRequired?.(task, 'frame');
          await hooks?.onGateRequired?.(task, 'sync');
        },
        writeStderr: () => undefined,
        onSigint: () => undefined,
        offSigint: () => undefined,
        exit: (code) => process.exit(code),
      },
    );

    expect(gateSpy).toHaveBeenNthCalledWith(1, task, 'frame');
    expect(gateSpy).toHaveBeenNthCalledWith(2, task, 'sync');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
