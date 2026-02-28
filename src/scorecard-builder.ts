/**
 * Shared scorecard building functions.
 * Extracted from cli/pre-crawl.ts for reuse in instant-audit and other consumers.
 */

import type { CriterionResult } from './site-crawler.js';
import type { Status, FindingType, Severity, ScoreCardItem, CriterionDetail, DetailedFinding } from './types.js';
import type { AuditFinding } from './types.js';

// ─── Criterion label mapping (site-crawler labels -> prompt-standard names) ──

export const CRITERION_LABELS: Record<string, string> = {
  'llms.txt File': 'llms.txt File',
  'Schema.org Structured Data': 'Schema.org Structured Data',
  'Q&A Content Format': 'Q&A Content Format',
  'Clean, Crawlable HTML': 'Clean, Crawlable HTML',
  'Entity Authority & E-E-A-T': 'Entity Authority & NAP Consistency',
  'robots.txt for AI Crawlers': 'robots.txt for AI Crawlers',
  'Comprehensive FAQ Sections': 'Comprehensive FAQ Section',
  'Original Data & Expert Content': 'Original Data & Expert Analysis',
  'Internal Linking Architecture': 'Internal Linking Structure',
  'Semantic HTML5 & Accessibility': 'Semantic HTML5 & Accessibility',
  'Content Freshness Signals': 'Content Freshness Signals',
  'Sitemap Completeness': 'Sitemap Completeness',
  'RSS/Atom Feed': 'RSS/Atom Feed',
  'Table & List Extractability': 'Table & List Extractability',
  'Definition Patterns': 'Definition Patterns',
  'Direct Answer Paragraphs': 'Direct Answer Paragraphs',
  'Content Licensing & AI Permissions': 'Content Licensing & AI Permissions',
  'Author & Expert Schema': 'Author & Expert Schema',
  'Fact & Data Density': 'Fact & Data Density',
  'Canonical URL Strategy': 'Canonical URL Strategy',
  'Content Publishing Velocity': 'Content Publishing Velocity',
  'Schema Coverage & Depth': 'Schema Coverage & Depth',
  'Speakable Schema': 'Speakable Schema',
};

// ─── Score to Status mapping (matches AI prompt: 0=MISSING...8-10=STRONG) ────

export function scoreToStatus(score: number): Status {
  if (score === 0) return 'MISSING';
  if (score === 1) return 'NEARLY EMPTY';
  if (score === 2) return 'POOR';
  if (score === 3) return 'WEAK';
  if (score <= 5) return 'PARTIAL';
  if (score === 6) return 'MODERATE';
  if (score === 7) return 'GOOD';
  return 'STRONG';
}

// ─── Finding severity mapping (site-crawler -> audit format) ─────────────────

export function mapFindingSeverity(severity: AuditFinding['severity']): Severity {
  switch (severity) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'MISSING';
    case 'medium': return 'ADD';
    case 'low': return 'PARTIAL';
    case 'info': return 'WORKING';
    default: return 'PARTIAL';
  }
}

export function mapFindingType(severity: AuditFinding['severity'], hasFix: boolean): FindingType {
  if (severity === 'info') return 'Good';
  if (severity === 'critical') return 'Critical';
  if (severity === 'high') return 'Missing';
  if (hasFix) return 'Issue';
  return 'Note';
}

// ─── Convert CriterionResult to scorecard + detailedFindings format ──────────

export function buildScorecard(results: CriterionResult[]): ScoreCardItem[] {
  return results.map((r, i) => {
    const label = CRITERION_LABELS[r.criterion_label] || r.criterion_label;

    // Build keyFindings from the most important findings (2-3 sentences)
    const keyParts: string[] = [];
    for (const f of r.findings) {
      if (keyParts.length >= 3) break;
      keyParts.push(f.detail);
    }
    const keyFindings = keyParts.join('. ') + (keyParts.length > 0 && !keyParts[keyParts.length - 1].endsWith('.') ? '.' : '');

    return {
      id: i + 1,
      criterion: label,
      score: r.score,
      status: scoreToStatus(r.score),
      keyFindings,
    };
  });
}

export function buildDetailedFindings(results: CriterionResult[]): CriterionDetail[] {
  return results.map((r, i) => {
    const label = CRITERION_LABELS[r.criterion_label] || r.criterion_label;

    const rawFindings: DetailedFinding[] = r.findings.map(f => ({
      type: mapFindingType(f.severity, !!f.fix),
      description: f.fix ? `${f.detail}. ${f.fix}` : f.detail,
      severity: mapFindingSeverity(f.severity),
    }));

    // Deduplicate findings by description
    const seen = new Set<string>();
    const findings: DetailedFinding[] = [];
    for (const f of rawFindings) {
      if (!seen.has(f.description)) {
        seen.add(f.description);
        findings.push(f);
      }
    }

    // Fallback: if a criterion somehow has fewer than 2 findings, add a single specific one
    if (findings.length < 2) {
      if (r.score >= 7) {
        findings.push({ type: 'Good', description: `${label} is well-implemented for AI engine visibility.`, severity: 'WORKING' });
      } else {
        findings.push({ type: 'Note', description: `${label} needs improvement - review specific issues above.`, severity: 'PARTIAL' });
      }
    }

    return {
      id: i + 1,
      name: label,
      findings,
    };
  });
}
