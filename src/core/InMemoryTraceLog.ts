import type { ITraceLog, TraceURI } from './ITraceLog';

/**
 * In-memory mock of the Trace Log for kernel bootstrap tests.
 * Registered as 'Trace' in the PluginRegistry.
 */
export class InMemoryTraceLog implements ITraceLog {
  readonly name = 'Trace';
  readonly version = '0.1.0-mock';

  private store = new Map<number, unknown>();
  private nextId = 0;

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.store.clear(); this.nextId = 0; };

  appendTrace(payload: unknown): TraceURI {
    const id = this.nextId++;
    this.store.set(id, payload);
    return `trace://v1/${id}` as TraceURI;
  }

  getTrace(uri: TraceURI): unknown | null {
    const match = uri.match(/^trace:\/\/v1\/(\d+)$/);
    if (!match) return null;
    const id = parseInt(match[1], 10);
    return this.store.get(id) ?? null;
  }
}
