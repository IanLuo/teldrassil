import crypto from 'crypto';
import type { IMemoryEngine, MemoryURI, MemoryEntryMetadata } from './IMemoryEngine';

/**
 * In-memory mock of the Memory Engine for kernel bootstrap tests.
 * Registered as 'Memory' in the PluginRegistry.
 */
export class InMemoryMemoryEngine implements IMemoryEngine {
  readonly name = 'Memory';
  readonly version = '0.1.0-mock';
  readonly kind = 'memory' as const;

  private store = new Map<string, unknown>();

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.store.clear(); };

  put(key: string, payload: unknown, _metadata?: MemoryEntryMetadata): MemoryURI {
    this.store.set(key, payload);
    const safeKey = this.safeId(key);
    return `mem://v1/${safeKey}?sig=mock` as MemoryURI;
  }

  get(uri: MemoryURI): unknown {
    if (!this.validateSignature(uri)) return null;
    const safeKey = uri.split('?sig=')[0].replace('mem://v1/', '');
    // Iterate store keys to find matching safeKey-to-rawKey mapping
    for (const [rawKey, value] of this.store) {
      if (this.safeId(rawKey) === safeKey) {
        return value;
      }
    }
    return null;
  }

  validateSignature(uri: MemoryURI): boolean {
    return uri.includes('?sig=mock');
  }

  private safeId(key: string): string {
    return crypto.createHash('sha256').update(key).digest('base64url').slice(0, 16);
  }
}
