import { describe, it, expect } from 'vitest';
import { extractNavLinks, extractContentPagesFromSitemap } from '../src/multi-page-fetcher.js';

// ─── extractNavLinks ─────────────────────────────────────────────────────────

describe('extractNavLinks', () => {
  it('extracts paths from <nav> links', () => {
    const html = `
      <nav>
        <a href="/about">About</a>
        <a href="/pricing">Pricing</a>
        <a href="/blog">Blog</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toContain('/about');
    expect(paths).toContain('/pricing');
    expect(paths).toContain('/blog');
  });

  it('handles absolute URLs for same domain', () => {
    const html = `
      <nav>
        <a href="https://example.com/services">Services</a>
        <a href="https://www.example.com/contact">Contact</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toContain('/services');
    expect(paths).toContain('/contact');
  });

  it('skips external domain links', () => {
    const html = `
      <nav>
        <a href="https://example.com/about">About</a>
        <a href="https://other-site.com/page">External</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toContain('/about');
    expect(paths).not.toContain('/page');
  });

  it('skips API and utility paths', () => {
    const html = `
      <nav>
        <a href="/api/data">API</a>
        <a href="/login">Login</a>
        <a href="/about">About</a>
        <a href="/static/file.js">Static</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toContain('/about');
    expect(paths).not.toContain('/api/data');
    expect(paths).not.toContain('/login');
  });

  it('skips root path', () => {
    const html = `<nav><a href="/">Home</a></nav>`;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).not.toContain('/');
  });

  it('deduplicates paths', () => {
    const html = `
      <nav>
        <a href="/about">About</a>
        <a href="/about/">About Us</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    const aboutCount = paths.filter(p => p === '/about').length;
    expect(aboutCount).toBe(1);
  });

  it('returns empty array when no nav element', () => {
    const html = `<div><a href="/about">About</a></div>`;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toHaveLength(0);
  });

  it('skips file extensions', () => {
    const html = `
      <nav>
        <a href="/logo.png">Logo</a>
        <a href="/doc.pdf">Doc</a>
        <a href="/about">About</a>
      </nav>
    `;
    const paths = extractNavLinks(html, 'example.com');
    expect(paths).toContain('/about');
    expect(paths).not.toContain('/logo.png');
    expect(paths).not.toContain('/doc.pdf');
  });
});

// ─── extractContentPagesFromSitemap ──────────────────────────────────────────

describe('extractContentPagesFromSitemap', () => {
  it('extracts non-blog content pages', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/solutions/enterprise</loc></url>
        <url><loc>https://example.com/platform</loc></url>
        <url><loc>https://example.com/blog/post-1</loc></url>
      </urlset>
    `;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com');
    expect(pages).toContain('https://example.com/solutions/enterprise');
    expect(pages).toContain('https://example.com/platform');
    expect(pages).not.toContain('https://example.com/');
    expect(pages).not.toContain('https://example.com/blog/post-1');
  });

  it('skips common excluded paths', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://example.com/tag/seo</loc></url>
        <url><loc>https://example.com/category/tech</loc></url>
        <url><loc>https://example.com/platform</loc></url>
      </urlset>
    `;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com');
    expect(pages).not.toContain('https://example.com/about');
    expect(pages).not.toContain('https://example.com/tag/seo');
    expect(pages).not.toContain('https://example.com/category/tech');
  });

  it('limits results', () => {
    const urls = Array.from({ length: 20 }, (_, i) =>
      `<url><loc>https://example.com/page-${i}</loc></url>`
    ).join('\n');
    const sitemap = `<urlset>${urls}</urlset>`;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com', 3);
    expect(pages.length).toBeLessThanOrEqual(3);
  });

  it('skips other domains', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://other.com/platform</loc></url>
        <url><loc>https://example.com/platform</loc></url>
      </urlset>
    `;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com');
    expect(pages).toContain('https://example.com/platform');
    expect(pages).not.toContain('https://other.com/platform');
  });

  it('returns empty array for empty sitemap', () => {
    const pages = extractContentPagesFromSitemap('', 'example.com');
    expect(pages).toHaveLength(0);
  });

  it('defaults to 6 content pages', () => {
    const urls = Array.from({ length: 20 }, (_, i) =>
      `<url><loc>https://example.com/page-${i}</loc></url>`
    ).join('\n');
    const sitemap = `<urlset>${urls}</urlset>`;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com');
    expect(pages).toHaveLength(6);
  });

  it('selects evenly spaced pages from candidates', () => {
    const urls = Array.from({ length: 10 }, (_, i) =>
      `<url><loc>https://example.com/page-${i}</loc></url>`
    ).join('\n');
    const sitemap = `<urlset>${urls}</urlset>`;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com', 4);
    expect(pages).toHaveLength(4);
    // Should include first and last
    expect(pages[0]).toBe('https://example.com/page-0');
    expect(pages[pages.length - 1]).toBe('https://example.com/page-9');
  });

  it('skips new category paths (resources, docs, cases)', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://example.com/resources/guide</loc></url>
        <url><loc>https://example.com/docs/getting-started</loc></url>
        <url><loc>https://example.com/case-studies/acme</loc></url>
        <url><loc>https://example.com/platform</loc></url>
      </urlset>
    `;
    const pages = extractContentPagesFromSitemap(sitemap, 'example.com');
    expect(pages).toContain('https://example.com/platform');
    expect(pages).not.toContain('https://example.com/resources/guide');
    expect(pages).not.toContain('https://example.com/docs/getting-started');
    expect(pages).not.toContain('https://example.com/case-studies/acme');
  });
});
