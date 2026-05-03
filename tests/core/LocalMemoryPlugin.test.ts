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
