import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../../stores/workflow-store';

describe('HumanAttachModal', () => {
  beforeEach(() => {
    useWorkflowStore.setState(useWorkflowStore.getInitialState());
  });

  it('should start with modal hidden', () => {
    expect(useWorkflowStore.getState().attachModalActive).toBe(false);
    expect(useWorkflowStore.getState().attachModalNode).toBe('');
  });

  it('should trigger attach modal with node ID', () => {
    useWorkflowStore.getState().triggerAttachModal('evaluate');
    expect(useWorkflowStore.getState().attachModalActive).toBe(true);
    expect(useWorkflowStore.getState().attachModalNode).toBe('evaluate');
  });

  it('should dismiss attach modal', () => {
    useWorkflowStore.getState().triggerAttachModal('node_x');
    useWorkflowStore.getState().dismissAttachModal();
    expect(useWorkflowStore.getState().attachModalActive).toBe(false);
    expect(useWorkflowStore.getState().attachModalNode).toBe('');
  });

  it('should expose current node in attach context', () => {
    useWorkflowStore.getState().addHistoryEntry({
      node_id: 'code_fix',
      status: 'in_progress',
      worker_id: 'senior_coder',
      artifact_ref: null,
    });
    useWorkflowStore.getState().triggerAttachModal('code_fix');

    const state = useWorkflowStore.getState();
    expect(state.attachModalActive).toBe(true);
    expect(state.currentNode).toBe('code_fix');
  });
});
