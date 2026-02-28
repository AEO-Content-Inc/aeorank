import { describe, it, expect } from 'vitest';
import {
  CRITERION_LABELS,
  scoreToStatus,
  mapFindingSeverity,
  mapFindingType,
  buildScorecard,
  buildDetailedFindings,
} from '../src/scorecard-builder.js';
import type { CriterionResult } from '../src/site-crawler.js';

// ─── CRITERION_LABELS ────────────────────────────────────────────────────────

describe('CRITERION_LABELS', () => {
  it('has exactly 23 entries (one per criterion)', () => {
    expect(Object.keys(CRITERION_LABELS)).toHaveLength(23);
  });

  it('includes Speakable Schema', () => {
    expect(CRITERION_LABELS['Speakable Schema']).toBe('Speakable Schema');
  });

  it('maps Entity Authority label', () => {
    expect(CRITERION_LABELS['Entity Authority & E-E-A-T']).toBe('Entity Authority & NAP Consistency');
  });
});

// ─── scoreToStatus ───────────────────────────────────────────────────────────

describe('scoreToStatus', () => {
  it('maps 0 to MISSING', () => expect(scoreToStatus(0)).toBe('MISSING'));
  it('maps 1 to NEARLY EMPTY', () => expect(scoreToStatus(1)).toBe('NEARLY EMPTY'));
  it('maps 2 to POOR', () => expect(scoreToStatus(2)).toBe('POOR'));
  it('maps 3 to WEAK', () => expect(scoreToStatus(3)).toBe('WEAK'));
  it('maps 4 to PARTIAL', () => expect(scoreToStatus(4)).toBe('PARTIAL'));
  it('maps 5 to PARTIAL', () => expect(scoreToStatus(5)).toBe('PARTIAL'));
  it('maps 6 to MODERATE', () => expect(scoreToStatus(6)).toBe('MODERATE'));
  it('maps 7 to GOOD', () => expect(scoreToStatus(7)).toBe('GOOD'));
  it('maps 8 to STRONG', () => expect(scoreToStatus(8)).toBe('STRONG'));
  it('maps 9 to STRONG', () => expect(scoreToStatus(9)).toBe('STRONG'));
  it('maps 10 to STRONG', () => expect(scoreToStatus(10)).toBe('STRONG'));
});

// ─── mapFindingSeverity ──────────────────────────────────────────────────────

describe('mapFindingSeverity', () => {
  it('maps critical to CRITICAL', () => expect(mapFindingSeverity('critical')).toBe('CRITICAL'));
  it('maps high to MISSING', () => expect(mapFindingSeverity('high')).toBe('MISSING'));
  it('maps medium to ADD', () => expect(mapFindingSeverity('medium')).toBe('ADD'));
  it('maps low to PARTIAL', () => expect(mapFindingSeverity('low')).toBe('PARTIAL'));
  it('maps info to WORKING', () => expect(mapFindingSeverity('info')).toBe('WORKING'));
});

// ─── mapFindingType ──────────────────────────────────────────────────────────

describe('mapFindingType', () => {
  it('maps info to Good', () => expect(mapFindingType('info', false)).toBe('Good'));
  it('maps critical to Critical', () => expect(mapFindingType('critical', false)).toBe('Critical'));
  it('maps high to Missing', () => expect(mapFindingType('high', false)).toBe('Missing'));
  it('maps medium with fix to Issue', () => expect(mapFindingType('medium', true)).toBe('Issue'));
  it('maps medium without fix to Note', () => expect(mapFindingType('medium', false)).toBe('Note'));
});

// ─── buildScorecard ──────────────────────────────────────────────────────────

function makeCriterionResult(overrides: Partial<CriterionResult> = {}): CriterionResult {
  return {
    criterion: 'llms_txt',
    criterion_label: 'llms.txt File',
    score: 7,
    status: 'pass',
    findings: [
      { severity: 'info', detail: 'llms.txt file found' },
    ],
    fix_priority: 'P3',
    ...overrides,
  };
}

describe('buildScorecard', () => {
  it('returns correct structure', () => {
    const results = [makeCriterionResult()];
    const scorecard = buildScorecard(results);
    expect(scorecard).toHaveLength(1);
    expect(scorecard[0]).toMatchObject({
      id: 1,
      criterion: 'llms.txt File',
      score: 7,
      status: 'GOOD',
    });
    expect(scorecard[0].keyFindings).toContain('llms.txt file found');
  });

  it('maps criterion labels correctly', () => {
    const results = [makeCriterionResult({ criterion_label: 'Entity Authority & E-E-A-T' })];
    const scorecard = buildScorecard(results);
    expect(scorecard[0].criterion).toBe('Entity Authority & NAP Consistency');
  });

  it('falls through unknown labels', () => {
    const results = [makeCriterionResult({ criterion_label: 'Unknown Criterion' })];
    const scorecard = buildScorecard(results);
    expect(scorecard[0].criterion).toBe('Unknown Criterion');
  });

  it('handles Speakable Schema label', () => {
    const results = [makeCriterionResult({ criterion_label: 'Speakable Schema' })];
    const scorecard = buildScorecard(results);
    expect(scorecard[0].criterion).toBe('Speakable Schema');
  });

  it('limits keyFindings to 3 findings', () => {
    const results = [makeCriterionResult({
      findings: [
        { severity: 'info', detail: 'Finding 1' },
        { severity: 'info', detail: 'Finding 2' },
        { severity: 'info', detail: 'Finding 3' },
        { severity: 'info', detail: 'Finding 4' },
      ],
    })];
    const scorecard = buildScorecard(results);
    expect(scorecard[0].keyFindings).not.toContain('Finding 4');
  });
});

// ─── buildDetailedFindings ───────────────────────────────────────────────────

describe('buildDetailedFindings', () => {
  it('returns correct structure', () => {
    const results = [makeCriterionResult({
      findings: [
        { severity: 'info', detail: 'Found llms.txt' },
        { severity: 'medium', detail: 'Content could be improved', fix: 'Add more details' },
      ],
    })];
    const detailed = buildDetailedFindings(results);
    expect(detailed).toHaveLength(1);
    expect(detailed[0].id).toBe(1);
    expect(detailed[0].name).toBe('llms.txt File');
    expect(detailed[0].findings).toHaveLength(2);
  });

  it('deduplicates findings by description', () => {
    const results = [makeCriterionResult({
      findings: [
        { severity: 'info', detail: 'Same finding' },
        { severity: 'info', detail: 'Same finding' },
      ],
    })];
    const detailed = buildDetailedFindings(results);
    // 1 unique + 1 fallback (minimum 2)
    expect(detailed[0].findings).toHaveLength(2);
  });

  it('adds fallback finding when fewer than 2', () => {
    const results = [makeCriterionResult({
      score: 8,
      findings: [{ severity: 'info', detail: 'Looks good' }],
    })];
    const detailed = buildDetailedFindings(results);
    expect(detailed[0].findings).toHaveLength(2);
    expect(detailed[0].findings[1].type).toBe('Good');
  });

  it('adds issue fallback for low scores', () => {
    const results = [makeCriterionResult({
      score: 3,
      findings: [{ severity: 'high', detail: 'Missing' }],
    })];
    const detailed = buildDetailedFindings(results);
    expect(detailed[0].findings[1].type).toBe('Note');
    expect(detailed[0].findings[1].severity).toBe('PARTIAL');
  });
});
