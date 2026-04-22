import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeatherConfig, TaskEntry } from '../../src/config/schema.js';
import { openMemoryDb } from '../../src/memory/db.js';
import { embedText, storeEmbedding } from '../../src/memory/embeddings.js';
import { retrieveGraph, retrieveKeyword, retrieveScoped, retrieveVector } from '../../src/memory/retrieval/channels.js';
import { assembleContext } from '../../src/memory/retrieval/assemble.js';
import { buildRetrievalIntent, type RetrievalTask } from '../../src/memory/retrieval/intent.js';
import { retrieveMemoryContext } from '../../src/memory/retrieval/index.js';
import { rerankMemories, type RerankCandidate } from '../../src/memory/retrieval/rerank.js';
import { MemoryStore } from '../../src/memory/store.js';

const tempDirectories: string[] = [];
const originalFetch = globalThis.fetch;

function createTempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'featherkit-memory-retrieval-'));
  tempDirectories.push(directory);
  return join(directory, 'memory.db');
}

function createConfig(overrides: Partial<FeatherConfig['memory'] & { tokenBudget?: number; maxResults?: number }> = {}): FeatherConfig {
  return {
    version: 1,
    projectName: 'featheragents',
    clients: 'both',
    models: [{ provider: 'openai', model: 'gpt-5.4', role: 'build' }],
    packages: ['vitest'],
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

function createTask(overrides: Partial<RetrievalTask> = {}): RetrievalTask {
  const baseTask: TaskEntry = {
    id: 'mem-b',
    title: 'Build retrieval pipeline',
    status: 'active',
    progress: [],
    assignedRole: 'build',
  };

  return {
    ...baseTask,
    repo: 'featheragents',
    branch: 'feature/memory-retrieval',
    files: ['src/memory/retrieval/index.ts', 'package.json'],
    packages: ['better-sqlite3'],
    taskCategory: 'memory',
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('memory retrieval channels', () => {
  it('returns only branch and repo memories from the scope channel', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    store.insert({ title: 'Branch note', content: 'Current branch implementation details.', type: 'semantic', scope: 'branch' });
    store.insert({ title: 'Repo note', content: 'Repository-wide convention.', type: 'semantic', scope: 'repo' });
    store.insert({ title: 'Global note', content: 'Unrelated global guidance.', type: 'semantic', scope: 'global' });

    const matches = retrieveScoped(db, buildRetrievalIntent(createTask(), createConfig()));

    expect(matches.map((match) => match.memory.scope).sort()).toEqual(['branch', 'repo']);

    db.close();
  });

  it('returns FTS matches for file names mentioned in task.files', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const matchingId = store.insert({
      title: 'Update package json flow',
      content: 'Remember to review package.json before adjusting dependencies.',
      type: 'semantic',
      scope: 'repo',
    });
    store.insert({
      title: 'Other file',
      content: 'No relevant filenames here.',
      type: 'semantic',
      scope: 'repo',
    });

    const matches = retrieveKeyword(db, buildRetrievalIntent(createTask({ files: ['package.json'] }), createConfig()));

    expect(matches.map((match) => match.memory.id)).toContain(matchingId);

    db.close();
  });

  it('preserves short dotted filename segments in the FTS query', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const matchingId = store.insert({
      title: 'Review a.ts import path',
      content: 'The a.ts file needs a memory note.',
      type: 'semantic',
      scope: 'repo',
    });

    const matches = retrieveKeyword(db, buildRetrievalIntent(createTask({ files: ['a.ts'] }), createConfig()));

    expect(matches.map((match) => match.memory.id)).toContain(matchingId);

    db.close();
  });

  it('walks graph neighbors through edges and shared entities', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const rootId = store.insert({
      title: 'Root memory',
      content: 'Seed memory.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'file', value: 'package.json' }],
    });
    const edgeId = store.insert({ title: 'Edge neighbor', content: 'Connected by edge.', type: 'semantic', scope: 'repo' });
    const entityId = store.insert({
      title: 'Entity neighbor',
      content: 'Connected by shared entity.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'file', value: 'package.json' }],
    });

    db.prepare('INSERT INTO memory_edges (id, from_memory_id, to_memory_id, relation, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'edge-1',
      rootId,
      edgeId,
      'related',
      Date.now(),
    );

    const matches = retrieveGraph(db, [rootId]);

    expect(matches.map((match) => match.memory.id).sort()).toEqual([edgeId, entityId].sort());

    db.close();
  });

  it('returns an empty vector result when Ollama is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;

    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);
    const memoryId = store.insert({ title: 'Embedded memory', content: 'Stored vector.', type: 'semantic', scope: 'repo' });
    storeEmbedding(db, memoryId, new Float32Array([0.1, 0.2, 0.3]));

    const matches = await retrieveVector(db, buildRetrievalIntent(createTask(), createConfig()), 'http://127.0.0.1:11434');

    expect(matches).toEqual([]);

    db.close();
  });
});

