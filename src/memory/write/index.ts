import { randomUUID } from 'node:crypto';

import type { FeatherConfig, ModelRole, TaskEntry } from '../../config/schema.js';
import type { MemoryDb } from '../db.js';
import { commitAction, type CommitResult } from './commit.js';
import { decideAction, findRelated, type WriteAction } from './dedup.js';
import { extractCandidates, type CandidateMemory } from './extract.js';
import { scoreWorthiness } from './worthiness.js';

export type MemoryWriteDecision = {
  candidate: CandidateMemory;
  score: number;
  action: WriteAction;
  result?: CommitResult;
};

function logDecision(db: MemoryDb, decision: MemoryWriteDecision): void {
  const timestamp = Date.now();

  if (decision.action.kind === 'compact') {
    return;
  }

  const relatedIds = decision.result?.sourceIds ?? [];
  const memoryIds = decision.result?.memoryId ? [decision.result.memoryId, ...relatedIds] : relatedIds;

  for (const memoryId of [...new Set(memoryIds)].filter((value): value is string => value !== null)) {
    db.prepare(
      'INSERT INTO memory_access_log (id, memory_id, actor, reason, accessed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      randomUUID(),
      memoryId,
      'memory-write',
      `${decision.action.kind}${decision.result?.confidenceDelta ? ` confidence+${decision.result.confidenceDelta.toFixed(2)}` : ''}`,
      timestamp,
    );
  }
}

export async function writePhaseMemories(
  db: MemoryDb,
  phaseOutput: string,
  task: TaskEntry,
  role: ModelRole,
  config: FeatherConfig,
  options: Parameters<typeof extractCandidates>[3] = {},
): Promise<MemoryWriteDecision[]> {
  if (!config.memory.enabled) {
    return [];
  }

  const candidates = await extractCandidates(phaseOutput, task, role, {
    claudeBinary: config.orchestrator.claudeCodeBinary,
    ...options,
  });

  const decisions: MemoryWriteDecision[] = [];

  for (const candidate of candidates) {
    const related = findRelated(db, candidate);
    const score = scoreWorthiness(candidate, related);
    if (score < config.memory.worthinessThreshold) {
      decisions.push({ candidate, score, action: { kind: 'ignore' } });
      continue;
    }

    const action = decideAction(candidate, related);
    const result = commitAction(db, action, candidate);
    const decision = { candidate, score, action, result } satisfies MemoryWriteDecision;
    decisions.push(decision);
    logDecision(db, decision);
  }

  return decisions;
}
