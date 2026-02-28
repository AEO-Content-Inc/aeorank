import { describe, it, expect } from 'vitest';
import { analyzePage, analyzeAllPages } from '../src/page-analyzer.js';
import type { SiteData } from '../src/site-crawler.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function html(parts: { title?: string; meta?: string; h1?: string | string[]; body?: string; schema?: string; canonical?: string; og?: boolean }): string {
  const title = parts.title ? `<title>${parts.title}</title>` : '';
  const meta = parts.meta ? `<meta name="description" content="${parts.meta}">` : '';
  const canonical = parts.canonical ? `<link rel="canonical" href="${parts.canonical}">` : '';
  const og = parts.og ? '<meta property="og:title" content="Test">' : '';
  const schema = parts.schema ? `<script type="application/ld+json">${parts.schema}</script>` : '';
  const h1Array = Array.isArray(parts.h1) ? parts.h1 : parts.h1 ? [parts.h1] : [];
  const h1Tags = h1Array.map(h => `<h1>${h}</h1>`).join('');
  const body = parts.body || '';

  return `<!DOCTYPE html><html lang="en"><head>${title}${meta}${canonical}${og}${schema}</head><body>${h1Tags}${body}</body></html>`;
}

const GOOD_HTML = html({
  title: 'Example Page',
  meta: 'A great page about things.',
  h1: 'Welcome to Example',
  canonical: 'https://example.com/',
  og: true,
  schema: '{"@type":"Organization","name":"Example"}',
  body: '<p>' + 'word '.repeat(400) + '</p><a href="/about">About</a><img src="logo.png" alt="Logo">',
});

const MINIMAL_HTML = '<!DOCTYPE html><html><head></head><body><p>Hello world</p></body></html>';

// ─── Issue checks ───────────────────────────────────────────────────────────

