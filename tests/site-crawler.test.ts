import { describe, it, expect } from 'vitest';
import { auditSiteFromData, countRecentSitemapDates, extractRawDataSummary, extractBlogUrlsFromSitemap, extractSubSitemapUrl } from '../src/site-crawler.js';
import type { SiteData, FetchResult, RawDataSummary } from '../src/site-crawler.js';
import { calculateOverallScore as calcScore } from '../src/scoring.js';

// ─── Helper: create minimal SiteData ─────────────────────────────────────────

function makeSiteData(overrides: Partial<SiteData> = {}): SiteData {
  return {
    domain: 'example.com',
    protocol: 'https',
    homepage: { text: '<html><head><title>Example</title></head><body><main><h1>Hello</h1></main></body></html>', status: 200 },
    llmsTxt: null,
    robotsTxt: null,
    faqPage: null,
    sitemapXml: null,
    rssFeed: null,
    aiTxt: null,
    redirectedTo: null,
    parkedReason: null,
    blogSample: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('auditSiteFromData', () => {
  it('returns 23 criteria for a full SiteData input', () => {
    const data = makeSiteData();
    const results = auditSiteFromData(data);
    expect(results).toHaveLength(23);
  });

  it('returns correct criterion keys for all 23 checks', () => {
    const data = makeSiteData();
    const results = auditSiteFromData(data);
    const keys = results.map(r => r.criterion);
    expect(keys).toEqual([
      'llms_txt', 'schema_markup', 'qa_content_format', 'clean_html',
      'entity_consistency', 'robots_txt', 'faq_section', 'original_data',
      'internal_linking', 'semantic_html',
      'content_freshness', 'sitemap_completeness', 'rss_feed',
      'table_list_extractability', 'definition_patterns', 'direct_answer_density',
      'content_licensing', 'author_schema_depth', 'fact_density',
      'canonical_url', 'content_velocity', 'schema_coverage',
      'speakable_schema',
    ]);
  });

  it('scores 0-10 for every criterion', () => {
    const data = makeSiteData();
    const results = auditSiteFromData(data);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(10);
    }
  });

  it('handles null homepage gracefully', () => {
    const data = makeSiteData({ homepage: null });
    const results = auditSiteFromData(data);
    expect(results).toHaveLength(23);
    // Homepage-dependent checks should score 0
    const homepageCriteria = ['content_freshness', 'table_list_extractability', 'definition_patterns',
      'direct_answer_density', 'author_schema_depth', 'fact_density', 'canonical_url', 'schema_coverage',
      'speakable_schema'];
    for (const key of homepageCriteria) {
      const r = results.find(r => r.criterion === key);
      expect(r?.score).toBe(0);
    }
  });
});

// ─── Criterion 11: Content Freshness ─────────────────────────────────────────

describe('checkContentFreshness (criterion 11)', () => {
  it('scores high with JSON-LD dates, <time> elements, article meta, and year refs', () => {
    const html = `<html><head>
      <meta property="article:published_time" content="2026-01-15">
    </head><body>
      <script type="application/ld+json">{"datePublished":"2026-01-15","dateModified":"2026-02-10"}</script>
      <time datetime="2026-01-15">Jan 15</time>
      <time datetime="2026-02-10">Feb 10</time>
      <p>Updated in 2026 with latest data.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_freshness')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no freshness signals', () => {
    const html = '<html><body><h1>Static page</h1><p>No dates anywhere.</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_freshness')!;
    expect(r.score).toBeLessThanOrEqual(2);
  });
});

// ─── Criterion 12: Sitemap Completeness ──────────────────────────────────────

describe('checkSitemapCompleteness (criterion 12)', () => {
  it('scores high with complete sitemap', () => {
    const urls = Array.from({ length: 60 }, (_, i) =>
      `<url><loc>https://example.com/page-${i}</loc><lastmod>2026-02-01</lastmod></url>`
    ).join('');
    const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    const data = makeSiteData({ sitemapXml: { text: sitemap, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'sitemap_completeness')!;
    expect(r.score).toBeGreaterThanOrEqual(7);
  });

  it('scores 0 with no sitemap', () => {
    const data = makeSiteData({ sitemapXml: null });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'sitemap_completeness')!;
    expect(r.score).toBe(0);
  });
});

// ─── Criterion 13: RSS Feed ─────────────────────────────────────────────────

describe('checkRssFeed (criterion 13)', () => {
  it('scores high with RSS link tag and valid feed with items', () => {
    const homepage = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head><body></body></html>`;
    const feedItems = Array.from({ length: 8 }, (_, i) =>
      `<item><title>Post ${i}</title></item>`
    ).join('');
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel>${feedItems}</channel></rss>`;
    const data = makeSiteData({
      homepage: { text: homepage, status: 200 },
      rssFeed: { text: feed, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'rss_feed')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no RSS at all', () => {
    const data = makeSiteData({ rssFeed: null });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'rss_feed')!;
    expect(r.score).toBe(0);
  });
});

// ─── Criterion 14: Table & List Extractability ──────────────────────────────

describe('checkTableListExtractability (criterion 14)', () => {
  it('scores high with tables, ordered/unordered lists, and definition lists', () => {
    const html = `<html><body>
      <table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>A</td><td>9</td></tr></tbody></table>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>B</td><td>7</td></tr></tbody></table>
      <ol><li>Step 1</li><li>Step 2</li><li>Step 3</li></ol>
      <ul><li>Feature 1</li><li>Feature 2</li><li>Feature 3</li><li>Feature 4</li><li>Feature 5</li>
      <li>F6</li><li>F7</li><li>F8</li><li>F9</li><li>F10</li></ul>
      <dl><dt>Term</dt><dd>Definition</dd></dl>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'table_list_extractability')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no lists or tables', () => {
    const html = '<html><body><p>Just text.</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'table_list_extractability')!;
    expect(r.score).toBe(0);
  });
});

// ─── Criterion 15: Definition Patterns ──────────────────────────────────────

describe('checkDefinitionPatterns (criterion 15)', () => {
  it('scores high with multiple definition patterns early in content', () => {
    const html = `<html><body>
      <p>AEO is the practice of optimizing content for AI answer engines. It refers to techniques that make websites visible to large language models. Schema markup is defined as structured data that helps search engines understand content. This approach is known as semantic optimization and means that your content can be cited directly.</p>
      <dl><dt>AEO</dt><dd>AI Engine Optimization</dd></dl>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'definition_patterns')!;
    expect(r.score).toBeGreaterThanOrEqual(7);
  });

  it('scores low with no definitions', () => {
    const html = '<html><body><p>Buy now. Click here. Sign up today.</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'definition_patterns')!;
    expect(r.score).toBeLessThanOrEqual(2);
  });
});

// ─── Criterion 16: Direct Answer Density ────────────────────────────────────

describe('checkDirectAnswerDensity (criterion 16)', () => {
  it('scores high with Q&A pairs and snippet-zone paragraphs', () => {
    const longPara = 'This is a comprehensive answer that explains the concept in detail. '.repeat(4);
    const html = `<html><body>
      <h2>What is AEO?</h2>
      <p>${longPara}</p>
      <h3>How does AEO work?</h3>
      <p>${longPara}</p>
      <h3>Why is AEO important?</h3>
      <p>${longPara} Yes, it is critical for modern businesses. In short, AEO matters.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'direct_answer_density')!;
    expect(r.score).toBeGreaterThanOrEqual(6);
  });

  it('scores 0 with no Q&A pairs', () => {
    const html = '<html><body><h1>Welcome</h1><div>Some content</div></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'direct_answer_density')!;
    expect(r.score).toBeLessThanOrEqual(2);
  });
});

// ─── Criterion 17: Content Licensing ────────────────────────────────────────

describe('checkContentLicensing (criterion 17)', () => {
  it('scores high with ai.txt, policy language, schema license, and CC', () => {
    const html = `<html><body>
      <p>Content policy: All content on this site is available under Creative Commons CC BY 4.0 license.</p>
      <script type="application/ld+json">{"license":"https://creativecommons.org/licenses/by/4.0/","copyrightYear":"2026"}</script>
    </body></html>`;
    const aiTxt = 'User-Agent: *\nAllow: /\nTDM-Policy: allow\nContent may be used for AI training under Creative Commons CC BY.';
    const data = makeSiteData({
      homepage: { text: html, status: 200 },
      aiTxt: { text: aiTxt, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_licensing')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no licensing signals', () => {
    const data = makeSiteData({ aiTxt: null });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_licensing')!;
    expect(r.score).toBe(0);
  });
});

// ─── Criterion 18: Author Schema Depth ──────────────────────────────────────

describe('checkAuthorSchemaDepth (criterion 18)', () => {
  it('scores high with Person schema, credentials, sameAs, byline, and address', () => {
    const html = `<html><body>
      <script type="application/ld+json">{"@type":"Person","name":"Alex Shortov","jobTitle":"CEO","knowsAbout":"AEO","sameAs":["https://linkedin.com/in/alex"]}</script>
      <p>Written by Alex Shortov</p>
      <address>436 North Main Street, Doylestown, PA</address>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'author_schema_depth')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no author signals', () => {
    const html = '<html><body><p>No author info.</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'author_schema_depth')!;
    expect(r.score).toBe(0);
  });
});

