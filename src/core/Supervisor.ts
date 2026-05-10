import { WildcardRule } from './WildcardRule';

export enum SupervisorDecision {
  PROCEED = 'PROCEED',
  REWORK = 'REWORK',
  ESCALATE = 'ESCALATE',
  BLOCK = 'BLOCK',
  COMPLETE = 'COMPLETE',
}

export interface SupervisorInput {
  output: string;
  retryCount: number;
  maxRetries: number;
  criteria: Array<{
    description: string;
    check: (output: string) => boolean;
  }>;
  isBlocked?: boolean;
  isComplete?: boolean;
  diversity?: {
    items: string[];
    threshold: number;
  };
}

export class Supervisor {
  /**
   * Evaluate worker output against quality criteria.
   *
   * Decision order:
   * 1. If isBlocked → BLOCK (human intervention required, takes highest priority)
   * 2. If retryCount >= maxRetries → ESCALATE (escalation gate)
   * 3. If any criterion fails → REWORK (binary quality gate)
   * 4. If isComplete → COMPLETE (workflow finished)
   * 5. All criteria pass → PROCEED
   */
  static evaluate(input: SupervisorInput): SupervisorDecision {
    if (input.isBlocked) {
      return SupervisorDecision.BLOCK;
    }

    if (input.retryCount >= input.maxRetries) {
      return SupervisorDecision.ESCALATE;
    }

    for (const criterion of input.criteria) {
      if (!criterion.check(input.output)) {
        return SupervisorDecision.REWORK;
      }
    }

    if (input.diversity) {
      const result = WildcardRule.evaluate(input.diversity.items, input.diversity.threshold);
      if (!result.passed) {
        return SupervisorDecision.REWORK;
      }
    }

    if (input.isComplete) {
      return SupervisorDecision.COMPLETE;
    }

    return SupervisorDecision.PROCEED;
  }
}
