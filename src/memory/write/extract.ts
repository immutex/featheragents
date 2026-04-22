import { execa } from 'execa';
import { z } from 'zod/v4';

import type { ModelRole, TaskEntry } from '../../config/schema.js';
import { MemoryInsertEntitySchema, MemoryScopeSchema, MemoryTypeSchema } from '../types.js';

const EXTRACTION_TIMEOUT_MS = 60_000;

export const CandidateMemorySchema = z.object({
  type: MemoryTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  scope: MemoryScopeSchema,
  entities: z.array(MemoryInsertEntitySchema).default([]),
});
export type CandidateMemory = z.infer<typeof CandidateMemorySchema>;

type ExtractionRunnerResult = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

type ExtractionRunner = (
  command: string,
  args: string[],
  options: { cwd: string; reject: boolean; stdin: 'ignore'; cancelSignal?: AbortSignal },
) => Promise<ExtractionRunnerResult>;

function buildExtractionPrompt(phaseOutput: string, task: TaskEntry, role: ModelRole): string {
  return [
    'Extract at most 5 long-term memories as JSON array only.',
    'Schema: [{"type":"semantic|episodic|procedural","title":"...","content":"...","scope":"session|branch|repo|workspace|user|global","entities":[{"kind":"file|package|task|agent|concept","value":"..."}]}].',
    'Ignore status updates, chatter, and empty/low-signal items.',
    `Task: ${task.id} — ${task.title}`,
    `Role: ${role}`,
    `Output:\n${phaseOutput.slice(0, 4_000)}`,
  ].join('\n');
}

function parseCandidateArray(output: string): CandidateMemory[] {
  const arrayMatch = output.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return [];
  }

  const parsed = JSON.parse(arrayMatch[0]);
  const result = z.array(CandidateMemorySchema).safeParse(parsed);
  if (!result.success) {
    return [];
  }

  return result.data.slice(0, 5);
}

export async function extractCandidates(
  phaseOutput: string,
  task: TaskEntry,
  role: ModelRole,
  options: {
    claudeBinary?: string;
    timeoutMs?: number;
    runCommand?: ExtractionRunner;
    cwd?: string;
  } = {},
): Promise<CandidateMemory[]> {
  const runCommand = options.runCommand ?? (execa as unknown as ExtractionRunner);
  const claudeBinary = options.claudeBinary ?? 'claude';
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const prompt = buildExtractionPrompt(phaseOutput, task, role);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.error('[memory] candidate extraction timed out');
    controller.abort();
  }, timeoutMs);

  try {
    const result = await runCommand(claudeBinary, ['--print', '-p', prompt], {
      cwd,
      reject: false,
      stdin: 'ignore',
      cancelSignal: controller.signal,
    });
    if ((result.exitCode ?? 0) !== 0) {
      return [];
    }

    return parseCandidateArray(result.stdout ?? '');
  } catch (error) {
    if (timedOut || (typeof error === 'object' && error !== null && 'isCanceled' in error && error.isCanceled === true)) {
      return [];
    }

    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
