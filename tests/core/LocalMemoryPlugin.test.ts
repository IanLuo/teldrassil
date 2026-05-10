import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMemoryPlugin } from '../../src/core/LocalMemoryPlugin';

describe('LocalMemoryPlugin', () => {
  function createPlugin(dek?: string) {
    return new LocalMemoryPlugin(dek || 'test-dek-32-bytes-key-material!!');
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

    it('should return null for a URI with invalid signature', () => {
      const plugin = createPlugin();
      const uri = 'mem://v1/never-stored?sig=tampered_hash' as any;

      expect(plugin.get(uri)).toBeNull();
    });

    it('should return null when signature is modified after put', () => {
      const plugin = createPlugin();
      const uri = plugin.put('sensitive', 'secret data');

      // Tamper with the signature
      const tampered = uri.replace(/sig=/, 'sig=tampered_') as any;
      expect(plugin.get(tampered)).toBeNull();
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
      expect(plugin.get(uri)).toEqual(data);
    });

    it('should isolate different sessions (different DEKs)', () => {
      const plugin1 = createPlugin('dek-session-alpha');
      const plugin2 = createPlugin('dek-session-beta');

      const uri = plugin1.put('shared-key', 'alpha-data');

      // plugin2 has different DEK — should fail signature validation
      expect(plugin2.get(uri)).toBeNull();
    });
  });

  describe('URI opaque key', () => {
    it('should not expose raw key in URI path', () => {
      const plugin = createPlugin();
      const uri = plugin.put('raw-key-should-not-leak', { data: 'secret' });
      // The URI path must NOT contain the raw key string
      expect(uri).not.toContain('raw-key-should-not-leak');
    });

    it('should use opaque safe ID in URI path', () => {
      const plugin = createPlugin();
      const uri = plugin.put('my-key', 'data');
      const pathSegment = uri.split('?sig=')[0].replace('mem://v1/', '');
      // The path segment must be an opaque identifier, not the raw key
      expect(pathSegment).not.toBe('my-key');
      // Should still match the expected URI format
      expect(uri).toMatch(/^mem:\/\/v1\/[^/]+\?sig=/);
    });

    it('should generate consistent opaque IDs for the same raw key', () => {
      const plugin = createPlugin();
      const uri1 = plugin.put('repeat-key', 'data1');
      const uri2 = plugin.put('repeat-key', 'data2');
      const path1 = uri1.split('?sig=')[0].replace('mem://v1/', '');
      const path2 = uri2.split('?sig=')[0].replace('mem://v1/', '');
      // Same raw key → same opaque safeKey in URI
      expect(path1).toBe(path2);
    });

    it('should generate different opaque IDs for different raw keys', () => {
      const plugin = createPlugin();
      const uri1 = plugin.put('key-alpha', 'data1');
      const uri2 = plugin.put('key-beta', 'data2');
      const path1 = uri1.split('?sig=')[0].replace('mem://v1/', '');
      const path2 = uri2.split('?sig=')[0].replace('mem://v1/', '');
      expect(path1).not.toBe(path2);
    });

    it('should retrieve payload using opaque URI', () => {
      const plugin = createPlugin();
      const payload = { name: 'opaque-test' };
      const uri = plugin.put('opaque-key', payload);
      expect(plugin.get(uri)).toEqual(payload);
    });

    it('should still validate signature with opaque URI', () => {
      const plugin = createPlugin();
      const uri = plugin.put('signed-opaque', 'value');
      expect(plugin.validateSignature(uri)).toBe(true);
    });

    it('should reject tampered opaque URI', () => {
      const plugin = createPlugin();
      const uri = plugin.put('tamper-test', 'secret');
      const tampered = uri.replace(/sig=/, 'sig=tampered_') as any;
      expect(plugin.get(tampered)).toBeNull();
    });
  });

  describe('validateSignature', () => {
    it('should return true for valid URI', () => {
      const plugin = createPlugin();
      const uri = plugin.put('check', 'value');
      expect(plugin.validateSignature(uri)).toBe(true);
    });

    it('should return false for URI without signature', () => {
      const plugin = createPlugin();
      expect(plugin.validateSignature('mem://v1/data' as any)).toBe(false);
    });

    it('should return false for empty URI', () => {
      const plugin = createPlugin();
      expect(plugin.validateSignature('' as any)).toBe(false);
    });
  });
});
