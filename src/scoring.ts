import type { CriterionResult } from './site-crawler.js';

const WEIGHTS: Record<string, number> = {
  // Original 10
  llms_txt: 0.10,
  schema_markup: 0.15,
  qa_content_format: 0.15,
  clean_html: 0.10,
  entity_consistency: 0.10,
  robots_txt: 0.05,
  faq_section: 0.10,
  original_data: 0.10,
  internal_linking: 0.10,
  semantic_html: 0.05,
  // New 12
  content_freshness: 0.07,
  sitemap_completeness: 0.05,
  rss_feed: 0.03,
  table_list_extractability: 0.07,
  definition_patterns: 0.04,
  direct_answer_density: 0.07,
  content_licensing: 0.04,
  author_schema_depth: 0.04,
  fact_density: 0.05,
  canonical_url: 0.04,
  content_velocity: 0.03,
  schema_coverage: 0.03,
  speakable_schema: 0.03,
};

export function calculateOverallScore(criteria: CriterionResult[]): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const c of criteria) {
    const weight = WEIGHTS[c.criterion] ?? 0.10;
    weightedSum += (c.score / 10) * weight * 100;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}
