'use client';

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useWorkflowStore } from '../stores/workflow-store';

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  in_progress: '#facc15',
  completed: '#4ade80',
  failed: '#f87171',
  rework: '#c084fc',
};

function getNodeStyle(status: string): React.CSSProperties {
  return {
    background: STATUS_COLORS[status] || '#94a3b8',
    color: '#000',
    border: '2px solid #333',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontWeight: 600,
    width: 180,
    textAlign: 'center',
  };
}

export default function WorkflowVisualization() {
  const history = useWorkflowStore((s) => s.history);

  const nodes: Node[] = useMemo(
    () =>
      history.map((entry, index) => ({
        id: entry.node_id,
        data: {
          label: `${entry.node_id}\n${entry.status.replace('_', ' ')}\n${entry.worker_id}`,
        },
        position: { x: 100, y: index * 120 + 20 },
        style: getNodeStyle(entry.status),
      })),
    [history]
  );

  const edges: Edge[] = useMemo(
    () =>
      history.slice(1).map((entry, index) => ({
        id: `${history[index].node_id}→${entry.node_id}`,
        source: history[index].node_id,
        target: entry.node_id,
        animated: entry.status === 'in_progress',
        style: { stroke: '#64748b', strokeWidth: 2 },
      })),
    [history]
  );

  if (nodes.length === 0) {
    return (
      <div style={{ padding: 20, color: '#94a3b8', fontFamily: 'monospace' }}>
        No workflow history yet. Execute a task to see the visualization.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '500px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#1e293b" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => getNodeStyle(n.data?.status || 'pending').background as string}
          style={{ background: '#0f172a' }}
        />
      </ReactFlow>
    </div>
  );
}
