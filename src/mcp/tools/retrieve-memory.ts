// No console.log — stdout is the JSON-RPC transport.
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';

import { MemoryTypeSchema, MemoryScopeSchema } from '../../memory/types.js';
import { openMemoryDb } from '../../memory/db.js';
import { retrieveKeyword, retrieveScoped, retrieveVector } from '../../memory/retrieval/channels.js';
import { aggregateMatches } from '../../memory/retrieval/index.js';
import { buildRetrievalIntent } from '../../memory/retrieval/intent.js';
import { rerankMemories } from '../../memory/retrieval/rerank.js';
import { loadConfig } from '../state-io.js';

function formatResultList(results: ReturnType<typeof rerankMemories>): string {
  if (results.length === 0) {
    return 'No matching memories found.';
  }

  return [
    '## Retrieved Memories',
    '',
    ...results.map((memory, index) => (
      `${index + 1}. **${memory.title}** \
(${memory.id})\
   - type: ${memory.type}\
   - scope: ${memory.scope}\
   - score: ${memory.score.toFixed(2)}\
   - reasons: ${memory.reasons.join(', ')}\
   - content: ${memory.content}`
    )),
  ].join('\n');
}

function logRetrievedMemories(memoryDb: ReturnType<typeof openMemoryDb>, memoryIds: string[], query: string): void {
  if (memoryIds.length === 0) {
    return;
  }

  const timestamp = Date.now();
  const statement = memoryDb.prepare(
    'INSERT INTO memory_access_log (id, memory_id, actor, reason, accessed_at) VALUES (hex(randomblob(16)), ?, ?, ?, ?)',
  );

  for (const memoryId of memoryIds) {
    statement.run(memoryId, 'mcp-retrieve', `query:${query}`, timestamp);
  }
}

export function registerRetrieveMemory(server: McpServer): void {
  server.registerTool(
    'retrieve_memory',
    {
      description: 'Retrieve relevant memories by query, scope, and type.',
      inputSchema: {
        query: z.string().min(1).describe('Free-text query used to retrieve relevant memories.'),
        scope: MemoryScopeSchema.optional().describe('Optional memory scope filter.'),
        type: MemoryTypeSchema.optional().describe('Optional memory type filter.'),
        limit: z.number().int().positive().max(20).optional().describe('Maximum number of memories to return.'),
      },
    },
    async ({ query, scope, type, limit }) => {
      const config = await loadConfig();
      if (!config?.memory.enabled) {
        return {
          content: [{ type: 'text' as const, text: 'Memory is disabled in featherkit/config.json.' }],
        };
      }

      const dbPath = config.memory.dbPath === ':memory:' ? ':memory:' : join(process.cwd(), config.memory.dbPath);
      const db = openMemoryDb(dbPath);

      try {
        const intent = buildRetrievalIntent({
          id: 'mcp-retrieve-memory',
          title: query,
          status: 'active',
          progress: [],
          assignedRole: 'build',
          taskCategory: 'memory',
          files: [query],
          packages: [query],
        }, config);

        const [scopedMatches, keywordMatches, vectorMatches] = await Promise.all([
          Promise.resolve(retrieveScoped(db, intent)),
          Promise.resolve(retrieveKeyword(db, intent)),
          retrieveVector(db, intent, config.memory.ollamaUrl),
        ]);

        const filteredCandidates = aggregateMatches([...scopedMatches, ...keywordMatches, ...vectorMatches])
          .filter((memory) => (scope ? memory.scope === scope : true))
          .filter((memory) => (type ? memory.type === type : true));
        const results = rerankMemories(filteredCandidates, intent).slice(0, limit ?? config.memory.maxResults);

        logRetrievedMemories(db, results.map((memory) => memory.id), query);

        return {
          content: [{ type: 'text' as const, text: formatResultList(results) }],
        };
      } finally {
        db.close();
      }
    },
  );
}
