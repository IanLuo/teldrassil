import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../../stores/workflow-store';

describe('WorkflowVisualization', () => {
  beforeEach(() => {
    useWorkflowStore.setState(useWorkflowStore.getInitialState());
  });

  it('should convert history entries to nodes', () => {
    useWorkflowStore.getState().addHistoryEntry({
      node_id: 'bootstrap',
      status: 'completed',
      worker_id: 'kernel',
      artifact_ref: null,
    });
    useWorkflowStore.getState().addHistoryEntry({
      node_id: 'search',
      status: 'in_progress',
      worker_id: 'agent_a',
      artifact_ref: 'mem://v1/results?sig=abc',
    });

    const history = useWorkflowStore.getState().history;

    // Each history entry should become a node
    const nodes = history.map((entry, index) => ({
      id: entry.node_id,
      data: { label: `${entry.node_id}\n${entry.status}` },
      position: { x: 100, y: index * 100 },
      style: getNodeStyle(entry.status),
    }));

    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe('bootstrap');
    expect(nodes[0].data.label).toContain('completed');
    expect(nodes[1].id).toBe('search');
    expect(nodes[1].data.label).toContain('in_progress');
  });

  it('should create edges between sequential nodes', () => {
    useWorkflowStore.getState().addHistoryEntry({
      node_id: 'a',
      status: 'completed',
      worker_id: 'w1',
      artifact_ref: null,
    });
    useWorkflowStore.getState().addHistoryEntry({
      node_id: 'b',
      status: 'in_progress',
      worker_id: 'w2',
      artifact_ref: null,
    });

    const history = useWorkflowStore.getState().history;
    const edges = history.slice(1).map((entry, index) => ({
      id: `${history[index].node_id}-${entry.node_id}`,
      source: history[index].node_id,
      target: entry.node_id,
    }));

    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
  });

  it('should handle empty history (no nodes or edges)', () => {
    const history = useWorkflowStore.getState().history;
    expect(history).toHaveLength(0);

    const nodes = history.map((entry, index) => ({
      id: entry.node_id,
      data: { label: entry.node_id },
      position: { x: 100, y: index * 100 },
    }));

    expect(nodes).toHaveLength(0);
  });
});

function getNodeStyle(status: string) {
  const colors: Record<string, string> = {
    completed: '#4ade80',
    in_progress: '#facc15',
    failed: '#f87171',
    pending: '#94a3b8',
    rework: '#c084fc',
  };
  return {
    background: colors[status] || '#94a3b8',
    color: '#000',
    border: '2px solid #333',
    borderRadius: '8px',
    padding: '10px',
  };
}
