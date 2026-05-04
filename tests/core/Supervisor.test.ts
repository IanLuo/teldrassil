import { describe, it, expect } from 'vitest';
import { Supervisor, SupervisorDecision } from '../../src/core/Supervisor';

interface SupervisorInput {
  output: string;
  retryCount: number;
  maxRetries: number;
  criteria: Array<{
    description: string;
    check: (output: string) => boolean;
  }>;
  isComplete?: boolean;
  isBlocked?: boolean;
}

describe('Supervisor — Quality Gate', () => {
  describe('evaluate', () => {
    const passLength = {
      description: 'output must be at least 5 chars',
      check: (out: string) => out.length >= 5,
    };
    const containCode = {
      description: 'output must contain code block',
      check: (out: string) => out.includes('```'),
    };
    const noProfanity = {
      description: 'no profanity in output',
      check: (out: string) => !out.includes('badword'),
    };

    it('should return PROCEED when output passes all criteria', () => {
      const input: SupervisorInput = {
        output: '```ts\nconst x = 5;\n```',
        retryCount: 0,
        maxRetries: 3,
        criteria: [passLength, containCode],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.PROCEED);
    });

    it('should return REWORK when output fails a criterion', () => {
      const input: SupervisorInput = {
        output: 'hi',
        retryCount: 0,
        maxRetries: 3,
        criteria: [passLength],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.REWORK);
    });

    it('should return REWORK when output fails any of multiple criteria', () => {
      const input: SupervisorInput = {
        output: 'abcde', // passes length (5 >= 5) but fails containCode
        retryCount: 0,
        maxRetries: 3,
        criteria: [passLength, containCode],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.REWORK);
    });

    it('should return ESCALATE when retry count exceeds max retries', () => {
      const input: SupervisorInput = {
        output: 'hi',
        retryCount: 4,
        maxRetries: 3,
        criteria: [passLength],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.ESCALATE);
    });

    it('should return REWORK when retry count equals max retries (not yet exceeded)', () => {
      const input: SupervisorInput = {
        output: 'hi',
        retryCount: 3,
        maxRetries: 3,
        criteria: [passLength],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.REWORK);
    });

    it('should return PROCEED when criteria list is empty', () => {
      const input: SupervisorInput = {
        output: 'anything',
        retryCount: 0,
        maxRetries: 3,
        criteria: [],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.PROCEED);
    });

    it('should return ESCALATE when retry exceeded even on empty criteria (edge: unreachable but defensive)', () => {
      const input: SupervisorInput = {
        output: 'anything',
        retryCount: 5,
        maxRetries: 3,
        criteria: [], // passes all, but still shouldn't proceed if retries blown
      };

      // Retry check takes priority over criteria check
      expect(Supervisor.evaluate(input)).toBe(SupervisorDecision.ESCALATE);
    });

    it('should evaluate criteria in order and stop on first failure', () => {
      let secondChecked = false;
      const input: SupervisorInput = {
        output: 'hi',
        retryCount: 0,
        maxRetries: 3,
        criteria: [
          passLength,
          { description: 'should not be checked', check: () => { secondChecked = true; return true; } },
        ],
      };

      const result = Supervisor.evaluate(input);
      expect(result).toBe(SupervisorDecision.REWORK);
      // First criterion failed ('hi'.length=2 < 5), second should not run
      expect(secondChecked).toBe(false); // short-circuit on first failure
    });

    describe('5-enum extended decisions', () => {
      it('should return BLOCK when isBlocked is true', () => {
        const input: SupervisorInput = {
          output: 'some output',
          retryCount: 0,
          maxRetries: 3,
          criteria: [passLength],
          isBlocked: true,
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.BLOCK);
      });

      it('should return COMPLETE when isComplete is true and all criteria pass', () => {
        const input: SupervisorInput = {
          output: '```ts\nconst x = 5;\n```',
          retryCount: 0,
          maxRetries: 3,
          criteria: [passLength, containCode],
          isComplete: true,
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.COMPLETE);
      });

      it('should return REWORK when isComplete is true but criteria fail', () => {
        const input: SupervisorInput = {
          output: 'hi',
          retryCount: 0,
          maxRetries: 3,
          criteria: [passLength],
          isComplete: true,
        };

        // isComplete is not a free pass — criteria must also pass
        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.REWORK);
      });

      it('should return PROCEED when neither blocked nor complete and criteria pass', () => {
        const input: SupervisorInput = {
          output: 'hello world',
          retryCount: 0,
          maxRetries: 3,
          criteria: [passLength],
          isBlocked: false,
          isComplete: false,
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.PROCEED);
      });

      it('should prioritise BLOCK over ESCALATE even when retries exhausted', () => {
        const input: SupervisorInput = {
          output: 'hi',
          retryCount: 5,
          maxRetries: 3,
          criteria: [passLength],
          isBlocked: true,
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.BLOCK);
      });

      it('should prioritise BLOCK over REWORK even when criteria fail', () => {
        const input: SupervisorInput = {
          output: 'hi',
          retryCount: 0,
          maxRetries: 3,
          criteria: [passLength],
          isBlocked: true,
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.BLOCK);
      });

      it('should return ESCALATE when retries exceeded and neither BLOCK nor COMPLETE', () => {
        const input: SupervisorInput = {
          output: 'anything',
          retryCount: 4,
          maxRetries: 3,
          criteria: [],
        };

        const result = Supervisor.evaluate(input);
        expect(result).toBe(SupervisorDecision.ESCALATE);
      });
    });
  });
});
