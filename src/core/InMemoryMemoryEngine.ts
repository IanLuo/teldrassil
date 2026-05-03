import type { IMemoryEngine, MemoryURI, MemoryEntryMetadata } from './IMemoryEngine';

/**
 * In-memory mock of the Memory Engine for kernel bootstrap tests.
 * Registered as 'Memory' in the PluginRegistry.
 */
export class InMemoryMemoryEngine implements IMemoryEngine {
  readonly name = 'Memory';
  readonly version = '0.1.0-mock';

  private store = new Map<string, unknown>();

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.store.clear(); };

  put(key: string, payload: unknown, _metadata?: MemoryEntryMetadata): MemoryURI {
    this.store.set(key, payload);
    return `mem://v1/${key}?sig=mock` as MemoryURI;
  }

  get(uri: MemoryURI): unknown {
    if (!this.validateSignature(uri)) return null;
    const key = uri.split('?sig=')[0].replace('mem://v1/', '');
    return this.store.get(key) ?? null;
  }

  validateSignature(uri: MemoryURI): boolean {
    return uri.includes('?sig=mock');
  }
}