// ─── Criterion 19: Fact Density ─────────────────────────────────────────────

describe('checkFactDensity (criterion 19)', () => {
  it('scores high with data points, year refs, attributions, and units', () => {
    const html = `<html><body>
      <p>Our platform serves 500+ clients with 95% retention. Revenue grew 42% in 2025.</p>
      <p>According to Gartner research from 2024, AI-optimized sites see 3x more citations.</p>
      <p>Average audit takes 24 hours and covers 22 criteria across 15 categories.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'fact_density')!;
    expect(r.score).toBeGreaterThanOrEqual(7);
  });

  it('scores 0 with no facts', () => {
    const html = '<html><body><p>We help businesses grow. Our team is great.</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'fact_density')!;
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

// ─── Criterion 20: Canonical URL ────────────────────────────────────────────

describe('checkCanonicalUrl (criterion 20)', () => {
  it('scores 10 with self-referencing HTTPS canonical and no duplicates', () => {
    const html = `<html><head>
      <link rel="canonical" href="https://example.com/">
    </head><body></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'canonical_url')!;
    expect(r.score).toBe(10);
  });

  it('scores 10 with href before rel (Webflow-style attribute order)', () => {
    const html = `<html><head>
      <link href="https://example.com/" rel="canonical"/>
    </head><body></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'canonical_url')!;
    expect(r.score).toBe(10);
  });

  it('scores 0 with no canonical', () => {
    const html = '<html><head></head><body></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'canonical_url')!;
    expect(r.score).toBe(0);
  });

  it('penalizes duplicate canonical tags', () => {
    const html = `<html><head>
      <link rel="canonical" href="https://example.com/">
      <link rel="canonical" href="https://example.com/home">
    </head><body></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'canonical_url')!;
    // 4 (exists) + 3 (self-ref on first match) + 2 (https) - 1 (duplicates) = 8
    expect(r.score).toBeLessThanOrEqual(9);
  });
});

