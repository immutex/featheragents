import { describe, expect, it } from 'vitest';

import { FLOW_START_NODE_ID, flowToWorkflow, workflowToFlow } from '@/lib/workflow-convert';
import type { ApiWorkflow } from '@/lib/queries';

describe('workflow conversion', () => {
  it('round-trips workflow node metadata, positions, and edge conditions', () => {
    const workflow: ApiWorkflow = {
      version: 1,
      start: 'frame',
      nodes: [
        {
          id: 'frame',
          role: 'frame',
          model: 'anthropic/claude-sonnet-4-6',
          promptTemplate: 'Plan the task',
          x: 120,
          y: 40,
        },
        {
          id: 'build',
          role: 'build',
          gate: 'prompt',
          loopback: 'frame',
          requires: ['frame'],
          x: 420,
          y: 160,
        },
      ],
      edges: [
        { from: 'frame', to: 'build', condition: 'pass' },
        { from: 'build', to: 'frame', condition: 'fail' },
      ],
    };

    const flow = workflowToFlow(workflow);
    expect(flow.nodes.map((node) => node.id)).toContain(FLOW_START_NODE_ID);
    expect(flow.edges.some((edge) => edge.source === FLOW_START_NODE_ID && edge.target === 'frame')).toBe(true);

    const roundTrip = flowToWorkflow(flow.nodes, flow.edges);
    expect(roundTrip).toEqual({
      version: 1,
      start: 'frame',
      nodes: [
        {
          id: 'frame',
          role: 'frame',
          model: 'anthropic/claude-sonnet-4-6',
          promptTemplate: 'Plan the task',
          x: 120,
          y: 40,
        },
        {
          id: 'build',
          role: 'build',
          gate: 'prompt',
          loopback: 'frame',
          requires: ['frame'],
          x: 420,
          y: 160,
        },
      ],
      edges: [
        { from: 'build', to: 'frame', condition: 'fail' },
        { from: 'frame', to: 'build', condition: 'pass' },
      ],
    });
  });

  it('uses stored coordinates when present and sensible defaults when missing', () => {
    const flow = workflowToFlow({
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame', x: 300, y: 100 },
        { id: 'sync', role: 'sync' },
      ],
      edges: [{ from: 'frame', to: 'sync' }],
    });

    expect(flow.nodes.find((node) => node.id === 'frame')?.position).toEqual({ x: 300, y: 100 });
    expect(flow.nodes.find((node) => node.id === 'sync')?.position).toEqual({ x: 480, y: 140 });
    expect(flow.nodes.find((node) => node.id === FLOW_START_NODE_ID)?.position).toEqual({ x: 120, y: 100 });
  });
});
