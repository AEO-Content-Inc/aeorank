import { describe, it, expect } from 'vitest';
import {
  generateVerdict,
  generateOpportunities,
  generatePitchNumbers,
  generateBottomLine,
} from '../src/narrative-generator.js';
import type { ScoreCardItem, Deliverable } from '../src/types.js';
import type { CriterionResult, RawDataSummary } from '../src/site-crawler.js';

function makeScorecard(overrides: Partial<ScoreCardItem>[] = []): ScoreCardItem[] {
  const defaults: ScoreCardItem[] = [
    { id: 1, criterion: 'llms.txt File', score: 2, status: 'WEAK', keyFindings: '' },
    { id: 2, criterion: 'Schema.org', score: 3, status: 'WEAK', keyFindings: '' },
    { id: 3, criterion: 'Q&A Format', score: 1, status: 'MISSING', keyFindings: '' },
    { id: 4, criterion: 'Clean HTML', score: 4, status: 'PARTIAL', keyFindings: '' },
    { id: 5, criterion: 'Entity Authority', score: 2, status: 'WEAK', keyFindings: '' },
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
    robots_txt_snippet: '',
    robots_txt_ai_crawlers: [],
    robots_txt_blocked_crawlers: [],
    schema_types_found: [],
    schema_block_count: 0,
    faq_page_status: null,
    faq_page_length: 0,
    sitemap_status: 200,
    internal_link_count: 5,
    external_link_count: 1,
    question_headings_count: 0,
    h1_count: 1,
    has_meta_description: false,
    has_title: true,
    has_phone: false,
    has_address: false,
    has_org_schema: false,
    has_social_links: false,
    semantic_elements_found: [],
    img_count: 0,
    img_with_alt_count: 0,
    has_lang_attr: false,
    has_aria: false,
    has_breadcrumbs: false,
    has_nav: false,
    has_footer: false,
    has_case_studies: false,
    has_statistics: false,
    has_expert_attribution: false,
    has_blog_section: false,
    has_date_modified_schema: false,
    time_element_count: 0,
    sitemap_url_count: 0,
    has_rss_feed: false,
    table_count: 0,
    ordered_list_count: 0,
    unordered_list_count: 0,
    definition_pattern_count: 0,
    has_ai_txt: false,
    has_person_schema: false,
    fact_data_point_count: 0,
    has_canonical: false,
    has_license_schema: false,
    sitemap_recent_lastmod_count: 0,
    has_speakable_schema: false,
    speakable_selector_count: 0,
    blog_sample_count: 0,
    blog_sample_urls: [],
    blog_sample_schema_types: [],
    blog_sample_question_headings: 0,
    blog_sample_faq_schema_found: false,
    ...overrides,
  };
}

// ─── generateBottomLine extended tests ───────────────────────────────────────