// ─── Criterion 21: Content Velocity ─────────────────────────────────────────

describe('checkContentVelocity (criterion 21)', () => {
  it('scores high with many diverse recent lastmod dates', () => {
    const now = Date.now();
    const urls = Array.from({ length: 25 }, (_, i) => {
      const date = new Date(now - i * 2 * 24 * 60 * 60 * 1000); // spread over 50 days
      return `<url><loc>https://example.com/p-${i}</loc><lastmod>${date.toISOString().split('T')[0]}</lastmod></url>`;
    }).join('');
    const sitemap = `<urlset>${urls}</urlset>`;
    const data = makeSiteData({ sitemapXml: { text: sitemap, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_velocity')!;
    expect(r.score).toBeGreaterThanOrEqual(9);
  });

  it('scores 0 with no sitemap', () => {
    const data = makeSiteData({ sitemapXml: null });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_velocity')!;
    expect(r.score).toBe(0);
  });

  it('scores 2 when sitemap has no lastmod', () => {
    const sitemap = '<urlset><url><loc>https://example.com/</loc></url></urlset>';
    const data = makeSiteData({ sitemapXml: { text: sitemap, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_velocity')!;
    expect(r.score).toBe(2);
  });
});

// ─── Criterion 22: Schema Coverage ──────────────────────────────────────────

describe('checkSchemaCoverage (criterion 22)', () => {
  it('scores high with multiple schema types and properties', () => {
    const html = `<html><body>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Organization","@id":"#org",
        "name":"Example","url":"https://example.com","logo":"logo.png",
        "contactPoint":{"@type":"ContactPoint"},"sameAs":["https://linkedin.com"],
        "address":"123 Main St","description":"A company"
      }</script>
      <script type="application/ld+json">{
        "@type":"Article","headline":"Post","datePublished":"2026-01-01","dateModified":"2026-02-01",
        "author":{"@type":"Person","name":"Alex"},"description":"Desc","publisher":{"@id":"#org"},
        "image":"img.png"
      }</script>
      <script type="application/ld+json">{
        "@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q?"}]
      }</script>
      <script type="application/ld+json">{
        "@type":"WebSite","name":"Example","url":"https://example.com"
      }</script>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'schema_coverage')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores 0 with no JSON-LD', () => {
    const html = '<html><body><p>No schema</p></body></html>';
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'schema_coverage')!;
    expect(r.score).toBe(0);
  });
});

// ─── HTML catch-all fakeout detection ────────────────────────────────────────

const CATCH_ALL_HTML = '<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>404</h1></body></html>';

describe('HTML catch-all fakeout detection', () => {
  it('rejects HTML response as ai.txt (scores 0 for ai.txt check)', () => {
    const data = makeSiteData({
      aiTxt: { text: CATCH_ALL_HTML, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_licensing')!;
    // Without real ai.txt, max from ai.txt portion is 0 (not 4)
    expect(r.score).toBeLessThanOrEqual(6); // can still get points from other checks
    const aiTxtFinding = r.findings.find(f => f.detail.includes('ai.txt'));
    expect(aiTxtFinding?.detail).toContain('No ai.txt file found');
  });

  it('accepts real ai.txt text content', () => {
    const realAiTxt = 'User-Agent: *\nAllow: /\nTDM-Policy: allow\nContent licensing: Creative Commons CC BY.';
    const data = makeSiteData({
      aiTxt: { text: realAiTxt, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_licensing')!;
    expect(r.score).toBeGreaterThanOrEqual(4); // ai.txt alone = 4
    const aiTxtFinding = r.findings.find(f => f.detail.includes('ai.txt'));
    expect(aiTxtFinding?.detail).toContain('ai.txt file found');
  });

  it('rejects HTML response as llms.txt (scores 0)', () => {
    const data = makeSiteData({
      llmsTxt: { text: CATCH_ALL_HTML, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'llms_txt')!;
    expect(r.score).toBe(0);
    expect(r.findings[0].detail).toContain('HTML page served');
  });

  it('accepts real llms.txt text content', () => {
    const realLlmsTxt = '# Example Site\n\n> Description of the site\n\n## Key pages\n- /about\n- /pricing\n- /faq\n\nThis site provides comprehensive information about example topics.';
    const data = makeSiteData({
      llmsTxt: { text: realLlmsTxt, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'llms_txt')!;
    expect(r.score).toBeGreaterThanOrEqual(4); // exists = 4 base
  });

  it('rejects HTML response as robots.txt (scores as missing)', () => {
    const data = makeSiteData({
      robotsTxt: { text: CATCH_ALL_HTML, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'robots_txt')!;
    expect(r.score).toBe(2); // missing robots.txt = 2
  });

  it('accepts real robots.txt content', () => {
    const realRobots = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nSitemap: https://example.com/sitemap.xml';
    const data = makeSiteData({
      robotsTxt: { text: realRobots, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'robots_txt')!;
    expect(r.score).toBeGreaterThanOrEqual(4);
  });

  it('handles <html with attributes (not just bare <html>)', () => {
    const htmlWithAttrs = '<html lang="en"><head><title>Page</title></head><body></body></html>';
    const data = makeSiteData({
      aiTxt: { text: htmlWithAttrs, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_licensing')!;
    const aiTxtFinding = r.findings.find(f => f.detail.includes('ai.txt'));
    expect(aiTxtFinding?.detail).toContain('No ai.txt file found');
  });

  it('handles leading whitespace before <!DOCTYPE', () => {
    const htmlWithWhitespace = '  \n  <!DOCTYPE html><html><body></body></html>';
    const data = makeSiteData({
      llmsTxt: { text: htmlWithWhitespace, status: 200 },
    });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'llms_txt')!;
    expect(r.score).toBe(0);
  });
});

// ─── Backward compatibility: calculateOverallScore ──────────────────────────

describe('calculateOverallScore backward compatibility', () => {
  it('produces the same score for 10-criteria input as before', () => {
    // Old 10-criteria mock (all score 8)
    const oldResults = [
      'llms_txt', 'schema_markup', 'qa_content_format', 'clean_html',
      'entity_consistency', 'robots_txt', 'faq_section', 'original_data',
      'internal_linking', 'semantic_html',
    ].map(key => ({
      criterion: key, criterion_label: key, score: 8, status: 'pass' as const,
      findings: [], fix_priority: 'P3' as const,
    }));

    // All 8/10 with old weights (sum=1.0): score = 8/10 * 100 = 80
    const score = calcScore(oldResults);
    expect(score).toBe(80);
  });

  it('normalizes correctly for 22-criteria input', () => {
    const allResults = [
      'llms_txt', 'schema_markup', 'qa_content_format', 'clean_html',
      'entity_consistency', 'robots_txt', 'faq_section', 'original_data',
      'internal_linking', 'semantic_html',
      'content_freshness', 'sitemap_completeness', 'rss_feed',
      'table_list_extractability', 'definition_patterns', 'direct_answer_density',
      'content_licensing', 'author_schema_depth', 'fact_density',
      'canonical_url', 'content_velocity', 'schema_coverage',
    ].map(key => ({
      criterion: key, criterion_label: key, score: 8, status: 'pass' as const,
      findings: [], fix_priority: 'P3' as const,
    }));

    // All 8/10 regardless of weight count: score = 80
    const score = calcScore(allResults);
    expect(score).toBe(80);
  });
});

// ─── Fix 1: Content Velocity - uniform lastmod detection ─────────────────────

describe('countRecentSitemapDates helper', () => {
  it('detects uniform pattern when >80% share same date', () => {
    const today = new Date().toISOString().split('T')[0];
    const urls = Array.from({ length: 100 }, (_, i) =>
      `<url><loc>https://example.com/p-${i}</loc><lastmod>${today}</lastmod></url>`
    ).join('');
    const result = countRecentSitemapDates(`<urlset>${urls}</urlset>`);
    expect(result.isUniform).toBe(true);
    expect(result.distinctRecentDays).toBe(1);
    expect(result.recentCount).toBe(100);
    expect(result.uniformDetail).toContain('likely auto-generated');
  });

  it('does not flag diverse dates as uniform', () => {
    const now = Date.now();
    const urls = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - i * 3 * 24 * 60 * 60 * 1000);
      return `<url><loc>https://example.com/p-${i}</loc><lastmod>${d.toISOString().split('T')[0]}</lastmod></url>`;
    }).join('');
    const result = countRecentSitemapDates(`<urlset>${urls}</urlset>`);
    expect(result.isUniform).toBe(false);
    expect(result.distinctRecentDays).toBeGreaterThan(1);
  });

  it('returns zero for empty sitemap', () => {
    const result = countRecentSitemapDates('<urlset></urlset>');
    expect(result.recentCount).toBe(0);
    expect(result.isUniform).toBe(false);
    expect(result.totalWithDates).toBe(0);
  });
});

describe('checkContentVelocity - uniform lastmod', () => {
  it('scores low when 941 URLs share the same build date', () => {
    const today = new Date().toISOString().split('T')[0];
    const urls = Array.from({ length: 941 }, (_, i) =>
      `<url><loc>https://example.com/p-${i}</loc><lastmod>${today}</lastmod></url>`
    ).join('');
    const data = makeSiteData({ sitemapXml: { text: `<urlset>${urls}</urlset>`, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_velocity')!;
    // 1 distinct day = score 2 (has lastmod) + 1 (1 recent) = 3
    expect(r.score).toBeLessThanOrEqual(4);
    expect(r.findings.some(f => f.detail.includes('auto-generated'))).toBe(true);
  });

  it('scores high when 25 URLs have genuinely different dates', () => {
    const now = Date.now();
    const urls = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(now - i * 2 * 24 * 60 * 60 * 1000);
      return `<url><loc>https://example.com/p-${i}</loc><lastmod>${d.toISOString().split('T')[0]}</lastmod></url>`;
    }).join('');
    const data = makeSiteData({ sitemapXml: { text: `<urlset>${urls}</urlset>`, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'content_velocity')!;
    expect(r.score).toBeGreaterThanOrEqual(9);
  });
});

// ─── Fix 2: Entity Authority - phone context validation ──────────────────────

describe('checkEntityConsistency - phone context validation', () => {
  it('scores phone with tel: link', () => {
    const html = `<html><body>
      <a href="tel:+12125551234">Call us: (212) 555-1234</a>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'entity_consistency')!;
    expect(r.findings.some(f => f.detail.includes('phone number found'))).toBe(true);
  });

  it('scores phone with schema telephone property', () => {
    const html = `<html><body>
      <script type="application/ld+json">{"@type":"Organization","telephone":"(212) 555-1234"}</script>
      <p>Our office: (212) 555-1234</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'entity_consistency')!;
    expect(r.findings.some(f => f.detail.includes('phone number found'))).toBe(true);
  });

  it('scores phone with nearby context word "call"', () => {
    const html = `<html><body>
      <p>Call us today at (212) 555-1234 for a free consultation.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'entity_consistency')!;
    expect(r.findings.some(f => f.detail.includes('phone number found'))).toBe(true);
  });

  it('rejects postal code patterns as phone numbers', () => {
    const html = `<html><body>
      <p>We are located at 123 Main Street, Doylestown, PA 18901-6789. Our company ID is 12345-6789.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'entity_consistency')!;
    expect(r.findings.some(f => f.detail.includes('No phone number found'))).toBe(true);
  });

  it('rejects product ID / serial number patterns', () => {
    const html = `<html><body>
      <p>Product SKU: 800-555-0199. Order number: 123-456-7890.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'entity_consistency')!;
    expect(r.findings.some(f => f.detail.includes('No phone number found'))).toBe(true);
  });
});

// ─── Fix 3: Original Data - strong/weak scoring ─────────────────────────────

describe('checkOriginalData - strong vs weak scoring', () => {
  it('scores high with proprietary research context + metrics', () => {
    const html = `<html><body>
      <p>Our analysis of 500 websites found that 73% lack proper schema markup.</p>
      <p>Case study: We helped Acme Corp increase AI citations by 45% in 90 days.</p>
      <p>Written by Dr. Jane Smith, AEO specialist</p>
      <a href="/blog/aeo-research">Read our blog</a>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it('scores low with generic marketing stats only', () => {
    const html = `<html><body>
      <p>500+ clients trust our platform. 10 years of experience.</p>
      <p>Testimonials from happy customers.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    // Weak stats (+1) + weak case studies (+1) = 2
    expect(r.score).toBeLessThanOrEqual(4);
  });

  it('gives full stats points with research methodology context', () => {
    const html = `<html><body>
      <p>We surveyed 200 SaaS companies and found 82% have no llms.txt file.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('research context'))).toBe(true);
  });

  it('gives weak stats points for generic stat without research context', () => {
    const html = `<html><body>
      <p>Trusted by 500+ clients worldwide. 95% satisfaction rate.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('without research context'))).toBe(true);
  });

  it('requires actual href for blog detection', () => {
    const html = `<html><body>
      <p>Read our blog for more insights and guides.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('No links to blog'))).toBe(true);
  });

  it('detects actual blog href links', () => {
    const html = `<html><body>
      <a href="/blog/latest-post">Latest Post</a>
      <a href="/articles/guide">Our Guide</a>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('Links to blog/articles'))).toBe(true);
  });

  it('gives full case study points with nearby metric', () => {
    const html = `<html><body>
      <p>Our case study showed a 45% increase in traffic.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('specific metrics'))).toBe(true);
  });

  it('gives weak case study points without metric', () => {
    const html = `<html><body>
      <p>Read our client success stories and testimonials.</p>
    </body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'original_data')!;
    expect(r.findings.some(f => f.detail.includes('without specific metrics'))).toBe(true);
  });
});

// ─── extractRawDataSummary ───────────────────────────────────────────────────

describe('extractRawDataSummary', () => {
  it('returns summary with all expected fields', () => {
    const data = makeSiteData();
    const summary = extractRawDataSummary(data);
    expect(summary.domain).toBe('example.com');
    expect(summary.protocol).toBe('https');
    expect(summary.homepage_length).toBeGreaterThan(0);
    expect(summary.homepage_text_length).toBeGreaterThan(0);
    expect(summary.has_https).toBe(true);
  });

  it('accepts rendered_with_headless as optional field on RawDataSummary type', () => {
    const data = makeSiteData();
    const summary = extractRawDataSummary(data);
    // Field is optional and not set by extractRawDataSummary itself (set by pre-crawl.ts)
    const extended: RawDataSummary = { ...summary, rendered_with_headless: true };
    expect(extended.rendered_with_headless).toBe(true);
  });

  it('includes blog sample fields when blog pages present', () => {
    const blogPage: FetchResult = {
      text: `<html><body>
        <script type="application/ld+json">{"@type":"Article","headline":"Test"}</script>
        <h2>What is testing?</h2>
        <p>Testing is important.</p>
      </body></html>`,
      status: 200,
      finalUrl: 'https://example.com/blog/test',
    };
    const data = makeSiteData({ blogSample: [blogPage] });
    const summary = extractRawDataSummary(data);
    expect(summary.blog_sample_count).toBe(1);
    expect(summary.blog_sample_urls).toEqual(['https://example.com/blog/test']);
    expect(summary.blog_sample_schema_types).toContain('article');
    expect(summary.blog_sample_question_headings).toBe(1);
  });

  it('returns empty blog fields when no blog sample', () => {
    const data = makeSiteData({ blogSample: [] });
    const summary = extractRawDataSummary(data);
    expect(summary.blog_sample_count).toBe(0);
    expect(summary.blog_sample_urls).toEqual([]);
    expect(summary.blog_sample_schema_types).toEqual([]);
    expect(summary.blog_sample_question_headings).toBe(0);
    expect(summary.blog_sample_faq_schema_found).toBe(false);
  });
});

// ─── Blog Sampling: extractBlogUrlsFromSitemap ─────────────────────────────

describe('extractBlogUrlsFromSitemap', () => {
  it('extracts blog URLs matching common patterns', () => {
    const sitemap = `<urlset>
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/blog/post-1</loc></url>
      <url><loc>https://example.com/blog/post-2</loc></url>
      <url><loc>https://example.com/articles/guide-1</loc></url>
      <url><loc>https://example.com/about</loc></url>
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 5);
    expect(urls).toContain('https://example.com/blog/post-1');
    expect(urls).toContain('https://example.com/blog/post-2');
    expect(urls).toContain('https://example.com/articles/guide-1');
    // Root URL should be excluded
    expect(urls).not.toContain('https://example.com/');
  });

  it('sorts by lastmod descending', () => {
    const sitemap = `<urlset>
      <url><loc>https://example.com/blog/old</loc><lastmod>2025-01-01</lastmod></url>
      <url><loc>https://example.com/blog/new</loc><lastmod>2026-02-15</lastmod></url>
      <url><loc>https://example.com/blog/mid</loc><lastmod>2025-06-01</lastmod></url>
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 5);
    expect(urls[0]).toContain('new');
    expect(urls[1]).toContain('mid');
    expect(urls[2]).toContain('old');
  });

  it('respects limit', () => {
    const sitemap = `<urlset>
      ${Array.from({ length: 20 }, (_, i) =>
        `<url><loc>https://example.com/blog/post-${i}</loc></url>`
      ).join('')}
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 5);
    expect(urls).toHaveLength(5);
  });

  it('excludes tag/category/author paths', () => {
    const sitemap = `<urlset>
      <url><loc>https://example.com/blog/real-post</loc></url>
      <url><loc>https://example.com/tag/seo</loc></url>
      <url><loc>https://example.com/category/marketing</loc></url>
      <url><loc>https://example.com/author/john</loc></url>
      <url><loc>https://example.com/wp-admin/edit</loc></url>
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 10);
    expect(urls).toContain('https://example.com/blog/real-post');
    expect(urls).not.toContain('https://example.com/tag/seo');
    expect(urls).not.toContain('https://example.com/category/marketing');
    expect(urls).not.toContain('https://example.com/author/john');
    expect(urls).not.toContain('https://example.com/wp-admin/edit');
  });

  it('excludes cross-domain URLs', () => {
    const sitemap = `<urlset>
      <url><loc>https://other.com/blog/post</loc></url>
      <url><loc>https://example.com/blog/post</loc></url>
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 5);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('example.com');
  });

  it('handles empty sitemap', () => {
    const urls = extractBlogUrlsFromSitemap('<urlset></urlset>', 'example.com', 5);
    expect(urls).toEqual([]);
  });

  it('includes deep paths with 2+ segments', () => {
    const sitemap = `<urlset>
      <url><loc>https://example.com/services/consulting/enterprise</loc></url>
      <url><loc>https://example.com/about</loc></url>
    </urlset>`;
    const urls = extractBlogUrlsFromSitemap(sitemap, 'example.com', 5);
    expect(urls).toContain('https://example.com/services/consulting/enterprise');
    // Single-segment non-blog path excluded
    expect(urls).not.toContain('https://example.com/about');
  });
});

