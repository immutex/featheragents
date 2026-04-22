import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod/v4';

import { TaskStatusSchema, type FeatherConfig, type ProjectState, type TaskEntry } from '../../config/schema.js';
import { loadState, saveState } from '../../mcp/state-io.js';
import { isTaskRunnable, readJsonBody, sendJson } from '../utils.js';

const TaskPatchSchema = z.object({
  status: TaskStatusSchema,
});

type StateRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

function canActivateTask(task: TaskEntry, state: ProjectState): boolean {
  return task.status === 'pending' && isTaskRunnable(task, state);
}

function applyStatusTransition(task: TaskEntry, nextStatus: z.infer<typeof TaskStatusSchema>, state: ProjectState): string | null {
  if (nextStatus === 'done') {
    return 'Tasks can only be marked done by the orchestrator.';
  }

  if (nextStatus === task.status) {
    return null;
  }

  if (task.status === 'pending' && nextStatus === 'active') {
    if (!canActivateTask(task, state)) {
      return 'Task dependencies are not complete.';
    }

    task.status = 'active';
    return null;
  }

  if (task.status === 'active' && nextStatus === 'blocked') {
    task.status = 'blocked';
    if (state.currentTask === task.id) {
      state.currentTask = null;
    }
    return null;
  }

  if (task.status === 'blocked' && nextStatus === 'pending') {
    task.status = 'pending';
    if (state.currentTask === task.id) {
      state.currentTask = null;
    }
    return null;
  }

  return `Invalid dashboard transition: ${task.status} -> ${nextStatus}`;
}

export async function handleStateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: StateRouteContext,
): Promise<boolean> {
  const cwd = context.cwd ?? process.cwd();

  if (pathname === '/api/state' && req.method === 'GET') {
    const state = await loadState(context.config.stateDir, cwd);
    sendJson(res, 200, state);
    return true;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (!taskMatch || req.method !== 'PATCH') {
    return false;
  }

  if (context.readOnly) {
    sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
    return true;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return true;
  }

  const parsed = TaskPatchSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid task patch payload.' });
    return true;
  }

  const state = await loadState(context.config.stateDir, cwd);
  const taskId = decodeURIComponent(taskMatch[1]!);
  const task = state.tasks.find((entry) => entry.id === taskId);

  if (!task) {
    sendJson(res, 404, { error: `Task ${taskId} not found.` });
    return true;
  }

  const transitionError = applyStatusTransition(task, parsed.data.status, state);
  if (transitionError !== null) {
    sendJson(res, 409, { error: transitionError });
    return true;
  }

  await saveState(state, context.config.stateDir, cwd);
  sendJson(res, 200, task);
  return true;
}