describe('memory reranking and assembly', () => {
  it('ranks repo scope above global for a repo-scoped task', () => {
    const now = Date.now();
    const intent = buildRetrievalIntent(createTask({ branch: undefined }), createConfig());
    const candidates: RerankCandidate[] = [
      {
        id: 'global',
        title: 'Global',
        content: 'Global memory.',
        type: 'semantic',
        scope: 'global',
        supersedesMemoryId: null,
        isActive: true,
        invalidAt: null,
        createdAt: now,
        updatedAt: now,
        reasons: ['scope:global match'],
        keywordScore: 0,
        semanticScore: 0,
        scopeScore: 0,
        entityOverlap: 0,
        graphDepth: null,
      },
      {
        id: 'repo',
        title: 'Repo',
        content: 'Repo memory.',
        type: 'semantic',
        scope: 'repo',
        supersedesMemoryId: null,
        isActive: true,
        invalidAt: null,
        createdAt: now,
        updatedAt: now,
        reasons: ['scope:repo match'],
        keywordScore: 0,
        semanticScore: 0,
        scopeScore: 3,
        entityOverlap: 0,
        graphDepth: null,
      },
    ];

    expect(rerankMemories(candidates, intent).map((memory) => memory.id)).toEqual(['repo', 'global']);
  });

  it('enforces the token budget during context assembly', () => {
    const repeatedWords = Array.from({ length: 120 }, () => 'word').join(' ');
    const scored = rerankMemories(
      [
        {
          id: 'long',
          title: 'Long memory',
          content: repeatedWords,
          type: 'semantic',
          scope: 'repo',
          supersedesMemoryId: null,
          isActive: true,
          invalidAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          reasons: ['scope:repo match'],
          keywordScore: 1,
          semanticScore: 0,
          scopeScore: 3,
          entityOverlap: 0,
          graphDepth: null,
        },
      ],
      buildRetrievalIntent(createTask(), createConfig()),
    );

    const assembled = assembleContext(scored, 500);

    expect(assembled.used).toBeLessThanOrEqual(500);
    expect(assembled.block.length).toBeGreaterThan(0);
    expect(assembled.block.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(125);
  });
});

describe('retrieveMemoryContext', () => {
  it('prefers the current Ollama embed endpoint before falling back to the legacy one', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.25, 0.5] }),
      } satisfies Partial<Response>) as typeof fetch;

    const result = await embedText('memory query', 'http://127.0.0.1:11434/');

    expect(result).toEqual(new Float32Array([0.25, 0.5]));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/embed',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a block and trace without throwing when Ollama is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;

    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    store.insert({
      title: 'Repo convention',
      content: 'Review package.json when updating dependencies.',
      type: 'semantic',
      scope: 'repo',
    });

    const result = await retrieveMemoryContext(db, createTask({ files: ['package.json'] }), createConfig({ ollamaUrl: 'http://127.0.0.1:11434' }));

    expect(result.block).toContain('Repo convention');
    expect(result.trace.included[0]?.reasons.some((reason) => reason.startsWith('scope:') || reason.startsWith('fts:'))).toBe(true);

    db.close();
  });
});
