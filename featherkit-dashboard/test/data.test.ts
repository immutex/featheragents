import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FK_DATA, type Memory, type Entity, type MemoryEdge, type MemoryType, type MemoryScope, type EdgeType } from '@/data/mock';

function expectNoConsoleErrors(fn: () => void) {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...args: any[]) => errors.push(args.join(' '));
  fn();
  console.error = orig;
  expect(errors).toEqual([]);
}

describe('FK_DATA mock integrity', () => {
  it('has all required top-level keys', () => {
    expect(FK_DATA).toHaveProperty('orchestrator');
    expect(FK_DATA).toHaveProperty('stats');
    expect(FK_DATA).toHaveProperty('agents');
    expect(FK_DATA).toHaveProperty('tasks');
    expect(FK_DATA).toHaveProperty('projects');
    expect(FK_DATA).toHaveProperty('connections');
    expect(FK_DATA).toHaveProperty('mcpServers');
    expect(FK_DATA).toHaveProperty('skills');
    expect(FK_DATA).toHaveProperty('events');
    expect(FK_DATA).toHaveProperty('workflowNodes');
    expect(FK_DATA).toHaveProperty('workflowEdges');
    expect(FK_DATA).toHaveProperty('memories');
    expect(FK_DATA).toHaveProperty('entities');
    expect(FK_DATA).toHaveProperty('memoryEdges');
  });

  it('has at least one active task', () => {
    const active = FK_DATA.tasks.filter(t => t.status === 'active');
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least one project with pending input', () => {
    const withPending = FK_DATA.projects.filter(p => p.pendingInputs.length > 0);
    expect(withPending.length).toBeGreaterThanOrEqual(1);
  });

  it('has agents with valid role colors', () => {
    const validColors = ['frame', 'build', 'critic', 'sync', 'accent'];
    FK_DATA.agents.forEach(a => {
      expect(validColors).toContain(a.roleColor);
    });
  });

  it('workflow edges reference existing nodes', () => {
    const nodeIds = new Set(FK_DATA.workflowNodes.map(n => n.id));
    FK_DATA.workflowEdges.forEach(e => {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    });
  });
});

describe('Memory data integrity', () => {
  it('all memories have required fields', () => {
    FK_DATA.memories.forEach((m: Memory) => {
      expect(m.id).toBeTruthy();
      expect(m.type).toBeTruthy();
      expect(m.scope).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.content).toBeTruthy();
      expect(typeof m.salience).toBe('number');
      expect(typeof m.confidence).toBe('number');
      expect(m.salience).toBeGreaterThanOrEqual(0);
      expect(m.salience).toBeLessThanOrEqual(1);
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('memory types are valid', () => {
    const validTypes: MemoryType[] = ['semantic', 'episodic', 'procedural', 'summary'];
    FK_DATA.memories.forEach((m: Memory) => {
      expect(validTypes).toContain(m.type);
    });
  });

  it('memory scopes are valid', () => {
    const validScopes: MemoryScope[] = ['global', 'user', 'workspace', 'repo', 'branch', 'agent', 'model_role', 'session'];
    FK_DATA.memories.forEach((m: Memory) => {
      expect(validScopes).toContain(m.scope);
    });
  });

  it('memory entity references exist in entities array', () => {
    const entityIds = new Set(FK_DATA.entities.map((e: Entity) => e.id));
    FK_DATA.memories.forEach((m: Memory) => {
      m.entityIds.forEach(eid => {
        expect(entityIds.has(eid)).toBe(true);
      });
    });
  });

  it('memory edge references exist', () => {
    const allIds = new Set([
      ...FK_DATA.memories.map((m: Memory) => m.id),
      ...FK_DATA.entities.map((e: Entity) => e.id),
    ]);
    FK_DATA.memoryEdges.forEach((e: MemoryEdge) => {
      expect(allIds.has(e.fromId)).toBe(true);
      expect(allIds.has(e.toId)).toBe(true);
    });
  });

  it('edge types are valid', () => {
    const validTypes: EdgeType[] = ['about', 'related_to', 'depends_on', 'caused_by', 'resolved_by', 'derived_from', 'uses_tool', 'preferred_for', 'belongs_to_scope', 'supersedes', 'contradicts'];
    FK_DATA.memoryEdges.forEach((e: MemoryEdge) => {
      expect(validTypes).toContain(e.edgeType);
    });
  });

  it('supersede chains reference valid memories', () => {
    const memoryIds = new Set(FK_DATA.memories.map((m: Memory) => m.id));
    FK_DATA.memories.forEach((m: Memory) => {
      if (m.supersedesMemoryId) {
        expect(memoryIds.has(m.supersedesMemoryId)).toBe(true);
      }
    });
  });

  it('has at least one supersede chain', () => {
    const superseding = FK_DATA.memories.filter((m: Memory) => m.supersedesMemoryId);
    expect(superseding.length).toBeGreaterThanOrEqual(1);
  });

  it('has all four memory types represented', () => {
    const types = new Set(FK_DATA.memories.map((m: Memory) => m.type));
    expect(types.has('semantic')).toBe(true);
    expect(types.has('episodic')).toBe(true);
    expect(types.has('procedural')).toBe(true);
    expect(types.has('summary')).toBe(true);
  });

  it('entity kinds are valid', () => {
    const validKinds = ['repo', 'file', 'function', 'package', 'issue', 'tool', 'model', 'agent', 'concept', 'preference'];
    FK_DATA.entities.forEach((e: Entity) => {
      expect(validKinds).toContain(e.kind);
    });
  });
});

describe('Project data integrity', () => {
  it('all projects have tasks', () => {
    FK_DATA.projects.forEach(p => {
      expect(p.tasks.length).toBeGreaterThan(0);
    });
  });

  it('all projects have verification tools', () => {
    FK_DATA.projects.forEach(p => {
      expect(p.verificationTools.length).toBeGreaterThan(0);
    });
  });

  it('pending inputs have agent references', () => {
    const agentIds = new Set(FK_DATA.agents.map(a => a.id));
    FK_DATA.projects.forEach(p => {
      p.pendingInputs.forEach(inp => {
        expect(agentIds.has(inp.agentId)).toBe(true);
      });
    });
  });

  it('pending inputs have options array', () => {
    FK_DATA.projects.forEach(p => {
      p.pendingInputs.forEach(inp => {
        if (inp.options) {
          expect(Array.isArray(inp.options)).toBe(true);
          expect(inp.options.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
