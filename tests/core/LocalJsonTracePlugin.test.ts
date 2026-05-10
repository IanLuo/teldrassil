import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalJsonTracePlugin } from '../../src/core/LocalJsonTracePlugin';
import { createTraceEnvelope } from '../../src/core/ITraceLog';

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
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { from: 'n1', to: 'n2' });
      const uri = plugin.appendTrace(envelope);

      expect(uri).toBeTypeOf('string');
      expect(plugin.getTrace(uri)).toEqual(envelope);
    });

    it('should return null for unknown URI', () => {
      expect(plugin.getTrace('trace://v1/nonexistent' as any)).toBeNull();
    });

    it('should preserve append order via URI sequence', () => {
      const e1 = createTraceEnvelope('custom', 's1', 'session-1', { step: 1 });
      const e2 = createTraceEnvelope('custom', 's2', 'session-1', { step: 2 });
      const e3 = createTraceEnvelope('custom', 's3', 'session-1', { step: 3 });

      const uri1 = plugin.appendTrace(e1);
      const uri2 = plugin.appendTrace(e2);
      const uri3 = plugin.appendTrace(e3);

      expect(plugin.getTrace(uri1)).toEqual(e1);
      expect(plugin.getTrace(uri2)).toEqual(e2);
      expect(plugin.getTrace(uri3)).toEqual(e3);
    });

    it('should handle diverse payload types', () => {
      const e1 = createTraceEnvelope('custom', 'n1', 'session-1', 'raw log line');
      const e2 = createTraceEnvelope('custom', 'n2', 'session-1', 42);
      const e3 = createTraceEnvelope('gate_finding', 'n3', 'session-1', [{ finding: 'issue1' }, { finding: 'issue2' }]);
      const e4 = createTraceEnvelope('llm_io', 'n4', 'session-1', { input: 'prompt', output: 'response', tokens: 150 });

      const uri1 = plugin.appendTrace(e1);
      const uri2 = plugin.appendTrace(e2);
      const uri3 = plugin.appendTrace(e3);
      const uri4 = plugin.appendTrace(e4);

      expect(plugin.getTrace(uri1)).toEqual(e1);
      expect(plugin.getTrace(uri2)).toEqual(e2);
      expect(plugin.getTrace(uri3)).toEqual(e3);
      expect(plugin.getTrace(uri4)).toEqual(e4);
    });
  });

  describe('disk persistence', () => {
    it('should persist traces to disk on append', () => {
      plugin = new LocalJsonTracePlugin(traceDir);
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { step: 1 });
      plugin.appendTrace(envelope);

      const traceFile = path.join(traceDir, 'trace.json');
      expect(fs.existsSync(traceFile)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
      expect(raw.entries).toHaveLength(1);
      expect(raw.entries[0].envelope.payload).toEqual({ step: 1 });
    });

    it('should load existing traces from disk on construction', () => {
      const p1 = new LocalJsonTracePlugin(traceDir);
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { step: 1 });
      const uri = p1.appendTrace(envelope);

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri)).toEqual(envelope);
    });

    it('should preserve all traces after reload from disk', () => {
      const p1 = new LocalJsonTracePlugin(traceDir);
      const e1 = createTraceEnvelope('custom', 's1', 'session-1', { step: 'a' });
      const e2 = createTraceEnvelope('custom', 's2', 'session-1', { step: 'b' });
      const e3 = createTraceEnvelope('custom', 's3', 'session-1', { step: 'c' });

      const uri1 = p1.appendTrace(e1);
      const uri2 = p1.appendTrace(e2);
      const uri3 = p1.appendTrace(e3);

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri1)).toEqual(e1);
      expect(p2.getTrace(uri2)).toEqual(e2);
      expect(p2.getTrace(uri3)).toEqual(e3);
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
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { step: 'fresh' });
      const uri = plugin.appendTrace(envelope);
      expect(plugin.getTrace(uri)).toEqual(envelope);
    });

    it('should recover from empty trace file', () => {
      const traceFile = path.join(traceDir, 'trace.json');
      fs.mkdirSync(traceDir, { recursive: true });
      fs.writeFileSync(traceFile, '', 'utf8');

      plugin = new LocalJsonTracePlugin(traceDir);
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { step: 'fresh' });
      const uri = plugin.appendTrace(envelope);
      expect(plugin.getTrace(uri)).toEqual(envelope);
    });
  });

  describe('shutdown', () => {
    it('should persist on shutdown and clear in-memory state', () => {
      plugin = new LocalJsonTracePlugin(traceDir);
      const envelope = createTraceEnvelope('custom', 'n1', 'session-1', { step: 1 });
      const uri = plugin.appendTrace(envelope);
      plugin.shutdown!();

      expect(plugin.getTrace(uri)).toBeNull();
      expect(plugin.getTrace(uri)).toBeNull();

      const p2 = new LocalJsonTracePlugin(traceDir);
      expect(p2.getTrace(uri)).toEqual(envelope);
    });
  });
});
