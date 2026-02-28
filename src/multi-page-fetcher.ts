/**
 * Extended page discovery for instant audit.
 * Fetches additional pages beyond what prefetchSiteData provides,
 * including nav-linked pages, common paths, and content pages from sitemap.
 */

import type { FetchResult, SiteData, PageCategory } from './site-crawler.js';

// ─── Fetch helper (matches site-crawler.ts fetchText) ────────────────────────

async function fetchPage(url: string, timeoutMs = 10000): Promise<FetchResult | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'AEO-Visibility-Bot/1.0' },
      redirect: 'follow',
    });
    if (res.status !== 200) return null;
    const text = await res.text();
    if (text.length < 200) return null; // Skip trivially small pages
    return { text: text.slice(0, 500000), status: res.status, finalUrl: res.url };
  } catch {
    return null;
  }
}

// ─── Page variant paths ──────────────────────────────────────────────────────

const PAGE_VARIANTS: Record<string, string[]> = {
  about: ['/about', '/about-us', '/company', '/who-we-are'],
  pricing: ['/pricing', '/plans', '/packages'],
  services: ['/services', '/features', '/solutions', '/products', '/what-we-do'],
  contact: ['/contact', '/contact-us', '/get-in-touch'],
  team: ['/team', '/our-team', '/authors', '/people', '/leadership'],
  resources: ['/resources', '/resource-center', '/library'],
  docs: ['/docs', '/documentation', '/help', '/help-center', '/support'],
  cases: ['/case-studies', '/customers', '/success-stories', '/testimonials'],
};

// ─── Nav link extraction ─────────────────────────────────────────────────────

/**
 * Extract internal page paths from <nav> elements in homepage HTML.
 * Returns deduplicated absolute paths (e.g. ['/about', '/pricing']).
 */
export function extractNavLinks(html: string, domain: string): string[] {
  // Extract links from <nav> elements
  const navBlocks = html.match(/<nav[\s\S]*?<\/nav>/gi) || [];
  const navHtml = navBlocks.join('\n');

  const hrefMatches = navHtml.match(/href="([^"#]*)"/gi) || [];
  const paths = new Set<string>();

  const cleanDomain = domain.replace(/^www\./, '').toLowerCase();

  for (const match of hrefMatches) {
    const href = match.match(/href="([^"#]*)"/i)?.[1];
    if (!href) continue;

    let path: string;
    if (href.startsWith('/')) {
      path = href;
    } else if (href.startsWith('http')) {
      try {
        const url = new URL(href);
        const linkDomain = url.hostname.replace(/^www\./, '').toLowerCase();
        if (linkDomain !== cleanDomain) continue;
        path = url.pathname;
      } catch {
        continue;
      }
    } else {
      continue;
    }

    // Normalize: strip trailing slash, skip root and fragments
    path = path.replace(/\/+$/, '') || '/';
    if (path === '/') continue;
    if (path.includes('#')) continue;

    // Skip resource/utility paths
    if (/\.(js|css|png|jpg|svg|ico|pdf|xml|txt)$/i.test(path)) continue;
    if (/^\/(api|wp-|static|assets|_next|auth|login|signup|cart|checkout)\b/i.test(path)) continue;

    paths.add(path);
  }

  return Array.from(paths);
}

// ─── Content page extraction from sitemap ────────────────────────────────────

/**
 * Extract non-blog deep content pages from sitemap XML.
 * Targets service pages, product pages, etc. (not blog/article posts).
 */
export function extractContentPagesFromSitemap(
  sitemapText: string,
  domain: string,
  limit = 6
): string[] {
  const urlBlocks = sitemapText.match(/<url>([\s\S]*?)<\/url>/gi) || [];
  const cleanDomain = domain.replace(/^www\./, '').toLowerCase();
  const candidates: string[] = [];

  // Paths to skip (already covered by blog sample or common pages)
  const skipPatterns = /\/(?:blog|articles?|posts?|news|tag|category|author|feed|faq|about|pricing|contact|team|resources?|docs?|documentation|help|support|case-studies|customers|testimonials|sitemap|wp-|api|login|cart|checkout|search)\b/i;

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();

    try {
      const parsed = new URL(url);
      const urlDomain = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (urlDomain !== cleanDomain) continue;

      if (parsed.pathname === '/' || parsed.pathname === '') continue;

      const path = parsed.pathname.toLowerCase();
      if (skipPatterns.test(path)) continue;

      // Want pages with 1-2 path segments (service pages, product pages)
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 1 || segments.length > 3) continue;

      candidates.push(url);
    } catch {
      continue;
    }
  }

  // Return evenly spaced pages from the list for variety
  if (candidates.length <= limit) return candidates;

  const result: string[] = [];
  for (let i = 0; i < limit; i++) {
    const index = Math.round(i * (candidates.length - 1) / (limit - 1));
    result.push(candidates[index]);
  }
  return result;
}

