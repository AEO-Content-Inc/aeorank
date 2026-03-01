import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing audit
vi.mock('../src/site-crawler.js', () => ({
  prefetchSiteData: vi.fn(),
  auditSiteFromData: vi.fn(),
  extractRawDataSummary: vi.fn(),
}));

vi.mock('../src/scoring.js', () => ({
  calculateOverallScore: vi.fn(),
}));

vi.mock('../src/headless-fetch.js', () => ({
  isSpaShell: vi.fn(),
  fetchWithHeadless: vi.fn(),
  classifyRendering: vi.fn(),
}));

vi.mock('../src/scorecard-builder.js', () => ({
  buildScorecard: vi.fn(),
  buildDetailedFindings: vi.fn(),
}));

vi.mock('../src/narrative-generator.js', () => ({
  generateVerdict: vi.fn(),
  generateOpportunities: vi.fn(),
  generatePitchNumbers: vi.fn(),
  generateBottomLine: vi.fn(),
}));

vi.mock('../src/multi-page-fetcher.js', () => ({
  fetchMultiPageData: vi.fn(),
}));

vi.mock('../src/page-analyzer.js', () => ({
  analyzeAllPages: vi.fn(),
}));

import { audit } from '../src/audit.js';
import { prefetchSiteData, auditSiteFromData, extractRawDataSummary } from '../src/site-crawler.js';
import { calculateOverallScore } from '../src/scoring.js';
import { isSpaShell, fetchWithHeadless } from '../src/headless-fetch.js';
import { buildScorecard, buildDetailedFindings } from '../src/scorecard-builder.js';
import { generateVerdict, generateOpportunities, generatePitchNumbers, generateBottomLine } from '../src/narrative-generator.js';
import { fetchMultiPageData } from '../src/multi-page-fetcher.js';
import { analyzeAllPages } from '../src/page-analyzer.js';

function makeSiteData(overrides = {}) {
  return {
    domain: 'example.com',
    protocol: 'https',
    homepage: { text: '<html><body>Hello world content here</body></html>', status: 200, finalUrl: 'https://example.com' },
    redirectedTo: null,
    parkedReason: null,
    faqPage: null,
    blogSample: [],
    sitemapXml: null,
    robotsTxt: null,
    ...overrides,
  };
}

