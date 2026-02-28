/**
 * Deterministic narrative generation from scorecard data.
 * Produces verdict, opportunities, pitchNumbers, and bottomLine
 * without any LLM calls - pure template-based generation.
 */

import type { ScoreCardItem, Deliverable, PitchMetric, ImpactLevel } from './types.js';
import type { CriterionResult } from './site-crawler.js';
import type { RawDataSummary } from './site-crawler.js';

// ─── Scoring weights (mirrored from scoring.ts for impact calculation) ───────

const CRITERION_WEIGHTS: Record<string, number> = {
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

// ─── Opportunity templates (23 criteria) ─────────────────────────────────────

interface OpportunityTemplate {
  name: string;
  effort: string;
  description: string;
}

const OPPORTUNITY_TEMPLATES: Record<string, OpportunityTemplate> = {
  llms_txt: {
    name: 'Create llms.txt File',
    effort: 'Low',
    description: 'Add a /llms.txt file that describes your site, core services, and key pages in markdown format. This helps AI engines like ChatGPT and Claude understand your site structure and content offerings.',
  },
  schema_markup: {
    name: 'Add Schema.org Structured Data',
    effort: 'Medium',
    description: 'Implement JSON-LD structured data (Organization, Service, Product, FAQPage) on key pages. Schema markup helps AI engines extract and cite your content accurately.',
  },
  qa_content_format: {
    name: 'Restructure Content as Q&A',
    effort: 'Medium',
    description: 'Add question-based headings (H2/H3) throughout your content. Use "What is...", "How does...", "Why should..." patterns that match how users query AI assistants.',
  },
  clean_html: {
    name: 'Fix HTML Structure & Enable HTTPS',
    effort: 'Medium',
    description: 'Ensure clean, well-structured HTML with proper meta tags, semantic elements, and HTTPS. Clean HTML makes your content more parseable by AI crawlers.',
  },
  entity_consistency: {
    name: 'Strengthen Entity Authority (NAP)',
    effort: 'Low',
    description: 'Add Organization schema with consistent name, address, phone (NAP). Include sameAs links to social profiles and authoritative directories to strengthen entity recognition.',
  },
  robots_txt: {
    name: 'Configure robots.txt for AI Crawlers',
    effort: 'Low',
    description: 'Update robots.txt to explicitly allow AI crawlers (GPTBot, ClaudeBot, PerplexityBot). Add a Sitemap directive to help crawlers discover your content.',
  },
  faq_section: {
    name: 'Build Comprehensive FAQ Section',
    effort: 'Medium',
    description: 'Create a dedicated FAQ page with FAQPage schema markup. Cover common questions about your products, services, and industry to become a direct answer source for AI engines.',
  },
  original_data: {
    name: 'Add Original Data & Case Studies',
    effort: 'High',
    description: 'Publish original research, statistics, case studies, or proprietary data that AI engines can cite. Unique data points make your content a primary source rather than a derivative one.',
  },
  internal_linking: {
    name: 'Improve Internal Linking Architecture',
    effort: 'Medium',
    description: 'Strengthen internal linking with descriptive anchor text between related pages. Add breadcrumb navigation and ensure every key page is reachable within 3 clicks from the homepage.',
  },
  semantic_html: {
    name: 'Implement Semantic HTML5',
    effort: 'Low',
    description: 'Use semantic HTML5 elements (main, article, nav, header, footer, section) to give AI parsers clear content structure. Add lang attribute and ARIA labels for accessibility.',
  },
  content_freshness: {
    name: 'Add Content Freshness Signals',
    effort: 'Low',
    description: 'Include dateModified schema, visible last-updated dates, and time elements on content pages. Fresh content signals help AI engines prioritize your pages over stale alternatives.',
  },
  sitemap_completeness: {
    name: 'Create Complete Sitemap',
    effort: 'Low',
    description: 'Generate a comprehensive sitemap.xml with lastmod dates for all important pages. A complete sitemap ensures AI crawlers can discover and prioritize your full content library.',
  },
  rss_feed: {
    name: 'Deploy RSS/Atom Feed',
    effort: 'Low',
    description: 'Add an RSS or Atom feed linked from your homepage. Feeds signal active content publishing and give AI engines a structured way to track your latest content.',
  },
  table_list_extractability: {
    name: 'Add Structured Tables & Lists',
    effort: 'Medium',
    description: 'Use HTML tables for comparison data and ordered/unordered lists for features, steps, and specifications. Structured data formats are directly extractable by AI engines for answers.',
  },
  definition_patterns: {
    name: 'Add Definition-Style Content',
    effort: 'Low',
    description: 'Include clear definition patterns ("X refers to...", "X is defined as...") for key terms and concepts. Definition-style content is highly citable by AI engines answering "what is" queries.',
  },
  direct_answer_density: {
    name: 'Add Direct Answer Paragraphs',
    effort: 'Medium',
    description: 'Write concise, standalone answer paragraphs (2-3 sentences) immediately after question headings. These "snippet-ready" paragraphs are ideal for AI engine citations.',
  },
  content_licensing: {
    name: 'Add Content Licensing & ai.txt',
    effort: 'Low',
    description: 'Create an /ai.txt file specifying AI usage permissions and add license schema to your structured data. Clear licensing signals help AI engines understand how they can use your content.',
  },
  author_schema_depth: {
    name: 'Enhance Author & Expert Schema',
    effort: 'Low',
    description: 'Add Person schema for content authors with credentials, expertise, and sameAs links. Expert attribution strengthens E-E-A-T signals that AI engines use to evaluate source credibility.',
  },
  fact_density: {
    name: 'Increase Fact & Data Density',
    effort: 'Medium',
    description: 'Add specific numbers, percentages, statistics, and data points throughout your content. Fact-dense content gives AI engines concrete data to cite rather than vague claims.',
  },
  canonical_url: {
    name: 'Fix Canonical URL Strategy',
    effort: 'Low',
    description: 'Add rel="canonical" tags to all pages pointing to the preferred URL version. Canonical URLs prevent duplicate content confusion and consolidate AI engine citations to a single authoritative URL.',
  },
  content_velocity: {
    name: 'Increase Publishing Frequency',
    effort: 'High',
    description: 'Establish a regular content publishing cadence with dated entries in your sitemap. Consistent publishing signals to AI engines that your site is an active, current information source.',
  },
  schema_coverage: {
    name: 'Deepen Schema Coverage',
    effort: 'Medium',
    description: 'Extend structured data beyond the homepage to inner pages (articles, services, products). Consistent schema coverage across your site helps AI engines understand your full content depth.',
  },
  speakable_schema: {
    name: 'Add Speakable Schema',
    effort: 'Low',
    description: 'Add SpeakableSpecification schema with CSS selectors pointing to key content sections. This tells voice assistants and AI engines which parts of your page are most suitable for spoken answers.',
  },
};

// ─── Impact calculation ──────────────────────────────────────────────────────

function calculateImpact(score: number, weight: number, effort: string): ImpactLevel {
  const impactScore = (10 - score) * weight * 100;

  // Quick win override: low effort + meaningful impact
  if (effort === 'Low' && impactScore >= 3) return 'QUICK WIN';

  if (impactScore >= 12) return 'CRITICAL';
  if (impactScore >= 8) return 'HIGH';
  if (impactScore >= 5) return 'CORE AEO';
  if (impactScore >= 3) return 'MEDIUM';
  return 'LOW';
}

// ─── Verdict generation ──────────────────────────────────────────────────────

export function generateVerdict(
  score: number,
  scorecard: ScoreCardItem[],
  rawData: RawDataSummary,
  domain: string
): string {
  // Score-tier opening
  let opening: string;
  if (score >= 86) {
    opening = `Excellent AEO implementation scoring ${score}/100.`;
  } else if (score >= 71) {
    opening = `Strong AEO fundamentals scoring ${score}/100 with room for optimization.`;
  } else if (score >= 56) {
    opening = `Moderate AEO readiness at ${score}/100 with significant gaps to address.`;
  } else if (score >= 41) {
    opening = `Below-average AEO readiness at ${score}/100 - multiple areas need attention.`;
  } else {
    opening = `Critical AEO gaps at ${score}/100 - ${domain} is largely invisible to AI engines.`;
  }

  // Top 3 strengths (score >= 8)
  const strengths = scorecard
    .filter(s => s.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Bottom 3 weaknesses (score <= 4)
  const weaknesses = scorecard
    .filter(s => s.score <= 4)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const parts = [opening];

  if (strengths.length > 0) {
    const names = strengths.map(s => s.criterion);
    parts.push(`Key strengths include ${formatList(names)}.`);
  }

  if (weaknesses.length > 0) {
    const names = weaknesses.map(s => s.criterion);
    parts.push(`Priority gaps: ${formatList(names)}.`);
  }

  // Protocol note
  if (!rawData.has_https) {
    parts.push('HTTPS is not enabled, which caps several criteria scores and reduces AI crawler trust.');
  }

  // SPA rendering note
  if (rawData.rendered_with_headless) {
    parts.push('Note: this site uses client-side JavaScript rendering. AI crawlers see an empty page shell instead of content, which is the primary factor limiting the score.');
  }

  return parts.join(' ');
}

// ─── Opportunities generation ────────────────────────────────────────────────

export function generateOpportunities(
  scorecard: ScoreCardItem[],
  criterionResults: CriterionResult[]
): Deliverable[] {
  const candidates: Array<{
    criterion: string;
    score: number;
    weight: number;
    impactScore: number;
    template: OpportunityTemplate;
    impact: ImpactLevel;
  }> = [];

  for (const result of criterionResults) {
    if (result.score > 7) continue; // Only generate opportunities for scores <= 7

    const weight = CRITERION_WEIGHTS[result.criterion] ?? 0.05;
    const template = OPPORTUNITY_TEMPLATES[result.criterion];
    if (!template) continue;

    const impactScore = (10 - result.score) * weight * 100;
    const impact = calculateImpact(result.score, weight, template.effort);

    candidates.push({
      criterion: result.criterion,
      score: result.score,
      weight,
      impactScore,
      template,
      impact,
    });
  }

  // Sort by impact score descending (highest impact first)
  candidates.sort((a, b) => b.impactScore - a.impactScore);

  // Take top 8-10
  const top = candidates.slice(0, 10);

  return top.map((c, i) => ({
    id: i + 1,
    name: c.template.name,
    description: c.template.description,
    effort: c.template.effort,
    impact: c.impact,
  }));
}

// ─── Pitch numbers generation ────────────────────────────────────────────────

export function generatePitchNumbers(
  score: number,
  rawData: RawDataSummary,
  scorecard: ScoreCardItem[]
): PitchMetric[] {
  const metrics: PitchMetric[] = [];

  // 0. Rendering method (SPA warning - prepended so it appears first)
  if (rawData.rendered_with_headless) {
    metrics.push({
      metric: 'Rendering Method',
      value: 'Client-Side Only',
      significance: 'AI crawlers see empty HTML. All content loads via JavaScript, making this site invisible to ChatGPT, Claude, and Perplexity.',
    });
  }

  // 1. Overall AEO Score
  metrics.push({
    metric: 'AEO Score',
    value: `${score}/100`,
    significance: score >= 70
      ? 'Above average AI engine visibility'
      : score >= 50
        ? 'Moderate AI visibility with clear improvement paths'
        : 'Below average - significant optimization needed',
  });

  // 2. Schema types found
  const schemaCount = rawData.schema_types_found.length;
  metrics.push({
    metric: 'Schema Types',
    value: `${schemaCount} found`,
    significance: schemaCount >= 4
      ? 'Rich structured data helps AI engines parse content'
      : schemaCount >= 1
        ? 'Basic schema present but more types would improve AI extraction'
        : 'No structured data - AI engines cannot reliably extract content',
  });

  // 3. AI crawler readiness
  const aiCrawlerCount = rawData.robots_txt_ai_crawlers.length;
  const blockedCount = rawData.robots_txt_blocked_crawlers.length;
  metrics.push({
    metric: 'AI Crawler Access',
    value: blockedCount > 0
      ? `${blockedCount} blocked`
      : aiCrawlerCount > 0
        ? `${aiCrawlerCount} configured`
        : 'Not configured',
    significance: blockedCount > 0
      ? 'Active AI crawlers are blocked from accessing content'
      : aiCrawlerCount > 0
        ? 'robots.txt explicitly addresses AI crawler access'
        : 'No AI-specific crawler directives in robots.txt',
  });

  // 4. Content pages indexed
  const sitemapUrls = rawData.sitemap_url_count;
  metrics.push({
    metric: 'Sitemap URLs',
    value: sitemapUrls > 0 ? `${sitemapUrls} pages` : 'No sitemap',
    significance: sitemapUrls >= 50
      ? 'Comprehensive content library discoverable by AI crawlers'
      : sitemapUrls >= 10
        ? 'Moderate content footprint in sitemap'
        : sitemapUrls > 0
          ? 'Small sitemap - expanding content improves AI coverage'
          : 'No sitemap means AI crawlers must discover pages via links only',
  });

  // 5. Internal linking
  const linkCount = rawData.internal_link_count;
  metrics.push({
    metric: 'Internal Links',
    value: `${linkCount} links`,
    significance: linkCount >= 30
      ? 'Strong internal linking supports AI content discovery'
      : linkCount >= 10
        ? 'Moderate linking - adding more cross-references improves navigability'
        : 'Weak internal linking limits AI crawler depth',
  });

  // 6. Question headings
  const questionCount = rawData.question_headings_count + (rawData.blog_sample_question_headings || 0);
  if (questionCount > 0) {
    metrics.push({
      metric: 'Question Headings',
      value: `${questionCount} found`,
      significance: 'Question-based headings match how users query AI assistants',
    });
  }

  // 7. Criteria passing (>= 7)
  const passing = scorecard.filter(s => s.score >= 7).length;
  metrics.push({
    metric: 'Criteria Passing',
    value: `${passing}/23`,
    significance: passing >= 18
      ? 'Excellent coverage across AEO dimensions'
      : passing >= 12
        ? 'Good foundation with room to improve remaining criteria'
        : `${23 - passing} criteria need attention for full AI visibility`,
  });

  return metrics;
}

// ─── Bottom line generation ──────────────────────────────────────────────────

export function generateBottomLine(
  score: number,
  opportunities: Deliverable[],
  scorecard: ScoreCardItem[],
  domain: string
): string {
  const quickWins = opportunities.filter(o => o.impact === 'QUICK WIN');
  const criticalOps = opportunities.filter(o => o.impact === 'CRITICAL' || o.impact === 'HIGH');

  const passing = scorecard.filter(s => s.score >= 7).length;
  const total = scorecard.length;

  let summary: string;
  if (score >= 86) {
    summary = `${domain} demonstrates excellent AI engine optimization with ${passing}/${total} criteria at good or strong levels. Focus on maintaining content freshness and expanding structured data coverage to stay ahead.`;
  } else if (score >= 71) {
    summary = `${domain} has a solid AEO foundation with ${passing}/${total} criteria passing.`;
    if (quickWins.length > 0) {
      summary += ` ${quickWins.length} quick wins available: ${quickWins.slice(0, 3).map(q => q.name).join(', ')}.`;
    }
    if (criticalOps.length > 0) {
      summary += ` Address ${criticalOps.length} high-impact opportunities to push the score above 85.`;
    }
  } else if (score >= 56) {
    summary = `${domain} has moderate AI visibility with ${passing}/${total} criteria passing. ${opportunities.length} improvement opportunities identified.`;
    if (quickWins.length > 0) {
      summary += ` Start with quick wins: ${quickWins.slice(0, 3).map(q => q.name).join(', ')}.`;
    }
  } else if (score >= 41) {
    summary = `${domain} needs significant AEO work with only ${passing}/${total} criteria passing.`;
    if (criticalOps.length > 0) {
      summary += ` Priority: ${criticalOps.slice(0, 3).map(c => c.name).join(', ')}.`;
    }
    summary += ` Implementing the top ${Math.min(5, opportunities.length)} recommendations could improve the score by 15-25 points.`;
  } else {
    summary = `${domain} is largely invisible to AI engines with only ${passing}/${total} criteria passing. Fundamental AEO infrastructure is missing.`;
    if (opportunities.length > 0) {
      summary += ` Start with: ${opportunities.slice(0, 3).map(o => o.name).join(', ')}.`;
    }
    summary += ` A comprehensive AEO implementation could transform AI visibility from near-zero to competitive.`;
  }

  return summary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