// ─── Main multi-page fetcher ─────────────────────────────────────────────────

export interface MultiPageOptions {
  timeoutMs?: number;
}

/**
 * Fetch additional pages beyond what prefetchSiteData provides.
 * Discovers pages from nav links + common path variants + sitemap content pages.
 * All fetched pages are appended to siteData.blogSample so existing
 * getCombinedHtml() and criteria checks pick them up automatically.
 *
 * Mutates siteData in place and returns the count of new pages added.
 */
export async function fetchMultiPageData(
  siteData: SiteData,
  options?: MultiPageOptions
): Promise<number> {
  if (!siteData.protocol || !siteData.homepage) return 0;

  const timeoutMs = options?.timeoutMs ?? 10000;
  const baseUrl = `${siteData.protocol}://${siteData.domain}`;
  const existingUrls = new Set<string>();

  // Track already-fetched URLs
  existingUrls.add(baseUrl + '/');
  existingUrls.add(baseUrl);
  if (siteData.blogSample) {
    for (const page of siteData.blogSample) {
      if (page.finalUrl) existingUrls.add(page.finalUrl);
    }
  }

  // Collect candidate URLs to fetch (URL -> category)
  const urlsToFetch = new Map<string, PageCategory>();

  // Source 1: Nav links from homepage
  const navPaths = extractNavLinks(siteData.homepage.text, siteData.domain);

  // Source 2: Common page variants (try nav links first, then fallback paths)
  for (const [category, variants] of Object.entries(PAGE_VARIANTS)) {
    // Check if any nav link matches this category
    const navMatch = navPaths.find(p =>
      variants.some(v => p.toLowerCase() === v || p.toLowerCase().startsWith(v + '/'))
    );

    if (navMatch) {
      const url = `${baseUrl}${navMatch}`;
      if (!existingUrls.has(url)) urlsToFetch.set(url, category as PageCategory);
    } else {
      // Try first variant as fallback
      const url = `${baseUrl}${variants[0]}`;
      if (!existingUrls.has(url)) urlsToFetch.set(url, category as PageCategory);
    }
  }

  // Source 3: Content pages from sitemap
  if (siteData.sitemapXml && siteData.sitemapXml.status === 200) {
    const contentUrls = extractContentPagesFromSitemap(
      siteData.sitemapXml.text,
      siteData.domain,
      6
    );
    for (const url of contentUrls) {
      if (!existingUrls.has(url)) urlsToFetch.set(url, 'content');
    }
  }

  // Fetch all URLs in parallel
  const entries = Array.from(urlsToFetch.entries());
  if (entries.length === 0) return 0;

  const results = await Promise.all(entries.map(([url]) => fetchPage(url, timeoutMs)));

  // Append successful results to blogSample with category tags
  if (!siteData.blogSample) siteData.blogSample = [];

  let added = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result && result.text.length > 500) {
      result.category = entries[i][1];
      siteData.blogSample.push(result);
      added++;
    }
  }

  return added;
}
