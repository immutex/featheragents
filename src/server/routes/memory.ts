import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { FeatherConfig } from '../../config/schema.js';
import { MemoryStore } from '../../memory/store.js';
import { openMemoryDb } from '../../memory/db.js';
import { loadConfig } from '../../mcp/state-io.js';
import { sendJson } from '../utils.js';

type MemoryGraphRow = {
  memory_id: string;
  title: string;
  content: string;
  type: string;
  scope: string;
  is_active: number;
  updated_at: number;
  edge_id: string | null;
  from_memory_id: string | null;
  to_memory_id: string | null;
  relation: string | null;
  weight: number | null;
};

type MemoryEntityRow = {
  id: string;
  kind: string;
  value: string;
  normalized_value: string;
  role: string;
};

type MemoryEdgeRow = {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  relation: string;
  weight: number | null;
  created_at: number;
};

type MemoryAccessRow = {
  id: string;
  actor: string | null;
  reason: string | null;
  accessed_at: number;
};

export type MemoryGraphNode = {
  id: string;
  title: string;
  content: string;
  type: string;
  scope: string;
  isActive: boolean;
  updatedAt: number;
};

export type MemoryGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  weight: number | null;
};

type MemoryRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

function resolveMemoryDbPath(config: FeatherConfig, cwd: string): string {
  return config.memory.dbPath === ':memory:' ? ':memory:' : join(cwd, config.memory.dbPath);
}

async function resolveMemoryContext(config: FeatherConfig | undefined, cwd: string | undefined): Promise<{ config: FeatherConfig; cwd: string }> {
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedConfig = config ?? await loadConfig(resolvedCwd);

  if (!resolvedConfig) {
    throw new Error('Unable to load featherkit/config.json.');
  }

  return { config: resolvedConfig, cwd: resolvedCwd };
}

export async function getMemoryGraph(
  scope: string,
  config?: FeatherConfig,
  cwd?: string,
): Promise<{ nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[]; memoryCount: number }> {
  const context = await resolveMemoryContext(config, cwd);
  const resolvedConfig = context.config;

  if (!resolvedConfig.memory.enabled) {
    throw new Error('Memory is disabled in featherkit/config.json.');
  }

  const db = openMemoryDb(resolveMemoryDbPath(resolvedConfig, context.cwd));

  try {
    const rows = db.prepare(`
      WITH limited_nodes AS (
        SELECT id, title, content, type, scope, is_active, updated_at
        FROM memories
        WHERE scope = ?
        ORDER BY updated_at DESC
        LIMIT 500
      )
      SELECT
        limited_nodes.id AS memory_id,
        limited_nodes.title,
        limited_nodes.content,
        limited_nodes.type,
        limited_nodes.scope,
        limited_nodes.is_active,
        limited_nodes.updated_at,
        memory_edges.id AS edge_id,
        memory_edges.from_memory_id,
        memory_edges.to_memory_id,
        memory_edges.relation,
        memory_edges.weight
      FROM limited_nodes
      LEFT JOIN memory_edges
        ON memory_edges.from_memory_id = limited_nodes.id
        OR memory_edges.to_memory_id = limited_nodes.id
    `).all(scope) as MemoryGraphRow[];

    const nodes = new Map<string, MemoryGraphNode>();
    const edges = new Map<string, MemoryGraphEdge>();

    for (const row of rows) {
      nodes.set(row.memory_id, {
        id: row.memory_id,
        title: row.title,
        content: row.content,
        type: row.type,
        scope: row.scope,
        isActive: row.is_active === 1,
        updatedAt: row.updated_at,
      });

      if (row.edge_id !== null && row.from_memory_id !== null && row.to_memory_id !== null && row.relation !== null) {
        edges.set(row.edge_id, {
          id: row.edge_id,
          from: row.from_memory_id,
          to: row.to_memory_id,
          relation: row.relation,
          weight: row.weight,
        });
      }
    }

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      memoryCount: nodes.size,
    };
  } finally {
    db.close();
  }
}

/**
 * Returns the per-phase retrieval trace array for a task.
 * Each element is a { taskId, phase, sessionId, recordedAt, trace } record.
 * The last element is the most recent phase's trace.
 */