function setupDefaultMocks(siteDataOverrides = {}) {
  const siteData = makeSiteData(siteDataOverrides);
  vi.mocked(prefetchSiteData).mockResolvedValue(siteData);
  vi.mocked(auditSiteFromData).mockReturnValue([]);
  vi.mocked(calculateOverallScore).mockReturnValue(75);
  vi.mocked(extractRawDataSummary).mockReturnValue({
    has_https: true,
    schema_types_found: [],
    robots_txt_ai_crawlers: [],
    robots_txt_blocked_crawlers: [],
    sitemap_url_count: 0,
    internal_link_count: 0,
    question_headings_count: 0,
  } as any);
  vi.mocked(isSpaShell).mockReturnValue(false);
  vi.mocked(fetchWithHeadless).mockResolvedValue(null);
  vi.mocked(buildScorecard).mockReturnValue([]);
  vi.mocked(buildDetailedFindings).mockReturnValue([]);
  vi.mocked(generateVerdict).mockReturnValue('Good verdict');
  vi.mocked(generateOpportunities).mockReturnValue([]);
  vi.mocked(generatePitchNumbers).mockReturnValue([]);
  vi.mocked(generateBottomLine).mockReturnValue('Bottom line text');
  vi.mocked(fetchMultiPageData).mockResolvedValue(0);
  vi.mocked(analyzeAllPages).mockReturnValue([]);
  return siteData;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audit', () => {
  it('runs the full audit pipeline and returns structured result', async () => {
    setupDefaultMocks();

    const result = await audit('example.com');

    expect(result.site).toBe('example.com');
    expect(result.overallScore).toBe(75);
    expect(result.verdict).toBe('Good verdict');
    expect(result.bottomLine).toBe('Bottom line text');
    expect(result.auditor).toBe('AEORank');
    expect(result.engine).toBe('instant');
    expect(typeof result.elapsed).toBe('number');
    expect(result.auditDate).toBeTruthy();
  });

  it('throws when no protocol (cannot connect)', async () => {
    setupDefaultMocks({ protocol: null });

    await expect(audit('bad.com')).rejects.toThrow('Could not connect to bad.com');
  });

  it('throws when domain redirects (hijacked)', async () => {
    setupDefaultMocks({ redirectedTo: 'other.com' });

    await expect(audit('example.com')).rejects.toThrow('redirects to other.com');
  });

  it('throws when domain is parked', async () => {
    setupDefaultMocks({ parkedReason: 'sedoparking.com' });

    await expect(audit('example.com')).rejects.toThrow('parked/lost domain');
  });

  it('uses headless rendering when SPA shell detected', async () => {
    const siteData = setupDefaultMocks();
    vi.mocked(isSpaShell).mockReturnValue(true);
    vi.mocked(fetchWithHeadless).mockResolvedValue({
      text: '<html><body>' + 'Rich rendered content. '.repeat(100) + '</body></html>',
      status: 200,
      finalUrl: 'https://example.com',
    });

    const result = await audit('example.com');

    expect(fetchWithHeadless).toHaveBeenCalledWith('https://example.com');
    expect(result.renderedWithHeadless).toBe(true);
  });

  it('skips headless when noHeadless option is set', async () => {
    setupDefaultMocks();
    vi.mocked(isSpaShell).mockReturnValue(true);

    await audit('example.com', { noHeadless: true });

    expect(fetchWithHeadless).not.toHaveBeenCalled();
  });

  it('does not set renderedWithHeadless when headless returns less text', async () => {
    setupDefaultMocks();
    vi.mocked(isSpaShell).mockReturnValue(true);
    // Return less text than original
    vi.mocked(fetchWithHeadless).mockResolvedValue({
      text: '<html></html>',
      status: 200,
      finalUrl: 'https://example.com',
    });

    const result = await audit('example.com');

    expect(result.renderedWithHeadless).toBeUndefined();
  });

  it('does not set renderedWithHeadless when headless returns null', async () => {
    setupDefaultMocks();
    vi.mocked(isSpaShell).mockReturnValue(true);
    vi.mocked(fetchWithHeadless).mockResolvedValue(null);

    const result = await audit('example.com');

    expect(result.renderedWithHeadless).toBeUndefined();
  });

  it('renders FAQ page with headless when homepage was SPA', async () => {
    const siteData = setupDefaultMocks({
      faqPage: { text: '<div id="root"></div>', status: 200, finalUrl: 'https://example.com/faq' },
    });
    vi.mocked(isSpaShell).mockReturnValue(true);
    vi.mocked(fetchWithHeadless)
      .mockResolvedValueOnce({
        text: '<html><body>' + 'Rich content here. '.repeat(100) + '</body></html>',
        status: 200,
        finalUrl: 'https://example.com',
      })
      .mockResolvedValueOnce({
        text: '<html><body>' + 'Rich FAQ content. '.repeat(100) + '</body></html>',
        status: 200,
        finalUrl: 'https://example.com/faq',
      });

    await audit('example.com');

    expect(fetchWithHeadless).toHaveBeenCalledTimes(2);
    expect(fetchWithHeadless).toHaveBeenCalledWith('https://example.com/faq');
  });

  it('skips FAQ headless when FAQ is not an SPA shell', async () => {
    setupDefaultMocks({
      faqPage: { text: '<html><body>' + 'Normal FAQ content. '.repeat(100) + '</body></html>', status: 200, finalUrl: 'https://example.com/faq' },
    });
    vi.mocked(isSpaShell)
      .mockReturnValueOnce(true)   // homepage is SPA
      .mockReturnValueOnce(false); // faqPage is not SPA
    vi.mocked(fetchWithHeadless).mockResolvedValueOnce({
      text: '<html><body>' + 'Rendered homepage. '.repeat(100) + '</body></html>',
      status: 200,
      finalUrl: 'https://example.com',
    });

    await audit('example.com');

    // Only called once for homepage, not for FAQ
    expect(fetchWithHeadless).toHaveBeenCalledTimes(1);
  });

  it('skips multi-page when noMultiPage option is set', async () => {
    setupDefaultMocks();

    await audit('example.com', { noMultiPage: true });

    expect(fetchMultiPageData).not.toHaveBeenCalled();
  });

  it('calls fetchMultiPageData by default', async () => {
    setupDefaultMocks();

    await audit('example.com');

    expect(fetchMultiPageData).toHaveBeenCalled();
  });

  it('sets rendered_with_headless in rawData when SPA rendered', async () => {
    setupDefaultMocks();
    vi.mocked(isSpaShell).mockReturnValue(true);
    vi.mocked(fetchWithHeadless).mockResolvedValue({
      text: '<html><body>' + 'Rich rendered content. '.repeat(100) + '</body></html>',
      status: 200,
      finalUrl: 'https://example.com',
    });

    await audit('example.com');

    const rawDataCall = vi.mocked(extractRawDataSummary).mock.results[0].value;
    expect(rawDataCall.rendered_with_headless).toBe(true);
  });
});