// ─── Blog Sampling: extractSubSitemapUrl ────────────────────────────────────

describe('extractSubSitemapUrl', () => {
  it('returns null for flat sitemaps', () => {
    const sitemap = '<urlset><url><loc>https://example.com/</loc></url></urlset>';
    expect(extractSubSitemapUrl(sitemap)).toBeNull();
  });

  it('detects sitemapindex and prefers post-sitemap', () => {
    const sitemap = `<sitemapindex>
      <sitemap><loc>https://example.com/page-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/post-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/category-sitemap.xml</loc></sitemap>
    </sitemapindex>`;
    expect(extractSubSitemapUrl(sitemap)).toBe('https://example.com/post-sitemap.xml');
  });

  it('falls back to first sub-sitemap when no post match', () => {
    const sitemap = `<sitemapindex>
      <sitemap><loc>https://example.com/page-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/category-sitemap.xml</loc></sitemap>
    </sitemapindex>`;
    expect(extractSubSitemapUrl(sitemap)).toBe('https://example.com/page-sitemap.xml');
  });
});

// ─── Blog Sampling: criterion enhancements ──────────────────────────────────

describe('blog sample criterion enhancements', () => {
  const makeBlogPage = (html: string): FetchResult => ({
    text: html,
    status: 200,
    finalUrl: 'https://example.com/blog/test',
  });

  it('Schema Markup: blog FAQPage schema boosts score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q?"}]}</script>
    </body></html>`);
    const withBlog = makeSiteData({
      homepage: { text: '<html><body><script type="application/ld+json">{"@type":"Organization","name":"Test"}</script></body></html>', status: 200 },
      blogSample: [blogPage],
    });
    const withoutBlog = makeSiteData({
      homepage: { text: '<html><body><script type="application/ld+json">{"@type":"Organization","name":"Test"}</script></body></html>', status: 200 },
      blogSample: [],
    });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'schema_markup')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'schema_markup')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Q&A Format: blog question headings boost score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <h2>What is home care?</h2><p>Home care provides assistance.</p>
      <h2>How does home care work?</h2><p>It works through agencies.</p>
      <h2>Who needs home care?</h2><p>Elderly and disabled.</p>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'qa_content_format')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'qa_content_format')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('FAQ Section: blog FAQPage schema boosts score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What?","acceptedAnswer":{"text":"Answer"}}]}</script>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'faq_section')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'faq_section')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Original Data: blog expert attribution boosts score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <p>Written by Dr. Jane Smith, board-certified specialist in home health care.</p>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'original_data')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'original_data')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Table & List: blog tables boost score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <table><thead><tr><th>Service</th><th>Cost</th></tr></thead><tbody><tr><td>Care</td><td>$50</td></tr></tbody></table>
      <ol><li>Step 1</li><li>Step 2</li></ol>
      <ul><li>Feature A</li><li>Feature B</li></ul>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'table_list_extractability')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'table_list_extractability')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Direct Answer: blog Q&A pairs boost score', () => {
    const longPara = 'This is a comprehensive answer that explains the concept in detail. '.repeat(4);
    const blogPage = makeBlogPage(`<html><body>
      <h2>What is home care?</h2>
      <p>${longPara}</p>
      <h3>How does it work?</h3>
      <p>${longPara}</p>
      <h3>Why choose home care?</h3>
      <p>${longPara} Yes, it is the best option. In short, home care matters.</p>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'direct_answer_density')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'direct_answer_density')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Semantic HTML: blog <article> and <time> boost score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <article>
        <time datetime="2026-02-15">Feb 15, 2026</time>
        <p>Blog content here.</p>
      </article>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'semantic_html')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'semantic_html')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Definition Patterns: blog definitions boost score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <p>Home care is a type of health service. It refers to professional assistance provided at home. Respite care is defined as temporary relief for caregivers. Palliative care is known as comfort-focused treatment.</p>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'definition_patterns')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'definition_patterns')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Author Schema: blog Person schema boosts score', () => {
    const blogPage = makeBlogPage(`<html><body>
      <script type="application/ld+json">{"@type":"Person","name":"Jane","jobTitle":"RN","sameAs":["https://linkedin.com/in/jane"]}</script>
      <p>Written by Jane Smith, RN</p>
    </body></html>`);
    const withBlog = makeSiteData({ blogSample: [blogPage] });
    const withoutBlog = makeSiteData({ blogSample: [] });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'author_schema_depth')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'author_schema_depth')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });

  it('Schema Coverage: blog schema types boost coverage', () => {
    const blogPage = makeBlogPage(`<html><body>
      <script type="application/ld+json">{"@type":"Article","headline":"Test","datePublished":"2026-01-01","author":{"@type":"Person","name":"Jane"},"publisher":{"@id":"#org"},"image":"img.png","description":"D","dateModified":"2026-02-01"}</script>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
    </body></html>`);
    const homepageWithSchema = '<html><body><script type="application/ld+json">{"@type":"Organization","name":"Test","url":"https://example.com"}</script></body></html>';
    const withBlog = makeSiteData({
      homepage: { text: homepageWithSchema, status: 200 },
      blogSample: [blogPage],
    });
    const withoutBlog = makeSiteData({
      homepage: { text: homepageWithSchema, status: 200 },
      blogSample: [],
    });
    const scoreBlog = auditSiteFromData(withBlog).find(r => r.criterion === 'schema_coverage')!.score;
    const scoreNoBlog = auditSiteFromData(withoutBlog).find(r => r.criterion === 'schema_coverage')!.score;
    expect(scoreBlog).toBeGreaterThan(scoreNoBlog);
  });
});

