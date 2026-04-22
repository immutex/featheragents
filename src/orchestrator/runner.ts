import { execa } from 'execa';
import type { TaskEntry, FeatherConfig, ModelRole, ProjectState } from '../config/schema.js';
import { createPiLoader } from '../integrations/pi-loader.js';
import { loadState, saveState } from '../mcp/state-io.js';
import { discoverLatestClaudeSessionId } from './session.js';
export type { PhaseRunStatus } from './events.js';
import type { PhaseRunStatus } from './events.js';

export interface PhaseRunResult {
  status: PhaseRunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface PhaseRunnerDeps {
  createPiLoader: typeof createPiLoader;
}

const defaultPhaseRunnerDeps: PhaseRunnerDeps = {
  createPiLoader,
};

function isPhaseRunnerDeps(value: unknown): value is PhaseRunnerDeps {
  return typeof value === 'object' && value !== null && 'createPiLoader' in value;
}

function normalizePhaseInputs(
  memoryBlockOrDeps?: string | PhaseRunnerDeps,
  deps?: PhaseRunnerDeps,
): { memoryBlock: string | undefined; deps: PhaseRunnerDeps } {
  if (isPhaseRunnerDeps(memoryBlockOrDeps)) {
    return { memoryBlock: undefined, deps: memoryBlockOrDeps };
  }

  return {
    memoryBlock: memoryBlockOrDeps,
    deps: deps ?? defaultPhaseRunnerDeps,
  };
}

function emitStdoutLine(line: string, stdoutLines: string[], onLine: (line: string) => void): void {
  const normalizedLine = line.replace(/\r$/, '');
  stdoutLines.push(normalizedLine);
  try {
    onLine(normalizedLine);
  } catch {
    // Swallow callback errors: the runner should never throw.
  }
}

function buildPhasePrompt(
  taskId: string,
  phase: ModelRole,
  harness: 'claude' | 'pi' = 'claude',
  memoryBlock?: string,
): string {
  const lines = harness === 'claude'
    ? [
        `Run the /${phase} skill on task ${taskId}.`,
        `Task file: project-docs/tasks/${taskId}.md`,
      ]
    : [
        `Act as the ${phase} role for task ${taskId}.`,
        `Read and follow the task file at project-docs/tasks/${taskId}.md.`,
      ];

  if (phase === 'critic') {
    lines.push(
      'Include a verdict field: "pass" if the changes meet all done criteria, "fail" if there are blocking issues, "warn" if there are minor concerns.'
    );
  }

  lines.push(
    `When done, call mcp__featherkit__mark_phase_complete with taskId="${taskId}", phase="${phase}", and a 1–3 sentence summary.`
  );

  if (memoryBlock && memoryBlock.trim().length > 0) {
    lines.push('', memoryBlock.trim());
  }

  return lines.join('\n');
}

function getRoleProvider(config: FeatherConfig, phase: ModelRole): string | undefined {
  return config.models.find((entry) => entry.role === phase)?.provider;
}

function hasPhaseCompletion(state: ProjectState, taskId: string, phase: ModelRole): boolean {
  const task = state.tasks.find((entry) => entry.id === taskId);
  return task?.phaseCompletions?.some((completion) => completion.phase === phase) ?? false;
}

async function persistSessionId(
  taskId: string,
  sessionId: string,
  stateDir: string | undefined,
  cwd: string,
): Promise<void> {
  const state = await loadState(stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || task.sessionId === sessionId) return;

  task.sessionId = sessionId;
  await saveState(state, stateDir, cwd);
}

function getOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map((entry) => String(entry)).join('\n');
  return '';
}

