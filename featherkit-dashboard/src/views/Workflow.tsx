import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type NodeProps,
  type EdgeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiPost } from '@/lib/api';
import { getBuiltInAgentById } from '@/lib/builtin-agents';
import { FLOW_START_NODE_ID, connectWorkflowFlowEdge, flowToWorkflow, removeWorkflowFlowNode, updateWorkflowFlowEdgeCondition, workflowToFlow, type WorkflowFlowEdge, type WorkflowFlowNode, type WorkflowFlowNodeData } from '@/lib/workflow-convert';
import { getWorkflowInspectorKey, shouldHandleWorkflowDeleteShortcut } from '@/lib/workflow-ui';
import { Save, Play, CheckCircle2, Layers, Boxes, Eye, GitMerge, RotateCcw, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeUp } from '@/lib/motion';
import { type ApiWorkflow, type ApiWorkflowEdge, usePutWorkflow, useWorkflowQuery, workflowNodeLabel } from '@/lib/queries';

type Direction = 'RIGHT' | 'DOWN';
type ToastPayload = { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string };
type WorkflowEdgeCondition = ApiWorkflowEdge['condition'];

const roleIcon: Record<string, any> = { frame: Layers, build: Boxes, critic: Eye, sync: GitMerge };

const roleColor: Record<string, string> = {
  frame: 'border-role-frame/60 bg-role-frame/[0.06]',
  build: 'border-role-build/60 bg-role-build/[0.06]',
  critic: 'border-role-critic/60 bg-role-critic/[0.06]',
  sync: 'border-role-sync/60 bg-role-sync/[0.06]',
  accent: 'border-accent/60 bg-accent/[0.06]',
};

const roleStripe: Record<string, string> = {
  frame: 'bg-role-frame',
  build: 'bg-role-build',
  critic: 'bg-role-critic',
  sync: 'bg-role-sync',
  accent: 'bg-accent',
};

function createNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `node-${Date.now()}`;
}

function arrangeNodes(nodes: WorkflowFlowNode[], direction: Direction): WorkflowFlowNode[] {
  const orderedAgents = nodes
    .filter((node) => node.id !== FLOW_START_NODE_ID)
    .slice()
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y || left.id.localeCompare(right.id));

  const positionedAgents = new Map(
    orderedAgents.map((node, index) => [
      node.id,
      direction === 'RIGHT'
        ? { x: 260 + index * 220, y: 140 }
        : { x: 260, y: 80 + index * 150 },
    ]),
  );

  const firstAgentPosition = positionedAgents.get(orderedAgents[0]?.id ?? '') ?? { x: 260, y: 140 };
  const startPosition = direction === 'RIGHT'
    ? { x: Math.max(40, firstAgentPosition.x - 180), y: firstAgentPosition.y }
    : { x: firstAgentPosition.x, y: Math.max(20, firstAgentPosition.y - 120) };

  return nodes.map((node) => {
    if (node.id === FLOW_START_NODE_ID) {
      return { ...node, position: startPosition };
    }

    return {
      ...node,
      position: positionedAgents.get(node.id) ?? node.position,
    };
  });
}

function OrchestratorNode({ data }: NodeProps<WorkflowFlowNode>) {
  return (
    <div className="group relative w-[96px] h-[96px] rounded-full bg-elevated border border-accent/70 flex flex-col items-center justify-center shadow-[0_0_32px_rgba(34,211,238,0.15)]" style={{ transform: 'translateZ(0)' }}>
      <Play size={16} className="text-accent mb-1" />
      <span className="text-[11px] font-semibold tracking-tight">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-bg !bg-accent !opacity-20 group-hover:!opacity-100 transition-opacity" />
    </div>
  );
}