// ─── Blog Sampling: backward compatibility ──────────────────────────────────

describe('blog sample backward compatibility', () => {
  it('produces identical scores with empty blogSample vs undefined blogSample', () => {
    const baseHomepage = `<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head><body>
      <main><h1>Hello</h1></main>
      <script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>
    </body></html>`;
    const withEmptyBlog = makeSiteData({ homepage: { text: baseHomepage, status: 200 }, blogSample: [] });
    const withUndefinedBlog = makeSiteData({ homepage: { text: baseHomepage, status: 200 }, blogSample: undefined });

    const scoresEmpty = auditSiteFromData(withEmptyBlog);
    const scoresUndefined = auditSiteFromData(withUndefinedBlog);

    for (let i = 0; i < 22; i++) {
      expect(scoresEmpty[i].score).toBe(scoresUndefined[i].score);
    }
  });

  it('blog sample can only increase scores, never decrease', () => {
    const baseHomepage = `<html><head><title>Test</title></head><body>
      <main><h1>Hello</h1></main>
      <script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>
    </body></html>`;
    const blogPage: FetchResult = {
      text: `<html><body>
        <article><h2>What is AEO?</h2><p>AEO is a practice of optimizing for AI engines. It refers to a set of techniques.</p></article>
        <script type="application/ld+json">{"@type":"Article","headline":"AEO Guide","author":{"@type":"Person","name":"Alex"}}</script>
        <time datetime="2026-02-15">Feb 15</time>
      </body></html>`,
      status: 200,
    };

    const withoutBlog = makeSiteData({ homepage: { text: baseHomepage, status: 200 }, blogSample: [] });
    const withBlog = makeSiteData({ homepage: { text: baseHomepage, status: 200 }, blogSample: [blogPage] });

    const scoresWithout = auditSiteFromData(withoutBlog);
    const scoresWith = auditSiteFromData(withBlog);

    for (let i = 0; i < 23; i++) {
      expect(scoresWith[i].score).toBeGreaterThanOrEqual(scoresWithout[i].score);
    }
  });
});

