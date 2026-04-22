import { basename } from 'node:path';

import type { FeatherConfig, ModelRole, TaskEntry } from '../../config/schema.js';

export type RetrievalTask = TaskEntry &
  Partial<{
    repo: string;
    branch: string;
    files: string[];
    packages: string[];
    agentRole: string;
    modelRole: ModelRole;
    taskCategory: string;
  }>;

export type RetrievalIntent = {
  repo: string | null;
  branch: string | null;
  files: string[];
  packages: string[];
  agentRole: string | null;
  modelRole: ModelRole | null;
  taskCategory: string;
  description: string;
  identifiers: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function buildRetrievalIntent(task: RetrievalTask, config: FeatherConfig): RetrievalIntent {
  const files = unique((task.files ?? []).flatMap((file) => [file, basename(file)]));
  const packages = unique([...(task.packages ?? []), ...config.packages]);
  const repo = task.repo ?? config.projectName;
  const branch = task.branch ?? null;
  const modelRole = task.modelRole ?? task.assignedRole ?? null;
  const agentRole = task.agentRole ?? task.assignedRole ?? null;
  const taskCategory = task.taskCategory ?? task.id.split('-')[0] ?? 'task';

  const identifiers = unique([
    task.id,
    task.title,
    repo,
    branch ?? '',
    taskCategory,
    ...files,
    ...packages,
  ]);

  const description = unique([
    `task ${task.id}`,
    task.title,
    repo ? `repo ${repo}` : '',
    branch ? `branch ${branch}` : '',
    files.length > 0 ? `files ${files.join(', ')}` : '',
    packages.length > 0 ? `packages ${packages.join(', ')}` : '',
    modelRole ? `role ${modelRole}` : '',
    agentRole ? `agent ${agentRole}` : '',
    `category ${taskCategory}`,
  ]).join(' | ');

  return {
    repo,
    branch,
    files,
    packages,
    agentRole,
    modelRole,
    taskCategory,
    description,
    identifiers,
  };
}
