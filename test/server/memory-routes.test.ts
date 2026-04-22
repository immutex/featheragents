import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { defaultConfig } from '../../src/config/defaults.js';
import { openMemoryDb } from '../../src/memory/db.js';
import { MemoryStore } from '../../src/memory/store.js';
import { getMemoryById, getMemoryGraph, getMemoryTrace } from '../../src/server/routes/memory.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-memory-routes-${randomUUID()}`);
}

describe('memory route helpers', () => {
  let tmpDir: string;
  let previousCwd: string;
  let memoryId: string;
  let relatedId: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state', 'memory-traces'), { recursive: true });
    process.chdir(tmpDir);

    const config = defaultConfig('memory-routes-test');
    config.memory.enabled = true;
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');

    const db = openMemoryDb(join(tmpDir, '.project-state', 'memory.db'));
    const store = new MemoryStore(db);
    memoryId = store.insert({
      title: 'Router rewrite',
      content: 'Keep memory available to the orchestrator prompt.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'task', value: 'router' }],
    });
    relatedId = store.insert({
      title: 'Build note',
      content: 'This memory is connected to the router rewrite.',
      type: 'episodic',
      scope: 'repo',
    });

    db.prepare(
      'INSERT INTO memory_edges (id, from_memory_id, to_memory_id, relation, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('edge-1', memoryId, relatedId, 'relates-to', 0.8, Date.now());
    db.prepare(
      'INSERT INTO memory_access_log (id, memory_id, actor, reason, accessed_at) VALUES (?, ?, ?, ?, ?)',
    ).run('access-1', memoryId, 'mcp-retrieve', 'query:router rewrite', Date.now());
    db.close();

    await writeFile(
      join(tmpDir, '.project-state', 'memory-traces', 'TASK-1.json'),
      JSON.stringify([
        { taskId: 'TASK-1', phase: 'frame', trace: { included: [{ memoryId }] } },
        { taskId: 'TASK-1', phase: 'build', trace: { included: [{ memoryId }] } },
      ], null, 2) + '\n',
      'utf8',
    );
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns graph nodes and edges for a scope', async () => {
    const graph = await getMemoryGraph('repo');

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([memoryId, relatedId]));
    expect(graph.edges).toEqual([
      expect.objectContaining({ id: 'edge-1', from: memoryId, to: relatedId, relation: 'relates-to' }),
    ]);
  });

  it('returns the retrieval trace array for a task (last element is newest)', async () => {
    const traces = await getMemoryTrace('TASK-1');

    expect(traces).toHaveLength(2);
    expect(traces?.[0]).toEqual(expect.objectContaining({ taskId: 'TASK-1', phase: 'frame' }));
    expect(traces?.[1]).toEqual(expect.objectContaining({ taskId: 'TASK-1', phase: 'build' }));
    await expect(getMemoryTrace('missing-task')).resolves.toBeNull();
  });

  it('returns full memory detail for a memory id', async () => {
    const detail = await getMemoryById(memoryId);

    expect(detail?.memory).toEqual(expect.objectContaining({ id: memoryId, title: 'Router rewrite' }));
    expect(detail?.entities).toEqual([
      expect.objectContaining({ kind: 'task', value: 'router' }),
    ]);
    expect(detail?.edges).toEqual([
      expect.objectContaining({ id: 'edge-1', fromMemoryId: memoryId, toMemoryId: relatedId }),
    ]);
    expect(detail?.accessLog).toEqual([
      expect.objectContaining({ id: 'access-1', actor: 'mcp-retrieve' }),
    ]);
  });
});
