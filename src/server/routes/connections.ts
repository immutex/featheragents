import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod/v4';

import type { FeatherConfig } from '../../config/schema.js';
import { readJsonBody, sendJson, writeJsonAtomic } from '../utils.js';

const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.object({}).passthrough()).default({}),
}).passthrough();

type ConnectionsRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

async function loadConnectionsFile(filePath: string): Promise<z.infer<typeof McpConfigSchema>> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    return McpConfigSchema.parse(raw);
  } catch {
    return { mcpServers: {} };
  }
}

export async function handleConnectionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: ConnectionsRouteContext,
): Promise<boolean> {
  if (pathname !== '/api/connections') {
    return false;
  }

  const cwd = context.cwd ?? process.cwd();
  const mcpPath = join(cwd, '.mcp.json');

  if (req.method === 'GET') {
    const mcpConfig = await loadConnectionsFile(mcpPath);
    const providers = [...new Set(context.config.models.map((model) => model.provider))]
      .sort()
      .map((provider) => ({
        provider,
        connected: provider === 'anthropic',
      }));

    sendJson(res, 200, {
      mcpServers: mcpConfig.mcpServers,
      providers,
    });
    return true;
  }

  if (req.method !== 'PUT') {
    return false;
  }

  if (context.readOnly) {
    sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
    return true;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return true;
  }

  const parsed = McpConfigSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid .mcp.json payload.', issues: parsed.error.issues });
    return true;
  }

  await writeJsonAtomic(mcpPath, parsed.data);
  sendJson(res, 200, parsed.data);
  return true;
}
