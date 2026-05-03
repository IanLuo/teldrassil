import { describe, it, expect } from 'vitest';
// IStateManager will be created by this task
// @ts-expect-error - Interface not yet implemented
import type { IStateManager, StateEntry, StateRecord } from '../../src/core/IStateManager';

describe('IStateManager', () => {
  describe('interface contract', () => {
    it('should define StateEntry with required fields', () => {
      const entry: StateEntry = {
        node_id: 'node_1',
        status: 'completed',
        worker_id: 'worker_a',
        artifact_ref: 'mem://v1/research_report.pdf',
      };

      expect(entry.node_id).toBe('node_1');
      expect(entry.status).toBe('completed');
      expect(entry.worker_id).toBe('worker_a');
      expect(entry.artifact_ref).toBe('mem://v1/research_report.pdf');
    });

    it('should define StateRecord with session_id, current_node, and history', () => {
      const entry: StateEntry = {
        node_id: 'node_1',
        status: 'completed',
        worker_id: 'worker_a',
        artifact_ref: null,
      };
      const record: StateRecord = {
        session_id: 'session-001',
        current_node: 'node_1',
        history: [entry],
      };

      expect(record.session_id).toBe('session-001');
      expect(record.current_node).toBe('node_1');
      expect(record.history).toHaveLength(1);
      expect(record.history[0].node_id).toBe('node_1');
    });

    it('should allow artifact_ref to be null for nodes without artifacts', () => {
      const entry: StateEntry = {
        node_id: 'bootstrap',
        status: 'in_progress',
        worker_id: 'kernel',
        artifact_ref: null,
      };

      expect(entry.artifact_ref).toBeNull();
    });

    it('should enforce that mock object implements all IStateManager methods', () => {
      const mock: IStateManager = {
        name: 'MockState',
        version: '1.0.0',
        initialize: () => {},
        ping: async () => true,
        append: (entry: StateEntry) => {
          void entry;
        },
        getCurrentNode: (): string => 'node_1',
        getHistory: (): StateEntry[] => [],
        snapshot: (): void => {},
      };

      expect(mock.name).toBe('MockState');
      expect(mock.version).toBe('1.0.0');
      expect(typeof mock.append).toBe('function');
      expect(typeof mock.getCurrentNode).toBe('function');
      expect(typeof mock.getHistory).toBe('function');
      expect(typeof mock.snapshot).toBe('function');
    });

    it('should type-check that history is append-only (array of entries)', () => {
      const entries: StateEntry[] = [
        { node_id: 'n1', status: 'completed', worker_id: 'w1', artifact_ref: 'mem://a' },
        { node_id: 'n2', status: 'in_progress', worker_id: 'w2', artifact_ref: null },
      ];

      expect(entries).toHaveLength(2);
      // Verify chronological order is maintained (oldest first)
      expect(entries[0].node_id).toBe('n1');
      expect(entries[1].node_id).toBe('n2');
    });
  });

  describe('4KB payload constraint', () => {
    it('should accept entries under 4KB', () => {
      const entry: StateEntry = {
        node_id: 'node_1',
        status: 'completed',
        worker_id: 'worker_a',
        // artifact_ref is a URI pointer, never raw payload
        artifact_ref: 'mem://v1/data?sig=abc123',
      };

      const serialized = JSON.stringify(entry);
      expect(serialized.length).toBeLessThan(4096);
    });
  });
});
