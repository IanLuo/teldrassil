import { create } from 'zustand';

/**
 * DAG state entry matching the State Manager's schema.
 */
export interface DAGEntry {
  node_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rework';
  worker_id: string;
  artifact_ref: string | null;
}

interface DAGState {
  sessionId: string;
  currentNode: string;
  history: DAGEntry[];

  setSessionId: (id: string) => void;
  setCurrentNode: (nodeId: string) => void;
  addHistoryEntry: (entry: DAGEntry) => void;
}

export const useDAGStore = create<DAGState>((set) => ({
  sessionId: '',
  currentNode: 'idle',
  history: [],

  setSessionId: (id) => set({ sessionId: id }),
  setCurrentNode: (nodeId) => set({ currentNode: nodeId }),
  addHistoryEntry: (entry) =>
    set((state) => ({
      history: [...state.history, entry],
      currentNode: entry.node_id,
    })),
}));
