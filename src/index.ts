/**
 * AEORank - AI Engine Optimization audit engine.
 *
 * Three tiers of access:
 *   1. Simple:   import { audit } from 'aeorank'
 *   2. Typed:    import type { AuditData, ScoreCardItem } from 'aeorank'
 *   3. Advanced: import { prefetchSiteData, calculateOverallScore } from 'aeorank'
 */

// ─── Primary API ────────────────────────────────────────────────────────────

export { audit } from './audit.js';
export type { AuditOptions, AuditResult } from './audit.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  Status,
  Severity,
  FindingType,
  ImpactLevel,
  ScoreCardItem,
  DetailedFinding,
  CriterionDetail,
  Deliverable,
  PitchMetric,
  PageCategory,
  PageIssue,
  PageReview,
  AuditData,
  AuditStatus,
  Priority,
  FindingSeverity,
  AuditFinding,
} from './types.js';

// ─── Advanced: individual pipeline stages ───────────────────────────────────

export {
  prefetchSiteData,
  auditSiteFromData,
  extractRawDataSummary,
} from './site-crawler.js';

export type {
  CriterionResult,
  SiteData,
  FetchResult,
  RawDataSummary,
} from './site-crawler.js';

export { calculateOverallScore } from './scoring.js';

export {
  buildScorecard,
  buildDetailedFindings,
  scoreToStatus,
  CRITERION_LABELS,
} from './scorecard-builder.js';

export {
  generateVerdict,
  generateOpportunities,
  generatePitchNumbers,
  generateBottomLine,
} from './narrative-generator.js';

export {
  analyzePage,
  analyzeAllPages,
} from './page-analyzer.js';

export {
  fetchMultiPageData,
  extractNavLinks,
  extractContentPagesFromSitemap,
} from './multi-page-fetcher.js';

export {
  isSpaShell,
  classifyRendering,
  fetchWithHeadless,
} from './headless-fetch.js';

export type {
  RenderingMethod,
  HeadlessOptions,
} from './headless-fetch.js';

export { detectParkedDomain } from './parked-domain.js';
export type { ParkedDomainResult } from './parked-domain.js';

// ─── HTML reports ────────────────────────────────────────────────────────────

export { generateHtmlReport, generateComparisonHtmlReport } from './html-report.js';

// ─── Comparison ──────────────────────────────────────────────────────────────

export { compare } from './compare.js';
export type { ComparisonResult, CriterionComparison } from './compare.js';