function AgentNode({ data }: NodeProps<WorkflowFlowNode>) {
  const agent = getBuiltInAgentById(data.agentId);
  const roleKey = data.role ?? agent?.roleColor ?? 'accent';
  const Icon = roleIcon[roleKey] || Layers;

  return (
    <div
      className={cn('group relative w-[172px] rounded-xl border bg-elevated overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,0.35)]', roleColor[roleKey])}
      style={{ transform: 'translateZ(0)' }}
    >
      <div className={cn('h-[3px] w-full', roleStripe[roleKey])} />
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={13} className="text-ink-2" />
          <span className="text-[13px] font-semibold tracking-tight">{data.label}</span>
        </div>
        <Badge tone={roleKey as any}>{roleKey}</Badge>
        {(data.model ?? agent?.model) && <div className="text-[10.5px] font-mono text-ink-4 mt-1.5 truncate">{data.model ?? agent?.model}</div>}
        {data.gate && <div className="text-[10px] font-mono text-ink-5 mt-1 truncate">gate: {data.gate}</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-bg !bg-accent !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-bg !bg-accent !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-bg !bg-accent !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-bg !bg-accent !opacity-0 group-hover:!opacity-100 transition-opacity" />
    </div>
  );
}

const nodeTypes = { orchestrator: OrchestratorNode, agent: AgentNode };

function WorkflowEdgeView({ id, data, markerEnd, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps<WorkflowFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: 20,
  });

  const color = data?.color ?? '#a1a1aa';
  const condition = data?.condition;

  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeOpacity={0.08}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'blur(2px)' }}
      />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: 1.6,
          strokeDasharray: condition === 'fail' ? '5,4' : undefined,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
      {condition && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute select-none rounded-[5px] border text-[9.5px] font-mono font-medium tracking-wide uppercase"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color,
              borderColor: `${color}55`,
              background: '#0d0d11',
              padding: '1.5px 6px',
            }}
          >
            {condition}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { workflow: WorkflowEdgeView };

