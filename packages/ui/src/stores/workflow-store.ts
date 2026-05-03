import { create } from 'zustand';

/**
 * Workflow state entry matching the State Manager's schema.
 */
export interface WorkflowEntry {
  node_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rework';
  worker_id: string;
  artifact_ref: string | null;
}

interface WorkflowState {
  sessionId: string;
  currentNode: string;
  history: WorkflowEntry[];
  attachModalActive: boolean;
  attachModalNode: string;

  setSessionId: (id: string) => void;
  setCurrentNode: (nodeId: string) => void;
  addHistoryEntry: (entry: WorkflowEntry) => void;
  triggerAttachModal: (nodeId: string) => void;
  dismissAttachModal: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  sessionId: '',
  currentNode: 'idle',
  history: [],
  attachModalActive: false,
  attachModalNode: '',

  setSessionId: (id) => set({ sessionId: id }),
  setCurrentNode: (nodeId) => set({ currentNode: nodeId }),
  addHistoryEntry: (entry) =>
    set((state) => ({
      history: [...state.history, entry],
      currentNode: entry.node_id,
    })),
  triggerAttachModal: (nodeId) =>
    set({ attachModalActive: true, attachModalNode: nodeId }),
  dismissAttachModal: () =>
    set({ attachModalActive: false, attachModalNode: '' }),
}));
