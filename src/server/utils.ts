import { mkdir, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';

import type { ProjectState, TaskEntry } from '../config/schema.js';

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw.length === 0 ? {} : JSON.parse(raw);
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(`${JSON.stringify(payload)}\n`);
}

export async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(tmpPath, filePath);
}

export function isTaskRunnable(task: TaskEntry, state: ProjectState): boolean {
  if (task.status === 'done' || task.status === 'blocked') {
    return false;
  }

  return (task.dependsOn ?? []).every((dependencyId) =>
    state.tasks.some((candidate) => candidate.id === dependencyId && candidate.status === 'done'),
  );
}
