import { randomUUID } from 'node:crypto';

import type { MemoryDb } from './db.js';
import {
  MemoryInsertSchema,
  MemoryQuerySchema,
  MemoryRowSchema,
  type MemoryInsertEntity,
  type MemoryInsert,
  type MemoryQuery,
  type MemoryRow,
} from './types.js';

type MemoryRowRecord = {
  id: string;
  title: string;
  content: string;
  type: string;
  scope: string;
  supersedes_memory_id: string | null;
  is_active: number;
  invalid_at: number | null;
  created_at: number;
  updated_at: number;
};

type EntityIdRow = { id: string };

function mapMemoryRow(row: MemoryRowRecord): MemoryRow {
  return MemoryRowSchema.parse({
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    scope: row.scope,
    supersedesMemoryId: row.supersedes_memory_id,
    isActive: row.is_active === 1,
    invalidAt: row.invalid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalizeEntityValue(value: string): string {
  return value.trim().toLowerCase();
}

export class MemoryStore {
  readonly #db: MemoryDb;
  readonly #insertMemoryStatement;
  readonly #selectEntityIdStatement;
  readonly #insertEntityStatement;
  readonly #insertEntityLinkStatement;
  readonly #getByIdStatement;
  readonly #supersedeOldStatement;
  readonly #supersedeNewStatement;
  readonly #deactivateStatement;

  constructor(db: MemoryDb) {
    this.#db = db;
    this.#insertMemoryStatement = this.#db.prepare(`
      INSERT INTO memories (
        id,
        title,
        content,
        type,
        scope,
        supersedes_memory_id,
        is_active,
        invalid_at,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @title,
        @content,
        @type,
        @scope,
        NULL,
        1,
        NULL,
        @createdAt,
        @updatedAt
      )
    `);
    this.#selectEntityIdStatement = this.#db.prepare('SELECT id FROM entities WHERE kind = ? AND normalized_value = ?');
    this.#insertEntityStatement = this.#db.prepare(
      'INSERT INTO entities (id, kind, value, normalized_value, created_at) VALUES (@id, @kind, @value, @normalizedValue, @createdAt)',
    );
    this.#insertEntityLinkStatement = this.#db.prepare(
      'INSERT OR IGNORE INTO memory_entity_links (memory_id, entity_id, role, created_at) VALUES (@memoryId, @entityId, @role, @createdAt)',
    );
    this.#getByIdStatement = this.#db.prepare('SELECT * FROM memories WHERE id = ?');
    this.#supersedeOldStatement = this.#db.prepare(
      'UPDATE memories SET is_active = 0, invalid_at = ?, updated_at = ? WHERE id = ? AND is_active = 1',
    );
    this.#supersedeNewStatement = this.#db.prepare('UPDATE memories SET supersedes_memory_id = ?, updated_at = ? WHERE id = ?');
    this.#deactivateStatement = this.#db.prepare(
      'UPDATE memories SET is_active = 0, invalid_at = ?, updated_at = ? WHERE id = ? AND is_active = 1',
    );
  }

  attachEntities(memoryId: string, entities: MemoryInsertEntity[], timestamp = Date.now()): void {
    for (const entity of entities) {
      const normalizedValue = entity.normalizedValue ?? normalizeEntityValue(entity.value);
      const existingEntity = this.#selectEntityIdStatement.get(entity.kind, normalizedValue) as EntityIdRow | undefined;
      const entityId = existingEntity?.id ?? randomUUID();

      if (!existingEntity) {
        this.#insertEntityStatement.run({
          id: entityId,
          kind: entity.kind,
          value: entity.value,
          normalizedValue,
          createdAt: timestamp,
        });
      }

      this.#insertEntityLinkStatement.run({
        memoryId,
        entityId,
        role: entity.role,
        createdAt: timestamp,
      });
    }
  }

  insert(memory: MemoryInsert): string {
    const parsed = MemoryInsertSchema.parse(memory);

    return this.#db.transaction((input: MemoryInsert) => {
      const timestamp = Date.now();
      const id = randomUUID();

      this.#insertMemoryStatement.run({
        id,
        title: input.title,
        content: input.content,
        type: input.type,
        scope: input.scope,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      this.attachEntities(id, input.entities, timestamp);

      return id;
    })(parsed);
  }

  getById(id: string): MemoryRow | null {
    const row = this.#getByIdStatement.get(id) as MemoryRowRecord | undefined;
    return row ? mapMemoryRow(row) : null;
  }

  query(filters: MemoryQuery = {}): MemoryRow[] {
    const parsed = MemoryQuerySchema.parse(filters);
    const conditions: string[] = [];
    const parameters: Record<string, string | number> = {};
    const joins: string[] = [];

    if (parsed.search !== undefined) {
      joins.push('JOIN memories_fts ON memories_fts.memory_id = memories.id');
      conditions.push('memories_fts MATCH @search');
      parameters.search = parsed.search;
    }

    if (parsed.scope !== undefined) {
      conditions.push('memories.scope = @scope');
      parameters.scope = parsed.scope;
    }

    if (parsed.type !== undefined) {
      conditions.push('memories.type = @type');
      parameters.type = parsed.type;
    }

    conditions.push('memories.is_active = @isActive');
    parameters.isActive = (parsed.isActive ?? true) ? 1 : 0;

    const statement = this.#db.prepare(`
      SELECT memories.*
      FROM memories
      ${joins.join(' ')}
      WHERE ${conditions.join(' AND ')}
      ORDER BY memories.created_at DESC
    `);

    return (statement.all(parameters) as MemoryRowRecord[]).map(mapMemoryRow);
  }

  supersede(oldId: string, newId: string): void {
    this.#db.transaction((fromId: string, toId: string) => {
      const timestamp = Date.now();
      const oldResult = this.#supersedeOldStatement.run(timestamp, timestamp, fromId);

      if (oldResult.changes === 0) {
        throw new Error(`Cannot supersede missing or inactive memory: ${fromId}`);
      }

      const newResult = this.#supersedeNewStatement.run(fromId, timestamp, toId);

      if (newResult.changes === 0) {
        throw new Error(`Cannot assign superseded memory on missing row: ${toId}`);
      }
    })(oldId, newId);
  }

  deactivate(id: string): void {
    this.#db.transaction((memoryId: string) => {
      const timestamp = Date.now();
      const result = this.#deactivateStatement.run(timestamp, timestamp, memoryId);

      if (result.changes === 0) {
        throw new Error(`Cannot deactivate missing or inactive memory: ${memoryId}`);
      }
    })(id);
  }
}
