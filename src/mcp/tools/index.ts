import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// No console.log — stdout is the JSON-RPC transport.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FeatherConfigSchema } from '../../config/schema.js';
import { registerGetProjectBrief } from './get-project-brief.js';
import { registerGetActiveFocus } from './get-active-focus.js';
import { registerGetTask } from './get-task.js';
import { registerStartTask } from './start-task.js';
import { registerAppendProgress } from './append-progress.js';
import { registerRecordReviewNotes } from './record-review-notes.js';
import { registerWriteHandoff } from './write-handoff.js';
import { registerRecordDecision } from './record-decision.js';
import { registerListTasks } from './list-tasks.js';
import { registerGetDiff } from './get-diff.js';
import { registerMarkPhaseComplete } from './mark-phase-complete.js';
import { registerPrepareContextPack } from './prepare-context-pack.js';
import { registerVerifyPhase } from './verify-phase.js';
import { registerRetrieveMemory } from './retrieve-memory.js';
import { registerWriteMemory } from './write-memory.js';
import { registerListMemories } from './list-memories.js';

function isMemoryEnabled(cwd = process.cwd()): boolean {
  const configPath = join(cwd, 'featherkit', 'config.json');
  if (!existsSync(configPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const result = FeatherConfigSchema.safeParse(parsed);
    return result.success ? result.data.memory.enabled : false;
  } catch {
    return false;
  }
}

export function registerAllTools(server: McpServer): void {
  registerGetProjectBrief(server);
  registerGetActiveFocus(server);
  registerGetTask(server);
  registerStartTask(server);
  registerAppendProgress(server);
  registerRecordReviewNotes(server);
  registerWriteHandoff(server);
  registerRecordDecision(server);
  registerListTasks(server);
  registerGetDiff(server);
  registerMarkPhaseComplete(server);
  registerPrepareContextPack(server);
  registerVerifyPhase(server);

  if (isMemoryEnabled()) {
    registerRetrieveMemory(server);
    registerWriteMemory(server);
    registerListMemories(server);
  }
}
