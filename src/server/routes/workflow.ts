import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import type { FeatherConfig } from '../../config/schema.js';
import { DEFAULT_WORKFLOW } from '../../workflow/default.js';
import { WorkflowSchema } from '../../workflow/schema.js';
import { readJsonBody, sendJson, writeJsonAtomic } from '../utils.js';

type WorkflowRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function validateWorkflowGraph(workflow: { start: string; nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> }): string[] {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const errors: string[] = [];

  if (!nodeIds.has(workflow.start)) {
    errors.push('Start node must reference an existing workflow node.');
    return errors;
  }

  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      errors.push(`Edge ${edge.from} → ${edge.to} references a missing node.`);
      continue;
    }

    adjacency.get(edge.from)?.push(edge.to);
  }

  if (errors.length > 0) {
    return errors;
  }

  const visited = new Set<string>();
  const queue = [workflow.start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  const terminalNodes = workflow.nodes.filter((node) => (adjacency.get(node.id)?.length ?? 0) === 0).map((node) => node.id);
  if (terminalNodes.length === 0) {
    errors.push('Workflow must include at least one terminal node.');
  } else if (!terminalNodes.some((nodeId) => visited.has(nodeId))) {
    errors.push('No terminal node is reachable from the start node.');
  }

  const unreachableNodes = workflow.nodes.map((node) => node.id).filter((nodeId) => !visited.has(nodeId));
  if (unreachableNodes.length > 0) {
    errors.push(`Unreachable nodes: ${unreachableNodes.join(', ')}`);
  }

  return errors;
}

export async function handleWorkflowRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: WorkflowRouteContext,
): Promise<boolean> {
  if (pathname !== '/api/workflow' && pathname !== '/api/workflow/validate') {
    return false;
  }

  const cwd = context.cwd ?? process.cwd();
  const workflowPath = resolve(cwd, context.config.workflow);

  if (pathname === '/api/workflow' && req.method === 'GET') {
    try {
      const raw = JSON.parse(await readFile(workflowPath, 'utf8'));
      sendJson(res, 200, WorkflowSchema.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        sendJson(res, 200, DEFAULT_WORKFLOW);
        return true;
      }

      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return true;
  }

  const parsed = WorkflowSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid workflow payload.', issues: parsed.error.issues });
    return true;
  }

  if (pathname === '/api/workflow/validate' && req.method === 'POST') {
    const validationErrors = validateWorkflowGraph(parsed.data);
    if (validationErrors.length > 0) {
      sendJson(res, 400, {
        error: validationErrors.join(' '),
        issues: validationErrors,
      });
      return true;
    }

    sendJson(res, 200, { ok: true, message: 'Workflow is valid.' });
    return true;
  }

  if (pathname !== '/api/workflow' || req.method !== 'PUT') {
    return false;
  }

  if (context.readOnly) {
    sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
    return true;
  }

  await writeJsonAtomic(workflowPath, parsed.data);
  sendJson(res, 200, parsed.data);
  return true;
}
