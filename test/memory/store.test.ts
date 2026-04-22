import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { openMemoryDb } from '../../src/memory/db.js';
import { MemoryStore } from '../../src/memory/store.js';

const tempDirectories: string[] = [];

function createTempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'featherkit-memory-'));
  tempDirectories.push(directory);
  return join(directory, 'memory.db');
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('openMemoryDb', () => {
  it('creates the schema once and leaves migrations idempotent', () => {
    const dbPath = createTempDbPath();
    const firstDb = openMemoryDb(dbPath);

    const tableNames = (firstDb
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
      .all() as Array<{ name: string }>)
      .map((row) => row.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'entities',
        'memories',
        'memories_fts',
        'memory_access_log',
        'memory_compactions',
        'memory_edges',
        'memory_embeddings',
        'memory_entity_links',
        'schema_migrations',
      ]),
    );

    expect(firstDb.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 1 });
    firstDb.close();

    const secondDb = openMemoryDb(dbPath);
    expect(secondDb.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 1 });
    secondDb.close();
  });
});

describe('MemoryStore', () => {
  it('inserts a memory, persists linked entities, and reads it back by id', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const id = store.insert({
      title: 'Repository convention',
      content: 'Use zod/v4 for all runtime schemas.',
      type: 'semantic',
      scope: 'repo',
      entities: [{ kind: 'package', value: 'zod/v4' }],
    });

    expect(store.getById(id)).toMatchObject({
      id,
      title: 'Repository convention',
      type: 'semantic',
      scope: 'repo',
      isActive: true,
      supersedesMemoryId: null,
      invalidAt: null,
    });

    expect(
      db.prepare('SELECT COUNT(*) AS count FROM memory_entity_links WHERE memory_id = ?').get(id) as { count: number },
    ).toEqual({ count: 1 });

    db.close();
  });

  it('queries active rows by scope and type and supports FTS search', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const repoSemanticId = store.insert({
      title: 'Schema default',
      content: 'Memory stays optin and disabled by default.',
      type: 'semantic',
      scope: 'repo',
    });
    const branchSemanticId = store.insert({
      title: 'Branch note',
      content: 'Feature branch keeps separate local context.',
      type: 'semantic',
      scope: 'branch',
    });
    store.insert({
      title: 'Repo episode',
      content: 'This should not match the semantic filter.',
      type: 'episodic',
      scope: 'repo',
    });

    expect(store.query({ scope: 'repo', type: 'semantic' }).map((memory) => memory.id)).toEqual([repoSemanticId]);

    const ftsRows = db.prepare('SELECT memory_id FROM memories_fts WHERE memories_fts MATCH ?').all('optin') as Array<{
      memory_id: string;
    }>;
    expect(ftsRows).toEqual([{ memory_id: repoSemanticId }]);

    expect(store.query({ search: 'context' }).map((memory) => memory.id)).toEqual([branchSemanticId]);

    db.close();
  });

  it('supersedes and deactivates rows atomically', () => {
    const db = openMemoryDb(createTempDbPath());
    const store = new MemoryStore(db);

    const oldId = store.insert({
      title: 'Old memory',
      content: 'This fact has been replaced.',
      type: 'semantic',
      scope: 'repo',
    });
    const newId = store.insert({
      title: 'New memory',
      content: 'This fact is the latest version.',
      type: 'semantic',
      scope: 'repo',
    });

    store.supersede(oldId, newId);

    expect(store.getById(oldId)).toMatchObject({
      id: oldId,
      isActive: false,
      supersedesMemoryId: null,
    });
    expect(store.getById(oldId)?.invalidAt).toEqual(expect.any(Number));
    expect(store.getById(newId)).toMatchObject({
      id: newId,
      supersedesMemoryId: oldId,
      isActive: true,
    });

    store.deactivate(newId);

    expect(store.getById(newId)).toMatchObject({
      id: newId,
      isActive: false,
      supersedesMemoryId: oldId,
    });
    expect(store.query({ scope: 'repo', type: 'semantic' })).toHaveLength(0);

    db.close();
  });
});
