import type { ITraceLog } from './ITraceLog';
import { createTraceEnvelope } from './ITraceLog';
import { SupervisorDecision } from './Supervisor';

export interface RouteDecision {
  /** The step/agent that produced the output */
  from: string;
  /** The next step/agent (null if terminal) */
  to: string | null;
  /** The routing decision */
  decision: SupervisorDecision;
  /** Human-readable reason for the decision */
  reason: string;
  /** ISO 8601 timestamp of the decision */
  timestamp: string;
  /** Additional context (e.g., failed criteria descriptions) */
  metadata?: Record<string, unknown>;
}

/**
 * Write a RouteDecision to the Trace Log and return the URI.
 * This is the canonical way to record routing metadata.
 */
export async function recordRouteDecision(
  traceLog: ITraceLog,
  decision: RouteDecision,
  sessionId: string,
  nodeId: string
): Promise<string> {
  return traceLog.appendTrace(createTraceEnvelope('route_decision', nodeId, sessionId, decision));
}
