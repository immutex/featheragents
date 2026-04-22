import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import type { ApprovalRecord, TaskEntry } from '../config/schema.js';
import { loadState, saveState } from '../mcp/state-io.js';
import { log } from '../utils/logger.js';

type ApprovalPhase = 'frame' | 'sync';

export interface ApproveCommandOptions {
  phase?: ApprovalPhase;
  reject?: boolean;
}

function lastMatching<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  return [...items].reverse().find(predicate);
}

function inferApprovalPhase(task: TaskEntry): ApprovalPhase | null {
  const completions = task.phaseCompletions ?? [];
  const approvals = task.approvals ?? [];

  const lastFrameCompletion = lastMatching(completions, (entry) => entry.phase === 'frame');
  const lastBuildCompletion = lastMatching(completions, (entry) => entry.phase === 'build');
  const lastCriticCompletion = lastMatching(completions, (entry) => entry.phase === 'critic');
  const lastFrameApproval = lastMatching(approvals, (entry) => entry.phase === 'frame');
  const lastSyncApproval = lastMatching(approvals, (entry) => entry.phase === 'sync');

  const needsFrameApproval =
    lastFrameCompletion &&
    (!lastFrameApproval || lastFrameApproval.approvedAt < lastFrameCompletion.completedAt) &&
    (!lastBuildCompletion || lastBuildCompletion.completedAt < lastFrameCompletion.completedAt);

  if (needsFrameApproval) return 'frame';

  const needsSyncApproval =
    lastCriticCompletion &&
    (!lastSyncApproval || lastSyncApproval.approvedAt < lastCriticCompletion.completedAt);

  if (needsSyncApproval) return 'sync';

  return null;
}

function buildApprovalRecord(phase: ApprovalPhase): ApprovalRecord {
  return {
    phase,
    approvedAt: new Date().toISOString(),
    modified: false,
    mode: 'pause',
  };
}

export async function runApproveCommand(
  taskId: string,
  options: ApproveCommandOptions,
  cwd = process.cwd(),
): Promise<void> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);

  if (!task) {
    throw new Error(`Task \"${taskId}\" not found.`);
  }

  const phase = options.phase ?? inferApprovalPhase(task);
  if (!phase) {
    throw new Error(`Could not determine awaiting approval phase for task ${taskId}. Use --phase <frame|sync>.`);
  }

  if (options.reject) {
    task.status = 'blocked';
    state.orchestrator = { ...state.orchestrator, status: 'idle' };
    await saveState(state, config.stateDir, cwd);
    process.stdout.write(`Approval rejected. Task ${taskId} blocked.\n`);
    return;
  }

  task.approvals = [...(task.approvals ?? []), buildApprovalRecord(phase)];
  state.orchestrator = { ...state.orchestrator, status: 'idle' };
  await saveState(state, config.stateDir, cwd);
  process.stdout.write(`Approval recorded. Resume with: feather orchestrate --task ${taskId}\n`);
}

export const approveCommand = new Command('approve')
  .description('Record approval for an awaiting orchestrator gate')
  .argument('<task-id>', 'Task to approve')
  .option('--phase <phase>', 'Approval phase to record (frame or sync)')
  .option('--reject', 'Reject the awaiting gate and block the task')
  .action(async (taskId: string, options: ApproveCommandOptions) => {
    try {
      await runApproveCommand(taskId, options, process.cwd());
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });
