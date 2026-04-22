import { stat } from 'fs/promises';
import { join } from 'path';
import { confirm } from '@inquirer/prompts';
import { execa } from 'execa';
import type { ApprovalRecord, FeatherConfig, TaskEntry } from '../config/schema.js';
import { loadState, saveState } from '../mcp/state-io.js';

type GatePhase = 'frame' | 'sync';
type FrameGateMode = 'editor' | 'inline' | 'pause' | 'auto';
type SyncGateMode = 'prompt' | 'pause' | 'auto';

interface TerminalHooks {
  onSuspend?: () => void;
  onResume?: () => void;
}

export class GatePauseError extends Error {
  constructor(public readonly taskId: string, public readonly phase: GatePhase) {
    super(`Gate paused for task ${taskId} phase ${phase}`);
    this.name = 'GatePauseError';
  }
}

function isPromptExit(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}

async function updateTaskState(
  config: FeatherConfig,
  taskId: string,
  updater: (task: TaskEntry, stateStatus?: string) => void,
): Promise<void> {
  const cwd = process.cwd();
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found in state.json`);
  }

  updater(task, state.orchestrator?.status);
  await saveState(state, config.stateDir, cwd);
}

async function appendApprovalRecord(
  config: FeatherConfig,
  taskId: string,
  record: ApprovalRecord,
): Promise<void> {
  await updateTaskState(config, taskId, (task) => {
    task.approvals = [...(task.approvals ?? []), record];
  });
}

async function markAwaitingApproval(
  config: FeatherConfig,
  taskId: string,
): Promise<void> {
  const cwd = process.cwd();
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found in state.json`);
  }

  state.orchestrator = {
    ...state.orchestrator,
    status: 'awaiting-approval',
  };

  await saveState(state, config.stateDir, cwd);
}

function getTaskFilePath(config: FeatherConfig, taskId: string): string {
  return join(process.cwd(), config.docsDir, 'tasks', `${taskId}.md`);
}

async function runEditorGate(config: FeatherConfig, task: TaskEntry, terminalHooks?: TerminalHooks): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('Editor approval gate requires an interactive terminal. Set orchestrator.approvalGate.frame to "auto" for non-interactive runs.');
  }

  const taskFilePath = getTaskFilePath(config, task.id);
  const before = await stat(taskFilePath);
  const editorBinary = config.orchestrator.approvalGate.editor ?? process.env.EDITOR ?? 'vi';

  terminalHooks?.onSuspend?.();
  try {
    await execa(editorBinary, [taskFilePath], {
      cwd: process.cwd(),
      reject: false,
      stdio: 'inherit',
    });
  } finally {
    terminalHooks?.onResume?.();
  }

  const after = await stat(taskFilePath);
  await appendApprovalRecord(config, task.id, {
    phase: 'frame',
    approvedAt: new Date().toISOString(),
    modified: after.mtimeMs > before.mtimeMs,
    mode: 'editor',
  });
}

function summarizeDiff(result: { exitCode?: number; stdout?: string; stderr?: string }): string {
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';

  if (stdout.length > 0) return stdout;
  if (result.exitCode === 0) return '(no changes)';
  if (/no commits yet|unknown revision|bad revision|ambiguous argument/i.test(stderr)) {
    return '(no prior commits)';
  }

  return stderr.length > 0 ? stderr : '(no prior commits)';
}

async function runPromptGate(config: FeatherConfig, task: TaskEntry, terminalHooks?: TerminalHooks): Promise<void> {
  terminalHooks?.onSuspend?.();
  let confirmed = false;
  try {
    const diffResult = await execa('git', ['diff', '--stat', 'HEAD'], {
      cwd: process.cwd(),
      reject: false,
    });

    process.stderr.write(`[feather] ${summarizeDiff(diffResult)}\n`);

    try {
      confirmed = await confirm({ message: 'Proceed with sync?' });
    } catch (error) {
      if (!isPromptExit(error)) throw error;
    }
  } finally {
    terminalHooks?.onResume?.();
  }

  if (!confirmed) {
    throw new GatePauseError(task.id, 'sync');
  }

  await appendApprovalRecord(config, task.id, {
    phase: 'sync',
    approvedAt: new Date().toISOString(),
    modified: false,
    mode: 'prompt',
  });
}

async function runPauseGate(config: FeatherConfig, task: TaskEntry, phase: GatePhase): Promise<void> {
  await markAwaitingApproval(config, task.id);
  throw new GatePauseError(task.id, phase);
}

async function runImmediateGate(
  config: FeatherConfig,
  task: TaskEntry,
  phase: GatePhase,
  mode: 'auto' | 'inline',
): Promise<void> {
  await appendApprovalRecord(config, task.id, {
    phase,
    approvedAt: new Date().toISOString(),
    modified: false,
    mode,
  });
}

export function makeGateHook(
  config: FeatherConfig,
  terminalHooks?: TerminalHooks,
): (task: TaskEntry, phase: GatePhase) => Promise<void> {
  return async (task, phase) => {
    const mode = phase === 'frame'
      ? config.orchestrator.approvalGate.frame
      : config.orchestrator.approvalGate.sync;

    if (phase === 'frame') {
      switch (mode as FrameGateMode) {
        case 'editor':
          await runEditorGate(config, task, terminalHooks);
          return;
        case 'pause':
          await runPauseGate(config, task, phase);
          return;
        case 'inline':
          await runImmediateGate(config, task, phase, 'inline');
          return;
        case 'auto':
          await runImmediateGate(config, task, phase, 'auto');
          return;
      }
    }

    switch (mode as SyncGateMode) {
      case 'prompt':
        await runPromptGate(config, task, terminalHooks);
        return;
      case 'pause':
        await runPauseGate(config, task, phase);
        return;
      case 'auto':
        await runImmediateGate(config, task, phase, 'auto');
        return;
    }
  };
}
