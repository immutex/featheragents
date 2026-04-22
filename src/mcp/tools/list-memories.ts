// No console.log — stdout is the JSON-RPC transport.
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';

import { openMemoryDb } from '../../memory/db.js';
import { MemoryScopeSchema, MemoryTypeSchema } from '../../memory/types.js';
import { MemoryStore } from '../../memory/store.js';
import { loadConfig } from '../state-io.js';

const DEFAULT_LIMIT = 50;

export function registerListMemories(server: McpServer): void {
  server.registerTool(
    'list_memories',
    {
      description: 'List memories filtered by scope, type, and active state.',
      inputSchema: {
        scope: MemoryScopeSchema.optional().describe('Optional memory scope filter.'),
        type: MemoryTypeSchema.optional().describe('Optional memory type filter.'),
        isActive: z.boolean().optional().describe('Filter active vs inactive memories.'),
      },
    },
    async ({ scope, type, isActive }) => {
      const config = await loadConfig();
      if (!config?.memory.enabled) {
        return {
          content: [{ type: 'text' as const, text: 'Memory is disabled in featherkit/config.json.' }],
        };
      }

      const dbPath = config.memory.dbPath === ':memory:' ? ':memory:' : join(process.cwd(), config.memory.dbPath);
      const db = openMemoryDb(dbPath);

      try {
        const store = new MemoryStore(db);
        const memories = store.query({ scope, type, isActive }).slice(0, DEFAULT_LIMIT);

        if (memories.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No memories found for the requested filters.' }],
          };
        }

        const lines = memories.map((memory) => (
          `- **${memory.title}** (${memory.id}) — ${memory.type}/${memory.scope} — active=${memory.isActive}`
        ));

        return {
          content: [{ type: 'text' as const, text: `## Memories\n\n${lines.join('\n')}` }],
        };
      } finally {
        db.close();
      }
    },
  );
}
