/**
 * StateManager — The "Immutable Flight Recorder."
 *
 * Stores metadata, node statuses, and artifact references (URIs).
 * NEVER stores raw payload data exceeding 4KB.
 * Append-only chronological record.
 *
 * @see docs/design.md §2.3 — Pointer-Payload Decoupling
 * @see docs/detailed-components.md §2 — State Manager
 */

/**
 * A single entry in the execution history.
 * Artifact references are URIs (pointers) — never raw payload.
 */
export interface StateEntry {
  /** The DAG node ID this entry corresponds to */
  node_id: string;
  /** Node execution status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rework';
  /** The worker (agent) that processed this node */
  worker_id: string;
  /**
   * URI reference to the artifact in Memory Engine.
   * Must be null if no artifact was produced.
   * Must be ≤4KB — this is a pointer, not payload storage.
   */
  artifact_ref: string | null;
}

/**
 * The full state record for a session.
 */
export interface StateRecord {
  /** Unique identifier for this project run */
  session_id: string;
  /** The currently active DAG node */
  current_node: string;
  /** Append-only stack of state transitions (oldest first) */
  history: StateEntry[];
}

/**
 * IStateManager — The kernel's "Ledger" plugin.
 *
 * Constraint: ALL payloads accepted by this interface MUST be ≤4KB.
 * Raw domain data belongs in the Memory Engine, not here.
 */
export interface IStateManager {
  /** Plugin identity — registered as "State" in the PluginRegistry */
  readonly name: string;
  readonly version?: string;

  /** Lifecycle: called when the plugin is registered */
  initialize: () => void;

  /** Health check for BootstrapSequence validation */
  ping?: () => Promise<boolean>;

  /** Lifecycle: called on kernel shutdown */
  shutdown?: () => void;

  /**
   * Append a new entry to the execution history.
   * The entry (as JSON) must not exceed 4KB.
   */
  append(entry: StateEntry): void;

  /** Get the ID of the currently active DAG node */
  getCurrentNode(): string;

  /** Get the full append-only history of state transitions */
  getHistory(): StateEntry[];

  /**
   * Persist the current state to disk.
   * Called after every event for SIGINT recovery.
   */
  snapshot(): void;
}
