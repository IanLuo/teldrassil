import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalFileMemoryPlugin } from '../../src/core/LocalFileMemoryPlugin';
import type { MemoryURI } from '../../src/core/IMemoryEngine';

describe('LocalFileMemoryPlugin', () => {
  let memoryDir: string;
  const dek = 'test-dek-32-bytes-key-material!!';
  const sessionA = 'session-alpha';
  const sessionB = 'session-beta';

  beforeEach(() => {
    memoryDir = path.join(os.tmpdir(), `teldrassil-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    if (fs.existsSync(memoryDir)) {
      fs.rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  function createPlugin(sessionId?: string): LocalFileMemoryPlugin {
    return new LocalFileMemoryPlugin(memoryDir, dek, sessionId ?? sessionA);
  }

  describe('plugin identity', () => {
    it('should be named Memory for BootstrapSequence', () => {
      const plugin = createPlugin();
      expect(plugin.name).toBe('Memory');
    });

    it('should have a working ping that returns true', async () => {
      const plugin = createPlugin();
      expect(await plugin.ping!()).toBe(true);
    });
  });

  describe('put and get', () => {
    it('should persist a payload and return a signed MemoryURI', () => {
      const plugin = createPlugin();
      const uri = plugin.put('test-key', { data: 'hello' });

      expect(uri).toContain('mem://');
      expect(uri).toContain('?sig=');
    });

    it('should retrieve the original payload by signed URI', () => {
      const plugin = createPlugin();
      const payload = { name: 'research', results: [1, 2, 3] };

      const uri = plugin.put('research-1', payload);
      const retrieved = plugin.get(uri);

      expect(retrieved).toEqual(payload);
    });

    it('should store and retrieve string payloads', () => {
      const plugin = createPlugin();
      const uri = plugin.put('doc', 'plain text document');
      expect(plugin.get(uri)).toBe('plain text document');
    });

    it('should store and retrieve Buffer payloads', () => {
      const plugin = createPlugin();
      const data = Buffer.from('binary data');
      const uri = plugin.put('binary', data);
      const retrieved = plugin.get(uri);
      expect(Buffer.isBuffer(retrieved)).toBe(true);
      expect(retrieved).toEqual(data);
    });

    it('should store and retrieve numeric payloads', () => {
      const plugin = createPlugin();
      const uri = plugin.put('count', 42);
      expect(plugin.get(uri)).toBe(42);
    });

    it('should store and retrieve array payloads', () => {
      const plugin = createPlugin();
      const payload = [1, 'two', { three: true }];
      const uri = plugin.put('mixed', payload);
      expect(plugin.get(uri)).toEqual(payload);
    });
  });

  describe('disk persistence', () => {
    it('should write a file to disk on put', () => {
      const plugin = createPlugin();
      plugin.put('persisted', 'data-on-disk');

      const sessionDir = path.join(memoryDir, sessionA);
      const files = fs.readdirSync(sessionDir);
      expect(files.length).toBe(1);
    });

    it('should survive plugin re-creation (same params)', () => {
      const p1 = createPlugin();
      const payload = { alive: true, count: 100 };
      const uri = p1.put('survivor', payload);

      const p2 = new LocalFileMemoryPlugin(memoryDir, dek, sessionA);
      expect(p2.get(uri)).toEqual(payload);
    });

    it('should preserve multiple entries across re-creation', () => {
      const p1 = createPlugin();
      const uri1 = p1.put('first', 'alpha');
      const uri2 = p1.put('second', 'beta');

      const p2 = new LocalFileMemoryPlugin(memoryDir, dek, sessionA);
      expect(p2.get(uri1)).toBe('alpha');
      expect(p2.get(uri2)).toBe('beta');
    });

    it('should create the memory directory and session subdirectory on first use', () => {
      const plugin = createPlugin();
      plugin.put('init', 'hello');

      const sessionDir = path.join(memoryDir, sessionA);
      expect(fs.existsSync(memoryDir)).toBe(true);
      expect(fs.existsSync(sessionDir)).toBe(true);
    });
  });

  describe('session isolation', () => {
    it('should isolate storage between different sessions', () => {
      const dekA = 'dek-session-alpha-32bytes-key!!';
      const dekB = 'dek-session-beta-32bytes-key!!!';
      const pA = new LocalFileMemoryPlugin(memoryDir, dekA, sessionA);
      const pB = new LocalFileMemoryPlugin(memoryDir, dekB, sessionB);

      const uriFromA = pA.put('shared-key', 'data-from-alpha');

      // pB has different DEK — should not pass signature validation
      expect(pB.validateSignature(uriFromA)).toBe(false);
      expect(pB.get(uriFromA)).toBeNull();
    });

    it('should allow same key in different sessions', () => {
      const dekA = 'dek-session-alpha-32bytes-key!!';
      const dekB = 'dek-session-beta-32bytes-key!!!';
      const pA = new LocalFileMemoryPlugin(memoryDir, dekA, sessionA);
      const pB = new LocalFileMemoryPlugin(memoryDir, dekB, sessionB);

      const uriA = pA.put('same-key', 'alpha-value');
      const uriB = pB.put('same-key', 'beta-value');

      expect(pA.get(uriA)).toBe('alpha-value');
      expect(pB.get(uriB)).toBe('beta-value');
      // Cross-read should fail — different DEKs produce different signatures
      expect(pA.validateSignature(uriB)).toBe(false);
      expect(pB.validateSignature(uriA)).toBe(false);
      expect(pA.get(uriB)).toBeNull();
      expect(pB.get(uriA)).toBeNull();
    });
  });

  describe('signature validation', () => {
    it('should return null for a URI with tampered signature', () => {
      const plugin = createPlugin();
      const uri = plugin.put('sensitive', 'secret data');

      const tampered = uri.replace(/sig=/, 'sig=tampered_') as MemoryURI;
      expect(plugin.get(tampered)).toBeNull();
    });

    it('should return null for a URI without signature', () => {
      const plugin = createPlugin();
      expect(plugin.get('mem://v1/data' as MemoryURI)).toBeNull();
    });

    it('should validate a valid URI as true', () => {
      const plugin = createPlugin();
      const uri = plugin.put('check', 'value');
      expect(plugin.validateSignature(uri)).toBe(true);
    });

    it('should return false for empty URI', () => {
      const plugin = createPlugin();
      expect(plugin.validateSignature('' as MemoryURI)).toBe(false);
    });

    it('should return false for URI without ?sig= segment', () => {
      const plugin = createPlugin();
      expect(plugin.validateSignature('mem://v1/data' as MemoryURI)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return null for a non-existent key', () => {
      const plugin = createPlugin();
      const uri = plugin.put('real', 'value');
      // Use same signature scheme but different key
      const sig = uri.split('?sig=')[1];
      const fakeUri = `mem://v1/fake-key?sig=${sig}` as MemoryURI;
      expect(plugin.get(fakeUri)).toBeNull();
    });

    it('should handle directory traversal attempts in keys', () => {
      const plugin = createPlugin();
      const uri = plugin.put('../../etc/passwd', 'evil');

      // Should not write outside session dir
      const files = fs.readdirSync(path.join(memoryDir, sessionA));
      expect(files.length).toBe(1);
      // Key is hashed, so no traversal
      const fileName = files[0];
      expect(fileName).not.toContain('..');
      expect(fileName).not.toContain('/');

      // And the payload should still be retrievable
      expect(plugin.get(uri)).toBe('evil');
    });

    it('should handle payloads with special characters in key', () => {
      const plugin = createPlugin();
      const uri = plugin.put('key/with:special*chars?and&more', 'still works');
      expect(plugin.get(uri)).toBe('still works');
    });

    it('should return null when file is missing from disk', () => {
      const plugin = createPlugin();
      const uri = plugin.put('temp', 'will be deleted');

      // Manually delete the file to simulate missing entry
      const files = fs.readdirSync(path.join(memoryDir, sessionA));
      fs.rmSync(path.join(memoryDir, sessionA, files[0]));
      expect(plugin.get(uri)).toBeNull();
    });

    it('should return null when file contains corrupt data', () => {
      const plugin = createPlugin();
      const uri = plugin.put('corrupt-me', 'original');

      const files = fs.readdirSync(path.join(memoryDir, sessionA));
      const filePath = path.join(memoryDir, sessionA, files[0]);
      fs.writeFileSync(filePath, 'not valid json');

      expect(plugin.get(uri)).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should not prevent disk data from being read by a new instance', () => {
      const plugin = createPlugin();
      const uri = plugin.put('before-shutdown', 'data');
      expect(plugin.get(uri)).toBe('data');

      plugin.shutdown!();
      // Disk data persists across plugin lifecycles
      const p2 = new LocalFileMemoryPlugin(memoryDir, dek, sessionA);
      expect(p2.get(uri)).toBe('data');
    });
  });
});
