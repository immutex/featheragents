import type { FeatherConfig } from '../../config/schema.js';
import type { MemoryDb } from '../db.js';
import { retrieveGraph, retrieveKeyword, retrieveScoped, retrieveVector, type ChannelMatch } from './channels.js';
import { assembleContext, type RetrievalTrace } from './assemble.js';
import { buildRetrievalIntent, type RetrievalTask } from './intent.js';
import { rerankMemories, type RerankCandidate } from './rerank.js';

export function aggregateMatches(matches: ChannelMatch[]): RerankCandidate[] {
  const candidates = new Map<string, RerankCandidate>();

  for (const match of matches) {
    const existing = candidates.get(match.memory.id);

    if (existing === undefined) {
      candidates.set(match.memory.id, {
        ...match.memory,
        reasons: [match.reason],
        keywordScore: match.keywordScore ?? 0,
        semanticScore: match.semanticScore ?? 0,
        scopeScore: match.scopeScore ?? 0,
        entityOverlap: 0,
        graphDepth: match.graphDepth ?? null,
      });
      continue;
    }

    existing.reasons = [...new Set([...existing.reasons, match.reason])];
    existing.keywordScore = Math.max(existing.keywordScore, match.keywordScore ?? 0);
    existing.semanticScore = Math.max(existing.semanticScore, match.semanticScore ?? 0);
    existing.scopeScore = Math.max(existing.scopeScore, match.scopeScore ?? 0);
    existing.graphDepth =
      existing.graphDepth === null
        ? (match.graphDepth ?? null)
        : match.graphDepth === undefined
          ? existing.graphDepth
          : Math.min(existing.graphDepth, match.graphDepth);
  }

  return [...candidates.values()];
}

export async function retrieveMemoryContext(
  db: MemoryDb,
  task: RetrievalTask,
  config: FeatherConfig,
): Promise<{ block: string; trace: RetrievalTrace }> {
  if (!config.memory.enabled) {
    return {
      block: '',
      trace: {
        tokenBudget: 0,
        used: 0,
        included: [],
        dropped: [],
      },
    };
  }

  const intent = buildRetrievalIntent(task, config);
  const memoryConfig = config.memory;
  const tokenBudget = memoryConfig.tokenBudget;
  const maxResults = memoryConfig.maxResults;

  const [scopedMatches, keywordMatches, vectorMatches] = await Promise.all([
    Promise.resolve(retrieveScoped(db, intent)),
    Promise.resolve(retrieveKeyword(db, intent)),
    retrieveVector(db, intent, memoryConfig.ollamaUrl),
  ]);

  const seedIds = [...new Set([...scopedMatches, ...keywordMatches, ...vectorMatches].map((match) => match.memory.id))];
  const graphMatches = retrieveGraph(db, seedIds);
  const candidates = aggregateMatches([...scopedMatches, ...keywordMatches, ...vectorMatches, ...graphMatches]);
  const scored = rerankMemories(candidates, intent).slice(0, maxResults);

  return assembleContext(scored, tokenBudget);
}

export type { RetrievalTrace } from './assemble.js';
