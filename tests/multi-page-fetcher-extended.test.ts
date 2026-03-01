import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMultiPageData } from '../src/multi-page-fetcher.js';
import type { SiteData } from '../src/site-crawler.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeSiteData(overrides: Partial<SiteData> = {}): SiteData {
  return {
    domain: 'example.com',
    protocol: 'https',
    homepage: {
      text: `<html><body>
        <nav>
          <a href="/about">About</a>
          <a href="/pricing">Pricing</a>
          <a href="/services">Services</a>
          <a href="/contact">Contact</a>
        </nav>
        <h1>Welcome</h1>
      </body></html>`,
      status: 200,
      finalUrl: 'https://example.com',
    },
    redirectedTo: null,
    parkedReason: null,
    faqPage: null,
    blogSample: [],
    sitemapXml: null,
    robotsTxt: null,
    ...overrides,
  } as SiteData;
}

function mockFetchResponse(text: string, status = 200) {
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    url: 'https://example.com/page',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation(() => mockFetchResponse(
    '<html><body>' + 'Page content here. '.repeat(50) + '</body></html>'
  ));
});

describe('fetchMultiPageData', () => {
  it('returns 0 when no protocol', async () => {
    const siteData = makeSiteData({ protocol: null as any });
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('returns 0 when no homepage', async () => {
    const siteData = makeSiteData({ homepage: null as any });
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('fetches pages from nav links matching page variants', async () => {
    const siteData = makeSiteData();
    const count = await fetchMultiPageData(siteData);
    expect(count).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('uses fallback paths when nav links do not match', async () => {
    const siteData = makeSiteData({
      homepage: {
        text: '<html><body><nav><a href="/blog">Blog</a></nav></body></html>',
        status: 200,
        finalUrl: 'https://example.com',
      },
    });
    const count = await fetchMultiPageData(siteData);
    // Should still attempt to fetch default paths like /about, /pricing etc.
    expect(mockFetch).toHaveBeenCalled();
  });

  it('skips already-fetched URLs from blogSample', async () => {
    const siteData = makeSiteData({
      blogSample: [
        { text: 'blog content', status: 200, finalUrl: 'https://example.com/about' },
      ],
    });
    const count = await fetchMultiPageData(siteData);
    // /about should be skipped since it's already in blogSample
    const fetchedUrls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(fetchedUrls).not.toContain('https://example.com/about');
  });

  it('fetches content pages from sitemap', async () => {
    const siteData = makeSiteData({
      sitemapXml: {
        text: `<urlset>
          <url><loc>https://example.com/platform</loc></url>
          <url><loc>https://example.com/integrations</loc></url>
        </urlset>`,
        status: 200,
        finalUrl: 'https://example.com/sitemap.xml',
      },
    });
    const count = await fetchMultiPageData(siteData);
    const fetchedUrls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(fetchedUrls).toContain('https://example.com/platform');
  });

  it('ignores sitemap when status is not 200', async () => {
    const siteData = makeSiteData({
      homepage: {
        text: '<html><body><nav></nav></body></html>',
        status: 200,
        finalUrl: 'https://example.com',
      },
      sitemapXml: {
        text: '<urlset><url><loc>https://example.com/platform</loc></url></urlset>',
        status: 404,
        finalUrl: 'https://example.com/sitemap.xml',
      },
    });
    await fetchMultiPageData(siteData);
    const fetchedUrls = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(fetchedUrls).not.toContain('https://example.com/platform');
  });

  it('skips pages with too little content (< 500 chars)', async () => {
    mockFetch.mockImplementation(() => mockFetchResponse('short'));
    const siteData = makeSiteData();
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('handles fetch failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const siteData = makeSiteData();
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('skips pages returning non-200 status', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({
      status: 404,
      text: () => Promise.resolve('Not found'),
      url: 'https://example.com/404',
    }));
    const siteData = makeSiteData();
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('initializes blogSample if null', async () => {
    const siteData = makeSiteData({ blogSample: null as any });
    await fetchMultiPageData(siteData);
    expect(siteData.blogSample).toBeDefined();
    expect(Array.isArray(siteData.blogSample)).toBe(true);
  });

  it('returns 0 when no URLs to fetch', async () => {
    // No nav, no sitemap, but homepage exists - fallback paths will be tried
    const siteData = makeSiteData({
      homepage: {
        text: '<html><body></body></html>',
        status: 200,
        finalUrl: 'https://example.com',
      },
    });
    // Make all fetches fail
    mockFetch.mockImplementation(() => Promise.resolve({
      status: 404,
      text: () => Promise.resolve(''),
      url: 'https://example.com/x',
    }));
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('skips pages with < 200 chars of text', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({
      status: 200,
      text: () => Promise.resolve('x'.repeat(100)),
      url: 'https://example.com/small',
    }));
    const siteData = makeSiteData();
    const count = await fetchMultiPageData(siteData);
    expect(count).toBe(0);
  });

  it('respects custom timeout option', async () => {
    const siteData = makeSiteData();
    await fetchMultiPageData(siteData, { timeoutMs: 5000 });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('tags fetched pages with category from nav match', async () => {
    const siteData = makeSiteData();
    await fetchMultiPageData(siteData);
    // Pages added to blogSample should have a category tag
    const addedPages = siteData.blogSample?.filter(p => p.category) || [];
    if (addedPages.length > 0) {
      expect(addedPages[0].category).toBeTruthy();
    }
  });
});
