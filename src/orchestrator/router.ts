import { execa } from 'execa';
import { z } from 'zod/v4';
import type { FeatherConfig, TaskEntry } from '../config/schema.js';
import { loadState, saveState } from '../mcp/state-io.js';
import { log } from '../utils/logger.js';

export type RouterVerdict = 'advance' | 'loopback' | 'blocked';

interface RouterDecision {
  verdict: RouterVerdict;
  reason: string;
}

const ROUTER_SYSTEM_PROMPT = `You are a code review router for an automated coding pipeline.
Given a task goal and the critic agent's output, respond with exactly one JSON object on its own line:
{"verdict":"advance|loopback|blocked","reason":"..."}

- Use "advance" if the build meets all done criteria and is ready for sync/finalization.
- Use "loopback" if there are concrete, fixable defects that another build iteration can resolve.
- Use "blocked" if the task needs human intervention: unclear scope, contradictory criteria, or architectural blockers.

Return JSON only. No prose. No markdown fences.`;

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const RouterDecisionSchema = z.object({
  verdict: z.enum(['advance', 'loopback', 'blocked']),
  reason: z.string(),
});

function sanitizeCriticOutput(stdout: string): string {
  return stdout.replace(ANSI_PATTERN, '').slice(0, 4000);
}

function fallbackFromTask(task: TaskEntry): { route: RouterVerdict; verdict: 'pass' | 'warn' | 'fail' | 'none' } {
  const lastCritic = [...(task.phaseCompletions ?? [])]
    .reverse()
    .find((completion) => completion.phase === 'critic');

  if (lastCritic?.verdict === 'pass' || lastCritic?.verdict === 'warn') {
    return { route: 'advance', verdict: lastCritic.verdict };
  }

  if (lastCritic?.verdict === 'fail') {
    return { route: 'loopback', verdict: 'fail' };
  }

  return { route: 'loopback', verdict: 'none' };
}

async function appendRouterProgress(config: FeatherConfig, taskId: string, message: string): Promise<void> {
  try {
    const cwd = process.cwd();
    const state = await loadState(config.stateDir, cwd);
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) return;

    task.progress.push({
      timestamp: new Date().toISOString(),
      role: 'critic',
      message,
    });

    await saveState(state, config.stateDir, cwd);
  } catch {
    // Router progress logging must never break orchestration.
  }
}

function buildUserPrompt(task: TaskEntry, criticStdout: string): string {
  return [
    'Task goal:',
    task.title,
    '',
    'Done criteria (from task file, if available):',
    'unavailable',
    '',
    'Critic output:',
    sanitizeCriticOutput(criticStdout),
    '',
    'Return exactly one JSON object with verdict and reason.',
  ].join('\n');
}

function parseRouterDecision(stdout: string): RouterDecision {
  const lines = stdout.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index]?.trim();
    if (!candidate || candidate.startsWith('```')) continue;

    try {
      const parsed = RouterDecisionSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // Keep scanning for the last valid JSON line.
    }
  }

  throw new Error('Router returned no valid JSON verdict');
}

async function runRouter(task: TaskEntry, criticStdout: string, config: FeatherConfig): Promise<RouterDecision> {
  const result = await execa(
    config.orchestrator.claudeCodeBinary,
    [
      '--print',
      '--model',
      config.orchestrator.router.model,
      '--system-prompt',
      ROUTER_SYSTEM_PROMPT,
      buildUserPrompt(task, criticStdout),
    ],
    {
      cwd: process.cwd(),
      reject: false,
      timeout: config.orchestrator.router.timeoutMs,
      env: { ...process.env },
      stdin: 'ignore',
    },
  );

  if (result.timedOut) {
    throw new Error(`Router timed out after ${config.orchestrator.router.timeoutMs}ms`);
  }

  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Router exited with code ${result.exitCode}`);
  }

  return parseRouterDecision(result.stdout);
}

export async function routeCriticResult(
  task: TaskEntry,
  criticStdout: string,
  config: FeatherConfig,
): Promise<RouterVerdict> {
  const fallback = fallbackFromTask(task);

  if (!config.orchestrator.router.enabled) {
    await appendRouterProgress(
      config,
      task.id,
      `Router fallback: disabled; critic verdict ${fallback.verdict} -> ${fallback.route}.`,
    );
    return fallback.route;
  }

  try {
    const decision = await runRouter(task, criticStdout, config);
    await appendRouterProgress(config, task.id, `Router decision: ${decision.verdict} — ${decision.reason}`);
    return decision.verdict;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn(`Router failed for ${task.id}; falling back to critic verdict (${fallback.route}): ${reason}`);
    await appendRouterProgress(
      config,
      task.id,
      `Router fallback: error (${reason}); critic verdict ${fallback.verdict} -> ${fallback.route}.`,
    );
    return fallback.route;
  }
}
