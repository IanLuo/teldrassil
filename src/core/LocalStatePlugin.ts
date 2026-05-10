import type { IStateManager, StateEntry } from './IStateManager';

/**
 * LocalStatePlugin — JSON-file-based State Manager for local development.
 *
 * Maintains an append-only execution log in memory with disk snapshot support.
 * Implements the pointer-payload boundary: stores metadata (URIs, not raw data).
 *
 * @see docs/design.md §2.3 — Pointer-Payload Decoupling
 * @see docs/detailed-components.md §2 — State Manager
 */
export class LocalStatePlugin implements IStateManager {
  readonly name = 'State';
  readonly version = '0.1.0';
  readonly kind = 'state' as const;

  private entries: StateEntry[] = [];
  private currentNode = 'idle';

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {
    this.entries = [];
    this.currentNode = 'idle';
  };

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
    // In production, writes state to disk for SIGINT recovery.
    // For local dev, this is a no-op — state lives in memory.
  }
}
