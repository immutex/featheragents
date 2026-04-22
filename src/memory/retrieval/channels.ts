import type { MemoryDb } from '../db.js';
import { MemoryRowSchema, type MemoryRow, type MemoryScope } from '../types.js';
import type { RetrievalIntent } from './intent.js';
import { embedText } from '../embeddings.js';

export type ChannelMatch = {
  memory: MemoryRow;
  reason: string;
  keywordScore?: number;
  semanticScore?: number;
  graphDepth?: number;
  scopeScore?: number;
};

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

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function getRowsByIds(db: MemoryDb, ids: string[]): MemoryRow[] {
  if (ids.length === 0) {
    return [];
  }

  const rows = db
    .prepare(`SELECT * FROM memories WHERE is_active = 1 AND id IN (${placeholders(ids.length)})`)
    .all(...ids) as MemoryRowRecord[];

  return rows.map(mapMemoryRow);
}

function tokenizeFtsTerm(term: string): string[] {
  const trimmed = term.trim().toLowerCase();

  if (trimmed.length === 0) {
    return [];
  }

  const parts = trimmed.split(/[^a-zA-Z0-9_]+/).map((value) => value.trim()).filter((value) => value.length > 0);

  if (parts.length === 0) {
    return [];
  }

  const preserveShortParts = /[^a-zA-Z0-9_]/.test(trimmed);
  const compact = parts.join('');
  const filteredParts = parts.filter((value) => preserveShortParts || value.length > 1);

  return compact.length > 1 ? [...filteredParts, compact] : filteredParts;
}

function buildFtsQuery(terms: string[]): string | null {
  const normalizedTerms = [...new Set(terms.flatMap(tokenizeFtsTerm))];

  if (normalizedTerms.length === 0) {
    return null;
  }

  return normalizedTerms
    .slice(0, 8)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' OR ');
}

function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

function scopedMatchScore(scope: MemoryScope, intent: RetrievalIntent): number {
  if (intent.branch !== null) {
    if (scope === 'branch') {
      return 3;
    }

    if (scope === 'repo') {
      return 2;
    }
  }

  if (intent.repo !== null && scope === 'repo') {
    return 3;
  }

  if (scope === 'workspace') {
    return 1;
  }

  if (scope === 'user') {
    return 0.5;
  }

  return 0;
}

export function retrieveScoped(db: MemoryDb, intent: RetrievalIntent): ChannelMatch[] {
  // mem-a stores only scope level, not repo/branch identifiers, so v1 can
  // filter by scope specificity but cannot yet distinguish between two repos
  // that both contain repo-scoped memories.
  const scopes: MemoryScope[] = intent.branch !== null ? ['branch', 'repo'] : intent.repo !== null ? ['repo'] : ['workspace', 'user', 'global'];

  const rows = db
    .prepare(`
      SELECT *
      FROM memories
      WHERE is_active = 1 AND scope IN (${placeholders(scopes.length)})
      ORDER BY updated_at DESC
      LIMIT 8
    `)
    .all(...scopes) as MemoryRowRecord[];

  return rows.map((row) => {
    const memory = mapMemoryRow(row);
    return {
      memory,
      reason: `scope:${memory.scope} match`,
      scopeScore: scopedMatchScore(memory.scope, intent),
    };
  });
}

export function retrieveKeyword(db: MemoryDb, intent: RetrievalIntent): ChannelMatch[] {
  const query = buildFtsQuery([...intent.files, ...intent.packages, ...intent.identifiers]);

  if (query === null) {
    return [];
  }

  const rows = db
    .prepare(`
      SELECT memories.*, bm25(memories_fts) AS keyword_rank
      FROM memories_fts
      JOIN memories ON memories.id = memories_fts.memory_id
      WHERE memories_fts MATCH ? AND memories.is_active = 1
      ORDER BY keyword_rank ASC
      LIMIT 8
    `)
    .all(query) as Array<MemoryRowRecord & { keyword_rank: number }>;

  return rows.map((row, index) => {
    const memory = mapMemoryRow(row);
    const reasonToken = intent.files.find((file) => memory.title.includes(file) || memory.content.includes(file))
      ?? intent.packages.find((pkg) => memory.title.includes(pkg) || memory.content.includes(pkg))
      ?? query;

    return {
      memory,
      reason: `fts:${reasonToken}`,
      keywordScore: 1 / (index + 1),
    };
  });
}

export async function retrieveVector(db: MemoryDb, intent: RetrievalIntent, ollamaUrl?: string): Promise<ChannelMatch[]> {
  if (ollamaUrl === undefined || ollamaUrl.length === 0) {
    return [];
  }

  const embedding = await embedText(intent.description, ollamaUrl);

  if (embedding === null) {
    return [];
  }

  try {
    const rows = db
      .prepare(`
        SELECT memories.*, vec_distance_cosine(memory_embeddings.embedding, ?) AS semantic_distance
        FROM memory_embeddings
        JOIN memories ON memories.id = memory_embeddings.memory_id
        WHERE memories.is_active = 1
        ORDER BY semantic_distance ASC
        LIMIT 8
      `)
      .all(vectorToBlob(embedding)) as Array<MemoryRowRecord & { semantic_distance: number }>;

    return rows.map((row) => ({
      memory: mapMemoryRow(row),
      reason: 'vector:intent similarity',
      semanticScore: Math.max(0, 1 - row.semantic_distance),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[memory] vector retrieval unavailable: ${message}`);
    return [];
  }
}

export function retrieveGraph(db: MemoryDb, rootIds: string[]): ChannelMatch[] {
  const visited = new Set(rootIds);
  const reasons = new Map<string, number>();
  let frontier = [...new Set(rootIds)];

  for (let depth = 1; depth <= 2 && frontier.length > 0; depth += 1) {
    const edgeRows = db
      .prepare(`
        SELECT CASE WHEN from_memory_id IN (${placeholders(frontier.length)}) THEN to_memory_id ELSE from_memory_id END AS memory_id
        FROM memory_edges
        WHERE from_memory_id IN (${placeholders(frontier.length)}) OR to_memory_id IN (${placeholders(frontier.length)})
      `)
      .all(...frontier, ...frontier, ...frontier) as Array<{ memory_id: string }>;

    const entityRows = db
      .prepare(`
        SELECT DISTINCT related.memory_id AS memory_id
        FROM memory_entity_links seed
        JOIN memory_entity_links related ON related.entity_id = seed.entity_id
        WHERE seed.memory_id IN (${placeholders(frontier.length)})
      `)
      .all(...frontier) as Array<{ memory_id: string }>;

    const nextIds = [...edgeRows, ...entityRows]
      .map((row) => row.memory_id)
      .filter((id) => !visited.has(id));

    for (const id of nextIds) {
      visited.add(id);
      reasons.set(id, depth);
    }

    frontier = [...new Set(nextIds)];
  }

  return getRowsByIds(db, [...reasons.keys()]).map((memory) => ({
    memory,
    reason: `graph:depth-${reasons.get(memory.id) ?? 1}`,
    graphDepth: reasons.get(memory.id) ?? 1,
  }));
}
