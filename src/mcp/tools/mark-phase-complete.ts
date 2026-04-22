// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig } from '../state-io.js';
import type { ModelRole } from '../../config/schema.js';

export type PhaseCompletionVerdict = 'pass' | 'warn' | 'fail';

export interface MarkPhaseCompleteInput {
  taskId: string;
  phase: ModelRole;
  verdict?: PhaseCompletionVerdict;
  summary: string;
}

export async function appendPhaseCompletion(
  input: MarkPhaseCompleteInput,
  options: { stateDir?: string; cwd?: string } = {},
): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  const state = await loadState(options.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === input.taskId);

  if (!task) {
    return false;
  }

  const timestamp = new Date().toISOString();
  const trimmedSummary = input.summary.trim();
  const completion = {
    phase: input.phase,
    verdict: input.verdict,
    summary: trimmedSummary,
    completedAt: timestamp,
  };

  task.phaseCompletions = [...(task.phaseCompletions ?? []), completion];
  task.progress.push({
    timestamp,
    role: input.phase,
    message: `Phase complete${input.verdict ? ` (${input.verdict})` : ''}: ${trimmedSummary}`,
  });

  await saveState(state, options.stateDir, cwd);
  return true;
}

export function registerMarkPhaseComplete(server: McpServer): void {
  server.registerTool(
    'mark_phase_complete',
    {
      description: 'Record a completed phase on a task and append a progress note.',
      inputSchema: {
        taskId: z.string().describe('The task identifier'),
        phase: z
          .enum(['frame', 'build', 'critic', 'sync'])
          .describe('The phase being marked complete'),
        verdict: z
          .enum(['pass', 'warn', 'fail'])
          .optional()
          .describe('Optional phase verdict, used by critic or warning/failure cases'),
        summary: z.string().describe('Short summary of what was completed'),
      },
    },
    async ({ taskId, phase, verdict, summary }) => {
      const config = await loadConfig();
      const wasMarked = await appendPhaseCompletion(
        {
          taskId,
          phase: phase as ModelRole,
          verdict: verdict as PhaseCompletionVerdict | undefined,
          summary,
        },
        { stateDir: config?.stateDir },
      );

      if (!wasMarked) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task ${taskId} not found. Cannot mark ${phase} as complete.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Marked ${phase} complete for ${taskId}.`,
          },
        ],
      };
    }
  );
}
