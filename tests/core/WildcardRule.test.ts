import { describe, it, expect } from 'vitest';
import { WildcardRule } from '../../src/core/WildcardRule';

describe('WildcardRule', () => {
  describe('evaluate', () => {
    it('should pass when diversity score exceeds threshold', () => {
      const items = ['brutalist concrete design', 'colorful gradient UI', 'minimal white layout'];
      const result = WildcardRule.evaluate(items, 0.3);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.3);
    });

    it('should fail when diversity score is below threshold', () => {
      const items = ['minimalist design', 'minimalist design', 'minimalist design', 'colorful UI'];
      const result = WildcardRule.evaluate(items, 0.5);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should return maximum diversity (1.0) for completely unique items', () => {
      const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
      const result = WildcardRule.evaluate(items, 0.8);

      expect(result.passed).toBe(true);
      expect(result.score).toBeCloseTo(1.0, 1);
    });

    it('should return minimum diversity (0.0) for uniform items', () => {
      const items = ['same', 'same', 'same', 'same'];
      const result = WildcardRule.evaluate(items, 0.1);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should handle empty items array', () => {
      const result = WildcardRule.evaluate([], 0.5);
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should handle single item (no diversity possible)', () => {
      const result = WildcardRule.evaluate(['only one'], 0.5);
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should always pass with threshold 0', () => {
      const items = ['same', 'same', 'same'];
      const result = WildcardRule.evaluate(items, 0);

      expect(result.passed).toBe(true);
    });

    it('should always fail with threshold above 1.0', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = WildcardRule.evaluate(items, 1.5);

      expect(result.passed).toBe(false);
    });
  });
});
