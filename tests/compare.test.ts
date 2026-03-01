import { describe, it, expect, vi } from 'vitest';

// Mock the audit function to avoid real HTTP requests
vi.mock('../src/audit.js', () => ({
  audit: vi.fn(),
}));

import { compare } from '../src/compare.js';
import { audit } from '../src/audit.js';
import type { AuditResult } from '../src/audit.js';

const mockedAudit = vi.mocked(audit);

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeResult(domain: string, scores: number[]): AuditResult {
  const criterionNames = [
    'llms.txt File', 'Schema.org Structured Data', 'Q&A Content Format',
    'Clean, Crawlable HTML', 'Entity Authority & NAP Consistency',
    'robots.txt for AI Crawlers', 'Comprehensive FAQ Section',
    'Original Data & Expert Analysis', 'Internal Linking Structure',
    'Semantic HTML5 & Accessibility', 'Content Freshness Signals',
    'Sitemap Completeness', 'RSS/Atom Feed', 'Table & List Extractability',
    'Definition Patterns', 'Direct Answer Paragraphs',
    'Content Licensing & AI Permissions', 'Author & Expert Schema',
    'Fact & Data Density', 'Canonical URL Strategy',
    'Content Publishing Velocity', 'Schema Coverage & Depth',
    'Speakable Schema',
  ];

  return {
    site: domain,
    auditDate: '2026-02-28',
    auditor: 'aeorank',
    overallScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10),
    verdict: `Audit for ${domain}`,
    scorecard: scores.map((score, i) => ({
      id: i + 1,
      criterion: criterionNames[i],
      score,
      status: score >= 8 ? 'STRONG' as const : score >= 5 ? 'PARTIAL' as const : 'WEAK' as const,
      keyFindings: `Finding for criterion ${i + 1}`,
    })),
    detailedFindings: [],
    opportunities: [],
    pitchNumbers: [],
    bottomLine: `Bottom line for ${domain}`,
    elapsed: 3.5,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('compare', () => {
  it('runs both audits in parallel', async () => {
    const resultA = makeResult('site-a.com', Array(23).fill(7));
    const resultB = makeResult('site-b.com', Array(23).fill(5));
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('site-a.com', 'site-b.com');

    expect(mockedAudit).toHaveBeenCalledTimes(2);
    expect(mockedAudit).toHaveBeenCalledWith('site-a.com', undefined);
    expect(mockedAudit).toHaveBeenCalledWith('site-b.com', undefined);
    expect(result.siteA.site).toBe('site-a.com');
    expect(result.siteB.site).toBe('site-b.com');
  });

  it('passes options to both audits', async () => {
    const resultA = makeResult('a.com', Array(23).fill(5));
    const resultB = makeResult('b.com', Array(23).fill(5));
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    await compare('a.com', 'b.com', { noHeadless: true, noMultiPage: true });

    expect(mockedAudit).toHaveBeenCalledWith('a.com', { noHeadless: true, noMultiPage: true });
    expect(mockedAudit).toHaveBeenCalledWith('b.com', { noHeadless: true, noMultiPage: true });
  });

  it('calculates correct score delta', async () => {
    const resultA = makeResult('a.com', Array(23).fill(8));
    const resultB = makeResult('b.com', Array(23).fill(5));
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    expect(result.comparison.scoreDelta).toBe(resultA.overallScore - resultB.overallScore);
  });

  it('builds per-criterion comparison with 23 items', async () => {
    const resultA = makeResult('a.com', Array(23).fill(7));
    const resultB = makeResult('b.com', Array(23).fill(5));
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    expect(result.comparison.criteria).toHaveLength(23);
    expect(result.comparison.criteria[0].id).toBe(1);
    expect(result.comparison.criteria[0].criterion).toBe('llms.txt File');
  });

  it('calculates correct per-criterion deltas', async () => {
    const scoresA = [10, 5, 3, 8, 0, 7, 6, 4, 9, 7, 6, 5, 3, 7, 4, 6, 5, 4, 6, 8, 2, 7, 0];
    const scoresB = [0, 8, 5, 6, 3, 7, 4, 6, 7, 5, 8, 3, 5, 5, 6, 4, 7, 2, 8, 6, 4, 5, 2];
    const resultA = makeResult('a.com', scoresA);
    const resultB = makeResult('b.com', scoresB);
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    for (let i = 0; i < 23; i++) {
      expect(result.comparison.criteria[i].delta).toBe(scoresA[i] - scoresB[i]);
      expect(result.comparison.criteria[i].scoreA).toBe(scoresA[i]);
      expect(result.comparison.criteria[i].scoreB).toBe(scoresB[i]);
    }
  });

  it('correctly classifies advantages and tied', async () => {
    const scoresA = [10, 5, 5, 8, 0, 7, 6, 4, 9, 7, 6, 5, 3, 7, 4, 6, 5, 4, 6, 8, 2, 7, 0];
    const scoresB = [0, 8, 5, 6, 3, 7, 4, 6, 7, 5, 8, 3, 5, 5, 6, 4, 7, 2, 8, 6, 4, 5, 2];
    const resultA = makeResult('a.com', scoresA);
    const resultB = makeResult('b.com', scoresB);
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    // Count manually: tied where scoresA[i] === scoresB[i]
    const expectedTied = scoresA.filter((a, i) => a === scoresB[i]).length;
    const expectedAAdvantages = scoresA.filter((a, i) => a > scoresB[i]).length;
    const expectedBAdvantages = scoresA.filter((a, i) => a < scoresB[i]).length;

    expect(result.comparison.tied).toHaveLength(expectedTied);
    expect(result.comparison.siteAAdvantages).toHaveLength(expectedAAdvantages);
    expect(result.comparison.siteBAdvantages).toHaveLength(expectedBAdvantages);
  });

  it('when all scores equal, all criteria are tied', async () => {
    const scores = Array(23).fill(5);
    const resultA = makeResult('a.com', scores);
    const resultB = makeResult('b.com', scores);
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    expect(result.comparison.tied).toHaveLength(23);
    expect(result.comparison.siteAAdvantages).toHaveLength(0);
    expect(result.comparison.siteBAdvantages).toHaveLength(0);
    expect(result.comparison.scoreDelta).toBe(0);
  });

  it('advantages contain criterion names', async () => {
    const scoresA = Array(23).fill(10);
    const scoresB = Array(23).fill(0);
    const resultA = makeResult('a.com', scoresA);
    const resultB = makeResult('b.com', scoresB);
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    expect(result.comparison.siteAAdvantages).toHaveLength(23);
    expect(result.comparison.siteAAdvantages).toContain('llms.txt File');
    expect(result.comparison.siteAAdvantages).toContain('Schema.org Structured Data');
    expect(result.comparison.siteBAdvantages).toHaveLength(0);
  });

  it('includes statusA and statusB', async () => {
    const resultA = makeResult('a.com', Array(23).fill(9));
    const resultB = makeResult('b.com', Array(23).fill(2));
    mockedAudit.mockResolvedValueOnce(resultA).mockResolvedValueOnce(resultB);

    const result = await compare('a.com', 'b.com');

    expect(result.comparison.criteria[0].statusA).toBe('STRONG');
    expect(result.comparison.criteria[0].statusB).toBe('WEAK');
  });
});