function CanvasInner({ workflow, onToast }: { workflow: ApiWorkflow; onToast: (toast: ToastPayload) => void }) {
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowFlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { fitView } = useReactFlow();
  const initial = useRef(true);
  const putWorkflow = usePutWorkflow();

  useEffect(() => {
    const flow = workflowToFlow(workflow);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setReady(true);

    if (!flow.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }

    if (!flow.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }

    setTimeout(() => {
      fitView({ padding: 0.28, duration: initial.current ? 0 : 350 });
      initial.current = false;
    }, 30);
  }, [workflow, setNodes, setEdges, fitView, selectedNodeId, selectedEdgeId]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const buildDraftWorkflow = useCallback(() => flowToWorkflow(nodes, edges), [nodes, edges]);

  const resetView = useCallback(() => {
    fitView({ padding: 0.28, duration: 400 });
  }, [fitView]);

  const relayout = useCallback((nextDirection: Direction) => {
    setDirection(nextDirection);
    setNodes((current) => arrangeNodes(current, nextDirection));
    setTimeout(() => {
      fitView({ padding: 0.28, duration: 350 });
    }, 30);
  }, [fitView, setNodes]);

  const updateSelectedNode = useCallback((patch: Partial<WorkflowFlowNodeData>) => {
    if (!selectedNodeId || selectedNodeId === FLOW_START_NODE_ID) {
      return;
    }

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) {
          return node;
        }

        const nextData: WorkflowFlowNodeData = {
          ...node.data,
          ...patch,
        };

        if (patch.role) {
          nextData.label = workflowNodeLabel(patch.role);
        }

        return {
          ...node,
          data: nextData,
        };
      }),
    );
  }, [selectedNodeId, setNodes]);

  const handleAddNode = useCallback(() => {
    const id = createNodeId();
    const maxX = nodes.reduce((currentMax, node) => (node.id === FLOW_START_NODE_ID ? currentMax : Math.max(currentMax, node.position.x)), 260);
    const nextNode: WorkflowFlowNode = {
      id,
      type: 'agent',
      position: { x: maxX + 220, y: 140 },
      data: {
        label: 'Build',
        type: 'agent',
        role: 'build',
      },
    };

    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    onToast({ tone: 'accent', title: 'Node added', desc: 'New build node added to the canvas.' });
  }, [nodes, onToast, setNodes]);

  const handleConnect = useCallback((connection: Connection) => {
    const source = connection.source ?? null;
    const target = connection.target ?? null;

    if (!source || !target) {
      onToast({ tone: 'warn', title: 'Connection incomplete', desc: 'Connect two workflow nodes to add an edge.' });
      return;
    }

    if (source === target) {
      onToast({ tone: 'warn', title: 'Self-loop not added', desc: 'Connect a node to a different destination.' });
      return;
    }

    const nextEdges = connectWorkflowFlowEdge(edges, { source, target });
    if (nextEdges === edges) {
      onToast({ tone: 'warn', title: 'Connection unchanged', desc: source === FLOW_START_NODE_ID ? 'Start already points to that node.' : 'That connection already exists.' });
      return;
    }

    setEdges(nextEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(nextEdges[nextEdges.length - 1]?.id ?? null);
    onToast({ tone: 'accent', title: source === FLOW_START_NODE_ID ? 'Start updated' : 'Connection added', desc: source === FLOW_START_NODE_ID ? 'Workflow entrypoint updated from the canvas.' : 'New workflow edge added.' });
  }, [edges, onToast, setEdges]);

  const handleDeleteSelectedNode = useCallback(() => {
    if (!selectedNode || selectedNode.id === FLOW_START_NODE_ID) {
      onToast({ tone: 'warn', title: 'Cannot delete start node', desc: 'The synthetic start node is required for the workflow canvas.' });
      return;
    }

    const agentCount = nodes.filter((node) => node.id !== FLOW_START_NODE_ID && node.data.type === 'agent').length;
    if (agentCount <= 1) {
      onToast({ tone: 'warn', title: 'Need one workflow node', desc: 'Keep at least one agent node in the workflow.' });
      return;
    }

    const next = removeWorkflowFlowNode(nodes, edges, selectedNode.id);
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    onToast({ tone: 'accent', title: 'Node deleted', desc: `Removed ${selectedNode.data.label} from the workflow.` });
  }, [edges, nodes, onToast, selectedNode, setEdges, setNodes]);

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) {
      return;
    }

    if (selectedEdge.source === FLOW_START_NODE_ID) {
      onToast({ tone: 'warn', title: 'Start edge is managed separately', desc: 'Drag a new connection from Start to change the entrypoint.' });
      return;
    }

    setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
    setSelectedEdgeId(null);
    onToast({ tone: 'accent', title: 'Edge deleted', desc: 'Workflow connection removed.' });
  }, [onToast, selectedEdge, setEdges]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldHandleWorkflowDeleteShortcut(event)) {
        return;
      }

      if (selectedNode) {
        event.preventDefault();
        handleDeleteSelectedNode();
        return;
      }

      if (selectedEdge) {
        event.preventDefault();
        handleDeleteSelectedEdge();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelectedEdge, handleDeleteSelectedNode, selectedEdge, selectedNode]);

  const updateSelectedEdgeCondition = useCallback((condition: WorkflowEdgeCondition | undefined) => {
    if (!selectedEdgeId) {
      return;
    }

    setEdges((current) =>
      current.map((edge) => (edge.id === selectedEdgeId ? updateWorkflowFlowEdgeCondition(edge, condition) : edge)),
    );
  }, [selectedEdgeId, setEdges]);

  const handleValidate = useCallback(async () => {
    try {
      const result = await apiPost<{ ok: true; message?: string }>('/api/workflow/validate', buildDraftWorkflow());
      onToast({ tone: 'ok', title: 'Workflow valid', desc: result.message ?? 'Workflow validation passed.' });
    } catch (error) {
      onToast({
        tone: 'err',
        title: 'Workflow invalid',
        desc: error instanceof Error ? error.message : 'Workflow validation failed.',
      });
    }
  }, [buildDraftWorkflow, onToast]);

  const handleSave = useCallback(() => {
    const draftWorkflow = buildDraftWorkflow();
    putWorkflow.mutate(draftWorkflow, {
      onSuccess: () => {
        onToast({ tone: 'ok', title: 'Workflow saved', desc: 'Backend workflow definition updated.' });
      },
      onError: (error) => {
        onToast({
          tone: 'err',
          title: 'Workflow save failed',
          desc: error instanceof Error ? error.message : 'Unable to save workflow.',
        });
      },
    });
  }, [buildDraftWorkflow, onToast, putWorkflow]);

  return (
    <div className="h-[calc(100vh-200px)] min-h-[520px] flex gap-3 max-w-[1400px]">
      <Card className="flex-1 relative overflow-hidden !bg-bg !border-border">
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => relayout(direction === 'RIGHT' ? 'DOWN' : 'RIGHT')}>
            <LayoutGrid size={13} />{direction === 'RIGHT' ? 'Horizontal' : 'Vertical'}
          </Button>
          <Button variant="outline" size="sm" onClick={resetView}>
            <RotateCcw size={13} />Fit
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddNode}>
            <Plus size={13} />Add node
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={selectedNode ? handleDeleteSelectedNode : handleDeleteSelectedEdge}
            disabled={!selectedNode && !selectedEdge}
          >
            <Trash2 size={13} />Delete selected
          </Button>
        </div>
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <Button variant="outline" size="sm" onClick={handleValidate}>
            <CheckCircle2 size={13} />Validate
          </Button>
          <Button variant="accent" size="sm" onClick={handleSave} disabled={putWorkflow.isPending}>
            <Save size={13} />{putWorkflow.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'radial-gradient(circle at 50% 45%, transparent 45%, rgba(0,0,0,0.4) 100%)' }} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
          onConnect={handleConnect}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          nodesDraggable
          nodesConnectable
          edgesReconnectable={false}
          minZoom={0.4}
          maxZoom={2}
          nodesFocusable={false}
          panOnScroll={false}
          style={{ background: 'transparent' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#3f3f46" bgColor="#05050a" />
          <Controls
            className="!bg-elevated/95 !border !border-border !rounded-lg !shadow-xl [&>button]:!bg-transparent [&>button]:!border-border [&>button]:!text-ink-3 [&>button:hover]:!bg-bg [&>button]:!w-7 [&>button]:!h-7"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-elevated/95 !border !border-border !rounded-lg"
            maskColor="rgba(5,5,7,0.78)"
            nodeColor="#22d3ee"
            nodeStrokeColor="#1a1a22"
            nodeBorderRadius={6}
            pannable
            zoomable
          />
        </ReactFlow>

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-bg/60 backdrop-blur-sm">
            <div className="text-xs text-ink-4 font-mono">Loading workflow…</div>
          </div>
        )}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-3.5 py-2 rounded-lg bg-elevated/95 border border-border text-[10.5px] font-mono text-ink-4">
          <span className="flex items-center gap-1.5">
            <svg width="16" height="2"><path d="M0 1 L16 1" stroke="#4ade80" strokeWidth="1.6" strokeLinecap="round" /></svg>
            pass
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="2"><path d="M0 1 L16 1" stroke="#f87171" strokeWidth="1.6" strokeDasharray="3,2" strokeLinecap="round" /></svg>
            fail
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="2"><path d="M0 1 L16 1" stroke="#a1a1aa" strokeWidth="1.6" strokeLinecap="round" /></svg>
            flow
          </span>
          <span className="text-ink-5">drag node handles to create connections</span>
          <span className="text-ink-5">Delete / Backspace removes selection</span>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={getWorkflowInspectorKey(selectedNode?.id ?? null, selectedEdge?.id ?? null)}
          variants={fadeUp}
          initial="initial"
          animate="animate"
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          className="w-[320px] shrink-0"
        >
          <Card className="h-full overflow-hidden flex flex-col">
            {selectedNode ? (
              <NodePanel node={selectedNode} onChange={updateSelectedNode} onDelete={handleDeleteSelectedNode} />
            ) : selectedEdge ? (
              <EdgePanel edge={selectedEdge} onChangeCondition={updateSelectedEdgeCondition} onDelete={handleDeleteSelectedEdge} />
            ) : (
              <EmptyPanel />
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function WorkflowCanvas({ onToast }: { onToast: (toast: ToastPayload) => void }) {
  const workflowQuery = useWorkflowQuery();

  if (!workflowQuery.data) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center text-sm text-ink-4">
        Loading workflow…
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasInner workflow={workflowQuery.data} onToast={onToast} />
    </ReactFlowProvider>
  );
}

function EmptyPanel() {
  return (
    <div className="p-5 text-sm text-ink-4 h-full flex items-center justify-center text-center">
      Select a node or edge to edit it. Drag between the visible connection dots to create new edges.
    </div>
  );
}

function NodePanel({ node, onChange, onDelete }: { node: WorkflowFlowNode; onChange: (patch: Partial<WorkflowFlowNodeData>) => void; onDelete: () => void }) {
  const data = node.data;

  if (node.id === FLOW_START_NODE_ID) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3.5 border-b border-border">
          <div className="text-xs text-ink-5 uppercase tracking-wider mb-0.5">Node</div>
          <div className="text-base font-semibold">{data.label}</div>
        </div>
        <div className="flex-1 p-4 space-y-3 overflow-y-auto fk-scroll">
          <Field label="ID" value={node.id} />
          <Field label="Type" value={data.type} />
          <div className="text-sm text-ink-4">This synthetic start node controls the workflow entrypoint and is not persisted as a workflow node.</div>
        </div>
      </div>
    );
  }

  const builtInAgent = getBuiltInAgentById(data.agentId);
  const displayedModel = data.model ?? builtInAgent?.model ?? '';

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="text-xs text-ink-5 uppercase tracking-wider mb-0.5">Node</div>
        <div className="text-base font-semibold">{data.label}</div>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-y-auto fk-scroll">
        <Field label="ID" value={node.id} />
        <Field label="Role" value={data.role ? workflowNodeLabel(data.role) : 'Build'} />
        {builtInAgent && <Field label="Agent" value={builtInAgent.name} />}

        <EditableField
          label="Model"
          value={displayedModel}
          placeholder="openai/gpt-5.4"
          onChange={(value) => onChange({ model: value || undefined })}
        />

        <EditableSelect
          label="Gate"
          value={data.gate ?? ''}
          options={['', 'editor', 'inline', 'pause', 'auto', 'prompt']}
          onChange={(value) => onChange({ gate: value === '' ? undefined : (value as WorkflowFlowNodeData['gate']) })}
        />

        <EditableField
          label="Loopback"
          value={data.loopback ?? ''}
          placeholder="build"
          onChange={(value) => onChange({ loopback: value || undefined })}
        />

        <EditableField
          label="Requires (comma-separated)"
          value={data.requires?.join(', ') ?? ''}
          placeholder="frame, build"
          onChange={(value) => onChange({ requires: value.trim() ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined })}
        />

        <EditableTextarea
          label="Prompt Template"
          value={data.promptTemplate ?? ''}
          placeholder="Optional workflow-specific prompt template"
          onChange={(value) => onChange({ promptTemplate: value || undefined })}
        />

        {builtInAgent && (
          <div>
            <label className="text-xs text-ink-5 uppercase tracking-wider">Built-in system prompt</label>
            <div className="mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-ink-3 leading-snug">{builtInAgent.systemPrompt}</div>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 size={13} />Delete node
        </Button>
      </div>
    </div>
  );
}

