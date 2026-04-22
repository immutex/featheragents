import type { MemoryRow } from '../types.js';
import type { RetrievalIntent } from './intent.js';

export type RerankCandidate = MemoryRow & {
  reasons: string[];
  keywordScore: number;
  semanticScore: number;
  scopeScore: number;
  entityOverlap: number;
  graphDepth: number | null;
  salience?: number;
  confidence?: number;
  helpfulness?: number;
};

export type ScoredMemory = RerankCandidate & {
  score: number;
  scoreBreakdown: {
    scope: number;
    entityOverlap: number;
    semantic: number;
    keyword: number;
    recency: number;
    graph: number;
    salience: number;
    confidence: number;
    helpfulness: number;
  };
};

function computeScopeBoost(memory: MemoryRow, intent: RetrievalIntent): number {
  if (intent.branch !== null) {
    if (memory.scope === 'branch') {
      return 3;
    }

    if (memory.scope === 'repo') {
      return 2;
    }
  }

  if (intent.repo !== null && memory.scope === 'repo') {
    return 3;
  }

  if (memory.scope === 'workspace') {
    return 1;
  }

  if (memory.scope === 'user') {
    return 0.5;
  }

  return 0;
}

function computeEntityOverlap(candidate: RerankCandidate, intent: RetrievalIntent): number {
  const overlapCount = candidate.reasons.filter((reason) =>
    intent.identifiers.some((identifier) => reason.toLowerCase().includes(identifier.toLowerCase())),
  ).length;

  return overlapCount / 10;
}

function computeRecencyScore(updatedAt: number): number {
  const ageDays = Math.max(0, Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 30);
}

function computeGraphScore(depth: number | null): number {
  if (depth === null) {
    return 0;
  }

  return depth === 1 ? 0.5 : 0.25;
}

export function rerankMemories(candidates: RerankCandidate[], intent: RetrievalIntent): ScoredMemory[] {
  return candidates
    .map((candidate) => {
      const scope = Math.max(candidate.scopeScore, computeScopeBoost(candidate, intent));
      const entityOverlap = Math.max(candidate.entityOverlap, computeEntityOverlap(candidate, intent));
      const semantic = candidate.semanticScore;
      const keyword = candidate.keywordScore;
      const recency = computeRecencyScore(candidate.updatedAt);
      const graph = computeGraphScore(candidate.graphDepth);
      const salience = candidate.salience ?? 0;
      const confidence = candidate.confidence ?? 0;
      const helpfulness = candidate.helpfulness ?? 0;

      return {
        ...candidate,
        score: scope + entityOverlap + semantic + keyword + recency + graph + salience + confidence + helpfulness,
        scoreBreakdown: {
          scope,
          entityOverlap,
          semantic,
          keyword,
          recency,
          graph,
          salience,
          confidence,
          helpfulness,
        },
      };
    })
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);
}
