export enum SupervisorDecision {
  PROCEED = 'PROCEED',
  REWORK = 'REWORK',
  ESCALATE = 'ESCALATE',
}

export interface SupervisorInput {
  output: string;
  retryCount: number;
  maxRetries: number;
  criteria: Array<{
    description: string;
    check: (output: string) => boolean;
  }>;
}

export class Supervisor {
  /**
   * Evaluate worker output against quality criteria.
   *
   * Decision order:
   * 1. If retryCount > maxRetries → ESCALATE (escalation gate takes priority)
   * 2. If any criterion fails → REWORK (binary quality gate)
   * 3. All criteria pass → PROCEED
   */
  static evaluate(input: SupervisorInput): SupervisorDecision {
    // Escalation gate: retries exhausted
    if (input.retryCount > input.maxRetries) {
      return SupervisorDecision.ESCALATE;
    }

    // Quality gate: check all criteria, short-circuit on first failure
    for (const criterion of input.criteria) {
      if (!criterion.check(input.output)) {
        return SupervisorDecision.REWORK;
      }
    }

    return SupervisorDecision.PROCEED;
  }
}
