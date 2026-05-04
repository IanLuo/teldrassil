/**
 * TraceLog — The "Flight Recorder" for observability.
 *
 * Stores ephemeral routing metadata, GateFinding[] arrays, and raw LLM I/O.
 * Append-only store — prevents Memory Engine pollution with heavy trace data.
 *
 * @see docs/design.md §2.1, §2.3 — Vital Plugins, Tripartite Data Model
 * @see docs/detailed-components.md §4 — Trace Log
 */

/**
 * A Trace Log URI referencing a stored trace entry.
 * Format: trace://v1/<id>
 */
export type TraceURI = string & { readonly __brand?: 'TraceURI' };

/**
 * ITraceLog — The kernel's "Observability" plugin.
 *
 * Append-only ledger for heavy, ephemeral data:
 * - RouteDecision metadata
 * - GateFinding[] arrays
 * - Raw LLM input/output
 */
export interface ITraceLog {
  /** Plugin identity — registered as "Trace" in the PluginRegistry */
  readonly name: string;
  readonly version?: string;

  /** Lifecycle: called when the plugin is registered */
  initialize: () => void;

  /** Health check for BootstrapSequence validation */
  ping?: () => Promise<boolean>;

  /** Lifecycle: called on kernel shutdown */
  shutdown?: () => void;

  /**
   * Append a trace entry and return a unique TraceURI.
   *
   * @param payload — raw trace data (RouteDecision, GateFinding[], LLM I/O, etc.)
   * @returns A TraceURI (e.g., trace://v1/00001)
   */
  appendTrace(payload: unknown): TraceURI;

  /**
   * Retrieve a trace entry by its URI.
   *
   * @param uri — the TraceURI returned by appendTrace()
   * @returns The trace payload, or null if the URI does not exist
   */
  getTrace(uri: TraceURI): unknown | null;
}
