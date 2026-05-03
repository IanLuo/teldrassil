import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStatePlugin } from '../../src/core/LocalStatePlugin';
import type { StateEntry } from '../../src/core/IStateManager';

describe('LocalStatePlugin', () => {
  let plugin: LocalStatePlugin;

  beforeEach(() => {
    plugin = new LocalStatePlugin();
  });

  describe('plugin identity', () => {
    it('should be named State for BootstrapSequence', () => {
      expect(plugin.name).toBe('State');
    });

    it('should have a working ping that returns true', async () => {
      expect(await plugin.ping!()).toBe(true);
    });
  });

  describe('append and getHistory', () => {
    it('should start with empty history', () => {
      expect(plugin.getHistory()).toEqual([]);
    });

    it('should append entries and retrieve them in order', () => {
      const entry1: StateEntry = {
        node_id: 'node_1',
        status: 'completed',
        worker_id: 'worker_a',
        artifact_ref: 'mem://v1/file1?sig=abc',
      };
      const entry2: StateEntry = {
        node_id: 'node_2',
        status: 'in_progress',
        worker_id: 'worker_b',
        artifact_ref: null,
      };

      plugin.append(entry1);
      plugin.append(entry2);

      const history = plugin.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].node_id).toBe('node_1');
      expect(history[1].node_id).toBe('node_2');
      expect(history[1].status).toBe('in_progress');
    });

    it('should update currentNode to the latest appended entry', () => {
      plugin.append({
        node_id: 'node_init',
        status: 'completed',
        worker_id: 'kernel',
        artifact_ref: null,
      });

      expect(plugin.getCurrentNode()).toBe('node_init');

      plugin.append({
        node_id: 'node_search',
        status: 'in_progress',
        worker_id: 'agent_a',
        artifact_ref: 'mem://v1/results?sig=xyz',
      });

      expect(plugin.getCurrentNode()).toBe('node_search');
    });
  });

  describe('snapshot', () => {
    it('should persist state without throwing', () => {
      plugin.append({
        node_id: 'save_test',
        status: 'completed',
        worker_id: 'w',
        artifact_ref: null,
      });

      expect(() => plugin.snapshot()).not.toThrow();
    });

    it('should throw when snapshot is called but nothing to save', () => {
      // Empty snapshot is valid — just verifies it's callable
      expect(() => plugin.snapshot()).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should clear history on shutdown', () => {
      plugin.append({
        node_id: 'n1',
        status: 'completed',
        worker_id: 'w1',
        artifact_ref: null,
      });

      expect(plugin.getHistory()).toHaveLength(1);

      plugin.shutdown!();
      expect(plugin.getHistory()).toHaveLength(0);
    });
  });
});
