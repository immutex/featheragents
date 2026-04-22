import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';
import { useMemoryGraph, type ApiMemoryGraphData, type ApiMemoryGraphNode, type ApiMemoryScope, type ApiMemoryType } from '@/lib/queries';
import { Filter, Maximize2 } from 'lucide-react';

type MemoryNodeData =
  | {
      kind: 'memory';
      id: string;
      title: string;
      scope: ApiMemoryScope;
      memoryType: ApiMemoryType;
      isActive: boolean;
      selected: boolean;
    }
  | {
      kind: 'entity';
      label: string;
      entityKind: string;
    }
  | {
      kind: 'scope';
      label: string;
    };

const memoryTone: Record<ApiMemoryType, string> = {
  semantic: 'border-accent/50 bg-accent/[0.08]',
  episodic: 'border-info/50 bg-info/[0.08]',
  procedural: 'border-ok/50 bg-ok/[0.08]',
  summary: 'border-warn/50 bg-warn/[0.08]',
};

const memoryBadgeTone: Record<ApiMemoryType, 'accent' | 'ok' | 'warn' | 'default'> = {
  semantic: 'accent',
  episodic: 'default',
  procedural: 'ok',
  summary: 'warn',
};

const edgeColors: Record<string, string> = {
  supersedes: '#f87171',
  related_to: '#71717a',
  caused_by: '#fbbf24',
  derived_from: '#22d3ee',
  belongs_to_scope: '#3f3f46',
  about: '#60a5fa',
};

