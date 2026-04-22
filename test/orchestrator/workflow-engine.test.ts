import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';
import { nextStep } from '../../src/workflow/engine.js';
import { DEFAULT_WORKFLOW } from '../../src/workflow/default.js';
import { WorkflowSchema, type Workflow } from '../../src/workflow/schema.js';
import type { TaskEntry } from '../../src/config/schema.js';

const THREE_PHASE_WORKFLOW: Workflow = {
  version: 1,
  start: 'frame',
  nodes: [
    { id: 'frame', role: 'frame' },
    { id: 'build', role: 'build' },
    { id: 'sync', role: 'sync' },
  ],
  edges: [
    { from: 'frame', to: 'build' },
    { from: 'build', to: 'sync' },
  ],
};

function makeTask(completions: Array<{ phase: 'frame' | 'build' | 'critic' | 'sync'; verdict?: 'pass' | 'warn' | 'fail'; completedAt?: string }>): TaskEntry {
  return {
    id: 'test-task',
    title: 'Test Task',
    status: 'active',
    progress: [],
    phaseCompletions: completions.map((c, i) => ({
      phase: c.phase,
      verdict: c.verdict,
      summary: `${c.phase} done`,
      completedAt: c.completedAt ?? `2024-01-01T00:00:0${i}.000Z`,
    })),
  };
}

describe('nextStep — default 4-phase workflow', () => {
  it('returns frame when nothing is done', () => {
    const task = makeTask([]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('frame');
  });

  it('returns build after frame completes', () => {
    const task = makeTask([{ phase: 'frame', verdict: 'pass' }]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('build');
  });

  it('returns critic after build completes', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass' },
      { phase: 'build', verdict: 'pass' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('critic');
  });

  it('returns sync after critic passes', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass' },
      { phase: 'build', verdict: 'pass' },
      { phase: 'critic', verdict: 'pass' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('sync');
  });

  it('returns sync after critic warns', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass' },
      { phase: 'build', verdict: 'pass' },
      { phase: 'critic', verdict: 'warn' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('sync');
  });

  it('returns null when sync is complete (workflow done)', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass' },
      { phase: 'build', verdict: 'pass' },
      { phase: 'critic', verdict: 'pass' },
      { phase: 'sync', verdict: 'pass' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBeNull();
  });

  it('loops back to build when critic fails', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass', completedAt: '2024-01-01T00:00:00.000Z' },
      { phase: 'build', verdict: 'pass', completedAt: '2024-01-01T00:00:01.000Z' },
      { phase: 'critic', verdict: 'fail', completedAt: '2024-01-01T00:00:02.000Z' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('build');
  });

  it('returns critic after loopback build completes', () => {
    const task = makeTask([
      { phase: 'frame', verdict: 'pass', completedAt: '2024-01-01T00:00:00.000Z' },
      { phase: 'build', verdict: 'pass', completedAt: '2024-01-01T00:00:01.000Z' },
      { phase: 'critic', verdict: 'fail', completedAt: '2024-01-01T00:00:02.000Z' },
      { phase: 'build', verdict: 'pass', completedAt: '2024-01-01T00:00:03.000Z' },
    ]);
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('critic');
  });

  it('tie-breaks by completion index when timestamps are equal', () => {
    // build and critic same timestamp — critic has higher index so it ran after build
    const task: TaskEntry = {
      id: 'test-task',
      title: 'Test Task',
      status: 'active',
      progress: [],
      phaseCompletions: [
        { phase: 'frame', verdict: 'pass', summary: 'frame done', completedAt: '2024-01-01T00:00:00.000Z' },
        { phase: 'build', verdict: 'pass', summary: 'build done', completedAt: '2024-01-01T00:00:01.000Z' },
        { phase: 'critic', verdict: 'pass', summary: 'critic done', completedAt: '2024-01-01T00:00:01.000Z' },
      ],
    };
    // critic (index 2) > build (index 1) at same timestamp → critic ran after build → advance to sync
    expect(nextStep(task, DEFAULT_WORKFLOW)).toBe('sync');
  });
});

describe('nextStep — 3-phase workflow (no critic)', () => {
  it('starts at frame', () => {
    const task = makeTask([]);
    expect(nextStep(task, THREE_PHASE_WORKFLOW)).toBe('frame');
  });

  it('advances frame → build → sync', () => {
    const task1 = makeTask([{ phase: 'frame' }]);
    expect(nextStep(task1, THREE_PHASE_WORKFLOW)).toBe('build');

    const task2 = makeTask([{ phase: 'frame' }, { phase: 'build' }]);
    expect(nextStep(task2, THREE_PHASE_WORKFLOW)).toBe('sync');
  });

  it('returns null when sync is done', () => {
    const task = makeTask([{ phase: 'frame' }, { phase: 'build' }, { phase: 'sync' }]);
    expect(nextStep(task, THREE_PHASE_WORKFLOW)).toBeNull();
  });
});

describe('WorkflowSchema', () => {
  it('keeps the checked-in default workflow file in sync with the embedded fallback workflow', () => {
    const fileWorkflow = WorkflowSchema.parse(
      JSON.parse(readFileSync(new URL('../../project-docs/workflows/default.json', import.meta.url), 'utf8')),
    );

    expect(fileWorkflow).toEqual(DEFAULT_WORKFLOW);
  });

  it('allows future top-level extension fields without rejecting the workflow', () => {
    const parsed = WorkflowSchema.parse({
      ...DEFAULT_WORKFLOW,
      metadata: { source: 'test' },
    }) as Workflow & { metadata: { source: string } };

    expect(parsed.metadata.source).toBe('test');
  });
});
