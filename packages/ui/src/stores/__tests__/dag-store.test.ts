import { describe, it, expect, beforeEach } from 'vitest';
import { useDAGStore } from '../../../src/stores/dag-store';

describe('useDAGStore', () => {
  beforeEach(() => {
    useDAGStore.setState(useDAGStore.getInitialState());
  });

  describe('initial state', () => {
    it('should have empty session_id', () => {
      expect(useDAGStore.getState().sessionId).toBe('');
    });

    it('should have idle current_node', () => {
      expect(useDAGStore.getState().currentNode).toBe('idle');
    });

    it('should have empty history', () => {
      expect(useDAGStore.getState().history).toEqual([]);
    });
  });

  describe('actions', () => {
    it('should set session ID', () => {
      useDAGStore.getState().setSessionId('session-abc');
      expect(useDAGStore.getState().sessionId).toBe('session-abc');
    });

    it('should set current node', () => {
      useDAGStore.getState().setCurrentNode('node_search');
      expect(useDAGStore.getState().currentNode).toBe('node_search');
    });

    it('should add history entries in chronological order', () => {
      useDAGStore.getState().addHistoryEntry({
        node_id: 'node_1',
        status: 'in_progress',
        worker_id: 'worker_a',
        artifact_ref: null,
      });
      useDAGStore.getState().addHistoryEntry({
        node_id: 'node_2',
        status: 'completed',
        worker_id: 'worker_b',
        artifact_ref: 'mem://v1/data?sig=abc',
      });

      const history = useDAGStore.getState().history;
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
        useDAGStore.getState().addHistoryEntry({
          node_id: `node_${status}`,
          status,
          worker_id: 'w',
          artifact_ref: null,
        });
      }

      expect(useDAGStore.getState().history).toHaveLength(5);
    });

    it('should sync setCurrentNode with latest addHistoryEntry', () => {
      useDAGStore.getState().addHistoryEntry({
        node_id: 'node_init',
        status: 'completed',
        worker_id: 'kernel',
        artifact_ref: null,
      });

      expect(useDAGStore.getState().currentNode).toBe('node_init');
    });
  });
});