export async function getMemoryTrace(taskId: string, config?: FeatherConfig, cwd?: string): Promise<unknown[] | null> {
  const context = await resolveMemoryContext(config, cwd);
  const resolvedConfig = context.config;

  if (!resolvedConfig.memory.enabled) {
    throw new Error('Memory is disabled in featherkit/config.json.');
  }

  try {
    const raw = await readFile(join(context.cwd, resolvedConfig.stateDir, 'memory-traces', `${taskId}.json`), 'utf8');
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function getMemoryById(
  id: string,
  config?: FeatherConfig,
  cwd?: string,
): Promise<{
  memory: ReturnType<MemoryStore['getById']>;
  entities: Array<{ id: string; kind: string; value: string; normalizedValue: string; role: string }>;
  edges: Array<{ id: string; fromMemoryId: string; toMemoryId: string; relation: string; weight: number | null; createdAt: number }>;
  accessLog: Array<{ id: string; actor: string | null; reason: string | null; accessedAt: number }>;
} | null> {
  const context = await resolveMemoryContext(config, cwd);
  const resolvedConfig = context.config;

  if (!resolvedConfig.memory.enabled) {
    throw new Error('Memory is disabled in featherkit/config.json.');
  }

  const db = openMemoryDb(resolveMemoryDbPath(resolvedConfig, context.cwd));

  try {
    const store = new MemoryStore(db);
    const memory = store.getById(id);
    if (memory === null) {
      return null;
    }

    const entities = db.prepare(`
      SELECT entities.id, entities.kind, entities.value, entities.normalized_value, memory_entity_links.role
      FROM memory_entity_links
      JOIN entities ON entities.id = memory_entity_links.entity_id
      WHERE memory_entity_links.memory_id = ?
      ORDER BY entities.kind, entities.value
    `).all(id) as MemoryEntityRow[];

    const edges = db.prepare(`
      SELECT id, from_memory_id, to_memory_id, relation, weight, created_at
      FROM memory_edges
      WHERE from_memory_id = ? OR to_memory_id = ?
      ORDER BY created_at DESC
    `).all(id, id) as MemoryEdgeRow[];

    const accessLog = db.prepare(`
      SELECT id, actor, reason, accessed_at
      FROM memory_access_log
      WHERE memory_id = ?
      ORDER BY accessed_at DESC
      LIMIT 25
    `).all(id) as MemoryAccessRow[];

    return {
      memory,
      entities: entities.map((entity) => ({
        id: entity.id,
        kind: entity.kind,
        value: entity.value,
        normalizedValue: entity.normalized_value,
        role: entity.role,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        fromMemoryId: edge.from_memory_id,
        toMemoryId: edge.to_memory_id,
        relation: edge.relation,
        weight: edge.weight,
        createdAt: edge.created_at,
      })),
      accessLog: accessLog.map((entry) => ({
        id: entry.id,
        actor: entry.actor,
        reason: entry.reason,
        accessedAt: entry.accessed_at,
      })),
    };
  } finally {
    db.close();
  }
}

export async function handleMemoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: MemoryRouteContext,
): Promise<boolean> {
  if (!pathname.startsWith('/api/memory')) {
    return false;
  }

  if (!context.config.memory.enabled) {
    sendJson(res, 404, { error: 'Memory is disabled.' });
    return true;
  }

  const cwd = context.cwd ?? process.cwd();

  if (pathname === '/api/memory/graph' && req.method === 'GET') {
    const url = new URL(req.url ?? pathname, 'http://127.0.0.1');
    const scope = url.searchParams.get('scope') ?? 'repo';
    const graph = await getMemoryGraph(scope, context.config, cwd);
    sendJson(res, 200, { ...graph, truncated: false });
    return true;
  }

  const traceMatch = pathname.match(/^\/api\/memory\/trace\/([^/]+)$/);
  if (traceMatch && req.method === 'GET') {
    const trace = await getMemoryTrace(decodeURIComponent(traceMatch[1]!), context.config, cwd);
    sendJson(res, 200, trace ?? []);
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (detailMatch && req.method === 'GET') {
    const detail = await getMemoryById(decodeURIComponent(detailMatch[1]!), context.config, cwd);
    if (detail === null) {
      sendJson(res, 404, { error: `Memory not found: ${decodeURIComponent(detailMatch[1]!)}` });
      return true;
    }

    sendJson(res, 200, detail);
    return true;
  }

  return false;
}
