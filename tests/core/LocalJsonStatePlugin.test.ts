import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalJsonStatePlugin } from '../../src/core/LocalJsonStatePlugin';
import type { StateEntry } from '../../src/core/IStateManager';

describe('LocalJsonStatePlugin', () => {
  let stateDir: string;
  let plugin: LocalJsonStatePlugin;

  beforeEach(() => {
    stateDir = path.join(os.tmpdir(), `teldrassil-test-${Date.now()}`);
  });

  afterEach(() => {
    if (fs.existsSync(stateDir)) {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  describe('plugin identity', () => {
    beforeEach(() => { plugin = new LocalJsonStatePlugin(stateDir); });

    it('should be named State for BootstrapSequence', () => {
      expect(plugin.name).toBe('State');
    });

    it('should have a working ping', async () => {
      expect(await plugin.ping!()).toBe(true);
    });
  });

  describe('disk persistence', () => {
    beforeEach(() => { plugin = new LocalJsonStatePlugin(stateDir); });

    it('should persist state to disk on snapshot', () => {
      plugin.append({ node_id: 'n1', status: 'completed', worker_id: 'w1', artifact_ref: null });
      plugin.snapshot();

      const stateFile = path.join(stateDir, 'state.json');
      expect(fs.existsSync(stateFile)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      expect(raw.history).toHaveLength(1);
      expect(raw.currentNode).toBe('n1');
    });

    it('should load existing state from disk on construction', () => {
      const p1 = new LocalJsonStatePlugin(stateDir);
      p1.append({ node_id: 'n1', status: 'completed', worker_id: 'w1', artifact_ref: null });
      p1.snapshot();

      const p2 = new LocalJsonStatePlugin(stateDir);
      expect(p2.getCurrentNode()).toBe('n1');
      expect(p2.getHistory()).toHaveLength(1);
    });

    it('should preserve append order after reload from disk', () => {
      const p1 = new LocalJsonStatePlugin(stateDir);
      p1.append({ node_id: 'a', status: 'completed', worker_id: 'w1', artifact_ref: null });
      p1.append({ node_id: 'b', status: 'in_progress', worker_id: 'w2', artifact_ref: null });
      p1.snapshot();

      const p2 = new LocalJsonStatePlugin(stateDir);
      const history = p2.getHistory();
      expect(history[0].node_id).toBe('a');
      expect(history[1].node_id).toBe('b');
    });

    it('should handle empty state on first run', () => {
      const p = new LocalJsonStatePlugin(stateDir);
      expect(p.getHistory()).toEqual([]);
      expect(p.getCurrentNode()).toBe('idle');
    });
  });

  describe('4KB pointer-only limit', () => {
    beforeEach(() => { plugin = new LocalJsonStatePlugin(stateDir); });

    it('should accept entries under 4KB', () => {
      expect(() => {
        plugin.append({
          node_id: 'valid',
          status: 'completed',
          worker_id: 'w1',
          artifact_ref: 'mem://v1/data?sig=abc',
        });
      }).not.toThrow();
    });

    it('should reject entries with artifact_ref exceeding 4KB', () => {
      const hugeRef = 'x'.repeat(5000);
      expect(() => {
        plugin.append({
          node_id: 'oversized',
          status: 'completed',
          worker_id: 'w1',
          artifact_ref: hugeRef,
        });
      }).toThrow();
    });
  });

  describe('shutdown', () => {
    it('should clear in-memory state and snapshot on shutdown', () => {
      plugin = new LocalJsonStatePlugin(stateDir);
      plugin.append({ node_id: 'n1', status: 'completed', worker_id: 'w1', artifact_ref: null });
      plugin.shutdown!();

      expect(plugin.getHistory()).toHaveLength(0);
    });
  });
});
