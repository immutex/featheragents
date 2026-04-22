import { describe, expect, it } from 'vitest';

import { FLOW_START_NODE_ID, connectWorkflowFlowEdge, flowToWorkflow, removeWorkflowFlowNode, updateWorkflowFlowEdgeCondition, workflowToFlow } from '@/lib/workflow-convert';
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

  it('adds visual connections without duplicating edges and rewires the start edge', () => {
    const flow = workflowToFlow({
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame', x: 100, y: 100 },
        { id: 'build', role: 'build', x: 300, y: 100 },
      ],
      edges: [],
    });

    const rewiredStart = connectWorkflowFlowEdge(flow.edges, { source: FLOW_START_NODE_ID, target: 'build' });
    expect(rewiredStart.filter((edge) => edge.source === FLOW_START_NODE_ID)).toHaveLength(1);
    expect(rewiredStart.find((edge) => edge.source === FLOW_START_NODE_ID)?.target).toBe('build');

    const withConnection = connectWorkflowFlowEdge(rewiredStart, { source: 'frame', target: 'build' });
    expect(withConnection.filter((edge) => edge.source === 'frame' && edge.target === 'build')).toHaveLength(1);

    const deduped = connectWorkflowFlowEdge(withConnection, { source: 'frame', target: 'build' });
    expect(deduped).toEqual(withConnection);

    const failEdge = updateWorkflowFlowEdgeCondition(
      withConnection.find((edge) => edge.source === 'frame' && edge.target === 'build')!,
      'fail',
    );
    expect(failEdge.data?.condition).toBe('fail');
    expect(failEdge.animated).toBe(true);
  });

  it('deletes nodes and repairs the synthetic start edge to the next node', () => {
    const flow = workflowToFlow({
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame', x: 100, y: 100 },
        { id: 'build', role: 'build', x: 300, y: 100 },
        { id: 'sync', role: 'sync', x: 500, y: 100 },
      ],
      edges: [
        { from: 'frame', to: 'build', condition: 'pass' },
        { from: 'build', to: 'sync' },
      ],
    });

    const next = removeWorkflowFlowNode(flow.nodes, flow.edges, 'frame');

    expect(next.nodes.map((node) => node.id)).not.toContain('frame');
    expect(next.edges.some((edge) => edge.source === 'frame' || edge.target === 'frame')).toBe(false);
    expect(next.edges.find((edge) => edge.source === FLOW_START_NODE_ID)?.target).toBe('build');
  });

  it('treats React Flow edge ids as ephemeral view state when serializing workflows', () => {
    const flow = workflowToFlow({
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame', x: 100, y: 100 },
        { id: 'build', role: 'build', x: 300, y: 100 },
      ],
      edges: [{ from: 'frame', to: 'build', condition: 'pass' }],
    });

    const edge = flow.edges.find((candidate) => candidate.source === 'frame' && candidate.target === 'build');
    expect(edge).toBeDefined();

    const renamedEdges = flow.edges.map((candidate) =>
      candidate.id === edge?.id
        ? { ...candidate, id: 'legacy-flow-edge-id' }
        : candidate,
    );

    expect(flowToWorkflow(flow.nodes, flow.edges)).toEqual(flowToWorkflow(flow.nodes, renamedEdges));
  });
});
