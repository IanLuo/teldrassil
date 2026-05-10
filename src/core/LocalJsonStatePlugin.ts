import fs from 'fs';
import path from 'path';
import type { IStateManager, StateEntry } from './IStateManager';

interface PersistedState {
  sessionId: string;
  currentNode: string;
  history: StateEntry[];
}

const MAX_PAYLOAD_BYTES = 4096;

/**
 * LocalJsonStatePlugin — Disk-persistent State Manager.
 *
 * Stores the execution ledger as JSON at `/.teldrassil/state/state.json`.
 * Enforces the strict 4KB pointer-only limit on artifact_ref.
 *
 * @see docs/design.md §2.3 — Pointer-Payload Decoupling
 */
export class LocalJsonStatePlugin implements IStateManager {
  readonly name = 'State';
  readonly version = '0.2.0';

  private stateDir: string;
  private stateFile: string;
  private state: PersistedState;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.stateFile = path.join(stateDir, 'state.json');
    this.state = this.load();
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {
    this.snapshot();
    this.state = { sessionId: '', currentNode: 'idle', history: [] };
  };

  append(entry: StateEntry): void {
    // Enforce 4KB pointer-only limit
    if (entry.artifact_ref && Buffer.byteLength(entry.artifact_ref, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `State Manager rejects entries >4KB. artifact_ref is ${Buffer.byteLength(entry.artifact_ref, 'utf8')} bytes. ` +
        `Store raw payload in the Memory Engine and pass a URI pointer here.`
      );
    }

    this.state.history.push(entry);
    this.state.currentNode = entry.node_id;
  }

  getCurrentNode(): string {
    return this.state.currentNode;
  }

  getHistory(): StateEntry[] {
    return [...this.state.history];
  }

  snapshot(): void {
    this.save();
  }

  private load(): PersistedState {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }

    if (fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(raw) as PersistedState;
      } catch {
        // Corrupted state — start fresh
      }
    }

    return { sessionId: '', currentNode: 'idle', history: [] };
  }

  private save(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
  }
}
