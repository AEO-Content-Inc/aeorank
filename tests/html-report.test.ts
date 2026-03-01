import { describe, it, expect } from 'vitest';
import { generateHtmlReport, generateComparisonHtmlReport } from '../src/html-report.js';
import type { AuditResult } from '../src/audit.js';
import type { ComparisonResult } from '../src/compare.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    site: 'example.com',
    auditDate: '2026-02-28',
    auditor: 'aeorank',
    overallScore: 65,
    verdict: 'Moderate AI visibility with room for improvement.',
    scorecard: [
      { id: 1, criterion: 'llms.txt File', score: 0, status: 'MISSING', keyFindings: 'No llms.txt found' },
      { id: 2, criterion: 'Schema.org Structured Data', score: 8, status: 'STRONG', keyFindings: 'Good schema coverage' },
      { id: 3, criterion: 'Q&A Content Format', score: 5, status: 'PARTIAL', keyFindings: 'Some Q&A content' },
      { id: 4, criterion: 'Clean, Crawlable HTML', score: 9, status: 'STRONG', keyFindings: 'Clean HTML' },
      { id: 5, criterion: 'Entity Authority & NAP Consistency', score: 3, status: 'WEAK', keyFindings: 'Weak entity signals' },
      { id: 6, criterion: 'robots.txt for AI Crawlers', score: 7, status: 'GOOD', keyFindings: 'AI crawlers allowed' },
      { id: 7, criterion: 'Comprehensive FAQ Section', score: 6, status: 'MODERATE', keyFindings: 'Basic FAQ' },
      { id: 8, criterion: 'Original Data & Expert Analysis', score: 4, status: 'PARTIAL', keyFindings: 'Limited original data' },
      { id: 9, criterion: 'Internal Linking Structure', score: 8, status: 'STRONG', keyFindings: 'Good linking' },
      { id: 10, criterion: 'Semantic HTML5 & Accessibility', score: 7, status: 'GOOD', keyFindings: 'Semantic HTML' },
      { id: 11, criterion: 'Content Freshness Signals', score: 6, status: 'MODERATE', keyFindings: 'Recent content' },
      { id: 12, criterion: 'Sitemap Completeness', score: 5, status: 'PARTIAL', keyFindings: 'Partial sitemap' },
      { id: 13, criterion: 'RSS/Atom Feed', score: 3, status: 'WEAK', keyFindings: 'No RSS' },
      { id: 14, criterion: 'Table & List Extractability', score: 7, status: 'GOOD', keyFindings: 'Tables found' },
      { id: 15, criterion: 'Definition Patterns', score: 4, status: 'PARTIAL', keyFindings: 'Few definitions' },
      { id: 16, criterion: 'Direct Answer Paragraphs', score: 6, status: 'MODERATE', keyFindings: 'Some direct answers' },
      { id: 17, criterion: 'Content Licensing & AI Permissions', score: 5, status: 'PARTIAL', keyFindings: 'No ai.txt' },
      { id: 18, criterion: 'Author & Expert Schema', score: 4, status: 'PARTIAL', keyFindings: 'No author schema' },
      { id: 19, criterion: 'Fact & Data Density', score: 6, status: 'MODERATE', keyFindings: 'Some data points' },
      { id: 20, criterion: 'Canonical URL Strategy', score: 8, status: 'STRONG', keyFindings: 'Canonical set' },
      { id: 21, criterion: 'Content Publishing Velocity', score: 2, status: 'POOR', keyFindings: 'Low velocity' },
      { id: 22, criterion: 'Schema Coverage & Depth', score: 7, status: 'GOOD', keyFindings: 'Multi-type schema' },
      { id: 23, criterion: 'Speakable Schema', score: 0, status: 'MISSING', keyFindings: 'No speakable' },
    ],
    detailedFindings: [],
    opportunities: [
      { id: 1, name: 'Add llms.txt', description: 'Create an llms.txt file', effort: 'Low', impact: 'QUICK WIN' },
      { id: 2, name: 'Improve FAQ', description: 'Expand FAQ section', effort: 'Medium', impact: 'HIGH' },
      { id: 3, name: 'Add Speakable', description: 'Add speakable schema', effort: 'Low', impact: 'CRITICAL' },
    ],
    pitchNumbers: [],
    bottomLine: 'Focus on llms.txt and FAQ improvements for quick wins.',
    pagesReviewed: [
      { url: 'https://example.com/', title: 'Home', category: 'homepage', wordCount: 1200, issues: [], strengths: [{ check: 'hasSchema', label: 'Has schema', severity: 'info' }] },
      { url: 'https://example.com/about', title: 'About', category: 'about', wordCount: 800, issues: [{ check: 'noH1', label: 'Missing H1', severity: 'warning' }], strengths: [] },
    ],
    elapsed: 4.2,
    ...overrides,
  };
}

