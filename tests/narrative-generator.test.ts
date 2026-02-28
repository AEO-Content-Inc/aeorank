import { describe, it, expect } from 'vitest';
import {
  generateVerdict,
  generateOpportunities,
  generatePitchNumbers,
  generateBottomLine,
} from '../src/narrative-generator.js';
import type { ScoreCardItem } from '../src/types.js';
import type { CriterionResult, RawDataSummary } from '../src/site-crawler.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeScorecard(overrides: Partial<ScoreCardItem>[] = []): ScoreCardItem[] {
  const defaults: ScoreCardItem[] = [
    { id: 1, criterion: 'llms.txt File', score: 0, status: 'MISSING', keyFindings: 'No llms.txt' },
    { id: 2, criterion: 'Schema.org', score: 8, status: 'STRONG', keyFindings: 'Good schema' },
    { id: 3, criterion: 'Q&A Format', score: 5, status: 'PARTIAL', keyFindings: 'Some Q&A' },
    { id: 4, criterion: 'Clean HTML', score: 9, status: 'STRONG', keyFindings: 'Clean' },
    { id: 5, criterion: 'Entity Authority', score: 3, status: 'WEAK', keyFindings: 'Weak' },
  ];
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

function makeRawData(overrides: Partial<RawDataSummary> = {}): RawDataSummary {
  return {
    domain: 'example.com',
    protocol: 'https',
    homepage_length: 50000,
    homepage_text_length: 10000,
    has_https: true,
    llms_txt_status: null,
    llms_txt_length: 0,
    robots_txt_status: 200,
    robots_txt_snippet: 'User-agent: *',
    robots_txt_ai_crawlers: ['gptbot'],
    robots_txt_blocked_crawlers: [],
    schema_types_found: ['organization', 'website'],
    schema_block_count: 2,
    faq_page_status: null,
    faq_page_length: 0,
    sitemap_status: 200,
    internal_link_count: 25,
    external_link_count: 5,
    question_headings_count: 3,
    h1_count: 1,
    has_meta_description: true,
    has_title: true,
    has_phone: true,
    has_address: true,
    has_org_schema: true,
    has_social_links: true,
    semantic_elements_found: ['main', 'nav', 'footer'],
    img_count: 10,
    img_with_alt_count: 8,
    has_lang_attr: true,
    has_aria: true,
    has_breadcrumbs: false,
    has_nav: true,
    has_footer: true,
    has_case_studies: false,
    has_statistics: true,
    has_expert_attribution: false,
    has_blog_section: true,
    has_date_modified_schema: true,
    time_element_count: 2,
    sitemap_url_count: 30,
    has_rss_feed: false,
    table_count: 1,
    ordered_list_count: 2,
    unordered_list_count: 5,
    definition_pattern_count: 1,
    has_ai_txt: false,
    has_person_schema: false,
    fact_data_point_count: 5,
    has_canonical: true,
    has_license_schema: false,
    sitemap_recent_lastmod_count: 3,
    has_speakable_schema: false,
    speakable_selector_count: 0,
    blog_sample_count: 3,
    blog_sample_urls: [],
    blog_sample_schema_types: [],
    blog_sample_question_headings: 2,
    blog_sample_faq_schema_found: false,
    ...overrides,
  };
}

