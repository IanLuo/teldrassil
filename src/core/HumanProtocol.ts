/**
 * Human Interaction Protocol — the bridge between autonomous execution
 * and human-attach mode.
 *
 * When a BLOCK decision is reached, the WorkflowRunner publishes a
 * HumanInputRequest and pauses. An external UI (or test harness) submits
 * a HumanInputResult via the EventBus, and the runner resumes.
 */

export interface HumanInputRequest {
  /** Unique ID for this request — used to match the response */
  requestId: string;
  /** The step that is blocked */
  step: string;
  /** The agent that was executing */
  agent: string;
  /** What the human is being asked to do */
  prompt: string;
  /** Optional references to trace/memory entries for context */
  contextRefs?: string[];
  /** Optional predefined choices the human can pick from */
  choices?: string[];
  /** The raw output from the blocked step */
  output: string;
}

export interface HumanInputResult {
  /** Must match the requestId from the HumanInputRequest */
  requestId: string;
  /** How to proceed after human review */
  action: 'proceed' | 'rework' | 'abort';
  /** Optional feedback from the human (e.g., instructions for rework) */
  feedback?: string;
  /** Optional: resume at a different step (node ID) */
  resumeAt?: string;
}
