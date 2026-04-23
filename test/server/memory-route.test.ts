import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/config/defaults.js';
import { openMemoryDb } from '../../src/memory/db.js';
import { MemoryStore } from '../../src/memory/store.js';
import { startServer } from '../../src/server/index.js';
import { handleMemoryRoute } from '../../src/server/routes/memory.js';

type TestResponse = ServerResponse & { statusCode?: number; body?: string };

function createRequest(url: string): IncomingMessage {
  return {
    method: 'GET',
    url,
    headers: {},
  } as IncomingMessage;
}

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: '',
    writeHead(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    end(chunk?: string) {
      this.body = chunk ?? '';
      return this;
    },
  } as TestResponse;
}

describe('handleMemoryRoute', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createProject() {
    const cwd = await mkdtemp(join(tmpdir(), 'featherkit-memory-route-'));
    tmpDirs.push(cwd);

    const config = defaultConfig('memory-route-test');
    config.memory.enabled = true;
    config.memory.dbPath = '.project-state/memory.db';

    await mkdir(join(cwd, 'featherkit'), { recursive: true });
    await writeFile(join(cwd, 'featherkit', 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');

    const db = openMemoryDb(join(cwd, config.memory.dbPath));
    const store = new MemoryStore(db);
    return { cwd, config, db, store };
  }

  it('returns an empty graph for a fresh project', async () => {
    const { cwd, config, db } = await createProject();
    try {
      const req = createRequest('/api/memory/graph?scope=repo');
      const res = createResponse();

      await expect(handleMemoryRoute(req, res, '/api/memory/graph', { config, cwd })).resolves.toBe(true);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body ?? '')).toMatchObject({ nodes: [], edges: [], memoryCount: 0 });
    } finally {
      db.close();
    }
  });

  it('returns graph, detail, and trace data for populated memory', async () => {
    const { cwd, config, db, store } = await createProject();
    try {
      const oldId = store.insert({ title: 'Old memory', content: 'Old content', type: 'semantic', scope: 'repo', entities: [] });
      const newId = store.insert({ title: 'New memory', content: 'New content', type: 'semantic', scope: 'repo', entities: [] });
      db.prepare('INSERT INTO memory_edges (id, from_memory_id, to_memory_id, relation, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('edge-1', newId, oldId, 'supersedes', 1, Date.now());
      await mkdir(join(cwd, config.stateDir, 'memory-traces'), { recursive: true });
      await writeFile(
        join(cwd, config.stateDir, 'memory-traces', 'task-1.json'),
        JSON.stringify([{ taskId: 'task-1', phase: 'build', trace: { tokenBudget: 2000, used: 10, included: [{ memoryId: newId }], dropped: [] } }], null, 2) + '\n',
        'utf8',
      );

      const graphRes = createResponse();
      await handleMemoryRoute(createRequest('/api/memory/graph?scope=repo'), graphRes, '/api/memory/graph', { config, cwd });
      expect(graphRes.statusCode).toBe(200);
      const graph = JSON.parse(graphRes.body ?? '');
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);

      const detailRes = createResponse();
      await handleMemoryRoute(createRequest(`/api/memory/${encodeURIComponent(newId)}`), detailRes, `/api/memory/${newId}`, { config, cwd });
      expect(detailRes.statusCode).toBe(200);
      expect(JSON.parse(detailRes.body ?? '')).toMatchObject({ memory: { id: newId }, edges: [{ id: 'edge-1' }] });

      const traceRes = createResponse();
      await handleMemoryRoute(createRequest('/api/memory/trace/task-1'), traceRes, '/api/memory/trace/task-1', { config, cwd });
      expect(traceRes.statusCode).toBe(200);
      expect(JSON.parse(traceRes.body ?? '')).toEqual(expect.any(Array));
    } finally {
      db.close();
    }
  });

  it('returns 401 for memory endpoints without a token through feather serve', async () => {
    const { cwd, config, db } = await createProject();
    const server = await startServer(config, 0, { cwd });
    try {
      const graphResponse = await fetch(`${server.url}/api/memory/graph?scope=repo`);
      const detailResponse = await fetch(`${server.url}/api/memory/missing-memory`);
      const traceResponse = await fetch(`${server.url}/api/memory/trace/task-1`);
      const token = (await readFile(join(cwd, config.stateDir, 'dashboard.token'), 'utf8')).trim();
      const authorizedGraph = await fetch(`${server.url}/api/memory/graph?scope=repo`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(graphResponse.status).toBe(401);
      expect(detailResponse.status).toBe(401);
      expect(traceResponse.status).toBe(401);
      expect(authorizedGraph.status).toBe(200);
    } finally {
      await server.close();
      db.close();
    }
  });
});
