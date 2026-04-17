import type { FeatherConfig } from '../../config/schema.js';

interface OpenCodeConfig {
  mcp: Record<string, { command: string; args: string[] }>;
}

export function renderOpenCodeConfig(_config: FeatherConfig): string {
  const cfg: OpenCodeConfig = {
    mcp: {
      featherkit: {
        command: 'node',
        args: ['./node_modules/@1mmutex/featherkit/dist/server.js'],
      },
    },
  };

  return JSON.stringify(cfg, null, 2) + '\n';
}