function MemoryNodeCard({ data }: NodeProps<Node<MemoryNodeData>>) {
  if (data.kind !== 'memory') return null;

  return (
    <div
      className={cn(
        'w-[216px] rounded-xl border px-3.5 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-all',
        memoryTone[data.memoryType],
        !data.isActive && 'opacity-45',
        data.selected && 'ring-1 ring-accent/60 shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_0_18px_rgba(34,211,238,0.12)]',
      )}
      style={{ transform: 'translateZ(0)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-ink">{data.title}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={memoryBadgeTone[data.memoryType]}>{data.memoryType}</Badge>
            <Badge tone="muted">{data.scope}</Badge>
          </div>
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

function EntityNodeCard({ data }: NodeProps<Node<MemoryNodeData>>) {
  if (data.kind !== 'entity') return null;

  return (
    <div className="w-[180px] rounded-xl border border-border bg-elevated/90 px-3 py-2.5 shadow-[0_6px_14px_rgba(0,0,0,0.24)]">
      <div className="text-xs uppercase tracking-[0.18em] text-ink-5">{data.entityKind}</div>
      <div className="mt-1 truncate text-sm font-medium text-ink">{data.label}</div>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

function ScopeNodeCard({ data }: NodeProps<Node<MemoryNodeData>>) {
  if (data.kind !== 'scope') return null;

  return (
    <div className="h-[640px] w-[760px] rounded-[32px] border border-border/70 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="px-5 pt-4 text-[11px] font-mono uppercase tracking-[0.24em] text-ink-5">scope / {data.label}</div>
    </div>
  );
}

const nodeTypes = {
  memory: MemoryNodeCard,
  entity: EntityNodeCard,
  scope: ScopeNodeCard,
};

function buildLayout(graph: ApiMemoryGraphData, selectedMemoryId: string | null, hiddenMemoryIds: Set<string>) {
  const memoryNodes = graph.nodes.filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'memory' }> => node.kind === 'memory' && !hiddenMemoryIds.has(node.id));
  const entityNodes = graph.nodes.filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'entity' }> => node.kind === 'entity');
  const scopeNodes = graph.nodes.filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'scope' }> => node.kind === 'scope');

  const entityScope = new Map<string, ApiMemoryScope>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'entity' || hiddenMemoryIds.has(edge.from)) continue;
    const memory = memoryNodes.find((node) => node.id === edge.from);
    if (memory) {
      entityScope.set(edge.to, memory.scope);
    }
  }

  const groupedMemories = new Map<ApiMemoryScope, Extract<ApiMemoryGraphNode, { kind: 'memory' }>[]>();
  for (const memory of memoryNodes) {
    groupedMemories.set(memory.scope, [...(groupedMemories.get(memory.scope) ?? []), memory]);
  }

  const groupedEntities = new Map<ApiMemoryScope, Extract<ApiMemoryGraphNode, { kind: 'entity' }>[]>();
  for (const entity of entityNodes) {
    const scope = entityScope.get(entity.id) ?? 'repo';
    groupedEntities.set(scope, [...(groupedEntities.get(scope) ?? []), entity]);
  }

  const nodes: Node<MemoryNodeData>[] = [];
  const scopes = scopeNodes.length > 0 ? scopeNodes : [{ kind: 'scope', id: 'scope:repo', label: 'repo', scope: 'repo' as ApiMemoryScope }];

  scopes.forEach((scopeNode, scopeIndex) => {
    const clusterX = scopeIndex * 860;
    const clusterY = 24;
    const centerX = clusterX + 360;
    const centerY = 330;
    const memoriesInScope = (groupedMemories.get(scopeNode.scope) ?? []).sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0));
    const entitiesInScope = groupedEntities.get(scopeNode.scope) ?? [];

    nodes.push({
      id: scopeNode.id,
      type: 'scope',
      position: { x: clusterX, y: clusterY },
      data: { kind: 'scope', label: scopeNode.label },
      draggable: false,
      selectable: false,
      zIndex: 0,
    });

    memoriesInScope.forEach((memory, index) => {
      const angle = (index / Math.max(memoriesInScope.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = Math.floor(index / 6);
      const radius = 115 + ring * 42;
      nodes.push({
        id: memory.id,
        type: 'memory',
        position: {
          x: centerX + Math.cos(angle) * radius - 108,
          y: centerY + Math.sin(angle) * radius * 0.72 - 42,
        },
        data: {
          kind: 'memory',
          id: memory.id,
          title: memory.title,
          scope: memory.scope,
          memoryType: memory.type,
          isActive: memory.isActive && !memory.invalidAt,
          selected: selectedMemoryId === memory.id,
        },
        zIndex: 5,
      });
    });

    entitiesInScope.forEach((entity, index) => {
      const angle = (index / Math.max(entitiesInScope.length, 1)) * Math.PI * 2;
      const radius = 290;
      nodes.push({
        id: entity.id,
        type: 'entity',
        position: {
          x: centerX + Math.cos(angle) * radius - 90,
          y: centerY + Math.sin(angle) * radius * 0.85 - 28,
        },
        data: {
          kind: 'entity',
          label: entity.label,
          entityKind: entity.entityKind,
        },
        zIndex: 4,
      });
    });
  });

  const edges: Edge[] = graph.edges
    .filter((edge) => !hiddenMemoryIds.has(edge.from) && !hiddenMemoryIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: edge.relation === 'supersedes',
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[edge.relation] ?? '#71717a', width: 14, height: 14 },
      style: {
        stroke: edgeColors[edge.relation] ?? '#71717a',
        strokeWidth: edge.kind === 'scope' ? 1 : 1.6,
        opacity: edge.kind === 'scope' ? 0.35 : 0.95,
      },
      zIndex: edge.kind === 'scope' ? 1 : 3,
    }));

  return { nodes, edges };
}

