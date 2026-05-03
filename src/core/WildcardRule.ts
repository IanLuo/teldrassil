export interface WildcardResult {
  score: number;
  passed: boolean;
}

export class WildcardRule {
  /**
   * Evaluate the diversity of a list of items.
   *
   * Uses a normalized uniqueness metric:
   *   score = (uniqueCount - 1) / max(totalCount - 1, 1)
   *
   * - Completely uniform list → score = 0
   * - Completely unique list → score = 1
   * - Empty or single-item list → score = 0
   *
   * @param items — list of recommendations/options to check
   * @param threshold — minimum diversity score required to pass (0-1)
   */
  static evaluate(items: string[], threshold: number): WildcardResult {
    if (items.length === 0) {
      return { score: 0, passed: false };
    }

    const unique = new Set(items);
    const uniqueCount = unique.size;
    const total = items.length;

    if (total === 1) {
      return { score: 0, passed: false };
    }

    const score = (uniqueCount - 1) / (total - 1);
    // Clamp score to [0, 1]
    const clamped = Math.max(0, Math.min(1, score));

    return {
      score: clamped,
      passed: clamped >= threshold,
    };
  }
}
