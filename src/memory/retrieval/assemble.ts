import type { ScoredMemory } from './rerank.js';

export type RetrievalTrace = {
  tokenBudget: number;
  used: number;
  included: Array<{
    memoryId: string;
    title: string;
    score: number;
    reasons: string[];
    usedTokens: number;
  }>;
  dropped: Array<{
    memoryId: string;
    title: string;
    reason: string;
  }>;
};

function estimateTokens(text: string): number {
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  return Math.max(Math.ceil(text.length / 4), wordCount * 4);
}

function formatMemory(memory: ScoredMemory): string {
  return `[${memory.type}:${memory.scope}] ${memory.title} — ${memory.content}`;
}

export function assembleContext(scored: ScoredMemory[], tokenBudget: number): { block: string; used: number; trace: RetrievalTrace } {
  const blockParts: string[] = [];
  let used = 0;
  const trace: RetrievalTrace = {
    tokenBudget,
    used: 0,
    included: [],
    dropped: [],
  };

  for (const memory of scored) {
    const formatted = formatMemory(memory);
    const usedTokens = estimateTokens(formatted);

    if (used + usedTokens > tokenBudget || trace.included.length >= 8) {
      trace.dropped.push({
        memoryId: memory.id,
        title: memory.title,
        reason: used + usedTokens > tokenBudget ? 'budget' : 'max-memories',
      });
      continue;
    }

    blockParts.push(formatted);
    used += usedTokens;
    trace.included.push({
      memoryId: memory.id,
      title: memory.title,
      score: memory.score,
      reasons: memory.reasons,
      usedTokens,
    });
  }

  trace.used = used;

  return {
    block: blockParts.join('\n\n'),
    used,
    trace,
  };
}
