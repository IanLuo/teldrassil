'use client';

import { useWorkflowStore } from '../stores/workflow-store';

export default function HumanAttachModal() {
  const { attachModalActive, attachModalNode, dismissAttachModal } =
    useWorkflowStore();

  if (!attachModalActive) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: '2rem',
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ color: '#f87171', marginBottom: '1rem' }}>
          Human Attach Required
        </h2>
        <p style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
          The workflow has escalated at node:
        </p>
        <code
          style={{
            display: 'block',
            background: '#0f172a',
            padding: '0.5rem 1rem',
            borderRadius: 6,
            color: '#facc15',
            fontFamily: 'monospace',
            marginBottom: '1.5rem',
          }}
        >
          {attachModalNode || 'unknown'}
        </code>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          The system needs human oversight before proceeding. Review the
          current state in the shared workspace, then dismiss to continue.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={dismissAttachModal}
            style={{
              padding: '8px 20px',
              background: '#4ade80',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Done — Continue
          </button>
        </div>
      </div>
    </div>
  );
}
