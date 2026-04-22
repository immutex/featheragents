import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type MemoryStatement<Result = unknown> = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid?: number | bigint };
  get: (...params: unknown[]) => Result | undefined;
  all: (...params: unknown[]) => Result[];
};

export type MemoryDb = {
  exec: (sql: string) => void;
  prepare: <Result = unknown>(sql: string) => MemoryStatement<Result>;
  transaction: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => (...args: TArgs) => TResult;
  pragma: (sql: string) => unknown;
  loadExtension: (path: string) => void;
  close: () => void;
};

type BunSqliteStatement<Result = unknown> = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid?: number | bigint };
  get: (...params: unknown[]) => Result | null;
  all: (...params: unknown[]) => Result[];
};

type BunSqliteDatabase = {
  prepare: <Result = unknown>(sql: string) => BunSqliteStatement<Result>;
  query: <Result = unknown>(sql: string) => BunSqliteStatement<Result>;
  run: (sql: string, params?: unknown[] | Record<string, unknown>) => { changes: number; lastInsertRowid?: number | bigint };
  transaction: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => (...args: TArgs) => TResult;
  close: () => void;
};

const require = createRequire(import.meta.url);
const isBunRuntime = typeof globalThis === 'object' && 'Bun' in globalThis;

// This inline copy is a last-resort fallback for bundled environments where the
// SQL files are unavailable at runtime. The file-based migration remains the
// preferred source during development and local builds.
const MIGRATION_FALLBACKS = {
  '001_initial.sql': `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  supersedes_memory_id TEXT REFERENCES memories(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  invalid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_scope_type_active ON memories(scope, type, is_active);
CREATE INDEX IF NOT EXISTS idx_memories_supersedes ON memories(supersedes_memory_id);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  model TEXT,
  dimensions INTEGER,
  embedding BLOB,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  from_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_memory_id);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(kind, normalized_value)
);

CREATE TABLE IF NOT EXISTS memory_entity_links (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'mention',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (memory_id, entity_id, role)
);

CREATE INDEX IF NOT EXISTS idx_memory_entity_links_entity_id ON memory_entity_links(entity_id);

CREATE TABLE IF NOT EXISTS memory_access_log (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  actor TEXT,
  reason TEXT,
  accessed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_access_log_memory_id ON memory_access_log(memory_id, accessed_at);

CREATE TABLE IF NOT EXISTS memory_compactions (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_compactions_source ON memory_compactions(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_compactions_target ON memory_compactions(target_memory_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  memory_id UNINDEXED,
  title,
  content
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(memory_id, title, content)
  VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF title, content, id ON memories BEGIN
  DELETE FROM memories_fts WHERE memory_id = old.id;
  INSERT INTO memories_fts(memory_id, title, content)
  VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  DELETE FROM memories_fts WHERE memory_id = old.id;
END;
`,
} as const;

let hasLoggedSqliteVecWarning = false;
let hasLoggedMigrationFallbackDriftWarning = false;

function getNamedParameterPrefixes(sql: string): string[] {
  return [...new Set(Array.from(sql.matchAll(/[$:@][A-Za-z_][A-Za-z0-9_]*/g), (match) => match[0][0]))];
}

function normalizeStatementParams(params: unknown[], namedParameterPrefixes: string[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0] as unknown[];
  }

  if (
    params.length === 1 &&
    params[0] !== null &&
    typeof params[0] === 'object' &&
    !Array.isArray(params[0])
  ) {
    const namedParams = params[0] as Record<string, unknown>;
    const expandedParams = Object.entries(namedParams).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
      accumulator[key] = value;

      for (const prefix of namedParameterPrefixes) {
        accumulator[`${prefix}${key}`] = value;
      }

      return accumulator;
    }, {});

    return [expandedParams];
  }

  return params;
}

class BunStatementAdapter<Result = unknown> implements MemoryStatement<Result> {
  readonly #statement: BunSqliteStatement<Result>;
  readonly #namedParameterPrefixes: string[];

  constructor(statement: BunSqliteStatement<Result>, sql: string) {
    this.#statement = statement;
    this.#namedParameterPrefixes = getNamedParameterPrefixes(sql);
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint } {
    return this.#statement.run(...normalizeStatementParams(params, this.#namedParameterPrefixes));
  }