export async function runPhase(
  task: TaskEntry,
  phase: ModelRole,
  onLine: (line: string) => void,
  config: FeatherConfig,
  memoryBlockOrDeps?: string | PhaseRunnerDeps,
  deps?: PhaseRunnerDeps,
): Promise<PhaseRunResult> {
  const normalized = normalizePhaseInputs(memoryBlockOrDeps, deps);
  const memoryBlock = normalized.memoryBlock;
  const phaseRunnerDeps = normalized.deps;
  const roleProvider = getRoleProvider(config, phase);
  if (roleProvider && roleProvider !== 'anthropic') {
    const startedAtMs = Date.now();
    const cwd = process.cwd();
    const prompt = buildPhasePrompt(task.id, phase, 'pi', memoryBlock);

    try {
      const piLoader = await phaseRunnerDeps.createPiLoader(config, cwd);
      const result = await piLoader.invokeProvider(phase, prompt, onLine);
      const state = await loadState(config.stateDir, cwd);
      if (hasPhaseCompletion(state, task.id, phase)) {
        return { status: 'ok', stdout: result.stdout, stderr: result.stderr, durationMs: result.durationMs };
      }

      return {
        status: 'stuck',
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs || Date.now() - startedAtMs,
      };
    } catch (error) {
      return {
        status: 'failed',
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAtMs,
      };
    }
  }

  const startedAtMs = Date.now();
  const cwd = process.cwd();
  const prompt = buildPhasePrompt(task.id, phase, 'claude', memoryBlock);
  const args = task.sessionId
    ? ['--print', '--session-id', task.sessionId, '-p', prompt]
    : ['--print', '-p', prompt];
  const stdoutLines: string[] = [];
  const timeoutMs = config.orchestrator.timeouts.phaseMinutes * 60_000;

  try {
    const subprocess = execa(config.orchestrator.claudeCodeBinary, args, {
      cwd,
      reject: false,
      stdin: 'ignore',
    });

    let didTimeout = false;
    // TODO: Windows process termination may need special handling.
    const timeoutHandle = setTimeout(() => {
      didTimeout = true;
      subprocess.kill('SIGKILL');
    }, timeoutMs);

    let settled: unknown;
    const readStdout = subprocess.stdout
      ? (async () => {
          let buffer = '';
          try {
            for await (const chunk of subprocess.stdout) {
              buffer += chunk.toString();

              let newlineIndex = buffer.indexOf('\n');
              while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex);
                emitStdoutLine(line, stdoutLines, onLine);
                buffer = buffer.slice(newlineIndex + 1);
                newlineIndex = buffer.indexOf('\n');
              }
            }

            if (buffer.length > 0) {
              emitStdoutLine(buffer, stdoutLines, onLine);
            }
          } catch {
            // Process errors are handled by awaiting subprocess.
          }
        })()
      : Promise.resolve();

    try {
      settled = await subprocess;
    } catch (error) {
      settled = error;
    }

    await readStdout;

    clearTimeout(timeoutHandle);

    const durationMs = Date.now() - startedAtMs;
    const stdout = stdoutLines.join('\n');
    const stderr = getOutputText((settled as { stderr?: unknown }).stderr);

    if (!task.sessionId) {
      const discoveredSessionId = await discoverLatestClaudeSessionId(cwd, startedAtMs);
      if (discoveredSessionId) {
        task.sessionId = discoveredSessionId;
        await persistSessionId(task.id, discoveredSessionId, config.stateDir, cwd);
      }
    }

    if (didTimeout) {
      return { status: 'timeout', stdout, stderr, durationMs };
    }

    const state = await loadState(config.stateDir, cwd);
    if (hasPhaseCompletion(state, task.id, phase)) {
      return { status: 'ok', stdout, stderr, durationMs };
    }

    const exitCode = (settled as { exitCode?: number }).exitCode;
    if (typeof exitCode === 'number' && exitCode !== 0) {
      return { status: 'failed', stdout, stderr, durationMs };
    }

    const signal = (settled as { signal?: string }).signal;
    if (typeof signal === 'string' && signal.length > 0) {
      return { status: 'failed', stdout, stderr, durationMs };
    }

    return { status: 'stuck', stdout, stderr, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    const stdout = stdoutLines.join('\n');
    const stderr = error instanceof Error ? error.message : String(error);
    return { status: 'failed', stdout, stderr, durationMs };
  }
}

export const runClaudeCodePhase = runPhase;
