import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../workflow-store';

describe('useWorkflowStore', () => {
  beforeEach(() => {
    useWorkflowStore.setState(useWorkflowStore.getInitialState());
  });

  describe('initial state', () => {
    it('should have empty session_id', () => {
      expect(useWorkflowStore.getState().sessionId).toBe('');
    });

    it('should have idle current_node', () => {
      expect(useWorkflowStore.getState().currentNode).toBe('idle');
    });

    it('should have empty history', () => {
      expect(useWorkflowStore.getState().history).toEqual([]);
    });
  });

  describe('actions', () => {
    it('should set session ID', () => {
      useWorkflowStore.getState().setSessionId('session-abc');
      expect(useWorkflowStore.getState().sessionId).toBe('session-abc');
    });

    it('should set current node', () => {
      useWorkflowStore.getState().setCurrentNode('node_search');
      expect(useWorkflowStore.getState().currentNode).toBe('node_search');
    });

    it('should add history entries in chronological order', () => {
      useWorkflowStore.getState().addHistoryEntry({
        node_id: 'node_1',
        status: 'in_progress',
        worker_id: 'worker_a',
        artifact_ref: null,
      });
      useWorkflowStore.getState().addHistoryEntry({
        node_id: 'node_2',
        status: 'completed',
        worker_id: 'worker_b',
        artifact_ref: 'mem://v1/data?sig=abc',
      });

      const history = useWorkflowStore.getState().history;
      expect(history).toHaveLength(2);
      expect(history[0].node_id).toBe('node_1');
      expect(history[1].node_id).toBe('node_2');
      expect(history[1].artifact_ref).toBe('mem://v1/data?sig=abc');
    });

    it('should support all status types', () => {
      const statuses: Array<'pending' | 'in_progress' | 'completed' | 'failed' | 'rework'> = [
        'pending', 'in_progress', 'completed', 'failed', 'rework',
      ];

      for (const status of statuses) {
        useWorkflowStore.getState().addHistoryEntry({
          node_id: `node_${status}`,
          status,
          worker_id: 'w',
          artifact_ref: null,
        });
      }

      expect(useWorkflowStore.getState().history).toHaveLength(5);
    });

    it('should sync setCurrentNode with latest addHistoryEntry', () => {
      useWorkflowStore.getState().addHistoryEntry({
        node_id: 'node_init',
        status: 'completed',
        worker_id: 'kernel',
        artifact_ref: null,
      });

      expect(useWorkflowStore.getState().currentNode).toBe('node_init');
    });
  });
});