function makeCriterionResults(): CriterionResult[] {
  return [
    { criterion: 'llms_txt', criterion_label: 'llms.txt File', score: 0, status: 'fail', findings: [{ severity: 'critical', detail: 'No llms.txt' }], fix_priority: 'P0' },
    { criterion: 'schema_markup', criterion_label: 'Schema.org', score: 8, status: 'pass', findings: [{ severity: 'info', detail: 'Good' }], fix_priority: 'P3' },
    { criterion: 'qa_content_format', criterion_label: 'Q&A Format', score: 5, status: 'partial', findings: [{ severity: 'medium', detail: 'Some Q&A' }], fix_priority: 'P1' },
    { criterion: 'clean_html', criterion_label: 'Clean HTML', score: 9, status: 'pass', findings: [{ severity: 'info', detail: 'Clean' }], fix_priority: 'P3' },
    { criterion: 'entity_consistency', criterion_label: 'Entity Authority', score: 3, status: 'fail', findings: [{ severity: 'high', detail: 'Weak' }], fix_priority: 'P1' },
    { criterion: 'robots_txt', criterion_label: 'robots.txt', score: 6, status: 'partial', findings: [{ severity: 'low', detail: 'Basic' }], fix_priority: 'P2' },
    { criterion: 'faq_section', criterion_label: 'FAQ Section', score: 2, status: 'fail', findings: [{ severity: 'high', detail: 'No FAQ' }], fix_priority: 'P0' },
    { criterion: 'original_data', criterion_label: 'Original Data', score: 4, status: 'partial', findings: [{ severity: 'medium', detail: 'Some data' }], fix_priority: 'P1' },
    { criterion: 'internal_linking', criterion_label: 'Internal Linking', score: 7, status: 'pass', findings: [{ severity: 'info', detail: 'Good links' }], fix_priority: 'P3' },
    { criterion: 'semantic_html', criterion_label: 'Semantic HTML', score: 7, status: 'pass', findings: [{ severity: 'info', detail: 'Good' }], fix_priority: 'P3' },
  ];
}

// ─── generateVerdict ─────────────────────────────────────────────────────────

describe('generateVerdict', () => {
  it('uses excellent opening for 86+', () => {
    const verdict = generateVerdict(90, makeScorecard(), makeRawData(), 'example.com');
    expect(verdict).toContain('Excellent AEO implementation');
    expect(verdict).toContain('90/100');
  });

  it('uses strong opening for 71-85', () => {
    const verdict = generateVerdict(75, makeScorecard(), makeRawData(), 'example.com');
    expect(verdict).toContain('Strong AEO fundamentals');
  });

  it('uses moderate opening for 56-70', () => {
    const verdict = generateVerdict(60, makeScorecard(), makeRawData(), 'example.com');
    expect(verdict).toContain('Moderate AEO readiness');
  });

  it('uses below-average opening for 41-55', () => {
    const verdict = generateVerdict(45, makeScorecard(), makeRawData(), 'example.com');
    expect(verdict).toContain('Below-average');
  });

  it('uses critical opening for 0-40', () => {
    const verdict = generateVerdict(30, makeScorecard(), makeRawData(), 'example.com');
    expect(verdict).toContain('Critical AEO gaps');
    expect(verdict).toContain('example.com');
  });

  it('mentions strengths when present', () => {
    const scorecard = makeScorecard();
    scorecard[1].score = 9; // Schema: STRONG
    scorecard[3].score = 10; // Clean HTML: STRONG
    const verdict = generateVerdict(75, scorecard, makeRawData(), 'example.com');
    expect(verdict).toContain('Key strengths');
  });

  it('mentions gaps when present', () => {
    const scorecard = makeScorecard();
    scorecard[0].score = 0;
    scorecard[4].score = 2;
    const verdict = generateVerdict(60, scorecard, makeRawData(), 'example.com');
    expect(verdict).toContain('Priority gaps');
  });

  it('mentions HTTPS when missing', () => {
    const verdict = generateVerdict(60, makeScorecard(), makeRawData({ has_https: false }), 'example.com');
    expect(verdict).toContain('HTTPS');
  });
});

// ─── generateOpportunities ──────────────────────────────────────────────────