// ─── Criterion 23: Speakable Schema ─────────────────────────────────────────

describe('checkSpeakableSchema (criterion 23)', () => {
  it('scores 0 when no JSON-LD present', () => {
    const data = makeSiteData({ homepage: { text: '<html><body><h1>Hello</h1></body></html>', status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBe(0);
  });

  it('scores 0 when JSON-LD exists but no speakable', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>
    </head><body><h1>Hello</h1></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBe(0);
  });

  it('scores 4 when SpeakableSpecification type is present', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"WebPage","speakable":{"@type":"SpeakableSpecification","name":"Main content"}}</script>
    </head><body><h1>Hello</h1></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBe(4);
    expect(r.status).toBe('partial');
  });

  it('scores 7 when speakable has cssSelector targeting', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"WebPage","speakable":{"@type":"SpeakableSpecification","cssSelector":[".article-headline",".article-summary"]}}</script>
    </head><body><h1>Hello</h1></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBe(7);
    expect(r.status).toBe('pass');
  });

  it('scores 10 with speakable + selectors + blog coverage', () => {
    const homepage = `<html><head>
      <script type="application/ld+json">{"@type":"WebPage","speakable":{"@type":"SpeakableSpecification","cssSelector":[".headline"]}}</script>
    </head><body><h1>Hello</h1></body></html>`;
    const blogPage: FetchResult = {
      text: `<html><head>
        <script type="application/ld+json">{"@type":"Article","speakable":{"@type":"SpeakableSpecification","cssSelector":[".article-body"]}}</script>
      </head><body><article><h2>Blog post</h2></article></body></html>`,
      status: 200,
    };
    const data = makeSiteData({ homepage: { text: homepage, status: 200 }, blogSample: [blogPage] });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBe(10);
    expect(r.status).toBe('pass');
  });

  it('detects speakable property without SpeakableSpecification type', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Article","headline":"Test","speakable":{"cssSelector":[".summary"]}}</script>
    </head><body><h1>Hello</h1></body></html>`;
    const data = makeSiteData({ homepage: { text: html, status: 200 } });
    const results = auditSiteFromData(data);
    const r = results.find(r => r.criterion === 'speakable_schema')!;
    expect(r.score).toBeGreaterThanOrEqual(4);
  });
});
