import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import type { FeatherConfig, TaskEntry } from '../../src/config/schema.js';
import { openMemoryDb } from '../../src/memory/db.js';
import { MemoryStore } from '../../src/memory/store.js';
import { commitAction } from '../../src/memory/write/commit.js';
import { decideAction, findRelated } from '../../src/memory/write/dedup.js';
import { extractCandidates } from '../../src/memory/write/extract.js';
import { scoreWorthiness } from '../../src/memory/write/worthiness.js';
import { writePhaseMemories } from '../../src/memory/write/index.js';

const tempDirectories: string[] = [];

function createTempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'featherkit-memory-write-'));
  tempDirectories.push(directory);
  return join(directory, 'memory.db');
}

function createConfig(overrides: Partial<FeatherConfig['memory']> = {}): FeatherConfig {
  return {
    version: 1,
    projectName: 'featheragents',
    clients: 'both',
    models: [{ provider: 'anthropic', model: 'claude-sonnet-4-6', role: 'build' }],
    packages: [],
    integrations: {
      linear: false,
      github: false,
      context7: false,
      webSearch: false,
      playwright: false,
    },
    stateDir: '.project-state',
    docsDir: 'project-docs',
    workflow: 'project-docs/workflows/default.json',
    memory: {
      enabled: true,
      dbPath: '.project-state/memory.db',
      tokenBudget: 2000,
      maxResults: 8,
      worthinessThreshold: 0.5,
      ...overrides,
    },
    orchestrator: {
      enabled: false,
      mode: 'manual',
      claudeCodeBinary: 'claude',
      router: { enabled: true, model: 'haiku', timeoutMs: 60_000 },
      timeouts: { phaseMinutes: 30, idleHeartbeatMinutes: 5 },
      approvalGate: { frame: 'editor', sync: 'prompt' },
      tui: { enabled: true, maxStreamLines: 40 },
    },
  } as FeatherConfig;
}

function createTask(): TaskEntry {
  return {
    id: 'mem-c',
    title: 'Build memory write path',
    status: 'active',
    assignedRole: 'build',
    progress: [],
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('extractCandidates', () => {
  it('returns structured candidates and tolerates malformed JSON', async () => {
    const valid = await extractCandidates(
      'critic output',
      createTask(),
      'critic',
      {
        runCommand: async () => ({
          stdout: JSON.stringify([
            {
              type: 'semantic',
              title: 'Repository rule',
              content: 'Always review package.json before dependency updates.',
              scope: 'repo',
              entities: [{ kind: 'file', value: 'package.json' }],
            },
          ]),
          exitCode: 0,
        }),
      },
    );

    const invalid = await extractCandidates(
      'critic output',
      createTask(),
      'critic',
      {
        runCommand: async () => ({ stdout: 'not json', exitCode: 0 }),
      },
    );

    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ type: 'semantic', scope: 'repo' });
    expect(invalid).toEqual([]);
  });

  it('aborts the subprocess when extraction times out', async () => {
    let abortObserved = false;

    const result = await extractCandidates(
      'critic output',
      createTask(),
      'critic',
      {
        timeoutMs: 5,
        runCommand: async (_command, _args, options) => new Promise((_resolve, reject) => {
          options.cancelSignal?.addEventListener('abort', () => {
            abortObserved = true;
            reject(Object.assign(new Error('canceled'), { isCanceled: true }));
          }, { once: true });
        }),
      },
    );

    expect(result).toEqual([]);
    expect(abortObserved).toBe(true);
  });
});

describe('scoreWorthiness', () => {
  it('rejects low-signal candidates like "done"', () => {
    expect(scoreWorthiness({
      type: 'semantic',
      title: 'done',
      content: 'done',
      scope: 'repo',
      entities: [],
    }, [])).toBeLessThan(0.5);
  });
});

