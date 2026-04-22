import type { MemoryDb } from '../db.js';
import { MemoryRowSchema, type MemoryRow } from '../types.js';
import type { CandidateMemory } from './extract.js';

type MemoryRowRecord = {
  id: string;
  title: string;
  content: string;
  type: string;
  scope: string;
  supersedes_memory_id: string | null;
  is_active: number;
  invalid_at: number | null;
  created_at: number;
  updated_at: number;
};

export type WriteAction =
  | { kind: 'ignore'; targetId?: string }
  | { kind: 'update'; targetId: string }
  | { kind: 'create' }
  | { kind: 'supersede'; targetId: string }
  | { kind: 'compact'; sourceIds: string[] };

const CONTRADICTORY_TOKEN_PAIRS = [
  ['enabled', 'disabled'],
  ['on', 'off'],
  ['true', 'false'],
  ['allow', 'deny'],
  ['allowed', 'blocked'],
] as const;

const CONTRADICTORY_CANDIDATE_PATTERNS = /(no longer|replaced by|superseded by|deprecated in favor of|instead of|turned off|set to false|removed)/;

function mapMemoryRow(row: MemoryRowRecord): MemoryRow {
  return MemoryRowSchema.parse({
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    scope: row.scope,
    supersedesMemoryId: row.supersedes_memory_id,
    isActive: row.is_active === 1,
    invalidAt: row.invalid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function buildFtsQuery(candidate: CandidateMemory): string | null {
  const terms = [
    ...tokenize(candidate.title),
    ...candidate.entities.flatMap((entity) => tokenize(entity.value)),
    ...tokenize(candidate.content).slice(0, 4),
  ];

  const uniqueTerms = [...new Set(terms)].slice(0, 8);
  if (uniqueTerms.length === 0) {
    return null;
  }

  return uniqueTerms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}

export function normalizeMemoryText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasToken(text: string, token: string): boolean {
  return ` ${normalizeMemoryText(text)} `.includes(` ${token} `);
}

function isExactDuplicate(candidate: CandidateMemory, memory: MemoryRow): boolean {
  return normalizeMemoryText(candidate.title) === normalizeMemoryText(memory.title)
    && normalizeMemoryText(candidate.content) === normalizeMemoryText(memory.content);
}

function titleMatches(candidate: CandidateMemory, memory: MemoryRow): boolean {
  const candidateTitle = normalizeMemoryText(candidate.title);
  const memoryTitle = normalizeMemoryText(memory.title);
  return candidateTitle === memoryTitle || candidateTitle.includes(memoryTitle) || memoryTitle.includes(candidateTitle);
}

function looksContradictory(candidate: CandidateMemory, memory: MemoryRow): boolean {
  if (CONTRADICTORY_TOKEN_PAIRS.some(([left, right]) => (
    (hasToken(candidate.content, left) && hasToken(memory.content, right))
    || (hasToken(candidate.content, right) && hasToken(memory.content, left))
  ))) {
    return true;
  }

  return CONTRADICTORY_CANDIDATE_PATTERNS.test(candidate.content.toLowerCase());
}

function looksCompactable(candidate: CandidateMemory, related: MemoryRow[]): boolean {
  return candidate.type === 'episodic' && candidate.entities.length > 0 && related.length >= 3;
}

export function findRelated(db: MemoryDb, candidate: CandidateMemory): MemoryRow[] {
  const query = buildFtsQuery(candidate);
  if (query === null) {
    return [];
  }

  const rows = db
    .prepare(`
      SELECT memories.*
      FROM memories_fts
      JOIN memories ON memories.id = memories_fts.memory_id
      WHERE memories_fts MATCH ?
        AND memories.is_active = 1
        AND memories.scope = ?
        AND memories.type = ?
      ORDER BY memories.updated_at DESC
      LIMIT 8
    `)
    .all(query, candidate.scope, candidate.type) as MemoryRowRecord[];

  return rows.map(mapMemoryRow);
}

export function decideAction(candidate: CandidateMemory, related: MemoryRow[]): WriteAction {
  if (related.length === 0) {
    return { kind: 'create' };
  }

  if (looksCompactable(candidate, related)) {
    return { kind: 'compact', sourceIds: related.map((memory) => memory.id) };
  }

  const bestMatch = related.find((memory) => titleMatches(candidate, memory)) ?? related[0]!;
  if (isExactDuplicate(candidate, bestMatch)) {
    return { kind: 'ignore', targetId: bestMatch.id };
  }

  if (titleMatches(candidate, bestMatch)) {
    if (looksContradictory(candidate, bestMatch)) {
      return { kind: 'supersede', targetId: bestMatch.id };
    }

    return { kind: 'update', targetId: bestMatch.id };
  }

  return { kind: 'create' };
}