describe('analyzePage - issue checks', () => {
  it('detects missing title', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-title')).toBeTruthy();
  });

  it('passes when title exists', () => {
    const page = html({ title: 'My Page' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-title')).toBeUndefined();
  });

  it('detects empty title', () => {
    const page = '<!DOCTYPE html><html><head><title>  </title></head><body></body></html>';
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-title')).toBeTruthy();
  });

  it('detects missing meta description', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-meta-description')).toBeTruthy();
  });

  it('passes when meta description exists', () => {
    const page = html({ meta: 'A description' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-meta-description')).toBeUndefined();
  });

  it('detects no h1', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-h1')).toBeTruthy();
  });

  it('passes when h1 exists', () => {
    const page = html({ h1: 'Hello' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-h1')).toBeUndefined();
  });

  it('detects multiple h1 tags', () => {
    const page = html({ h1: ['First', 'Second'] });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    const issue = result.issues.find(i => i.check === 'multiple-h1');
    expect(issue).toBeTruthy();
    expect(issue!.label).toContain('2');
  });

  it('detects no JSON-LD schema', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-schema')).toBeTruthy();
  });

  it('passes when JSON-LD exists', () => {
    const page = html({ schema: '{"@type":"Organization"}' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-schema')).toBeUndefined();
  });

  it('detects missing canonical', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-canonical')).toBeTruthy();
  });

  it('passes when canonical exists', () => {
    const page = html({ canonical: 'https://example.com/' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-canonical')).toBeUndefined();
  });

  it('detects missing OG tags', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-og-tags')).toBeTruthy();
  });

  it('passes when OG tags exist', () => {
    const page = html({ og: true });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'missing-og-tags')).toBeUndefined();
  });

  it('detects thin content', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'thin-content')).toBeTruthy();
  });

  it('passes with enough content', () => {
    const page = html({ body: '<p>' + 'word '.repeat(400) + '</p>' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'thin-content')).toBeUndefined();
  });

  it('detects images missing alt text', () => {
    const page = html({ body: '<img src="a.png"><img src="b.png" alt="B">' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    const issue = result.issues.find(i => i.check === 'images-missing-alt');
    expect(issue).toBeTruthy();
    expect(issue!.label).toContain('1');
  });

  it('passes when all images have alt', () => {
    const page = html({ body: '<img src="a.png" alt="A"><img src="b.png" alt="B">' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'images-missing-alt')).toBeUndefined();
  });

  it('allows decorative images with empty alt', () => {
    const page = html({ body: '<img src="spacer.png" alt="">' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'images-missing-alt')).toBeUndefined();
  });

  it('detects no internal links', () => {
    const page = html({ body: '<a href="https://external.com">External</a>' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-internal-links')).toBeTruthy();
  });

  it('passes with internal links', () => {
    const page = html({ body: '<a href="/about">About</a>' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    expect(result.issues.find(i => i.check === 'no-internal-links')).toBeUndefined();
  });
});

// ─── Strength checks ────────────────────────────────────────────────────────

describe('analyzePage - strength checks', () => {
  it('detects structured data types', () => {
    const page = html({ schema: '{"@type":"Organization","name":"Test"}' });
    const result = analyzePage(page, 'https://example.com', 'homepage');
    const strength = result.strengths.find(s => s.check === 'has-structured-data');
    expect(strength).toBeTruthy();
    expect(strength!.label).toContain('Organization');
  });

  it('detects question headings', () => {
    const page = html({ body: '<h2>What is AEO?</h2><h2>How does it work?</h2><h2>Regular heading</h2>' });
    const result = analyzePage(page, 'https://example.com', 'blog');
    const strength = result.strengths.find(s => s.check === 'has-question-headings');
    expect(strength).toBeTruthy();
    expect(strength!.label).toContain('2');
  });

  it('returns no strengths for minimal page', () => {
    const result = analyzePage(MINIMAL_HTML, 'https://example.com', 'homepage');
    expect(result.strengths).toHaveLength(0);
  });
});

// ─── Full page analysis ─────────────────────────────────────────────────────

describe('analyzePage - metadata', () => {
  it('extracts title', () => {
    const result = analyzePage(GOOD_HTML, 'https://example.com', 'homepage');
    expect(result.title).toBe('Example Page');
  });

  it('calculates word count', () => {
    const result = analyzePage(GOOD_HTML, 'https://example.com', 'homepage');
    expect(result.wordCount).toBeGreaterThan(300);
  });

  it('sets category from argument', () => {
    const result = analyzePage(GOOD_HTML, 'https://example.com/blog/post', 'blog');
    expect(result.category).toBe('blog');
  });

  it('good page has zero issues', () => {
    const result = analyzePage(GOOD_HTML, 'https://example.com', 'homepage');
    expect(result.issues).toHaveLength(0);
  });
});

// ─── analyzeAllPages ────────────────────────────────────────────────────────

describe('analyzeAllPages', () => {
  it('analyzes homepage + blogSample', () => {
    const siteData: SiteData = {
      domain: 'example.com',
      protocol: 'https',
      homepage: { text: GOOD_HTML, status: 200, category: 'homepage' },
      llmsTxt: null,
      robotsTxt: null,
      faqPage: null,
      sitemapXml: null,
      rssFeed: null,
      aiTxt: null,
      redirectedTo: null,
      parkedReason: null,
      blogSample: [
        { text: MINIMAL_HTML, status: 200, finalUrl: 'https://example.com/blog/post-1', category: 'blog' },
        { text: GOOD_HTML, status: 200, finalUrl: 'https://example.com/about', category: 'about' },
      ],
    };

    const reviews = analyzeAllPages(siteData);
    expect(reviews).toHaveLength(3);
    expect(reviews[0].category).toBe('homepage');
    expect(reviews[1].category).toBe('blog');
    expect(reviews[2].category).toBe('about');
    // Minimal page should have issues, good page should not
    expect(reviews[1].issues.length).toBeGreaterThan(0);
    expect(reviews[0].issues).toHaveLength(0);
  });

  it('handles empty siteData', () => {
    const siteData: SiteData = {
      domain: 'example.com',
      protocol: null,
      homepage: null,
      llmsTxt: null,
      robotsTxt: null,
      faqPage: null,
      sitemapXml: null,
      rssFeed: null,
      aiTxt: null,
      redirectedTo: null,
      parkedReason: null,
    };

    const reviews = analyzeAllPages(siteData);
    expect(reviews).toHaveLength(0);
  });

  it('defaults uncategorized pages to content', () => {
    const siteData: SiteData = {
      domain: 'example.com',
      protocol: 'https',
      homepage: null,
      llmsTxt: null,
      robotsTxt: null,
      faqPage: null,
      sitemapXml: null,
      rssFeed: null,
      aiTxt: null,
      redirectedTo: null,
      parkedReason: null,
      blogSample: [
        { text: MINIMAL_HTML, status: 200, finalUrl: 'https://example.com/page' },
      ],
    };

    const reviews = analyzeAllPages(siteData);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].category).toBe('content');
  });
});
