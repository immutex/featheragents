import { z } from 'zod/v4';

export const MemoryTypeSchema = z.enum(['semantic', 'episodic', 'procedural']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryScopeSchema = z.enum(['session', 'branch', 'repo', 'workspace', 'user', 'global']);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  supersedesMemoryId: z.string().nullable(),
  isActive: z.boolean(),
  invalidAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type MemoryRow = z.infer<typeof MemoryRowSchema>;

export const EntityRowSchema = z.object({
  id: z.string(),
  kind: z.string().min(1),
  value: z.string().min(1),
  normalizedValue: z.string().min(1),
  createdAt: z.number().int(),
});
export type EntityRow = z.infer<typeof EntityRowSchema>;

export const MemoryEdgeSchema = z.object({
  id: z.string(),
  fromMemoryId: z.string(),
  toMemoryId: z.string(),
  relation: z.string().min(1),
  weight: z.number().nullable(),
  createdAt: z.number().int(),
});
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>;

export const MemoryInsertEntitySchema = z.object({
  kind: z.string().min(1),
  value: z.string().min(1),
  normalizedValue: z.string().min(1).optional(),
  role: z.string().min(1).default('mention'),
});
export type MemoryInsertEntity = z.infer<typeof MemoryInsertEntitySchema>;

export const MemoryInsertSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  entities: z.array(MemoryInsertEntitySchema).default([]),
});
export type MemoryInsert = z.infer<typeof MemoryInsertSchema>;

export const MemoryQuerySchema = z.object({
  scope: MemoryScopeSchema.optional(),
  type: MemoryTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().min(1).optional(),
});
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;
