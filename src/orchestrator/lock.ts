import type { FeatherConfig } from '../config/schema.js';
import { loadState, saveState } from '../mcp/state-io.js';

function isAliveError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const code = (error as NodeJS.ErrnoException).code;
  return code !== 'ESRCH';
}

export async function acquireLock(config: FeatherConfig): Promise<() => Promise<void>> {
  const cwd = process.cwd();
  const state = await loadState(config.stateDir, cwd);
  const existingPid = state.orchestrator?.pid;

  if (state.orchestrator?.status === 'running' && typeof existingPid === 'number') {
    try {
      process.kill(existingPid, 0);
      throw new Error(`Orchestrator already running with PID ${existingPid}`);
    } catch (error) {
      if (isAliveError(error)) {
        throw new Error(`Orchestrator already running with PID ${existingPid}`);
      }

      process.stderr.write(`[feather] orchestrator:stale-lock-cleared stalePid=${existingPid}\n`);
    }
  }

  const pid = process.pid;
  const startedAt = new Date().toISOString();
  const heartbeatMs = Math.max(1, config.orchestrator.timeouts.idleHeartbeatMinutes * 60_000);

  state.orchestrator = {
    status: 'running',
    pid,
    startedAt,
    heartbeatAt: startedAt,
  };

  await saveState(state, config.stateDir, cwd);

  const heartbeatTimer = setInterval(async () => {
    try {
      const nextState = await loadState(config.stateDir, cwd);
      nextState.orchestrator = {
        status: 'running',
        pid,
        startedAt,
        heartbeatAt: new Date().toISOString(),
      };
      await saveState(nextState, config.stateDir, cwd);
    } catch {
      // Ignore heartbeat write failures; the active run should continue.
    }
  }, heartbeatMs);

  heartbeatTimer.unref?.();

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    clearInterval(heartbeatTimer);

    const nextState = await loadState(config.stateDir, cwd);
    nextState.orchestrator = { status: 'idle' };
    await saveState(nextState, config.stateDir, cwd);
  };
}