describe('generateBottomLine (extended score ranges)', () => {
  const makeOpps = (count: number, impacts: string[] = []): Deliverable[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Opportunity ${i + 1}`,
      description: 'desc',
      effort: 'Low',
      impact: (impacts[i] || 'MEDIUM') as any,
    }));

  it('generates excellent summary for score >= 86', () => {
    const scorecard = makeScorecard().map(s => ({ ...s, score: 9 }));
    const line = generateBottomLine(90, [], scorecard, 'great.com');
    expect(line).toContain('great.com');
    expect(line).toContain('excellent');
  });

  it('generates solid foundation summary for 71-85 with critical ops', () => {
    const opps = makeOpps(3, ['CRITICAL', 'HIGH', 'QUICK WIN']);
    const line = generateBottomLine(75, opps, makeScorecard(), 'mid.com');
    expect(line).toContain('solid AEO foundation');
    expect(line).toContain('high-impact');
  });

  it('generates solid foundation for 71-85 without quick wins or critical', () => {
    const opps = makeOpps(2, ['MEDIUM', 'LOW']);
    const line = generateBottomLine(72, opps, makeScorecard(), 'mid.com');
    expect(line).toContain('solid AEO foundation');
  });

  it('generates moderate summary for 56-70 with quick wins', () => {
    const opps = makeOpps(3, ['QUICK WIN', 'QUICK WIN', 'MEDIUM']);
    const line = generateBottomLine(60, opps, makeScorecard(), 'mod.com');
    expect(line).toContain('moderate AI visibility');
    expect(line).toContain('quick wins');
  });

  it('generates moderate summary for 56-70 without quick wins', () => {
    const opps = makeOpps(3, ['MEDIUM', 'MEDIUM', 'LOW']);
    const line = generateBottomLine(60, opps, makeScorecard(), 'mod.com');
    expect(line).toContain('moderate AI visibility');
  });

  it('generates significant work summary for 41-55 with critical ops', () => {
    const opps = makeOpps(5, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOW']);
    const line = generateBottomLine(45, opps, makeScorecard(), 'low.com');
    expect(line).toContain('needs significant AEO work');
    expect(line).toContain('Priority');
    expect(line).toContain('improve the score by 15-25 points');
  });

  it('generates significant work summary for 41-55 without critical ops', () => {
    const opps = makeOpps(3, ['MEDIUM', 'LOW', 'LOW']);
    const line = generateBottomLine(45, opps, makeScorecard(), 'low.com');
    expect(line).toContain('needs significant AEO work');
    expect(line).toContain('Implementing the top');
  });

  it('generates invisible summary for score < 41 with opportunities', () => {
    const opps = makeOpps(5, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOW']);
    const line = generateBottomLine(20, opps, makeScorecard(), 'bad.com');
    expect(line).toContain('largely invisible to AI engines');
    expect(line).toContain('Start with');
    expect(line).toContain('near-zero to competitive');
  });

  it('generates invisible summary for score < 41 without opportunities', () => {
    const line = generateBottomLine(20, [], makeScorecard(), 'bad.com');
    expect(line).toContain('largely invisible');
    expect(line).toContain('comprehensive AEO implementation');
  });
});

// ─── generateVerdict extended tests ──────────────────────────────────────────

describe('generateVerdict (extended)', () => {
  it('mentions SPA rendering when rendered_with_headless is true', () => {
    const rawData = makeRawData({ rendered_with_headless: true });
    const verdict = generateVerdict(60, makeScorecard(), rawData, 'spa.com');
    expect(verdict).toContain('client-side JavaScript rendering');
  });

  it('handles scorecard with no strengths or weaknesses', () => {
    const scorecard = makeScorecard().map(s => ({ ...s, score: 6 })); // All moderate
    const verdict = generateVerdict(60, scorecard, makeRawData(), 'mid.com');
    expect(verdict).not.toContain('Key strengths');
    expect(verdict).not.toContain('Priority gaps');
  });

  it('formatList handles 2-item list (inside verdict)', () => {
    const scorecard: ScoreCardItem[] = [
      { id: 1, criterion: 'Schema', score: 9, status: 'STRONG', keyFindings: '' },
      { id: 2, criterion: 'HTML', score: 10, status: 'STRONG', keyFindings: '' },
      { id: 3, criterion: 'Other', score: 6, status: 'MODERATE', keyFindings: '' },
    ];
    const verdict = generateVerdict(80, scorecard, makeRawData(), 'x.com');
    // Sorted by score desc: HTML (10) before Schema (9)
    expect(verdict).toContain('HTML and Schema');
  });

  it('formatList handles 3+ item list (inside verdict)', () => {
    const scorecard: ScoreCardItem[] = [
      { id: 1, criterion: 'A', score: 9, status: 'STRONG', keyFindings: '' },
      { id: 2, criterion: 'B', score: 10, status: 'STRONG', keyFindings: '' },
      { id: 3, criterion: 'C', score: 8, status: 'STRONG', keyFindings: '' },
      { id: 4, criterion: 'D', score: 6, status: 'MODERATE', keyFindings: '' },
    ];
    const verdict = generateVerdict(80, scorecard, makeRawData(), 'x.com');
    expect(verdict).toContain(', and'); // Oxford comma from formatList
  });
});

// ─── generatePitchNumbers extended tests ────────────────────────────────────

describe('generatePitchNumbers (extended)', () => {
  it('includes rendering method for headless-rendered sites', () => {
    const rawData = makeRawData({ rendered_with_headless: true });
    const metrics = generatePitchNumbers(50, rawData, makeScorecard());
    const rendering = metrics.find(m => m.metric === 'Rendering Method');
    expect(rendering).toBeDefined();
    expect(rendering!.value).toBe('Client-Side Only');
  });

  it('handles score < 50 significance for AEO Score', () => {
    const metrics = generatePitchNumbers(30, makeRawData(), makeScorecard());
    const score = metrics.find(m => m.metric === 'AEO Score');
    expect(score!.significance).toContain('Below average');
  });

  it('handles score >= 70 significance for AEO Score', () => {
    const metrics = generatePitchNumbers(75, makeRawData(), makeScorecard());
    const score = metrics.find(m => m.metric === 'AEO Score');
    expect(score!.significance).toContain('Above average');
  });

  it('handles 4+ schema types', () => {
    const rawData = makeRawData({ schema_types_found: ['a', 'b', 'c', 'd'] });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const schema = metrics.find(m => m.metric === 'Schema Types');
    expect(schema!.significance).toContain('Rich structured data');
  });

  it('handles 0 schema types', () => {
    const rawData = makeRawData({ schema_types_found: [] });
    const metrics = generatePitchNumbers(40, rawData, makeScorecard());
    const schema = metrics.find(m => m.metric === 'Schema Types');
    expect(schema!.significance).toContain('No structured data');
  });

  it('handles blocked AI crawlers', () => {
    const rawData = makeRawData({ robots_txt_blocked_crawlers: ['gptbot'] });
    const metrics = generatePitchNumbers(50, rawData, makeScorecard());
    const crawler = metrics.find(m => m.metric === 'AI Crawler Access');
    expect(crawler!.value).toBe('1 blocked');
  });

  it('handles no sitemap', () => {
    const rawData = makeRawData({ sitemap_url_count: 0 });
    const metrics = generatePitchNumbers(50, rawData, makeScorecard());
    const sitemap = metrics.find(m => m.metric === 'Sitemap URLs');
    expect(sitemap!.value).toBe('No sitemap');
  });

  it('handles large sitemap', () => {
    const rawData = makeRawData({ sitemap_url_count: 100 });
    const metrics = generatePitchNumbers(70, rawData, makeScorecard());
    const sitemap = metrics.find(m => m.metric === 'Sitemap URLs');
    expect(sitemap!.significance).toContain('Comprehensive');
  });

  it('handles 50+ internal links', () => {
    const rawData = makeRawData({ internal_link_count: 60 });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const links = metrics.find(m => m.metric === 'Internal Links');
    expect(links!.significance).toContain('Strong internal linking');
  });

  it('handles low internal links', () => {
    const rawData = makeRawData({ internal_link_count: 3 });
    const metrics = generatePitchNumbers(40, rawData, makeScorecard());
    const links = metrics.find(m => m.metric === 'Internal Links');
    expect(links!.significance).toContain('Weak internal linking');
  });

  it('includes question headings when > 0', () => {
    const rawData = makeRawData({ question_headings_count: 5, blog_sample_question_headings: 3 });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const questions = metrics.find(m => m.metric === 'Question Headings');
    expect(questions).toBeDefined();
    expect(questions!.value).toBe('8 found');
  });

  it('omits question headings when 0', () => {
    const rawData = makeRawData({ question_headings_count: 0, blog_sample_question_headings: 0 });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const questions = metrics.find(m => m.metric === 'Question Headings');
    expect(questions).toBeUndefined();
  });

  it('handles 18+ criteria passing', () => {
    const scorecard = Array.from({ length: 23 }, (_, i) => ({
      id: i + 1, criterion: `C${i}`, score: 8, status: 'STRONG' as const, keyFindings: '',
    }));
    const metrics = generatePitchNumbers(85, makeRawData(), scorecard);
    const passing = metrics.find(m => m.metric === 'Criteria Passing');
    expect(passing!.significance).toContain('Excellent coverage');
  });

  it('handles sitemap 10-49 range', () => {
    const rawData = makeRawData({ sitemap_url_count: 25 });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const sitemap = metrics.find(m => m.metric === 'Sitemap URLs');
    expect(sitemap!.significance).toContain('Moderate content footprint');
  });

  it('handles sitemap 1-9 range', () => {
    const rawData = makeRawData({ sitemap_url_count: 5 });
    const metrics = generatePitchNumbers(50, rawData, makeScorecard());
    const sitemap = metrics.find(m => m.metric === 'Sitemap URLs');
    expect(sitemap!.significance).toContain('Small sitemap');
  });

  it('handles 10-29 internal links', () => {
    const rawData = makeRawData({ internal_link_count: 15 });
    const metrics = generatePitchNumbers(55, rawData, makeScorecard());
    const links = metrics.find(m => m.metric === 'Internal Links');
    expect(links!.significance).toContain('Moderate linking');
  });

  it('handles 12-17 criteria passing', () => {
    const scorecard = Array.from({ length: 23 }, (_, i) => ({
      id: i + 1, criterion: `C${i}`, score: i < 15 ? 8 : 3, status: (i < 15 ? 'STRONG' : 'WEAK') as any, keyFindings: '',
    }));
    const metrics = generatePitchNumbers(70, makeRawData(), scorecard);
    const passing = metrics.find(m => m.metric === 'Criteria Passing');
    expect(passing!.significance).toContain('Good foundation');
  });

  it('handles 1 configured AI crawler', () => {
    const rawData = makeRawData({ robots_txt_ai_crawlers: ['gptbot'], robots_txt_blocked_crawlers: [] });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const crawler = metrics.find(m => m.metric === 'AI Crawler Access');
    expect(crawler!.value).toBe('1 configured');
  });

  it('handles no configured AI crawlers and no blocked', () => {
    const rawData = makeRawData({ robots_txt_ai_crawlers: [], robots_txt_blocked_crawlers: [] });
    const metrics = generatePitchNumbers(50, rawData, makeScorecard());
    const crawler = metrics.find(m => m.metric === 'AI Crawler Access');
    expect(crawler!.value).toBe('Not configured');
  });

  it('handles 1-3 schema types', () => {
    const rawData = makeRawData({ schema_types_found: ['organization', 'website'] });
    const metrics = generatePitchNumbers(60, rawData, makeScorecard());
    const schema = metrics.find(m => m.metric === 'Schema Types');
    expect(schema!.significance).toContain('Basic schema present');
  });

  it('handles score 50-69 significance for AEO Score', () => {
    const metrics = generatePitchNumbers(55, makeRawData(), makeScorecard());
    const score = metrics.find(m => m.metric === 'AEO Score');
    expect(score!.significance).toContain('Moderate AI visibility');
  });
});

// ─── generateOpportunities extended tests ────────────────────────────────────

describe('generateOpportunities (extended)', () => {
  it('assigns CRITICAL impact for high impactScore >= 12', () => {
    // Score 0, weight 0.15 => impactScore = 15, effort Medium => CRITICAL
    const results: CriterionResult[] = [
      { criterion: 'schema_markup', criterion_label: 'Schema', score: 0, status: 'fail', findings: [], fix_priority: 'P0' },
    ];
    const opps = generateOpportunities([], results);
    const schema = opps.find(o => o.name === 'Add Schema.org Structured Data');
    expect(schema).toBeDefined();
    expect(schema!.impact).toBe('CRITICAL');
  });

  it('assigns CRITICAL for high-weight criteria with low scores', () => {
    // internal_linking: score 0, weight 0.10 => impactScore = 10*0.10*100 = 100 => CRITICAL
    const results: CriterionResult[] = [
      { criterion: 'internal_linking', criterion_label: 'Internal Linking', score: 0, status: 'fail', findings: [], fix_priority: 'P0' },
    ];
    const opps = generateOpportunities([], results);
    const linking = opps.find(o => o.name === 'Improve Internal Linking Architecture');
    expect(linking).toBeDefined();
    expect(linking!.impact).toBe('CRITICAL');
  });

  it('assigns QUICK WIN for low-effort criteria with decent impactScore', () => {
    // content_freshness: score 4, weight 0.07, effort Low => impactScore = 6*0.07*100 = 42
    // Low effort + impactScore >= 3 => QUICK WIN
    const results: CriterionResult[] = [
      { criterion: 'content_freshness', criterion_label: 'Content Freshness', score: 4, status: 'partial', findings: [], fix_priority: 'P1' },
    ];
    const opps = generateOpportunities([], results);
    const freshness = opps.find(o => o.name === 'Add Content Freshness Signals');
    expect(freshness).toBeDefined();
    expect(freshness!.impact).toBe('QUICK WIN');
  });

  it('assigns CRITICAL for medium-effort criteria at score 7 with weight 0.03', () => {
    // content_velocity: score 7, weight 0.03, effort High => impactScore = 3*0.03*100 = 9
    // 9 < 12, but > 8 => HIGH... wait: (10-7)*3 = 9. 9 >= 8 => HIGH
    // Actually let me check: score 6, weight 0.03 => (10-6)*3 = 12 => CRITICAL
    const results: CriterionResult[] = [
      { criterion: 'content_velocity', criterion_label: 'Content Velocity', score: 6, status: 'partial', findings: [], fix_priority: 'P2' },
    ];
    const opps = generateOpportunities([], results);
    const velocity = opps.find(o => o.name === 'Increase Publishing Frequency');
    expect(velocity).toBeDefined();
    expect(velocity!.impact).toBe('CRITICAL'); // impactScore = 12 >= 12
  });

  it('assigns HIGH for score 7 with small weight and non-low effort', () => {
    // schema_coverage: score 7, weight 0.03, effort Medium => impactScore = 3*3 = 9
    // 9 >= 8 => HIGH (effort is Medium, not Low)
    const results: CriterionResult[] = [
      { criterion: 'schema_coverage', criterion_label: 'Schema Coverage', score: 7, status: 'partial', findings: [], fix_priority: 'P2' },
    ];
    const opps = generateOpportunities([], results);
    const coverage = opps.find(o => o.name === 'Deepen Schema Coverage');
    expect(coverage).toBeDefined();
    expect(coverage!.impact).toBe('HIGH'); // impactScore = 9 >= 8
  });
});
