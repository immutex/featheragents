// No console.log — stdout is the JSON-RPC transport.
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';

import { openMemoryDb } from '../../memory/db.js';
import { MemoryInsertEntitySchema, MemoryScopeSchema, MemoryTypeSchema } from '../../memory/types.js';
import { commitAction } from '../../memory/write/commit.js';
import { decideAction, findRelated } from '../../memory/write/dedup.js';
import { scoreWorthiness } from '../../memory/write/worthiness.js';
import { loadConfig } from '../state-io.js';

function logWrite(memoryDb: ReturnType<typeof openMemoryDb>, action: string, memoryId: string | null, sourceIds: string[]): void {
  const memoryIds = [...new Set([memoryId, ...sourceIds].filter((value): value is string => value !== null))];
  if (memoryIds.length === 0) {
    return;
  }

  const timestamp = Date.now();
  const statement = memoryDb.prepare(
    'INSERT INTO memory_access_log (id, memory_id, actor, reason, accessed_at) VALUES (hex(randomblob(16)), ?, ?, ?, ?)',
  );

  for (const id of memoryIds) {
    statement.run(id, 'mcp-write', action, timestamp);
  }
}

export function registerWriteMemory(server: McpServer): void {
  server.registerTool(
    'write_memory',
    {
      description: 'Write a memory after worthiness, deduplication, and commit checks.',
      inputSchema: {
        type: MemoryTypeSchema,
        title: z.string().min(1),
        content: z.string().min(1),
        scope: MemoryScopeSchema,
        entities: z.array(MemoryInsertEntitySchema).optional(),
      },
    },
    async ({ type, title, content, scope, entities }) => {
      const config = await loadConfig();
      if (!config?.memory.enabled) {
        return {
          content: [{ type: 'text' as const, text: 'Memory is disabled in featherkit/config.json.' }],
        };
      }

      const dbPath = config.memory.dbPath === ':memory:' ? ':memory:' : join(process.cwd(), config.memory.dbPath);
      const db = openMemoryDb(dbPath);

      try {
        const candidate = {
          type,
          title,
          content,
          scope,
          entities: entities ?? [],
        };

        const related = findRelated(db, candidate);
        const score = scoreWorthiness(candidate, related);

        if (score < config.memory.worthinessThreshold) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ action: 'ignore', memoryId: null, score }, null, 2) }],
          };
        }

        const action = decideAction(candidate, related);
        const result = commitAction(db, action, candidate);
        logWrite(db, action.kind, result.memoryId, result.sourceIds);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ action: action.kind, memoryId: result.memoryId, score }, null, 2) }],
        };
      } finally {
        db.close();
      }
    },
  );
}
