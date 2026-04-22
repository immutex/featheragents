import { MarkerType, type Connection, type Edge, type Node } from '@xyflow/react';

import type { ApiWorkflow, ApiWorkflowEdge, ApiWorkflowNode } from './queries';

export const FLOW_START_NODE_ID = '__start';

export type WorkflowFlowNodeData = {
  label: string;
  type: 'orchestrator' | 'agent';
  agentId?: string;
  role?: ApiWorkflowNode['role'];
  model?: string;
  promptTemplate?: string;
  gate?: ApiWorkflowNode['gate'];
  requires?: string[];
  loopback?: string;
};

export type WorkflowFlowEdgeData = {
  condition?: ApiWorkflowEdge['condition'];
  color: string;
};

export type WorkflowFlowNode = Node<WorkflowFlowNodeData>;
export type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData>;

export type WorkflowFlowConnection = Pick<Connection, 'source' | 'target'> & {
  condition?: ApiWorkflowEdge['condition'];
};

function roleLabel(role: ApiWorkflowNode['role']): string {
  return role[0]!.toUpperCase() + role.slice(1);
}

function edgeColor(condition: ApiWorkflowEdge['condition'] | undefined): string {
  if (condition === 'fail') return '#f87171';
  if (condition === 'pass') return '#4ade80';
  if (condition === 'warn') return '#f59e0b';
  return '#a1a1aa';
}

function normalizeCondition(condition: ApiWorkflowEdge['condition'] | undefined): ApiWorkflowEdge['condition'] | undefined {
  return condition === 'default' ? undefined : condition;
}

function sortAgentNodes(nodes: WorkflowFlowNode[]): WorkflowFlowNode[] {
  return nodes
    .filter((node) => node.id !== FLOW_START_NODE_ID && node.data.type === 'agent')
    .slice()
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y || left.id.localeCompare(right.id));
}