describe('dedup and commitAction', () => {
  it('updates a closely matching memory and records confidence delta', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);
    const existingId = store.insert({
      title: 'Repository convention',
      content: 'Use zod/v4 for schemas.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'package', value: 'zod/v4' }],
    });

    const candidate = {
      title: 'Repository convention',
      content: 'Use zod/v4 for schemas and config validation.',
      type: 'semantic' as const,
      scope: 'repo' as const,
      entities: [{ kind: 'package', value: 'zod/v4' }],
    };

    const related = findRelated(db, candidate);
    const action = decideAction(candidate, related);
    const result = commitAction(db, action, candidate);

    expect(action).toEqual({ kind: 'update', targetId: existingId });
    expect(result.confidenceDelta).toBe(0.05);
    expect(store.getById(existingId)?.content).toContain('config validation');

    db.close();
  });

  it('supersedes contradictory memories', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);
    const oldId = store.insert({
      title: 'Feature flag state',
      content: 'Feature flag is enabled for all users.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'feature', value: 'flag' }],
    });

    const candidate = {
      title: 'Feature flag state',
      content: 'Feature flag is disabled and no longer enabled for all users.',
      type: 'semantic' as const,
      scope: 'repo' as const,
      entities: [{ kind: 'feature', value: 'flag' }],
    };

    const action = decideAction(candidate, findRelated(db, candidate));
    const result = commitAction(db, action, candidate);

    expect(action).toEqual({ kind: 'supersede', targetId: oldId });
    expect(store.getById(oldId)?.isActive).toBe(false);
    expect(store.getById(result.memoryId!)?.supersedesMemoryId).toBe(oldId);

    db.close();
  });

  it('detects broader contradictory states like on/off', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);
    const oldId = store.insert({
      title: 'Preview mode',
      content: 'Preview mode is on for staging reviewers.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'feature', value: 'preview-mode' }],
    });

    const candidate = {
      title: 'Preview mode',
      content: 'Preview mode is off for staging reviewers.',
      type: 'semantic' as const,
      scope: 'repo' as const,
      entities: [{ kind: 'feature', value: 'preview-mode' }],
    };

    const action = decideAction(candidate, findRelated(db, candidate));

    expect(action).toEqual({ kind: 'supersede', targetId: oldId });

    db.close();
  });

  it('compacts similar episodic memories into one summary memory', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    store.insert({
      title: 'Debug session 1',
      content: 'Investigated package.json dependency drift during incident review.',
      type: 'episodic',
      scope: 'repo',
      entities: [{ kind: 'file', value: 'package.json' }],
    });
    store.insert({
      title: 'Debug session 2',
      content: 'Investigated package.json dependency drift during incident follow-up.',
      type: 'episodic',
      scope: 'repo',
      entities: [{ kind: 'file', value: 'package.json' }],
    });
    store.insert({
      title: 'Debug session 3',
      content: 'Investigated package.json dependency drift during incident cleanup.',
      type: 'episodic',
      scope: 'repo',
      entities: [{ kind: 'file', value: 'package.json' }],
    });

    const candidate = {
      title: 'Debug session 4',
      content: 'Investigated package.json dependency drift during incident handoff.',
      type: 'episodic' as const,
      scope: 'repo' as const,
      entities: [{ kind: 'file', value: 'package.json' }],
    };

    const related = findRelated(db, candidate);
    const action = decideAction(candidate, related);
    const result = commitAction(db, action, candidate);

    expect(action.kind).toBe('compact');
    expect(result.memoryId).toBeTruthy();
    expect(store.getById(result.memoryId!)?.title).toContain('Summary:');
    expect(result.sourceIds.every((id) => store.getById(id)?.isActive === false)).toBe(true);

    db.close();
  });

  it('keeps supersede writes atomic when the target is missing', () => {
    const db = openMemoryDb(createTempDbPath());
    const beforeCount = (db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count;

    expect(() => commitAction(db, { kind: 'supersede', targetId: 'missing-id' }, {
      title: 'New fact',
      content: 'Replacement fact.',
      type: 'semantic',
      scope: 'repo',
      entities: [],
    })).toThrow('Cannot supersede missing or inactive memory: missing-id');

    const afterCount = (db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count;
    expect(afterCount).toBe(beforeCount);

    db.close();
  });
});

describe('writePhaseMemories', () => {
  it('filters out low-signal candidates below the worthiness threshold', async () => {
    const db = openMemoryDb(createTempDbPath());

    const result = await writePhaseMemories(
      db,
      'phase output',
      createTask(),
      'build',
      createConfig(),
      {
        runCommand: async () => ({
          stdout: JSON.stringify([
            {
              type: 'semantic',
              title: 'done',
              content: 'done',
              scope: 'repo',
              entities: [],
            },
          ]),
          exitCode: 0,
        }),
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.action.kind).toBe('ignore');
    expect((db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count).toBe(0);

    db.close();
  });

  it('is a no-op when memory is disabled', async () => {
    const db = openMemoryDb(createTempDbPath());

    const result = await writePhaseMemories(
      db,
      'phase output',
      createTask(),
      'build',
      createConfig({ enabled: false }),
      {
        runCommand: async () => {
          throw new Error('should not run');
        },
      },
    );

    expect(result).toEqual([]);

    db.close();
  });
});
