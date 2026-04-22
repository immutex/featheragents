import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FeatherConfig } from '../../config/schema.js';
import { loadState, saveState } from '../../mcp/state-io.js';
import { isTaskRunnable, sendJson } from '../utils.js';

type TasksRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

export async function handleTasksRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: TasksRouteContext,
): Promise<boolean> {
  const match = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
  if (!match || req.method !== 'POST') {
    return false;
  }

  if (context.readOnly) {
    sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
    return true;
  }

  const cwd = context.cwd ?? process.cwd();
  const state = await loadState(context.config.stateDir, cwd);
  const taskId = decodeURIComponent(match[1]!);
  const task = state.tasks.find((entry) => entry.id === taskId);

  if (!task) {
    sendJson(res, 404, { error: `Task ${taskId} not found.` });
    return true;
  }

  if (!isTaskRunnable(task, state)) {
    sendJson(res, 409, { error: `Task ${taskId} is not runnable.` });
    return true;
  }

  state.currentTask = taskId;
  await saveState(state, context.config.stateDir, cwd);

  sendJson(res, 200, {
    ok: true,
    taskId,
    // The dashboard only queues the task here; feather orchestrate --task <id>
    // still owns actual phase execution until dashboard-driven orchestration ships.
    queued: true,
  });
  return true;
}
