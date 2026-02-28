/**
 * AEORank type definitions.
 * Inlined from @aeo/shared to keep the package zero-dependency.
 */

// ─── Audit types ────────────────────────────────────────────────────────────

export type Status = 'MISSING' | 'NEARLY EMPTY' | 'POOR' | 'WEAK' | 'PARTIAL' | 'MODERATE' | 'GOOD' | 'STRONG';

export type Severity = 'WORKING' | 'GOOD' | 'GOOD PATTERN' | 'PARTIAL' | 'MISSING' | 'ADD' | 'FIX' | 'FIX IMMEDIATELY' | 'REWRITE' | 'CONFUSING' | 'INCONSISTENT' | 'SPARSE' | 'PERFORMANCE' | 'CLUTTER' | 'PLATFORM LIMIT' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'BIG OPPORTUNITY' | 'AEO GOLDMINE' | 'AEO CORE' | 'CORE AEO' | 'AEO deliverable' | 'QUICK WIN' | 'MEASUREMENT';

export type FindingType = 'Test' | 'Good' | 'Bad' | 'Missing' | 'Critical' | 'Issue' | 'Fix' | 'Exists' | 'Calc' | 'Present' | 'Note' | 'Current' | 'Volume' | 'Bonus' | 'Impact';

export type ImpactLevel = 'QUICK WIN' | 'CRITICAL' | 'HIGH' | 'CORE AEO' | 'MEDIUM' | 'LOW' | 'MEASUREMENT' | 'BIG OPPORTUNITY';

export interface ScoreCardItem {
  id: number;
  criterion: string;
  score: number;
  status: Status;
  keyFindings: string;
}

export interface DetailedFinding {
  type: FindingType;
  description: string;
  severity: Severity;
}

export interface CriterionDetail {
  id: number;
  name: string;
  findings: DetailedFinding[];
}

export interface Deliverable {
  id: number;
  name: string;
  description: string;
  effort: string;
  impact: ImpactLevel;
}

export interface PitchMetric {
  metric: string;
  value: string;
  significance: string;
}

export type PageCategory = 'homepage' | 'blog' | 'about' | 'pricing' | 'services'
  | 'contact' | 'team' | 'resources' | 'docs' | 'cases' | 'content';

export interface PageIssue {
  check: string;
  label: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PageReview {
  url: string;
  title: string;
  category: PageCategory;
  wordCount: number;
  issues: PageIssue[];
  strengths: PageIssue[];
}

export interface AuditData {
  site: string;
  auditDate: string;
  auditor: string;
  engine?: string;
  overallScore: number;
  verdict: string;
  scorecard: ScoreCardItem[];
  detailedFindings: CriterionDetail[];
  opportunities: Deliverable[];
  pitchNumbers: PitchMetric[];
  bottomLine: string;
  pagesReviewed?: PageReview[];
}

// ─── Visibility types (used by site-crawler criterion results) ──────────────

export type AuditStatus = 'pass' | 'fail' | 'partial' | 'not_found';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AuditFinding {
  severity: FindingSeverity;
  detail: string;
  fix?: string;
}
