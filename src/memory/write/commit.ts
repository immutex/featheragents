import { randomUUID } from 'node:crypto';

import type { MemoryDb } from '../db.js';
import { MemoryStore } from '../store.js';
import type { CandidateMemory } from './extract.js';
import type { WriteAction } from './dedup.js';

type ExistingMemoryRow = { title: string; content: string };

export type CommitResult = {
  memoryId: string | null;
  sourceIds: string[];
  confidenceDelta?: number;
};

function mergeContent(existingContent: string, nextContent: string): string {
  if (existingContent.includes(nextContent)) {
    return existingContent;
  }

  return `${existingContent}\n\n${nextContent}`;
}

function buildSummaryCandidate(candidate: CandidateMemory): CandidateMemory {
  return {
    ...candidate,
    type: 'semantic',
    title: `Summary: ${candidate.title}`,
  };
}

export function commitAction(db: MemoryDb, action: WriteAction, candidate: CandidateMemory): CommitResult {
  const store = new MemoryStore(db);

  if (action.kind === 'ignore') {
    return { memoryId: action.targetId ?? null, sourceIds: action.targetId ? [action.targetId] : [] };
  }

  if (action.kind === 'create') {
    const memoryId = store.insert(candidate);
    return { memoryId, sourceIds: [] };
  }

  if (action.kind === 'supersede') {
    return db.transaction((targetId: string, nextCandidate: CandidateMemory) => {
      const memoryId = store.insert(nextCandidate);
      store.supersede(targetId, memoryId);
      return { memoryId, sourceIds: [targetId] } satisfies CommitResult;
    })(action.targetId, candidate);
  }

  if (action.kind === 'update') {
    return db.transaction((targetId: string, nextCandidate: CandidateMemory) => {
      const existing = db.prepare('SELECT title, content FROM memories WHERE id = ? AND is_active = 1').get(targetId) as ExistingMemoryRow | undefined;
      if (!existing) {
        throw new Error(`Cannot update missing memory: ${targetId}`);
      }

      const timestamp = Date.now();
      db.prepare('UPDATE memories SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
        nextCandidate.title || existing.title,
        mergeContent(existing.content, nextCandidate.content),
        timestamp,
        targetId,
      );
      store.attachEntities(targetId, nextCandidate.entities, timestamp);

      return { memoryId: targetId, sourceIds: [targetId], confidenceDelta: 0.05 } satisfies CommitResult;
    })(action.targetId, candidate);
  }

  return db.transaction((sourceIds: string[], nextCandidate: CandidateMemory) => {
    const summaryCandidate = buildSummaryCandidate(nextCandidate);
    const memoryId = store.insert(summaryCandidate);
    const timestamp = Date.now();

    for (const sourceId of sourceIds) {
      db.prepare('UPDATE memories SET is_active = 0, invalid_at = ?, updated_at = ? WHERE id = ? AND is_active = 1').run(
        timestamp,
        timestamp,
        sourceId,
      );
      db.prepare(
        'INSERT INTO memory_compactions (id, source_memory_id, target_memory_id, reason, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(randomUUID(), sourceId, memoryId, 'compact', timestamp);
      db.prepare(
        'INSERT INTO memory_edges (id, from_memory_id, to_memory_id, relation, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(randomUUID(), memoryId, sourceId, 'compacts', 1, timestamp);
    }

    return { memoryId, sourceIds } satisfies CommitResult;
  })(action.sourceIds, candidate);
}
