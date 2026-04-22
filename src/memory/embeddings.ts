import type { MemoryDb } from './db.js';

const DEFAULT_EMBEDDING_MODEL = 'embeddinggemma';

function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

async function requestEmbedding(url: string, text: string): Promise<Float32Array | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { embedding?: number[]; embeddings?: number[][] };
  const values = payload.embedding ?? payload.embeddings?.[0];

  return Array.isArray(values) ? new Float32Array(values) : null;
}

export async function embedText(text: string, ollamaUrl: string): Promise<Float32Array | null> {
  const baseUrl = ollamaUrl.replace(/\/$/, '');

  try {
    return (await requestEmbedding(`${baseUrl}/api/embed`, text))
      ?? (await requestEmbedding(`${baseUrl}/api/embeddings`, text));
  } catch {
    return null;
  }
}

export function storeEmbedding(db: MemoryDb, memoryId: string, vector: Float32Array, model = DEFAULT_EMBEDDING_MODEL): void {
  db.transaction((id: string, currentVector: Float32Array, currentModel: string) => {
    db.prepare(
      `
        INSERT INTO memory_embeddings (memory_id, model, dimensions, embedding, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          model = excluded.model,
          dimensions = excluded.dimensions,
          embedding = excluded.embedding,
          created_at = excluded.created_at
      `,
    ).run(id, currentModel, currentVector.length, vectorToBlob(currentVector), Date.now());
  })(memoryId, vector, model);
}