function GraphCanvas({
  graph,
  selectedMemoryId,
  onSelectMemory,
  onOpenInspector,
}: {
  graph: ApiMemoryGraphData;
  selectedMemoryId: string | null;
  onSelectMemory: (id: string) => void;
  onOpenInspector: () => void;
}) {
  const { fitView } = useReactFlow();
  const [typeFilter, setTypeFilter] = useState<'all' | ApiMemoryType>('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [showSuperseded, setShowSuperseded] = useState(true);

  const memoryNodes = useMemo(
    () => graph.nodes.filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'memory' }> => node.kind === 'memory'),
    [graph.nodes],
  );

  const agentOptions = useMemo(
    () => ['all', ...new Set(memoryNodes.map((node) => node.agent).filter((value): value is string => Boolean(value)))],
    [memoryNodes],
  );
  const modelOptions = useMemo(
    () => ['all', ...new Set(memoryNodes.map((node) => node.model).filter((value): value is string => Boolean(value)))],
    [memoryNodes],
  );

  const hiddenMemoryIds = useMemo(() => {
    const hidden = new Set<string>();

    for (const node of memoryNodes) {
      const isSuperseded = node.supersededByIds.length > 0 || Boolean(node.invalidAt) || !node.isActive;
      if (!showSuperseded && isSuperseded) {
        hidden.add(node.id);
        continue;
      }
      if (typeFilter !== 'all' && node.type !== typeFilter) {
        hidden.add(node.id);
        continue;
      }
      if (agentFilter !== 'all' && node.agent !== agentFilter) {
        hidden.add(node.id);
        continue;
      }
      if (modelFilter !== 'all' && node.model !== modelFilter) {
        hidden.add(node.id);
      }
    }

    return hidden;
  }, [agentFilter, memoryNodes, modelFilter, showSuperseded, typeFilter]);

  const layout = useMemo(() => buildLayout(graph, selectedMemoryId, hiddenMemoryIds), [graph, hiddenMemoryIds, selectedMemoryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => fitView({ padding: 0.22, duration: 450 }), 30);
    return () => window.clearTimeout(timer);
  }, [fitView, layout]);

  return (
    <Card className="relative min-h-0 flex-1 overflow-hidden !bg-bg !border-border">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <FilterSelect label="Type" value={typeFilter} onChange={(value) => setTypeFilter(value as 'all' | ApiMemoryType)} options={['all', 'semantic', 'episodic', 'procedural', 'summary']} />
        <FilterSelect label="Agent" value={agentFilter} onChange={setAgentFilter} options={agentOptions} />
        <FilterSelect label="Model" value={modelFilter} onChange={setModelFilter} options={modelOptions} />
        <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated/95 px-3 py-2 text-xs text-ink-4">
          <span>Show superseded</span>
          <Toggle checked={showSuperseded} onChange={setShowSuperseded} />
        </div>
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => fitView({ padding: 0.22, duration: 450 })}>
          <Maximize2 size={13} />Fit
        </Button>
      </div>

      {graph.notice && (
        <div className="absolute left-3 bottom-3 z-10 rounded-lg border border-border bg-elevated/95 px-3 py-2 text-xs font-mono text-ink-4">
          {graph.notice}
        </div>
      )}

      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle at 50% 45%, transparent 45%, rgba(0,0,0,0.4) 100%)' }}
      />

      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === 'memory') {
            onSelectMemory(node.id);
            onOpenInspector();
          }
        }}
        onPaneClick={() => undefined}
        fitView
        minZoom={0.35}
        maxZoom={1.8}
        colorMode="dark"
        nodesConnectable={false}
        nodesDraggable={false}
        edgesReconnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
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
          nodeColor={(node) => (node.type === 'memory' ? '#22d3ee' : node.type === 'entity' ? '#a1a1aa' : '#18181b')}
          nodeStrokeColor="#1a1a22"
          nodeBorderRadius={6}
          pannable
          zoomable
        />
      </ReactFlow>
    </Card>
  );
}

export function MemoryGraph({
  scope,
  onScopeChange,
  selectedMemoryId,
  onSelectMemory,
  onOpenInspector,
}: {
  scope: ApiMemoryScope;
  onScopeChange: (scope: ApiMemoryScope) => void;
  selectedMemoryId: string | null;
  onSelectMemory: (id: string) => void;
  onOpenInspector: () => void;
}) {
  const graphQuery = useMemoryGraph(scope);

  if (graphQuery.isLoading || !graphQuery.data) {
    return (
      <Card className="flex min-h-[640px] flex-1 items-center justify-center !bg-bg !border-border text-sm text-ink-4">
        Loading memory graph…
      </Card>
    );
  }

  if (graphQuery.error) {
    return (
      <Card className="flex min-h-[640px] flex-1 items-center justify-center !bg-bg !border-border px-6 text-center text-sm text-err">
        {graphQuery.error instanceof Error ? graphQuery.error.message : 'Unable to load memory graph.'}
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-5">Graph view</div>
          <div className="mt-1 text-sm text-ink-4">Obsidian-inspired graph of visible memory, derived entities, and scope clusters.</div>
        </div>
        <FilterSelect label="Scope" value={scope} onChange={(value) => onScopeChange(value as ApiMemoryScope)} options={['repo', 'branch', 'session', 'global']} compact />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ReactFlowProvider>
          <GraphCanvas graph={graphQuery.data} selectedMemoryId={selectedMemoryId} onSelectMemory={onSelectMemory} onOpenInspector={onOpenInspector} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  compact?: boolean;
}) {
  return (
    <label className={cn('flex items-center gap-2 rounded-lg border border-border bg-elevated/95 text-xs text-ink-4', compact ? 'px-2.5 py-2' : 'px-3 py-2')}>
      <Filter size={12} className="text-ink-5" />
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-surface text-ink">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