describe('generateOpportunities', () => {
  it('returns Deliverable[] array', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    expect(Array.isArray(opps)).toBe(true);
    expect(opps.length).toBeGreaterThan(0);
    for (const opp of opps) {
      expect(opp).toHaveProperty('id');
      expect(opp).toHaveProperty('name');
      expect(opp).toHaveProperty('description');
      expect(opp).toHaveProperty('effort');
      expect(opp).toHaveProperty('impact');
    }
  });

  it('skips criteria scoring > 7', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const names = opps.map(o => o.name);
    // schema_markup has score 8, clean_html has score 9 - both should be skipped
    expect(names).not.toContain('Add Schema.org Structured Data');
    expect(names).not.toContain('Fix HTML Structure & Enable HTTPS');
  });

  it('includes criteria scoring <= 7', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const names = opps.map(o => o.name);
    expect(names).toContain('Create llms.txt File');
  });

  it('returns at most 10 opportunities', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    expect(opps.length).toBeLessThanOrEqual(10);
  });

  it('sorts by impact score descending', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    // First opportunity should be higher impact than last
    // llms.txt (score 0, weight 0.10) = 10 impact points vs robots_txt (score 6, weight 0.05) = 2
    const llmsIdx = opps.findIndex(o => o.name === 'Create llms.txt File');
    const robotsIdx = opps.findIndex(o => o.name === 'Configure robots.txt for AI Crawlers');
    if (llmsIdx !== -1 && robotsIdx !== -1) {
      expect(llmsIdx).toBeLessThan(robotsIdx);
    }
  });

  it('assigns QUICK WIN to low-effort items with impactScore >= 3', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const llms = opps.find(o => o.name === 'Create llms.txt File');
    expect(llms).toBeDefined();
    expect(llms!.impact).toBe('QUICK WIN'); // score 0, weight 0.10, effort Low -> impactScore 10
  });

  it('returns empty array when all criteria score > 7', () => {
    const results: CriterionResult[] = [
      { criterion: 'llms_txt', criterion_label: 'llms.txt', score: 8, status: 'pass', findings: [], fix_priority: 'P3' },
      { criterion: 'schema_markup', criterion_label: 'Schema', score: 9, status: 'pass', findings: [], fix_priority: 'P3' },
    ];
    const opps = generateOpportunities([], results);
    expect(opps).toHaveLength(0);
  });
});

// ─── generatePitchNumbers ────────────────────────────────────────────────────

describe('generatePitchNumbers', () => {
  it('returns PitchMetric[] array', () => {
    const metrics = generatePitchNumbers(65, makeRawData(), makeScorecard());
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThanOrEqual(5);
    for (const m of metrics) {
      expect(m).toHaveProperty('metric');
      expect(m).toHaveProperty('value');
      expect(m).toHaveProperty('significance');
    }
  });

  it('includes AEO Score metric', () => {
    const metrics = generatePitchNumbers(75, makeRawData(), makeScorecard());
    const score = metrics.find(m => m.metric === 'AEO Score');
    expect(score).toBeDefined();
    expect(score!.value).toBe('75/100');
  });

  it('includes Schema Types metric', () => {
    const metrics = generatePitchNumbers(65, makeRawData({ schema_types_found: ['organization', 'website', 'faqpage'] }), makeScorecard());
    const schema = metrics.find(m => m.metric === 'Schema Types');
    expect(schema).toBeDefined();
    expect(schema!.value).toBe('3 found');
  });

  it('includes Criteria Passing count', () => {
    const scorecard = makeScorecard();
    // Items with score >= 7: Schema (8), Clean HTML (9) = 2
    const metrics = generatePitchNumbers(65, makeRawData(), scorecard);
    const passing = metrics.find(m => m.metric === 'Criteria Passing');
    expect(passing).toBeDefined();
    expect(passing!.value).toBe('2/23');
  });
});

// ─── generateBottomLine ──────────────────────────────────────────────────────

describe('generateBottomLine', () => {
  it('returns a non-empty string', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const bottomLine = generateBottomLine(65, opps, makeScorecard(), 'example.com');
    expect(typeof bottomLine).toBe('string');
    expect(bottomLine.length).toBeGreaterThan(0);
  });

  it('includes domain name', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const bottomLine = generateBottomLine(65, opps, makeScorecard(), 'example.com');
    expect(bottomLine).toContain('example.com');
  });

  it('mentions quick wins for 71-85 range', () => {
    const opps = [
      { id: 1, name: 'Create llms.txt File', description: 'desc', effort: 'Low', impact: 'QUICK WIN' as const },
    ];
    const scorecard = makeScorecard();
    scorecard[1].score = 9;
    scorecard[3].score = 10;
    const bottomLine = generateBottomLine(75, opps, scorecard, 'example.com');
    expect(bottomLine).toContain('quick win');
  });

  it('mentions passing criteria count', () => {
    const opps = generateOpportunities(makeScorecard(), makeCriterionResults());
    const bottomLine = generateBottomLine(65, opps, makeScorecard(), 'example.com');
    // Should mention X/5 criteria passing
    expect(bottomLine).toMatch(/\d+\/5/);
  });
});
