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

export type TraceEntryType = 'route_decision' | 'gate_finding' | 'llm_io' | 'recovery' | 'custom';

export interface TraceEnvelope {
    traceId: string;
    sessionId: string;
    nodeId: string;
    type: TraceEntryType;
    timestamp: string;
    payload: unknown;
}

export function createTraceEnvelope(
    type: TraceEntryType,
    nodeId: string,
    sessionId: string,
    payload: unknown
): TraceEnvelope {
    return {
        traceId: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sessionId,
        nodeId,
        type,
        timestamp: new Date().toISOString(),
        payload,
    };
}

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
   * @param envelope — TraceEnvelope with standard metadata and typed payload
   * @returns A TraceURI (e.g., trace://v1/00001)
   */
  appendTrace(envelope: TraceEnvelope): TraceURI;

  /**
   * Retrieve a trace entry by its URI.
   *
   * @param uri — the TraceURI returned by appendTrace()
   * @returns The TraceEnvelope, or null if the URI does not exist
   */
  getTrace(uri: TraceURI): unknown | null;

  /**
   * List all trace entries for a given session.
   *
   * @param sessionId — the session identifier
   * @returns Array of TraceEnvelope entries
   */
  listBySession?(sessionId: string): TraceEnvelope[];
}
