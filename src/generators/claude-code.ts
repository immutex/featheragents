import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';

const SETTINGS_PATH = '.claude/settings.local.json';

const FEATHERKIT_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '--package', '@1mmutex/featherkit', 'featherkit-mcp'],
};

const CONTEXT7_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp@latest'],
};

/**
 * Recursively deep-merge `source` into `target`.
 * Objects are merged key-by-key; arrays and primitives replace.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

export async function generateClaudeCodeConfig(cwd: string, config?: FeatherConfig): Promise<void> {
  const settingsPath = join(cwd, SETTINGS_PATH);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, 'utf8');
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const mcpServers: Record<string, unknown> = { featherkit: FEATHERKIT_MCP_ENTRY };
  const allow = ['mcp__featherkit__*'];

  if (config?.integrations.context7) {
    mcpServers['context7'] = CONTEXT7_MCP_ENTRY;
    allow.push('mcp__context7__*');
  }

  const incoming: Record<string, unknown> = {
    mcpServers,
    permissions: { allow },
  };

  const merged = deepMerge(existing, incoming);

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