  get(...params: unknown[]): Result | undefined {
    return this.#statement.get(...normalizeStatementParams(params, this.#namedParameterPrefixes)) ?? undefined;
  }

  all(...params: unknown[]): Result[] {
    return this.#statement.all(...normalizeStatementParams(params, this.#namedParameterPrefixes));
  }
}

class BunMemoryDbAdapter implements MemoryDb {
  readonly #db: BunSqliteDatabase;

  constructor(db: BunSqliteDatabase) {
    this.#db = db;
  }

  exec(sql: string): void {
    this.#db.run(sql);
  }

  prepare<Result = unknown>(sql: string): MemoryStatement<Result> {
    return new BunStatementAdapter(this.#db.prepare<Result>(sql), sql);
  }

  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
    return this.#db.transaction(fn);
  }

  pragma(sql: string): unknown {
    const pragmaSql = `PRAGMA ${sql}`;
    if (sql.includes('=')) {
      this.#db.run(pragmaSql);
      return undefined;
    }

    return this.#db.query(pragmaSql).get();
  }

  loadExtension(_path: string): void {
    throw new Error('SQLite extensions are not supported by bun:sqlite');
  }

  close(): void {
    this.#db.close();
  }
}

function createMemoryDb(dbPath: string): MemoryDb {
  if (isBunRuntime) {
    const { Database } = require('bun:sqlite') as {
      Database: new (filename: string, options?: { create?: boolean; readwrite?: boolean; readonly?: boolean }) => BunSqliteDatabase;
    };

    return new BunMemoryDbAdapter(new Database(dbPath, { create: true }));
  }

  const BetterSqlite3 = require('better-sqlite3') as new (
    filename: string,
    options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number; verbose?: ((message?: unknown, ...optionalParams: unknown[]) => void) | undefined },
  ) => MemoryDb;
  return new BetterSqlite3(dbPath);
}

function resolveMigrationDirectory(): string | null {
  const candidates = [
    fileURLToPath(new URL('./migrations', import.meta.url)),
    fileURLToPath(new URL('../../src/memory/migrations', import.meta.url)),
    join(process.cwd(), 'src/memory/migrations'),
    join(process.cwd(), 'dist/memory/migrations'),
  ];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate, { withFileTypes: true });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function readMigrations(): Array<{ id: string; sql: string }> {
  const migrationDirectory = resolveMigrationDirectory();

  if (migrationDirectory !== null) {
    const migrationIds = readdirSync(migrationDirectory)
      .filter((entry) => extname(entry) === '.sql')
      .sort();

    return migrationIds.map((id) => {
      const sql = readFileSync(join(migrationDirectory, id), 'utf8');
      const fallbackSql = MIGRATION_FALLBACKS[id as keyof typeof MIGRATION_FALLBACKS];

      if (!hasLoggedMigrationFallbackDriftWarning && fallbackSql !== undefined && fallbackSql !== sql) {
        console.error(`[memory] migration fallback out of sync with file: ${id}`);
        hasLoggedMigrationFallbackDriftWarning = true;
      }

      return { id, sql };
    });
  }

  return Object.entries(MIGRATION_FALLBACKS)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, sql]) => ({ id, sql }));
}

function ensureMigrationTable(db: MemoryDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

function runPendingMigrations(db: MemoryDb): void {
  ensureMigrationTable(db);

  const appliedMigrations = new Set(
    (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map((row) => row.id),
  );

  for (const migration of readMigrations()) {
    if (appliedMigrations.has(migration.id)) {
      continue;
    }

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, Date.now());
    })();
  }
}

export function loadSqliteVec(db: MemoryDb): void {
  try {
    db.loadExtension('vec0');
  } catch (error) {
    if (!hasLoggedSqliteVecWarning) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[memory] sqlite-vec extension unavailable: ${message}`);
      hasLoggedSqliteVecWarning = true;
    }
  }
}

export function openMemoryDb(dbPath: string): MemoryDb {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = createMemoryDb(dbPath);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  loadSqliteVec(db);
  runPendingMigrations(db);

  return db;
}
