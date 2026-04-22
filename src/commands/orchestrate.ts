import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { log } from '../utils/logger.js';
import { acquireLock } from '../orchestrator/lock.js';
import { GatePauseError, makeGateHook } from '../orchestrator/gates.js';
import { runOrchestrator } from '../orchestrator/loop.js';
import { createDashboard } from '../orchestrator/tui/dashboard.js';
import type { FeatherConfig } from '../config/schema.js';
import type { OrchestratorHooks, OrchestratorRunOpts } from '../orchestrator/loop.js';
import type { OrchestratorEvent } from '../orchestrator/events.js';

export interface OrchestrateCommandOptions {
  task?: string;
  once?: boolean;
  dryRun?: boolean;
  noTui?: boolean;
}

interface OrchestrateCommandDeps {
  loadConfig: (cwd: string) => Promise<FeatherConfig>;
  acquireLock: (config: FeatherConfig) => Promise<() => Promise<void>>;
  makeGateHook: (
    config: FeatherConfig,
    terminalHooks?: { onSuspend?: () => void; onResume?: () => void },
  ) => OrchestratorHooks['onGateRequired'];
  runOrchestrator: (config: FeatherConfig, hooks?: OrchestratorHooks, opts?: OrchestratorRunOpts) => Promise<void>;
  writeStderr: (message: string) => void;
  onSigint: (handler: () => void | Promise<void>) => void;
  offSigint: (handler: () => void | Promise<void>) => void;
  exit: (code: number) => never;
}

const defaultDeps: OrchestrateCommandDeps = {
  loadConfig,
  acquireLock,
  makeGateHook,
  runOrchestrator,
  writeStderr: (message) => {
    process.stderr.write(message);
  },
  onSigint: (handler) => {
    process.once('SIGINT', handler);
  },
  offSigint: (handler) => {
    process.removeListener('SIGINT', handler);
  },
  exit: (code) => process.exit(code),
};

export function formatOrchestratorEvent(event: OrchestratorEvent): string {
  switch (event.type) {
    case 'phase:start':
      return `[feather] phase:start taskId=${event.taskId} phase=${event.phase}\n`;
    case 'phase:stdout':
      return `[feather] phase:stdout line=${event.line}\n`;
    case 'phase:complete':
      return `[feather] phase:complete taskId=${event.taskId} phase=${event.phase} status=${event.status} durationMs=${event.durationMs}\n`;
    case 'phase:failed':
      return `[feather] phase:failed taskId=${event.taskId} phase=${event.phase} reason=${event.reason}\n`;
    case 'gate:awaiting':
      return `[feather] gate:awaiting taskId=${event.taskId} phase=${event.phase}\n`;
    case 'gate:approved':
      return `[feather] gate:approved taskId=${event.taskId} phase=${event.phase}\n`;
    case 'task:done':
      return `[feather] task:done taskId=${event.taskId}\n`;
    case 'orchestrator:lock-acquired':
      return `[feather] orchestrator:lock-acquired pid=${event.pid}\n`;
    case 'orchestrator:lock-released':
      return `[feather] orchestrator:lock-released\n`;
    case 'orchestrator:stale-lock-cleared':
      return `[feather] orchestrator:stale-lock-cleared stalePid=${event.stalePid}\n`;
    default:
      return `[feather] unknown\n`;
  }
}

export function plainLogEvent(event: OrchestratorEvent): void {
  process.stderr.write(formatOrchestratorEvent(event));
}

export async function runOrchestrateCommand(
  options: OrchestrateCommandOptions,
  cwd = process.cwd(),
  deps: OrchestrateCommandDeps = defaultDeps,
): Promise<void> {
  const config = await deps.loadConfig(cwd);
  const useTui = !options.noTui && config.orchestrator.tui.enabled && !!process.stdout.isTTY;
  const dashboard = useTui ? createDashboard(config) : null;
  const release = await deps.acquireLock(config);
  let released = false;

  const releaseLock = async () => {
    if (released) return;
    released = true;
    await release();
    deps.writeStderr(formatOrchestratorEvent({ type: 'orchestrator:lock-released' }));
  };

  deps.writeStderr(formatOrchestratorEvent({ type: 'orchestrator:lock-acquired', pid: process.pid }));

  const handleSigint = async () => {
    process.exitCode = 130;
    dashboard?.stop();
    await releaseLock();
    deps.exit(130);
  };

  deps.onSigint(handleSigint);

  try {
    try {
      await deps.runOrchestrator(
        config,
        {
          onGateRequired: deps.makeGateHook(config, {
            onSuspend: () => dashboard?.stop(),
            onResume: () => dashboard?.start(),
          }),
          onEvent: dashboard ? dashboard.onEvent : plainLogEvent,
        },
        {
          taskId: options.task,
          once: options.once,
          dryRun: options.dryRun,
        },
      );
    } catch (error) {
      if (error instanceof GatePauseError) {
        deps.writeStderr(`[feather] gate:paused task=${error.taskId} phase=${error.phase}\n`);
        deps.writeStderr(`[feather] Resume with: feather orchestrate --task ${error.taskId}\n`);
        return;
      }

      throw error;
    }
  } finally {
    deps.offSigint(handleSigint);
    await releaseLock();
    dashboard?.cleanup();
  }
}

export const orchestrateCommand = new Command('orchestrate')
  .description('Run the orchestrator loop')
  .option('--task <id>', 'Target a specific task')
  .option('--once', 'Run one task and exit')
  .option('--dry-run', 'Log what would run without invoking Claude Code')
  .option('--no-tui', 'Disable the TUI dashboard and log plain stderr events')
  .action(async (options: OrchestrateCommandOptions) => {
    try {
      await runOrchestrateCommand(options, process.cwd());
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });
