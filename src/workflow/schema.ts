import { z } from 'zod/v4';
import { ModelRoleSchema } from '../config/schema.js';

export const WorkflowNodeSchema = z
  .object({
    id: z.string(),
    role: ModelRoleSchema,
    agent: z.string().optional(),
    model: z.string().optional(),
    promptTemplate: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    gate: z.enum(['editor', 'inline', 'pause', 'auto', 'prompt']).optional(),
    loopback: z.string().optional(),
    requires: z.array(z.string()).optional(),
  })
  .passthrough();
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    condition: z.enum(['pass', 'warn', 'fail', 'default']).optional(),
  })
  .passthrough();
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  version: z.literal(1),
  start: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
}).passthrough();
export type Workflow = z.infer<typeof WorkflowSchema>;