function makeComparisonResult(): ComparisonResult {
  const siteA = makeAuditResult({ site: 'site-a.com', overallScore: 72 });
  const siteB = makeAuditResult({
    site: 'site-b.com',
    overallScore: 58,
    scorecard: siteA.scorecard.map(item => ({
      ...item,
      score: Math.max(0, item.score - 2),
      status: item.score - 2 <= 0 ? 'MISSING' as const : item.status,
    })),
  });

  return {
    siteA,
    siteB,
    comparison: {
      scoreDelta: 14,
      criteria: siteA.scorecard.map((a, i) => ({
        id: a.id,
        criterion: a.criterion,
        scoreA: a.score,
        scoreB: siteB.scorecard[i].score,
        delta: a.score - siteB.scorecard[i].score,
        statusA: a.status,
        statusB: siteB.scorecard[i].status,
      })),
      siteAAdvantages: siteA.scorecard.filter((a, i) => a.score > siteB.scorecard[i].score).map(a => a.criterion),
      siteBAdvantages: [],
      tied: siteA.scorecard.filter((a, i) => a.score === siteB.scorecard[i].score).map(a => a.criterion),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateHtmlReport', () => {
  it('produces valid HTML document', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
  });

  it('includes domain and date in header', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('example.com');
    expect(html).toContain('2026-02-28');
  });

  it('renders SVG score circle with correct score', () => {
    const html = generateHtmlReport(makeAuditResult({ overallScore: 85 }));
    expect(html).toContain('>85<');
    expect(html).toContain('/100');
    expect(html).toContain('<svg');
  });

  it('uses correct score colors', () => {
    // Red for low scores
    const lowHtml = generateHtmlReport(makeAuditResult({ overallScore: 30 }));
    expect(lowHtml).toContain('#F44336');

    // Green for high scores
    const highHtml = generateHtmlReport(makeAuditResult({ overallScore: 80 }));
    expect(highHtml).toContain('#4CAF50');

    // Dark green for excellent
    const excellentHtml = generateHtmlReport(makeAuditResult({ overallScore: 90 }));
    expect(excellentHtml).toContain('#2E7D32');
  });

  it('renders all 23 criteria cards', () => {
    const result = makeAuditResult();
    const html = generateHtmlReport(result);
    // Criterion names with & get HTML-escaped to &amp;
    for (const item of result.scorecard) {
      const escaped = item.criterion.replace(/&/g, '&amp;');
      expect(html).toContain(escaped);
    }
    // Count criterion-card div occurrences (exclude CSS class definitions)
    const cardCount = (html.match(/class="criterion-card"/g) || []).length;
    expect(cardCount).toBe(23);
  });

  it('renders per-criterion colored bars', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('criterion-bar-fill');
    // Score 0 = 0% width, score 8 = 80% width
    expect(html).toContain('width:0%');
    expect(html).toContain('width:80%');
  });

  it('renders opportunities table', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('Add llms.txt');
    expect(html).toContain('QUICK WIN');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('impact-quick-win');
    expect(html).toContain('impact-critical');
  });

  it('renders pages reviewed table', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('https://example.com/');
    expect(html).toContain('https://example.com/about');
    expect(html).toContain('homepage');
  });

  it('renders verdict and bottom line', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('Moderate AI visibility');
    expect(html).toContain('Focus on llms.txt');
  });

  it('includes footer with timestamp', () => {
    const html = generateHtmlReport(makeAuditResult());
    expect(html).toContain('Generated by AEORank');
  });

  it('escapes HTML in domain names (XSS prevention)', () => {
    const html = generateHtmlReport(makeAuditResult({ site: '<script>alert("xss")</script>' }));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in verdict text', () => {
    const html = generateHtmlReport(makeAuditResult({ verdict: 'Test <img onerror=alert(1)>' }));
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });

  it('escapes HTML in opportunity names', () => {
    const result = makeAuditResult();
    result.opportunities[0].name = '<b>Malicious</b>';
    const html = generateHtmlReport(result);
    expect(html).not.toContain('<b>Malicious</b>');
    expect(html).toContain('&lt;b&gt;Malicious&lt;/b&gt;');
  });

  it('handles empty opportunities', () => {
    const html = generateHtmlReport(makeAuditResult({ opportunities: [] }));
    expect(html).not.toContain('Opportunities');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('handles empty pages reviewed', () => {
    const html = generateHtmlReport(makeAuditResult({ pagesReviewed: [] }));
    expect(html).not.toContain('Pages Reviewed');
    expect(html).toContain('<!DOCTYPE html>');
  });
});

describe('generateComparisonHtmlReport', () => {
  it('produces valid HTML document', () => {
    const html = generateComparisonHtmlReport(makeComparisonResult());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes both domain names', () => {
    const html = generateComparisonHtmlReport(makeComparisonResult());
    expect(html).toContain('site-a.com');
    expect(html).toContain('site-b.com');
  });

  it('renders two score circles', () => {
    const html = generateComparisonHtmlReport(makeComparisonResult());
    const svgCount = (html.match(/<svg/g) || []).length;
    expect(svgCount).toBe(2);
  });

  it('shows per-criterion comparison table', () => {
    const result = makeComparisonResult();
    const html = generateComparisonHtmlReport(result);
    expect(html).toContain('Per-Criterion Comparison');
    expect(html).toContain('llms.txt File');
    expect(html).toContain('Delta');
  });

  it('shows positive and negative deltas with correct classes', () => {
    const html = generateComparisonHtmlReport(makeComparisonResult());
    expect(html).toContain('delta-positive');
    // Score 0 vs 0 (after -2 clamped to 0) = tied
    expect(html).toContain('delta-zero');
  });

  it('shows advantage summary', () => {
    const html = generateComparisonHtmlReport(makeComparisonResult());
    expect(html).toContain('Advantages');
    expect(html).toContain('Tied Criteria');
  });

  it('escapes domain names', () => {
    const result = makeComparisonResult();
    result.siteA.site = '<script>xss</script>.com';
    const html = generateComparisonHtmlReport(result);
    expect(html).not.toContain('<script>xss</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
