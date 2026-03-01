import { describe, it, expect } from 'vitest';
import { calculateOverallScore } from '../src/scoring.js';
import type { CriterionResult } from '../src/site-crawler.js';

describe('calculateOverallScore (extended)', () => {
  it('returns 0 for empty criteria array', () => {
    expect(calculateOverallScore([])).toBe(0);
  });

  it('uses default weight 0.10 for unknown criterion', () => {
    const criteria: CriterionResult[] = [
      { criterion: 'unknown_criterion', criterion_label: 'Unknown', score: 10, status: 'pass', findings: [], fix_priority: 'P3' },
    ];
    // weight defaults to 0.10, score=10 => (10/10) * 0.10 * 100 = 10, totalWeight = 0.10
    // result = 10 / 0.10 = 100
    expect(calculateOverallScore(criteria)).toBe(100);
  });

  it('uses default weight 0.10 for unknown criterion with partial score', () => {
    const criteria: CriterionResult[] = [
      { criterion: 'nonexistent', criterion_label: 'X', score: 5, status: 'partial', findings: [], fix_priority: 'P1' },
    ];
    // (5/10) * 0.10 * 100 = 5, totalWeight = 0.10 => 5/0.10 = 50
    expect(calculateOverallScore(criteria)).toBe(50);
  });
});
