import { describe, it, expect } from 'vitest';
import type { IMemoryEngine, MemoryURI } from '../../src/core/IMemoryEngine';

describe('IMemoryEngine', () => {
  describe('MemoryURI format', () => {
    it('should be a string with mem:// scheme and HMAC signature', () => {
      const uri: MemoryURI = 'mem://v1/data?sig=abc123def456' as MemoryURI;
      expect(uri).toMatch(/^mem:\/\/.+/);
      expect(uri).toContain('?sig=');
    });
  });

  describe('interface contract', () => {
    it('should enforce that a mock implements all IMemoryEngine methods', () => {
      const mock: IMemoryEngine = {
        name: 'MockMemory',
        version: '1.0.0',
        initialize: () => {},
        ping: async () => true,
        put: (_key: string, _payload: unknown): MemoryURI => {
          return 'mem://v1/test?sig=mock' as MemoryURI;
        },
        get: (_uri: MemoryURI): unknown => {
          return { data: 'mock' };
        },
        validateSignature: (_uri: MemoryURI): boolean => {
          return true;
        },
      };

      expect(mock.name).toBe('MockMemory');
      expect(typeof mock.put).toBe('function');
      expect(typeof mock.get).toBe('function');
      expect(typeof mock.validateSignature).toBe('function');
    });

    it('should return a URI from put() that includes a signature', () => {
      const mock: IMemoryEngine = {
        name: 'MockMemory',
        initialize: () => {},
        put: () => 'mem://v1/artifact?sig=hmac123' as MemoryURI,
        get: () => null,
        validateSignature: () => true,
      };

      const uri = mock.put('key', 'payload');
      expect(uri).toContain('?sig=');
    });

    it('should allow get() to return null for missing artifacts', () => {
      const mock: IMemoryEngine = {
        name: 'MockMemory',
        initialize: () => {},
        put: () => 'mem://v1/x?sig=x' as MemoryURI,
        get: () => null,
        validateSignature: () => true,
      };

      expect(mock.get('mem://v1/missing?sig=bad' as MemoryURI)).toBeNull();
    });

    it('should reject URIs with invalid signatures via validateSignature', () => {
      const mock: IMemoryEngine = {
        name: 'MockMemory',
        initialize: () => {},
        put: () => 'mem://v1/valid?sig=good' as MemoryURI,
        get: () => null,
        validateSignature: (uri) => uri.includes('?sig=valid'),
      };

      expect(mock.validateSignature('mem://v1/data?sig=valid' as MemoryURI)).toBe(true);
      expect(mock.validateSignature('mem://v1/data?sig=tampered' as MemoryURI)).toBe(false);
    });

    it('should accept various payload types (string, object, Buffer)', () => {
      const stored: unknown[] = [];
      const mock: IMemoryEngine = {
        name: 'MockMemory',
        initialize: () => {},
        put: (_key, payload) => {
          stored.push(payload);
          return `mem://v1/x?sig=${stored.length}` as MemoryURI;
        },
        get: () => stored[0],
        validateSignature: () => true,
      };

      mock.put('text', 'hello');
      mock.put('json', { a: 1 });
      mock.put('binary', Buffer.from('data'));

      expect(stored).toHaveLength(3);
      expect(stored[0]).toBe('hello');
      expect(stored[1]).toEqual({ a: 1 });
    });
  });
});
