import type { IStateManager, StateEntry } from './IStateManager';

/**
 * In-memory mock of the State Manager for kernel bootstrap tests.
 * Registered as 'State' in the PluginRegistry.
 */
export class InMemoryStateManager implements IStateManager {
  readonly name = 'State';
  readonly version = '0.1.0-mock';
  readonly kind = 'state' as const;

  private entries: StateEntry[] = [];
  private currentNode = 'idle';

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.entries = []; };

  append(entry: StateEntry): void {
    this.entries.push(entry);
    this.currentNode = entry.node_id;
  }

  getCurrentNode(): string {
    return this.currentNode;
  }

  getHistory(): StateEntry[] {
    return [...this.entries];
  }

  snapshot(): void {
    // no-op for in-memory mock
  }
}
