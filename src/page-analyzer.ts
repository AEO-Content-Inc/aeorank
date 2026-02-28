/**
 * Per-page analysis for instant audit.
 * Runs 12 deterministic checks on each crawled page (no LLM).
 */

import type { PageCategory, SiteData } from './site-crawler.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PageIssue {
  check: string;
  label: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PageReview {
  url: string;
  title: string;
  category: PageCategory;
  wordCount: number;
  issues: PageIssue[];
  strengths: PageIssue[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function getTextContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ─── Individual checks ──────────────────────────────────────────────────────

function checkMissingTitle(html: string): PageIssue | null {
  const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(html);
  if (!hasTitle) {
    return { check: 'missing-title', label: 'Missing <title> tag', severity: 'error' };
  }
  const title = extractTitle(html);
  if (!title) {
    return { check: 'missing-title', label: 'Empty <title> tag', severity: 'error' };
  }
  return null;
}

function checkMissingMetaDescription(html: string): PageIssue | null {
  const hasDesc = /<meta\s[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)
    || /<meta\s[^>]*content=["'][^"']+["'][^>]*name=["']description["']/i.test(html);
  if (!hasDesc) {
    return { check: 'missing-meta-description', label: 'Missing meta description', severity: 'error' };
  }
  return null;
}

function checkNoH1(html: string): PageIssue | null {
  const h1Matches = html.match(/<h1[\s>]/gi);
  if (!h1Matches || h1Matches.length === 0) {
    return { check: 'no-h1', label: 'No <h1> tag', severity: 'error' };
  }
  return null;
}

function checkMultipleH1(html: string): PageIssue | null {
  const h1Matches = html.match(/<h1[\s>]/gi);
  if (h1Matches && h1Matches.length > 1) {
    return { check: 'multiple-h1', label: `Multiple <h1> tags (${h1Matches.length})`, severity: 'warning' };
  }
  return null;
}

function checkNoSchema(html: string): PageIssue | null {
  const hasLdJson = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  if (!hasLdJson) {
    return { check: 'no-schema', label: 'No JSON-LD structured data', severity: 'warning' };
  }
  return null;
}

function checkMissingCanonical(html: string): PageIssue | null {
  const hasCanonical = /<link[^>]*rel=["']canonical["'][^>]*>/i.test(html);
  if (!hasCanonical) {
    return { check: 'missing-canonical', label: 'Missing canonical link', severity: 'warning' };
  }
  return null;
}

function checkMissingOgTags(html: string): PageIssue | null {
  const hasOg = /<meta\s[^>]*property=["']og:/i.test(html);
  if (!hasOg) {
    return { check: 'missing-og-tags', label: 'No Open Graph tags', severity: 'warning' };
  }
  return null;
}

function checkThinContent(wordCount: number): PageIssue | null {
  if (wordCount < 300) {
    return { check: 'thin-content', label: `Thin content (${wordCount} words)`, severity: 'warning' };
  }
  return null;
}

function checkImagesMissingAlt(html: string): PageIssue | null {
  const imgTags = html.match(/<img\s[^>]*>/gi) || [];
  if (imgTags.length === 0) return null;

  let missingAlt = 0;
  for (const img of imgTags) {
    const hasAlt = /\salt=["'][^"']+["']/i.test(img);
    const hasEmptyAlt = /\salt=["']["']/i.test(img); // decorative
    if (!hasAlt && !hasEmptyAlt) missingAlt++;
  }

  if (missingAlt > 0) {
    return {
      check: 'images-missing-alt',
      label: `${missingAlt} image${missingAlt > 1 ? 's' : ''} missing alt text`,
      severity: 'warning',
    };
  }
  return null;
}

function checkNoInternalLinks(html: string, url: string): PageIssue | null {
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }

  const links = html.match(/<a\s[^>]*href=["']([^"'#]*?)["'][^>]*>/gi) || [];
  let internalCount = 0;

  for (const link of links) {
    const hrefMatch = link.match(/href=["']([^"'#]*?)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];

    if (href.startsWith('/') && !href.startsWith('//')) {
      internalCount++;
    } else if (href.startsWith('http')) {
      try {
        const linkDomain = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
        if (linkDomain === domain) internalCount++;
      } catch {
        // skip
      }
    }
  }

  if (internalCount === 0) {
    return { check: 'no-internal-links', label: 'No internal links found', severity: 'warning' };
  }
  return null;
}

// ─── Strength checks ────────────────────────────────────────────────────────

function checkHasStructuredData(html: string): PageIssue | null {
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (ldBlocks.length === 0) return null;

  const types = new Set<string>();
  for (const block of ldBlocks) {
    const content = block.replace(/<\/?script[^>]*>/gi, '');
    const typeMatches = content.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    for (const m of typeMatches) {
      const t = m.match(/"@type"\s*:\s*"([^"]+)"/);
      if (t) types.add(t[1]);
    }
  }

  if (types.size > 0) {
    return {
      check: 'has-structured-data',
      label: `JSON-LD: ${Array.from(types).join(', ')}`,
      severity: 'info',
    };
  }
  return null;
}

function checkHasQuestionHeadings(html: string): PageIssue | null {
  const headings = html.match(/<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>/gi) || [];
  let questionCount = 0;

  for (const h of headings) {
    const text = h.replace(/<[^>]*>/g, '').trim();
    if (/\?$/.test(text) || /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will)\b/i.test(text)) {
      questionCount++;
    }
  }

  if (questionCount > 0) {
    return {
      check: 'has-question-headings',
      label: `${questionCount} question-format heading${questionCount > 1 ? 's' : ''}`,
      severity: 'info',
    };
  }
  return null;
}

// ─── Main analyzers ─────────────────────────────────────────────────────────

export function analyzePage(html: string, url: string, category: PageCategory): PageReview {
  const title = extractTitle(html);
  const textContent = getTextContent(html);
  const wordCount = countWords(textContent);

  const issues: PageIssue[] = [];
  const strengths: PageIssue[] = [];

  // Issue checks
  const issueChecks = [
    checkMissingTitle(html),
    checkMissingMetaDescription(html),
    checkNoH1(html),
    checkMultipleH1(html),
    checkNoSchema(html),
    checkMissingCanonical(html),
    checkMissingOgTags(html),
    checkThinContent(wordCount),
    checkImagesMissingAlt(html),
    checkNoInternalLinks(html, url),
  ];

  for (const result of issueChecks) {
    if (result) issues.push(result);
  }

  // Strength checks
  const strengthChecks = [
    checkHasStructuredData(html),
    checkHasQuestionHeadings(html),
  ];

  for (const result of strengthChecks) {
    if (result) strengths.push(result);
  }

  return { url, title, category, wordCount, issues, strengths };
}

export function analyzeAllPages(siteData: SiteData): PageReview[] {
  const reviews: PageReview[] = [];

  // Analyze homepage
  if (siteData.homepage) {
    const url = `${siteData.protocol}://${siteData.domain}`;
    reviews.push(analyzePage(siteData.homepage.text, url, siteData.homepage.category || 'homepage'));
  }

  // Analyze all pages in blogSample
  if (siteData.blogSample) {
    for (const page of siteData.blogSample) {
      const url = page.finalUrl || 'unknown';
      reviews.push(analyzePage(page.text, url, page.category || 'content'));
    }
  }

  return reviews;
}