function uniqueEdgeId(baseId: string, edges: WorkflowFlowEdge[]): string {
  if (!edges.some((edge) => edge.id === baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (edges.some((edge) => edge.id === `${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function decorateEdge(edge: Omit<WorkflowFlowEdge, 'markerEnd' | 'animated'>): WorkflowFlowEdge {
  const color = edge.data?.color ?? edgeColor(edge.data?.condition);
  return {
    ...edge,
    animated: edge.data?.condition === 'fail',
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    data: {
      condition: edge.data?.condition,
      color,
    },
  };
}

function defaultNodePosition(index: number): { x: number; y: number } {
  return { x: 260 + index * 220, y: 140 };
}

export function createWorkflowFlowEdge(
  connection: WorkflowFlowConnection,
  existingEdges: WorkflowFlowEdge[] = [],
): WorkflowFlowEdge {
  const condition = normalizeCondition(connection.condition);
  const baseId = `workflow-${connection.source}-${connection.target}-${condition ?? 'default'}`;

  return decorateEdge({
    id: uniqueEdgeId(baseId, existingEdges),
    source: connection.source ?? '',
    target: connection.target ?? '',
    type: 'workflow',
    data: {
      condition,
      color: edgeColor(condition),
    },
  });
}

export function updateWorkflowFlowEdgeCondition(
  edge: WorkflowFlowEdge,
  condition: ApiWorkflowEdge['condition'] | undefined,
): WorkflowFlowEdge {
  const nextCondition = normalizeCondition(condition);

  return decorateEdge({
    ...edge,
    data: {
      condition: nextCondition,
      color: edgeColor(nextCondition),
    },
  });
}

export function connectWorkflowFlowEdge(
  edges: WorkflowFlowEdge[],
  connection: WorkflowFlowConnection,
): WorkflowFlowEdge[] {
  const source = connection.source ?? undefined;
  const target = connection.target ?? undefined;
  const condition = normalizeCondition(connection.condition);

  if (!source || !target || source === target) {
    return edges;
  }

  if (
    edges.some(
      (edge) =>
        edge.source === source &&
        edge.target === target &&
        normalizeCondition(edge.data?.condition) === condition,
    )
  ) {
    return edges;
  }

  if (source === FLOW_START_NODE_ID) {
    const withoutStartEdge = edges.filter((edge) => edge.source !== FLOW_START_NODE_ID);
    return [...withoutStartEdge, createWorkflowFlowEdge({ source, target, condition }, withoutStartEdge)];
  }

  return [...edges, createWorkflowFlowEdge({ source, target, condition }, edges)];
}

export function removeWorkflowFlowNode(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  nodeId: string,
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  if (nodeId === FLOW_START_NODE_ID) {
    return { nodes, edges };
  }

  const nextNodes = nodes.filter((node) => node.id !== nodeId);
  const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  const removedStartEdge = edges.some((edge) => edge.source === FLOW_START_NODE_ID && edge.target === nodeId);

  if (!removedStartEdge) {
    return { nodes: nextNodes, edges: nextEdges };
  }

  const fallbackStartNode = sortAgentNodes(nextNodes)[0];
  if (!fallbackStartNode) {
    return { nodes: nextNodes, edges: nextEdges };
  }

  const withoutStartEdge = nextEdges.filter((edge) => edge.source !== FLOW_START_NODE_ID);
  return {
    nodes: nextNodes,
    edges: [...withoutStartEdge, createWorkflowFlowEdge({ source: FLOW_START_NODE_ID, target: fallbackStartNode.id }, withoutStartEdge)],
  };
}

export function workflowToFlow(workflow: ApiWorkflow): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const workflowNodes = workflow.nodes.map((node, index) => {
    const position =
      typeof node.x === 'number' && typeof node.y === 'number'
        ? { x: node.x, y: node.y }
        : defaultNodePosition(index);

    return {
      id: node.id,
      type: 'agent',
      position,
      data: {
        label: roleLabel(node.role),
        type: 'agent',
        agentId: node.agent,
        role: node.role,
        model: node.model,
        promptTemplate: node.promptTemplate,
        gate: node.gate,
        requires: node.requires,
        loopback: node.loopback,
      },
    } satisfies WorkflowFlowNode;
  });

  const startTarget = workflowNodes.find((node) => node.id === workflow.start);
  const startPosition = startTarget
    ? { x: Math.max(40, startTarget.position.x - 180), y: startTarget.position.y }
    : { x: 40, y: 140 };

  const nodes: WorkflowFlowNode[] = [
    {
      id: FLOW_START_NODE_ID,
      type: 'orchestrator',
      position: startPosition,
      data: {
        label: 'Start',
        type: 'orchestrator',
      },
      draggable: false,
      selectable: false,
    },
    ...workflowNodes,
  ];

  const edges: WorkflowFlowEdge[] = [];
  edges.push(createWorkflowFlowEdge({ source: FLOW_START_NODE_ID, target: workflow.start }, edges));

  for (const edge of workflow.edges) {
    edges.push(
      createWorkflowFlowEdge(
        {
          source: edge.from,
          target: edge.to,
          condition: edge.condition,
        },
        edges,
      ),
    );
  }

  return { nodes, edges };
}

export function flowToWorkflow(nodes: WorkflowFlowNode[], edges: WorkflowFlowEdge[]): ApiWorkflow {
  const workflowNodes = sortAgentNodes(nodes)
    .map((node) => {
      const workflowNode: ApiWorkflowNode = {
        id: node.id,
        role: node.data.role ?? 'build',
        x: node.position.x,
        y: node.position.y,
      };

      if (node.data.agentId) workflowNode.agent = node.data.agentId;
      if (node.data.model) workflowNode.model = node.data.model;
      if (node.data.promptTemplate) workflowNode.promptTemplate = node.data.promptTemplate;
      if (node.data.gate) workflowNode.gate = node.data.gate;
      if (node.data.requires && node.data.requires.length > 0) workflowNode.requires = node.data.requires;
      if (node.data.loopback) workflowNode.loopback = node.data.loopback;

      return workflowNode;
    });

  const startEdge = edges.find((edge) => edge.source === FLOW_START_NODE_ID);
  const workflowEdges = edges
    .filter((edge) => edge.source !== FLOW_START_NODE_ID && edge.target !== FLOW_START_NODE_ID)
    .slice()
    .sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target) || (left.data?.condition ?? '').localeCompare(right.data?.condition ?? ''))
    .map((edge) => {
      const workflowEdge: ApiWorkflowEdge = {
        from: edge.source,
        to: edge.target,
      };

        const condition = normalizeCondition(edge.data?.condition);
        if (condition) {
          workflowEdge.condition = condition;
        }

      return workflowEdge;
    });

  return {
    version: 1,
    start: startEdge?.target ?? workflowNodes[0]?.id ?? '',
    nodes: workflowNodes,
    edges: workflowEdges,
  };
}
