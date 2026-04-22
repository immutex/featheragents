import { WorkflowSchema, type Workflow } from './schema.js';

export const DEFAULT_WORKFLOW_TEXT = `{
  "version": 1,
  "start": "frame",
  "nodes": [
    { "id": "frame", "role": "frame", "gate": "editor" },
    { "id": "build", "role": "build" },
    { "id": "critic", "role": "critic" },
    { "id": "sync", "role": "sync", "gate": "prompt" }
  ],
  "edges": [
    { "from": "frame", "to": "build" },
    { "from": "build", "to": "critic" },
    { "from": "critic", "to": "build", "condition": "fail" },
    { "from": "critic", "to": "sync", "condition": "default" }
  ]
}
`;

export const DEFAULT_WORKFLOW: Workflow = WorkflowSchema.parse(JSON.parse(DEFAULT_WORKFLOW_TEXT));
