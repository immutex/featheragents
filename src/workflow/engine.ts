import type { ModelRole, TaskEntry } from '../config/schema.js';
import type { Workflow, WorkflowNode } from './schema.js';

interface NodeState {
  node: WorkflowNode;
  completedAt: string | null;
  verdict: 'pass' | 'warn' | 'fail' | null;
  completionIndex: number;
}

function buildRoleNodeMap(workflow: Workflow): Map<ModelRole, WorkflowNode> {
  return new Map(workflow.nodes.map((node) => [node.role, node]));
}

function buildNodeStates(task: TaskEntry, workflow: Workflow): Map<string, NodeState> {
  const states = new Map<string, NodeState>();
  const nodesByRole = buildRoleNodeMap(workflow);

  for (const node of workflow.nodes) {
    states.set(node.id, { node, completedAt: null, verdict: null, completionIndex: -1 });
  }

  const completions = task.phaseCompletions ?? [];
  for (let i = 0; i < completions.length; i++) {
    const completion = completions[i]!;
    const nodeForRole = nodesByRole.get(completion.phase);
    if (!nodeForRole) continue;

    const existing = states.get(nodeForRole.id);
    if (!existing) continue;

    // Keep the latest completion for each node (highest index = most recent).
    if (i > existing.completionIndex) {
      states.set(nodeForRole.id, {
        node: nodeForRole,
        completedAt: completion.completedAt,
        verdict: completion.verdict ?? null,
        completionIndex: i,
      });
    }
  }

  return states;
}

function outgoingEdges(workflow: Workflow, nodeId: string) {
  return workflow.edges.filter((e) => e.from === nodeId);
}

function resolveNextNodeId(
  workflow: Workflow,
  nodeId: string,
  verdict: 'pass' | 'warn' | 'fail' | null,
): string | null {
  const edges = outgoingEdges(workflow, nodeId);
  if (edges.length === 0) return null;

  // Prefer an edge whose condition matches the verdict, then 'default', then first unconditional.
  const verdictMatch = verdict ? edges.find((e) => e.condition === verdict) : null;
  if (verdictMatch) return verdictMatch.to;

  const defaultEdge = edges.find((e) => e.condition === 'default' || !e.condition);
  return defaultEdge?.to ?? null;
}

/**
 * Pure DAG walker — returns the next role to run, or null when the workflow is done.
 *
 * Preserves the loopback-on-fail behaviour of the original nextPhase() FSM:
 * if the critic node has a 'fail' edge back to build, a fail verdict routes back to build.
 *
 * Tie-breaking: when two completions share the same completedAt timestamp, the one with
 * the higher index in phaseCompletions is considered more recent (matches original loop.ts logic).
 */
export function nextStep(task: TaskEntry, workflow: Workflow): ModelRole | null {
  const states = buildNodeStates(task, workflow);

  let currentId = workflow.start;

  // Walk the DAG until we find a node that hasn't been completed yet.
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      // Cycle guard — should not happen with valid workflows.
      return null;
    }
    visited.add(currentId);

    const state = states.get(currentId);
    if (!state) return null;

    if (!state.completedAt) {
      // This node hasn't been completed — it's what we should run next.
      return state.node.role;
    }

    const nextId = resolveNextNodeId(workflow, currentId, state.verdict);
    if (!nextId) {
      // No outgoing edge from the current (completed) node → workflow finished.
      return null;
    }

    const nextState = states.get(nextId);
    if (!nextState) return null;

    if (!nextState.completedAt) {
      // Next node not yet run.
      return nextState.node.role;
    }

    // Both current and next are complete. Check if current ran *after* next
    // (which happens on a loopback — build re-runs after critic fails).
    const currentIsNewer =
      state.completedAt > nextState.completedAt ||
      (state.completedAt === nextState.completedAt && state.completionIndex > nextState.completionIndex);

    if (currentIsNewer) {
      // Current was completed after next — we're on a loopback path.
      // The next node needs to re-run.
      return nextState.node.role;
    }

    currentId = nextId;
  }

  return null;
}