function EdgePanel({
  edge,
  onChangeCondition,
  onDelete,
}: {
  edge: WorkflowFlowEdge;
  onChangeCondition: (condition: WorkflowEdgeCondition | undefined) => void;
  onDelete: () => void;
}) {
  const isStartEdge = edge.source === FLOW_START_NODE_ID;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="text-xs text-ink-5 uppercase tracking-wider mb-0.5">Edge</div>
        <div className="text-base font-semibold">{isStartEdge ? 'Workflow start' : `${edge.source} → ${edge.target}`}</div>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-y-auto fk-scroll">
        <Field label="ID" value={edge.id} />
        <Field label="From" value={edge.source} />
        <Field label="To" value={edge.target} />

        {!isStartEdge && (
          <EditableSelect
            label="Condition"
            value={edge.data?.condition ?? ''}
            options={['', 'pass', 'warn', 'fail']}
            onChange={(value) => onChangeCondition(value === '' ? undefined : (value as WorkflowEdgeCondition))}
          />
        )}

        {isStartEdge ? (
          <div className="text-sm text-ink-4">This edge controls the workflow entrypoint. Drag a new connection from Start to another node to move it.</div>
        ) : (
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 size={13} />Delete edge
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-ink-5 uppercase tracking-wider">{label}</label>
      <div className="mt-1.5 px-3 py-2 rounded-lg bg-bg border border-border font-mono text-sm text-ink-2">{value}</div>
    </div>
  );
}

function EditableField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs text-ink-5 uppercase tracking-wider">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function EditableSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs text-ink-5 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      >
        {options.map((option) => (
          <option key={option || 'none'} value={option}>
            {option || 'none'}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditableTextarea({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs text-ink-5 uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-28 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}
