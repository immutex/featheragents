// MCP server entry point — spawned by clients as a stdio child process.
// CRITICAL: Do NOT use console.log here or in any imported MCP module.
// stdout is the JSON-RPC transport. Use console.error for logs only.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
  version = pkg.version;
} catch {
  // bundled — version constant is fine
}

const server = new McpServer({
  name: 'featherkit',
  version,
});

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[featherkit] MCP server started v${version}`);
}

main().catch((err) => {
  console.error('[featherkit] Fatal error:', err);
  process.exit(1);
});
