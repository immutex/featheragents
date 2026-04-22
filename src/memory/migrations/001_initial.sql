PRAGMA foreign_keys = ON;

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
