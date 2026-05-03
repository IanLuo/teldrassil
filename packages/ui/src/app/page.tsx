'use client';

import dynamic from 'next/dynamic';
import { useWorkflowStore } from '../stores/workflow-store';

const WorkflowVisualization = dynamic(
  () => import('../components/WorkflowVisualization'),
  { ssr: false }
);

export default function Home() {
  const { addHistoryEntry, setSessionId } = useWorkflowStore();

  function seedDemo() {
    setSessionId('demo-session-001');
    addHistoryEntry({ node_id: 'bootstrap', status: 'completed', worker_id: 'kernel', artifact_ref: null });
    addHistoryEntry({ node_id: 'manifest_load', status: 'completed', worker_id: 'parser', artifact_ref: null });
    addHistoryEntry({ node_id: 'supervisor_check', status: 'completed', worker_id: 'supervisor', artifact_ref: null });
    addHistoryEntry({ node_id: 'code_fix', status: 'in_progress', worker_id: 'senior_coder', artifact_ref: null });
    addHistoryEntry({ node_id: 'evaluate', status: 'pending', worker_id: 'reviewer', artifact_ref: null });
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '1rem' }}>
        <h1>🌳 Teldrassil</h1>
        <span style={{ color: '#64748b' }}>Supervised Workflow</span>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={seedDemo}
          style={{
            padding: '8px 16px',
            background: '#4ade80',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Run Demo Workflow
        </button>
      </div>

      <WorkflowVisualization />
    </main>
  );
}
