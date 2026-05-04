import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalJsonTracePlugin } from '../../src/core/LocalJsonTracePlugin';

describe('LocalJsonTracePlugin', () => {
  let traceDir: string;
  let plugin: LocalJsonTracePlugin;

  beforeEach(() => {
    traceDir = path.join(os.tmpdir(), `teldrassil-trace-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    if (fs.existsSync(traceDir)) {
      fs.rmSync(traceDir, { recursive: true, force: true });
    }
  });

  describe('plugin identity', () => {
    beforeEach(() => { plugin = new LocalJsonTracePlugin(traceDir); });

    it('should be named Trace for BootstrapSequence', () => {
      expect(plugin.name).toBe('Trace');
    });

    it('should have a working ping', async () => {
      expect(await plugin.ping!()).toBe(true);
    });
  });

  describe('appendTrace and getTrace', () => {
    beforeEach(() => { plugin = new LocalJsonTracePlugin(traceDir); });

    it('should append a trace and retrieve it by URI', () => {
      const payload = { type: 'RouteDecision', from: 'n1', to: 'n2' };
      const uri = plugin.appendTrace(payload);

      expect(uri).toBeTypeOf('string');
      expect(plugin.getTrace(uri)).toEqual(payload);
    });

    it('should return null for unknown URI', () => {
      expect(plugin.getTrace('trace://v1/nonexistent' as any)).toBeNull();
    });

    it('should preserve append order via URI sequence', () => {
      const uri1 = plugin.appendTrace({ step: 1 });
      const uri2 = plugin.appendTrace({ step: 2 });
      const uri3 = plugin.appendTrace({ step: 3 });

      expect(plugin.getTrace(uri1)).toEqual({ step: 1 });
      expect(plugin.getTrace(uri2)).toEqual({ step: 2 });
      expect(plugin.getTrace(uri3)).toEqual({ step: 3 });
    });

    it('should handle diverse payload types', () => {
      const stringPayload = 'raw log line';
      const numberPayload = 42;
      const arrayPayload = [{ finding: 'issue1' }, { finding: 'issue2' }];
      const nestedPayload = { llm_io: { input: 'prompt', output: 'response', tokens: 150 } };

      const uri1 = plugin.appendTrace(stringPayload);
      const uri2 = plugin.appendTrace(numberPayload);
      const uri3 = plugin.appendTrace(arrayPayload);
      const uri4 = plugin.appendTrace(nestedPayload);

      expect(plugin.getTrace(uri1)).toBe('raw log line');
      expect(plugin.getTrace(uri2)).toBe(42);
      expect(plugin.getTrace(uri3)).toEqual([{ finding: 'issue1' }, { finding: 'issue2' }]);
      expect(plugin.getTrace(uri4)).toEqual({ llm_io: { input: 'prompt', output: 'response', tokens: 150 } });
    });
  });

  describe('disk persistence', () => {
    it('should persist traces to disk on append', () => {
      plugin = new LocalJsonTracePlugin(traceDir);
      plugin.appendTrace({ step: 1 });

      const traceFile = path.join(traceDir, 'trace.json');
      expect(fs.existsSync(traceFile)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
      expect(raw.entries).toHaveLength(1);
      expect(raw.entries[0].payload).toEqual({ step: 1 });
    });

    it('should load existing traces from disk on construction', () => {
      const p1 = new LocalJsonTracePlugin(traceDir);
      const uri = p1.appendTrace({ step: 1 });

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri)).toEqual({ step: 1 });
    });

    it('should preserve all traces after reload from disk', () => {
      const p1 = new LocalJsonTracePlugin(traceDir);
      const uri1 = p1.appendTrace({ step: 'a' });
      const uri2 = p1.appendTrace({ step: 'b' });
      const uri3 = p1.appendTrace({ step: 'c' });

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri1)).toEqual({ step: 'a' });
      expect(p2.getTrace(uri2)).toEqual({ step: 'b' });
      expect(p2.getTrace(uri3)).toEqual({ step: 'c' });
    });

    it('should handle empty trace on first run', () => {
      plugin = new LocalJsonTracePlugin(traceDir);
      expect(plugin.getTrace('trace://v1/0' as any)).toBeNull();
    });
  });

  describe('corrupted data recovery', () => {
    it('should recover gracefully from corrupted trace file', () => {
      const traceFile = path.join(traceDir, 'trace.json');
      fs.mkdirSync(traceDir, { recursive: true });
      fs.writeFileSync(traceFile, 'not valid json{{{', 'utf8');

      plugin = new LocalJsonTracePlugin(traceDir);
      const uri = plugin.appendTrace({ step: 'fresh' });
      expect(plugin.getTrace(uri)).toEqual({ step: 'fresh' });
    });

    it('should recover from empty trace file', () => {
      const traceFile = path.join(traceDir, 'trace.json');
      fs.mkdirSync(traceDir, { recursive: true });
      fs.writeFileSync(traceFile, '', 'utf8');

      plugin = new LocalJsonTracePlugin(traceDir);
      const uri = plugin.appendTrace({ step: 'fresh' });
      expect(plugin.getTrace(uri)).toEqual({ step: 'fresh' });
    });
  });

  describe('shutdown', () => {
    it('should persist on shutdown and clear in-memory state', () => {
      plugin = new LocalJsonTracePlugin(traceDir);
      const uri = plugin.appendTrace({ step: 1 });
      plugin.shutdown!();

      expect(plugin.getTrace(uri)).toBeNull();
      expect(plugin.getTrace(uri)).toBeNull();

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri)).toEqual({ step: 1 });
    });
  });
});
