import type { MemoryRow } from '../types.js';
import { normalizeMemoryText } from './dedup.js';
import type { CandidateMemory } from './extract.js';

const LOW_SIGNAL_PATTERNS = [
  /^done\.?$/i,
  /^completed\b/i,
  /^i did\b/i,
  /^i updated\b/i,
  /^worked on\b/i,
  /^status:?/i,
];

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

export function scoreWorthiness(candidate: CandidateMemory, existingContext: MemoryRow[]): number {
  let score = 0;

  if (candidate.type === 'procedural' || candidate.type === 'semantic') {
    score += 0.4;
  }

  if (candidate.entities.length > 0) {
    score += 0.2;
  }

  if (candidate.scope === 'session' || candidate.scope === 'branch' || candidate.scope === 'repo') {
    score += 0.2;
  }

  if (candidate.content.trim().length < 20) {
    score -= 0.3;
  }

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(candidate.content.trim()) || pattern.test(candidate.title.trim()))) {
    score -= 0.3;
  }

  if (existingContext.some((memory) => (
    normalizeMemoryText(memory.title) === normalizeMemoryText(candidate.title)
    && normalizeMemoryText(memory.content) === normalizeMemoryText(candidate.content)
  ))) {
    score -= 0.2;
  }

  return clampScore(score);
}
