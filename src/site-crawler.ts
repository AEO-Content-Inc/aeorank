import type { AuditFinding, AuditStatus, Priority } from './types.js';
import { detectParkedDomain } from './parked-domain.js';

export interface CriterionResult {
  criterion: string;
  criterion_label: string;
  score: number;
  status: AuditStatus;
  findings: AuditFinding[];
  fix_priority: Priority;
}

// ─── Pre-fetched site data (one fetch per URL, reused across all criteria) ───

export type PageCategory = 'homepage' | 'blog' | 'about' | 'pricing' | 'services'
  | 'contact' | 'team' | 'resources' | 'docs' | 'cases' | 'content';

export interface FetchResult {
  text: string;
  status: number;
  finalUrl?: string;
  category?: PageCategory;
}

export interface SiteData {
  domain: string;
  protocol: 'https' | 'http' | null;
  homepage: FetchResult | null;
  llmsTxt: FetchResult | null;
  robotsTxt: FetchResult | null;
  faqPage: FetchResult | null;
  sitemapXml: FetchResult | null;
  rssFeed: FetchResult | null;
  aiTxt: FetchResult | null;
  /** Set when homepage redirects to a different (non-brand) domain */
  redirectedTo: string | null;
  /** Set when homepage is a parked/for-sale/lost domain */
  parkedReason: string | null;
  /** Sampled blog/content pages from sitemap (up to 5) */
  blogSample?: FetchResult[];
}

// Raw data summary for AI narrative generation
export interface RawDataSummary {
  domain: string;
  protocol: 'https' | 'http' | null;
  homepage_length: number;
  homepage_text_length: number;
  has_https: boolean;
  llms_txt_status: number | null;
  llms_txt_length: number;
  robots_txt_status: number | null;
  robots_txt_snippet: string;
  robots_txt_ai_crawlers: string[];
  robots_txt_blocked_crawlers: string[];
  schema_types_found: string[];
  schema_block_count: number;
  faq_page_status: number | null;
  faq_page_length: number;
  sitemap_status: number | null;
  internal_link_count: number;
  external_link_count: number;
  question_headings_count: number;
  h1_count: number;
  has_meta_description: boolean;
  has_title: boolean;
  has_phone: boolean;
  has_address: boolean;
  has_org_schema: boolean;
  has_social_links: boolean;
  semantic_elements_found: string[];
  img_count: number;
  img_with_alt_count: number;
  has_lang_attr: boolean;
  has_aria: boolean;
  has_breadcrumbs: boolean;
  has_nav: boolean;
  has_footer: boolean;
  has_case_studies: boolean;
  has_statistics: boolean;
  has_expert_attribution: boolean;
  has_blog_section: boolean;
  // New criteria fields
  has_date_modified_schema: boolean;
  time_element_count: number;
  sitemap_url_count: number;
  has_rss_feed: boolean;
  table_count: number;
  ordered_list_count: number;
  unordered_list_count: number;
  definition_pattern_count: number;
  has_ai_txt: boolean;
  has_person_schema: boolean;
  fact_data_point_count: number;
  has_canonical: boolean;
  has_license_schema: boolean;
  sitemap_recent_lastmod_count: number;
  rendered_with_headless?: boolean;
  // Speakable schema fields
  has_speakable_schema: boolean;
  speakable_selector_count: number;
  // Blog sample fields
  blog_sample_count: number;
  blog_sample_urls: string[];
  blog_sample_schema_types: string[];
  blog_sample_question_headings: number;
  blog_sample_faq_schema_found: boolean;
}

async function fetchText(url: string): Promise<FetchResult | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'AEO-Visibility-Bot/1.0' },
      redirect: 'follow',
    });
    const text = await res.text();
    return { text: text.slice(0, 500000), status: res.status, finalUrl: res.url };
  } catch {
    return null;
  }
}

/** Extract bare domain from URL (no protocol, www, port, path) */
function extractDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/.*/, '').replace(/:[0-9]+$/, '').replace(/^www\./, '').toLowerCase();
}

/** Extract brand name from domain (everything before TLD) */
function extractBrandName(domain: string): string {
  const parts = domain.split('.');
  const twoPartTlds = ['co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'co.in'];
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(0, -2).join('.');
  }
  return parts.length > 1 ? parts.slice(0, -1).join('.') : domain;
}

/** Check if redirect target is a different brand (hijacked domain) */
function detectCrossDomainRedirect(originalDomain: string, homepage: FetchResult): string | null {
  if (!homepage.finalUrl) return null;
  const finalDomain = extractDomain(homepage.finalUrl);
  const cleanOriginal = originalDomain.replace(/^www\./, '').toLowerCase();
  if (
    finalDomain === cleanOriginal ||
    finalDomain === `www.${cleanOriginal}` ||
    extractBrandName(finalDomain) === extractBrandName(cleanOriginal)
  ) {
    return null;
  }
  return finalDomain;
}

/** Detect JS-based cross-domain redirect in HTML body */
function detectJsRedirect(bodySnippet: string, originalDomain: string): string | null {
  const jsMatch = bodySnippet.match(
    /window\.location\.(replace|assign|href)\s*[=(]\s*['"]https?:\/\/([^'"]+)['"]/i,
  );
  if (!jsMatch) return null;
  const jsDomain = extractDomain('https://' + jsMatch[2]);
  const cleanOriginal = originalDomain.replace(/^www\./, '').toLowerCase();
  if (
    jsDomain === cleanOriginal ||
    jsDomain === `www.${cleanOriginal}` ||
    extractBrandName(jsDomain) === extractBrandName(cleanOriginal)
  ) {
    return null;
  }
  return jsDomain;
}

/** Detect HTML served for plain-text URLs (e.g. catch-all routes returning 200 for /ai.txt) */
function isHtmlResponse(result: FetchResult | null): boolean {
  if (!result || result.status !== 200) return false;
  const trimmed = result.text.trimStart().slice(0, 200).toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || /<head[\s>]/i.test(trimmed);
}

/**
 * Fetches all site data in parallel with HTTPS/HTTP fallback.
 * Single entry point for all HTTP requests - no redundant fetches.
 */
export async function prefetchSiteData(domain: string): Promise<SiteData> {
  // Step 1: Detect protocol (HTTPS first, fallback to HTTP)
  let protocol: 'https' | 'http' | null = null;
  let homepage: FetchResult | null = null;

  homepage = await fetchText(`https://${domain}`);
  if (homepage && homepage.status >= 200 && homepage.status < 400) {
    protocol = 'https';
  } else {
    homepage = await fetchText(`http://${domain}`);
    if (homepage && homepage.status >= 200 && homepage.status < 400) {
      protocol = 'http';
    }
  }

  if (!protocol) {
    return { domain, protocol: null, homepage: null, llmsTxt: null, robotsTxt: null, faqPage: null, sitemapXml: null, rssFeed: null, aiTxt: null, redirectedTo: null, parkedReason: null, blogSample: [] };
  }

  // Check for cross-domain redirect (hijacked/expired domains)
  const httpRedirect = homepage ? detectCrossDomainRedirect(domain, homepage) : null;
  const jsRedirect = homepage ? detectJsRedirect(homepage.text.slice(0, 8192), domain) : null;
  const redirectedTo = httpRedirect || jsRedirect;

  if (redirectedTo) {
    return { domain, protocol, homepage, llmsTxt: null, robotsTxt: null, faqPage: null, sitemapXml: null, rssFeed: null, aiTxt: null, redirectedTo, parkedReason: null, blogSample: [] };
  }

  // Check for parked/lost/for-sale domains
  const parkedResult = homepage ? detectParkedDomain(homepage.text.slice(0, 8192)) : { isParked: false };
  if (parkedResult.isParked) {
    return { domain, protocol, homepage, llmsTxt: null, robotsTxt: null, faqPage: null, sitemapXml: null, rssFeed: null, aiTxt: null, redirectedTo: null, parkedReason: parkedResult.reason || 'parked', blogSample: [] };
  }

  const baseUrl = `${protocol}://${domain}`;

  // Step 2: Fetch all other resources in parallel
  const [llmsTxt, robotsTxt, faqPage, sitemapXml, aiTxt] = await Promise.all([
    fetchText(`${baseUrl}/llms.txt`),
    fetchText(`${baseUrl}/robots.txt`),
    fetchText(`${baseUrl}/faq`).then(async (result) => {
      if (result && result.status === 200) return result;
      // Fallback chain for FAQ page variants
      for (const path of ['/frequently-asked-questions', '/help', '/support', '/help-center']) {
        const fallback = await fetchText(`${baseUrl}${path}`);
        if (fallback && fallback.status === 200) return fallback;
      }
      return result;
    }),
    fetchText(`${baseUrl}/sitemap.xml`),
    fetchText(`${baseUrl}/ai.txt`),
  ]);

  // Step 3: Discover RSS feed URL from homepage, then fetch it
  let rssFeed: FetchResult | null = null;
  if (homepage) {
    const rssLinkMatch = homepage.text.match(/<link[^>]*type="application\/(?:rss|atom)\+xml"[^>]*href="([^"]*)"[^>]*>/i);
    if (rssLinkMatch) {
      const rssUrl = rssLinkMatch[1].startsWith('http') ? rssLinkMatch[1] : `${baseUrl}${rssLinkMatch[1]}`;
      rssFeed = await fetchText(rssUrl);
    }
    if (!rssFeed || rssFeed.status !== 200) {
      // Fallback: try common RSS paths
      for (const path of ['/feed', '/rss.xml', '/feed.xml']) {
        rssFeed = await fetchText(`${baseUrl}${path}`);
        if (rssFeed && rssFeed.status === 200 && (rssFeed.text.includes('<rss') || rssFeed.text.includes('<feed') || rssFeed.text.includes('<channel'))) break;
        rssFeed = null;
      }
    }
  }

  // Step 4: Sample blog pages from sitemap (up to 5)
  let blogSample: FetchResult[] = [];
  if (sitemapXml && sitemapXml.status === 200) {
    let sitemapForBlog = sitemapXml.text;

    // If sitemapindex, fetch the best sub-sitemap first
    const subSitemapUrl = extractSubSitemapUrl(sitemapForBlog);
    if (subSitemapUrl) {
      const subSitemap = await fetchText(subSitemapUrl);
      if (subSitemap && subSitemap.status === 200) {
        sitemapForBlog = subSitemap.text;
      }
    }

    const blogUrls = extractBlogUrlsFromSitemap(sitemapForBlog, domain, 10);
    if (blogUrls.length > 0) {
      const fetched = await Promise.all(blogUrls.map(url => fetchText(url)));
      blogSample = fetched.filter((r): r is FetchResult =>
        r !== null && r.status === 200 && r.text.length > 500
      );
      // Tag blog sample pages
      for (const page of blogSample) {
        page.category = 'blog';
      }
    }
  }

  // Tag homepage
  if (homepage) homepage.category = 'homepage';

  return { domain, protocol, homepage, llmsTxt, robotsTxt, faqPage, sitemapXml, rssFeed, aiTxt, redirectedTo: null, parkedReason: null, blogSample };
}

// ─── Blog sample helpers ─────────────────────────────────────────────────────

/** Concatenate homepage + blog sample HTML for combined analysis */
function getCombinedHtml(data: SiteData): string {
  const parts = [data.homepage?.text || ''];
  if (data.blogSample) {
    for (const page of data.blogSample) {
      parts.push(page.text);
    }
  }
  return parts.join('\n');
}

/** Get blog-only HTML concatenated */
function getBlogHtml(data: SiteData): string {
  if (!data.blogSample || data.blogSample.length === 0) return '';
  return data.blogSample.map(p => p.text).join('\n');
}

// ─── Criterion checks (all use pre-fetched SiteData) ────────────────────────

// Criterion 1: llms.txt
function checkLlmsTxt(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  const result = data.llmsTxt;

  if (!result || result.status !== 200 || isHtmlResponse(result)) {
    const statusNote = result ? (isHtmlResponse(result) ? 'HTML page served (not a valid text file)' : `HTTP ${result.status}`) : 'connection failed';
    findings.push({ severity: 'critical', detail: `No llms.txt file found at ${data.protocol}://${data.domain}/llms.txt (${statusNote})`, fix: 'Create a /llms.txt file that describes your site, services, and key pages in markdown format' });
    return { criterion: 'llms_txt', criterion_label: 'llms.txt File', score: 0, status: 'fail', findings, fix_priority: 'P0' };
  }

  const text = result.text;
  let score = 4; // exists

  if (text.length < 100) {
    findings.push({ severity: 'medium', detail: `llms.txt exists but is very short (${text.length} characters)`, fix: 'Add comprehensive description of your services, team, and key content' });
  } else {
    score += 2;
    findings.push({ severity: 'info', detail: `llms.txt file found (${text.length} characters)` });
  }

  if (text.includes('#') || text.includes('##')) {
    score += 2;
    findings.push({ severity: 'info', detail: 'llms.txt uses markdown headings for structure' });
  } else {
    findings.push({ severity: 'low', detail: 'llms.txt lacks markdown structure', fix: 'Add headings (# About, ## Services, etc.) for better LLM parsing' });
  }

  if (/https?:\/\//.test(text)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'llms.txt includes URLs to key pages' });
  } else {
    findings.push({ severity: 'medium', detail: 'llms.txt does not link to key pages', fix: 'Add URLs to your most important pages (services, about, FAQ)' });
  }

  return { criterion: 'llms_txt', criterion_label: 'llms.txt File', score: Math.min(10, score), status: score >= 7 ? 'pass' : 'partial', findings, fix_priority: score >= 7 ? 'P3' : 'P0' };
}

// Criterion 2: Schema Markup
function checkSchemaMarkup(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage to check schema markup' });
    return { criterion: 'schema_markup', criterion_label: 'Schema.org Structured Data', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  const html = data.homepage.text;
  const ldJsonMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let score = 0;

  if (ldJsonMatches.length === 0) {
    findings.push({ severity: 'critical', detail: 'No JSON-LD structured data found on homepage', fix: 'Add Organization, LocalBusiness, or WebSite schema in a <script type="application/ld+json"> tag' });
    return { criterion: 'schema_markup', criterion_label: 'Schema.org Structured Data', score: 0, status: 'fail', findings, fix_priority: 'P1' };
  }

  score += 3;
  findings.push({ severity: 'info', detail: `Found ${ldJsonMatches.length} JSON-LD block(s) on homepage` });

  const allSchemaText = ldJsonMatches.join(' ').toLowerCase();
  const schemaTypes = ['organization', 'localbusiness', 'faqpage', 'service', 'article', 'webpage', 'website', 'breadcrumblist', 'howto', 'product'];
  const foundTypes: string[] = [];

  for (const type of schemaTypes) {
    if (allSchemaText.includes(`"${type}"`) || allSchemaText.includes(`"@type":"${type}"`)) {
      foundTypes.push(type);
    }
  }

  if (foundTypes.length > 0) {
    score += Math.min(4, foundTypes.length * 2);
    findings.push({ severity: 'info', detail: `Schema types found: ${foundTypes.join(', ')}` });
  }

  if (!foundTypes.includes('organization') && !foundTypes.includes('localbusiness')) {
    findings.push({ severity: 'high', detail: 'Missing Organization or LocalBusiness schema', fix: 'Add Organization schema with name, url, logo, contactPoint, and sameAs properties' });
  } else {
    score += 2;
    findings.push({ severity: 'info', detail: 'Organization or LocalBusiness schema found' });
  }

  if (!foundTypes.includes('faqpage')) {
    findings.push({ severity: 'medium', detail: 'No FAQPage schema found', fix: 'Add FAQPage schema on pages with FAQ content' });
  } else {
    score += 1;
    findings.push({ severity: 'info', detail: 'FAQPage schema markup present' });
  }

  // Blog sample enhancement: additional schema types from blog posts
  if (data.blogSample && data.blogSample.length > 0) {
    const blogHtml = getBlogHtml(data);
    const blogLdJson = blogHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    if (blogLdJson.length > 0) {
      const blogSchemaText = blogLdJson.join(' ').toLowerCase();
      const blogTypes = schemaTypes.filter(t =>
        (blogSchemaText.includes(`"${t}"`) || blogSchemaText.includes(`"@type":"${t}"`)) && !foundTypes.includes(t)
      );
      if (blogTypes.length > 0) {
        score += Math.min(2, blogTypes.length);
        findings.push({ severity: 'info', detail: `Additional schema types found on blog pages: ${blogTypes.join(', ')}` });
      }
      // FAQPage on blog is especially valuable
      if (!foundTypes.includes('faqpage') && /faqpage/i.test(blogSchemaText)) {
        score += 1;
        findings.push({ severity: 'info', detail: 'FAQPage schema found on blog posts' });
      }
    }
  }

  return { criterion: 'schema_markup', criterion_label: 'Schema.org Structured Data', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P2' : 'P1' };
}

// Criterion 3: Q&A Content Format
function checkQAFormat(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'qa_content_format', criterion_label: 'Q&A Content Format', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  const html = data.homepage.text;
  let score = 0;

  // Count question headings from homepage + blog sample combined
  const combinedHtml = getCombinedHtml(data);
  const hTagContent = (combinedHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || []).map(h => h.replace(/<[^>]*>/g, ''));
  const questionHeadings = hTagContent.filter(h => h.includes('?') || /^(what|how|why|when|who|where|can|do|does|is|are|should)\s/i.test(h));

  if (questionHeadings.length >= 10) {
    score += 5;
    findings.push({ severity: 'info', detail: `Found ${questionHeadings.length} question-format headings` });
  } else if (questionHeadings.length >= 3) {
    score += 3;
    findings.push({ severity: 'info', detail: `Found ${questionHeadings.length} question-format headings` });
  } else if (questionHeadings.length >= 1) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${questionHeadings.length} question-format heading(s) found`, fix: 'Structure more content as Q&A with question headings (H2/H3) followed by direct answers' });
  } else {
    findings.push({ severity: 'high', detail: 'No question-format headings found', fix: 'Add Q&A sections with headings like "What is...?", "How does...?" followed by concise answers' });
  }

  // Check for question heading followed by a paragraph (20-500 chars, allowing nested inline tags)
  const hasDirectAnswers = /<h[2-3][^>]*>[^<]*\?<\/h[2-3]>\s*<p[^>]*>[\s\S]{20,500}<\/p>/i.test(combinedHtml);
  if (hasDirectAnswers) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Content uses direct-answer format after question headings' });
  } else {
    findings.push({ severity: 'medium', detail: 'Content does not follow direct-answer format', fix: 'Start each answer paragraph with a concise 1-2 sentence definition before elaborating' });
  }

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 1) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Proper single H1 tag hierarchy' });
  } else if (h1Count === 0) {
    findings.push({ severity: 'high', detail: 'No H1 tag found', fix: 'Add exactly one H1 tag as the main page heading' });
  } else {
    score += 1;
    findings.push({ severity: 'medium', detail: `Multiple H1 tags found (${h1Count})`, fix: 'Use only one H1 per page; use H2/H3 for subsections' });
  }

  return { criterion: 'qa_content_format', criterion_label: 'Q&A Content Format', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P2' : 'P1' };
}

// Criterion 4: Clean HTML (includes HTTPS check - v4 requirement)
function checkCleanHTML(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'clean_html', criterion_label: 'Clean, Crawlable HTML', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  const html = data.homepage.text;
  let score = 0;
  const httpsAvailable = data.protocol === 'https';

  // HTTPS check (v4 requirement: no HTTPS = cap at 3)
  if (httpsAvailable) {
    findings.push({ severity: 'info', detail: 'Site serves over HTTPS' });
  } else {
    findings.push({ severity: 'critical', detail: 'Site does not support HTTPS', fix: 'Enable HTTPS with a valid SSL certificate. Sites without HTTPS are penalized by AI crawlers.' });
  }

  // Check for semantic elements
  const hasMain = /<main[\s>]/i.test(html);
  const hasArticle = /<article[\s>]/i.test(html);
  const hasSection = /<section[\s>]/i.test(html);

  const semanticCount = [hasMain, hasArticle, hasSection].filter(Boolean).length;
  score += Math.min(3, semanticCount * 1);
  if (semanticCount >= 2) {
    findings.push({ severity: 'info', detail: `Uses semantic HTML5 elements: ${[hasMain && 'main', hasArticle && 'article', hasSection && 'section'].filter(Boolean).join(', ')}` });
  } else {
    findings.push({ severity: 'medium', detail: 'Limited semantic HTML5 usage', fix: 'Wrap main content in <main>, use <article> for standalone content, <section> for grouped content' });
  }

  // Check H1 count
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 1) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Single H1 tag found - correct heading hierarchy' });
  } else {
    findings.push({ severity: h1Count === 0 ? 'high' : 'medium', detail: `${h1Count === 0 ? 'No' : 'Multiple'} H1 tag(s) found (${h1Count})`, fix: 'Use exactly one H1 per page' });
  }

  // Check for text content (not JS-only)
  const textContent = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (textContent.length > 500) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Page has substantial text content accessible without JavaScript' });
  } else {
    findings.push({ severity: 'high', detail: 'Very little text content visible in HTML source', fix: 'Ensure key content is server-rendered, not loaded via JavaScript only' });
  }

  // Check for meta tags
  const hasMetaDesc = /<meta[^>]*name="description"[^>]*>/i.test(html);
  const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
  if (hasMetaDesc && hasTitle) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Page has title and meta description' });
  } else {
    findings.push({ severity: 'medium', detail: `Missing ${!hasTitle ? 'title tag' : ''}${!hasTitle && !hasMetaDesc ? ' and ' : ''}${!hasMetaDesc ? 'meta description' : ''}`, fix: 'Add <title> and <meta name="description"> tags' });
  }

  // HTTPS cap: no HTTPS = max 3 for this criterion
  if (!httpsAvailable) {
    score = Math.min(score, 3);
  }

  return { criterion: 'clean_html', criterion_label: 'Clean, Crawlable HTML', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P1' };
}

// Criterion 5: Entity Consistency
function checkEntityConsistency(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'entity_consistency', criterion_label: 'Entity Authority & E-E-A-T', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  const html = data.homepage.text;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  let score = 0;

  // Check for phone numbers with context validation
  // A regex match only counts if it has supporting context (tel: link, schema, or nearby keywords)
  const hasTelLink = /href="tel:/i.test(html);
  const hasSchemaTelephone = /"telephone"/i.test(html);
  const phoneContextWords = /\b(phone|call|tel:|contact\s*us|fax|dial)\b/i;

  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = text.match(phoneRegex) || [];
  const contextValidatedPhones: string[] = [];

  if (hasTelLink || hasSchemaTelephone) {
    // Global context validates all matches
    contextValidatedPhones.push(...phones);
  } else {
    // Check each match for nearby context words (~100 chars around match)
    let match: RegExpExecArray | null;
    const phoneRegex2 = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    while ((match = phoneRegex2.exec(text)) !== null) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 100);
      const surrounding = text.slice(start, end);
      if (phoneContextWords.test(surrounding)) {
        contextValidatedPhones.push(match[0]);
      }
    }
  }

  const uniquePhones = [...new Set(contextValidatedPhones.map(p => p.replace(/\D/g, '')))];
  if (uniquePhones.length === 1) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Single consistent phone number found' });
  } else if (uniquePhones.length > 1) {
    score += 1;
    findings.push({ severity: 'medium', detail: `Multiple phone numbers found (${uniquePhones.length})`, fix: 'Use one primary phone number consistently across all pages' });
  } else {
    findings.push({ severity: 'low', detail: 'No phone number found on homepage' });
    score += 1;
  }

  // Check for address
  const hasAddress = /\d+\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|blvd|boulevard|lane|ln|way|court|ct)/i.test(text);
  if (hasAddress) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Physical address found on page' });
  }

  // Check for Organization schema
  const hasOrgSchema = /organization|localbusiness/i.test(html);
  if (hasOrgSchema) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Organization/LocalBusiness schema reinforces entity identity' });
  } else {
    findings.push({ severity: 'high', detail: 'No Organization schema to reinforce entity identity', fix: 'Add Organization JSON-LD with consistent name, address, phone, and social links' });
  }

  // Check for social proof
  const hasSameAs = /sameas|linkedin\.com|facebook\.com|twitter\.com|x\.com/i.test(html);
  if (hasSameAs) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Social media / sameAs references found' });
  } else {
    findings.push({ severity: 'low', detail: 'No social media links or sameAs found', fix: 'Add sameAs links in Organization schema to social profiles' });
  }

  return { criterion: 'entity_consistency', criterion_label: 'Entity Authority & E-E-A-T', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P1' };
}

// Criterion 6: robots.txt
function checkRobotsTxt(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  const result = data.robotsTxt;

  if (!result || result.status !== 200 || isHtmlResponse(result)) {
    findings.push({ severity: 'high', detail: 'No robots.txt file found', fix: 'Create a robots.txt that explicitly allows AI crawlers' });
    return { criterion: 'robots_txt', criterion_label: 'robots.txt for AI Crawlers', score: 2, status: 'fail', findings, fix_priority: 'P0' };
  }

  const text = result.text.toLowerCase();
  let score = 3; // exists

  const aiCrawlers = ['gptbot', 'claudebot', 'perplexitybot', 'anthropic', 'chatgpt'];
  const mentionedCrawlers = aiCrawlers.filter(c => text.includes(c));

  if (mentionedCrawlers.length > 0) {
    score += 3;
    findings.push({ severity: 'info', detail: `AI crawlers mentioned: ${mentionedCrawlers.join(', ')}` });

    const blocked = mentionedCrawlers.filter(c => {
      // Extract only this crawler's section (up to next User-agent: or EOF)
      // NOTE: do NOT use 'm' flag here - it makes $ match end-of-line, causing
      // non-greedy [\s\S]*? to stop at the first line instead of capturing the full section
      const sectionRegex = new RegExp(`user-agent:\\s*${c}[^\\S\\n]*\\n([\\s\\S]*?)(?=user-agent:|$)`, 'i');
      const match = sectionRegex.exec(result.text);
      if (!match) return false;
      const section = match[1];
      // If section has "Allow: /", the crawler is explicitly allowed (not blocked)
      if (/^allow:\s*\/\s*$/im.test(section)) return false;
      // Check for "Disallow: /" (root-only, not /path) within this section
      return /^disallow:\s*\/\s*$/im.test(section);
    });
    if (blocked.length > 0) {
      score -= 2;
      findings.push({ severity: 'critical', detail: `AI crawlers BLOCKED: ${blocked.join(', ')}`, fix: 'Change Disallow: / to Allow: / for AI crawler user-agents' });
    } else {
      score += 2;
      findings.push({ severity: 'info', detail: 'AI crawlers are allowed to index the site' });
    }
  } else {
    findings.push({ severity: 'medium', detail: 'No explicit AI crawler rules in robots.txt', fix: 'Add User-agent rules for GPTBot, ClaudeBot, PerplexityBot with Allow: /' });
  }

  if (text.includes('sitemap:')) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Sitemap URL referenced in robots.txt' });
  } else {
    findings.push({ severity: 'low', detail: 'No sitemap reference in robots.txt', fix: 'Add Sitemap: https://yoursite.com/sitemap.xml to robots.txt' });
  }

  return { criterion: 'robots_txt', criterion_label: 'robots.txt for AI Crawlers', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P2' : 'P0' };
}

// Criterion 7: FAQ Section
function checkFAQSection(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  let score = 0;

  const homepage = data.homepage;
  const hasHomepageFAQ = homepage && /faq|frequently\s+asked/i.test(homepage.text);

  if (hasHomepageFAQ) {
    score += 2;
    findings.push({ severity: 'info', detail: 'FAQ content found on homepage' });
  } else {
    findings.push({ severity: 'low', detail: 'No FAQ content found on homepage', fix: 'Add an FAQ section to your homepage addressing common visitor questions' });
  }

  const faqPage = data.faqPage;
  const hasFaqPage = faqPage && faqPage.status === 200 && faqPage.text.length > 500;

  if (hasFaqPage) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Dedicated FAQ page exists' });

    if (/accordion|toggle|collaps|expand/i.test(faqPage.text)) {
      score += 1;
      findings.push({ severity: 'info', detail: 'FAQ uses accordion/toggle UI pattern' });
    }
  } else {
    findings.push({ severity: 'high', detail: 'No dedicated FAQ page found at /faq', fix: 'Create a comprehensive FAQ page at /faq covering common questions about your service' });
  }

  // Check for FAQPage schema (homepage + FAQ page + blog sample)
  const blogHtml = getBlogHtml(data);
  const allHtml = (homepage?.text || '') + (faqPage?.text || '') + blogHtml;
  if (/faqpage/i.test(allHtml) && /application\/ld\+json/i.test(allHtml)) {
    score += 3;
    const faqOnBlog = blogHtml && /faqpage/i.test(blogHtml) && /application\/ld\+json/i.test(blogHtml);
    findings.push({ severity: 'info', detail: faqOnBlog ? 'FAQPage schema markup found on blog posts' : 'FAQPage schema markup found' });
  } else {
    findings.push({ severity: 'medium', detail: 'No FAQPage schema markup', fix: 'Add FAQPage JSON-LD schema to pages with FAQ content' });
  }

  const questionCount = (allHtml.match(/<h[2-4][^>]*>[^<]*\?<\/h[2-4]>/gi) || []).length;
  if (questionCount >= 10) {
    score += 1;
    findings.push({ severity: 'info', detail: `${questionCount} question headings found across checked pages` });
  } else if (questionCount >= 5) {
    findings.push({ severity: 'low', detail: `Only ${questionCount} question headings found`, fix: 'Expand FAQ to cover at least 10-15 common questions' });
  }

  return { criterion: 'faq_section', criterion_label: 'Comprehensive FAQ Sections', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P2' : 'P1' };
}

// Criterion 8: Original Data
function checkOriginalData(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'original_data', criterion_label: 'Original Data & Expert Content', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  const html = data.homepage.text;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  let score = 0;

  // Stats check: strong (+3) if research context nearby, weak (+1) for generic marketing stats
  const statPatterns = /\d+%|\d+\s*(patients|clients|customers|cases|years|professionals|specialists|companies|users|businesses|domains|audits)/i;
  if (statPatterns.test(text)) {
    const researchContext = /\b(our\s+(?:study|analysis|research|data|survey|findings|report)|we\s+(?:surveyed|analyzed|studied|measured|tracked)|proprietary|methodology|original\s+research)\b/i;
    if (researchContext.test(text)) {
      score += 3;
      findings.push({ severity: 'info', detail: 'Proprietary statistics with research context found on homepage' });
    } else {
      score += 1;
      findings.push({ severity: 'low', detail: 'Statistics found but without research context (e.g., "500+ clients")', fix: 'Add context about your methodology: "Our analysis of X found..." or "We surveyed Y..."' });
    }
  } else {
    findings.push({ severity: 'medium', detail: 'No proprietary data or statistics found', fix: 'Add unique statistics, case study results, or industry data that LLMs would cite as authoritative' });
  }

  // Case studies: with nearby metric (+3), without metric (+1)
  const caseStudyPattern = /case\s+stud|testimonial|success\s+stor|client\s+stor/i;
  if (caseStudyPattern.test(text)) {
    // Check for a numeric metric within ~200 chars of the case study mention
    const caseStudyRegex = /case\s+stud|testimonial|success\s+stor|client\s+stor/gi;
    let hasMetricNearby = false;
    let csMatch: RegExpExecArray | null;
    while ((csMatch = caseStudyRegex.exec(text)) !== null) {
      const start = Math.max(0, csMatch.index - 200);
      const end = Math.min(text.length, csMatch.index + csMatch[0].length + 200);
      const surrounding = text.slice(start, end);
      if (/\d+%|\$[\d,]+|\d+x\b/i.test(surrounding)) {
        hasMetricNearby = true;
        break;
      }
    }
    if (hasMetricNearby) {
      score += 3;
      findings.push({ severity: 'info', detail: 'Case studies or testimonials with specific metrics found' });
    } else {
      score += 1;
      findings.push({ severity: 'low', detail: 'Case studies or testimonials mentioned but without specific metrics', fix: 'Add measurable outcomes to case studies (e.g., "increased traffic by 45%")' });
    }
  } else {
    findings.push({ severity: 'medium', detail: 'No case studies or testimonials found', fix: 'Add case studies with specific outcomes and metrics' });
  }

  // Expert attribution (+2) - check homepage + blog
  const combinedText = data.blogSample && data.blogSample.length > 0
    ? text + ' ' + data.blogSample.map(p => p.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).join(' ')
    : text;
  if (/written\s+by|authored\s+by|expert|specialist|board.certified|licensed/i.test(combinedText)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Expert attribution or credentials found' });
  } else {
    findings.push({ severity: 'low', detail: 'No expert attribution or credentials visible', fix: 'Add author bios with credentials to establish E-E-A-T signals' });
  }

  // Blog check: require actual href links to content paths, not just the word "blog"
  const contentLinkPattern = /href="[^"]*\/(?:blog|articles|insights|guides|resources)\b[^"]*"/i;
  if (contentLinkPattern.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Links to blog/articles section found on site' });
  } else {
    findings.push({ severity: 'medium', detail: 'No links to blog or articles section found', fix: 'Create a content section with expert articles and link to it from your homepage' });
  }

  // Blog sample enhancement: case studies from blog posts
  if (data.blogSample && data.blogSample.length > 0 && !caseStudyPattern.test(text)) {
    const blogText = data.blogSample.map(p => p.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).join(' ');
    if (caseStudyPattern.test(blogText)) {
      score += 1;
      findings.push({ severity: 'info', detail: 'Case studies or testimonials found on blog posts' });
    }
  }

  return { criterion: 'original_data', criterion_label: 'Original Data & Expert Content', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P2' : 'P2' };
}

// Criterion 9: Internal Linking
function checkInternalLinking(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'internal_linking', criterion_label: 'Internal Linking Architecture', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  const html = data.homepage.text;
  let score = 0;

  const linkMatches = html.match(/<a[^>]*href="([^"]*)"[^>]*>/gi) || [];
  const internalLinks = linkMatches.filter(l => {
    const href = l.match(/href="([^"]*)"/)?.[1] || '';
    return href.startsWith('/') || href.includes(data.domain);
  });

  if (internalLinks.length >= 20) {
    score += 3;
    findings.push({ severity: 'info', detail: `${internalLinks.length} internal links found on homepage` });
  } else if (internalLinks.length >= 10) {
    score += 2;
    findings.push({ severity: 'low', detail: `${internalLinks.length} internal links on homepage`, fix: 'Add more internal links to key service/content pages' });
  } else {
    findings.push({ severity: 'high', detail: `Only ${internalLinks.length} internal links on homepage`, fix: 'Add prominent internal links to service pages, FAQ, blog, and about pages' });
  }

  if (/breadcrumb|aria-label="breadcrumb"/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Breadcrumb navigation detected' });
  } else {
    findings.push({ severity: 'medium', detail: 'No breadcrumb navigation found', fix: 'Add breadcrumb navigation with BreadcrumbList schema markup' });
  }

  if (/<nav[\s>]/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Semantic <nav> element used for navigation' });
  } else {
    findings.push({ severity: 'low', detail: 'No semantic <nav> element found', fix: 'Wrap navigation menus in <nav> for better AI and accessibility parsing' });
  }

  if (/related|see\s+also|learn\s+more|explore|you\s+may\s+also/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Related content or cross-linking sections found' });
  } else {
    findings.push({ severity: 'low', detail: 'No related content or cross-linking found', fix: 'Add "Related Services" or "Learn More" sections to build topic clusters' });
  }

  if (/<footer[\s>]/i.test(html)) {
    score += 1;
    findings.push({ severity: 'info', detail: 'Footer element with likely navigation links' });
  } else {
    findings.push({ severity: 'low', detail: 'No <footer> element found', fix: 'Add a <footer> with navigation links, contact info, and site structure' });
  }

  return { criterion: 'internal_linking', criterion_label: 'Internal Linking Architecture', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P2' : 'P1' };
}

// Criterion 10: Semantic HTML
function checkSemanticHTML(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'semantic_html', criterion_label: 'Semantic HTML5 & Accessibility', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  // Use combined HTML for semantic element detection
  const combinedHtml = getCombinedHtml(data);
  const html = data.homepage.text;
  let score = 0;

  const checks: [string, RegExp, string][] = [
    ['<main>', /<main[\s>]/i, 'Wrap primary page content in <main>'],
    ['<article>', /<article[\s>]/i, 'Use <article> for standalone content blocks'],
    ['<time>', /<time[\s>]/i, 'Use <time> elements for dates'],
    ['<nav>', /<nav[\s>]/i, 'Use <nav> for navigation sections'],
    ['<header>', /<header[\s>]/i, 'Use <header> for page/section headers'],
    ['<footer>', /<footer[\s>]/i, 'Use <footer> for page/section footers'],
  ];

  let found = 0;
  for (const [name, regex, fix] of checks) {
    if (regex.test(combinedHtml)) {
      found++;
    } else {
      findings.push({ severity: 'low', detail: `Missing ${name} element`, fix });
    }
  }
  score += Math.min(4, Math.floor(found * 0.7));
  if (found >= 4) findings.push({ severity: 'info', detail: `${found}/6 key semantic HTML5 elements found` });

  // Check img alt text
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithAlt = images.filter(img => /alt="[^"]+"/i.test(img));
  if (images.length > 0) {
    const ratio = imagesWithAlt.length / images.length;
    if (ratio >= 0.8) {
      score += 2;
      findings.push({ severity: 'info', detail: `${Math.round(ratio * 100)}% of images have alt text` });
    } else {
      findings.push({ severity: 'medium', detail: `Only ${Math.round(ratio * 100)}% of images have alt text`, fix: 'Add descriptive alt text to all images' });
    }
  }

  // Check lang attribute
  if (/lang="[a-z]{2}"/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'HTML lang attribute set' });
  } else {
    findings.push({ severity: 'medium', detail: 'Missing lang attribute on <html> tag', fix: 'Add lang="en" (or appropriate language) to the <html> tag' });
  }

  // Check for ARIA roles
  if (/role="|aria-/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'ARIA attributes found for accessibility' });
  } else {
    findings.push({ severity: 'low', detail: 'No ARIA roles or attributes found', fix: 'Add ARIA roles and labels to improve accessibility and semantic parsing' });
  }

  return { criterion: 'semantic_html', criterion_label: 'Semantic HTML5 & Accessibility', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P3' : 'P2' };
}

// Criterion 11: Content Freshness
function checkContentFreshness(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'content_freshness', criterion_label: 'Content Freshness Signals', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  const html = data.homepage.text;
  let score = 0;

  // JSON-LD date signals (datePublished, dateModified)
  const hasDatePublished = /datePublished|dateCreated/i.test(html);
  const hasDateModified = /dateModified/i.test(html);
  if (hasDatePublished || hasDateModified) {
    score += 3;
    findings.push({ severity: 'info', detail: `JSON-LD date properties found: ${[hasDatePublished && 'datePublished', hasDateModified && 'dateModified'].filter(Boolean).join(', ')}` });
  } else {
    findings.push({ severity: 'high', detail: 'No JSON-LD date properties (datePublished/dateModified) found', fix: 'Add datePublished and dateModified to Article or WebPage schema' });
  }

  // <time> elements
  const timeElements = html.match(/<time[\s>]/gi) || [];
  if (timeElements.length >= 2) {
    score += 3;
    findings.push({ severity: 'info', detail: `${timeElements.length} <time> elements found` });
  } else if (timeElements.length === 1) {
    score += 1;
    findings.push({ severity: 'low', detail: 'Only 1 <time> element found', fix: 'Use <time datetime="..."> for all dates to help AI parsers' });
  } else {
    findings.push({ severity: 'medium', detail: 'No <time> elements found', fix: 'Wrap publication and modification dates in <time datetime="..."> elements' });
  }

  // Article meta (article:published_time, article:modified_time)
  const hasArticleMeta = /article:published_time|article:modified_time/i.test(html);
  if (hasArticleMeta) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Open Graph article date meta tags found' });
  } else {
    findings.push({ severity: 'low', detail: 'No article:published_time or article:modified_time meta tags', fix: 'Add Open Graph article date meta tags' });
  }

  // Recency check - look for recent year references
  const currentYear = new Date().getFullYear();
  const hasRecentYear = html.includes(String(currentYear)) || html.includes(String(currentYear - 1));
  if (hasRecentYear) {
    score += 2;
    findings.push({ severity: 'info', detail: `References to ${currentYear} or ${currentYear - 1} found, suggesting recent content` });
  } else {
    findings.push({ severity: 'low', detail: 'No references to recent years found on homepage' });
  }

  return { criterion: 'content_freshness', criterion_label: 'Content Freshness Signals', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 12: Sitemap Completeness
function checkSitemapCompleteness(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  const sitemap = data.sitemapXml;

  if (!sitemap || sitemap.status !== 200) {
    findings.push({ severity: 'critical', detail: 'No sitemap.xml found', fix: 'Create a sitemap.xml with all indexable pages and submit to search engines' });
    return { criterion: 'sitemap_completeness', criterion_label: 'Sitemap Completeness', score: 0, status: 'fail', findings, fix_priority: 'P1' };
  }

  const text = sitemap.text;
  let score = 2; // exists

  // Valid XML structure
  if (text.includes('<urlset') || text.includes('<sitemapindex')) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Valid sitemap XML structure detected' });
  } else {
    findings.push({ severity: 'high', detail: 'sitemap.xml does not contain valid XML structure', fix: 'Ensure sitemap uses proper <urlset> or <sitemapindex> XML format' });
  }

  // Count URLs
  const urlCount = (text.match(/<loc>/gi) || []).length;
  if (urlCount >= 50) {
    score += 3;
    findings.push({ severity: 'info', detail: `${urlCount} URLs in sitemap` });
  } else if (urlCount >= 10) {
    score += 2;
    findings.push({ severity: 'info', detail: `${urlCount} URLs in sitemap` });
  } else if (urlCount > 0) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${urlCount} URL(s) in sitemap`, fix: 'Add all important pages to your sitemap' });
  }

  // Recent lastmod dates
  const lastmodMatches = text.match(/<lastmod>([^<]+)<\/lastmod>/gi) || [];
  if (lastmodMatches.length > 0) {
    score += 2;
    findings.push({ severity: 'info', detail: `${lastmodMatches.length} URLs have lastmod dates` });
  } else {
    findings.push({ severity: 'medium', detail: 'No lastmod dates in sitemap', fix: 'Add <lastmod> dates to sitemap entries for freshness signals' });
  }

  // Sitemap index
  if (text.includes('<sitemapindex')) {
    score += 1;
    findings.push({ severity: 'info', detail: 'Sitemap index found, indicating organized sitemap structure' });
  } else {
    findings.push({ severity: 'low', detail: 'No sitemap index structure', fix: 'Use a <sitemapindex> with multiple child sitemaps for larger sites to improve crawl efficiency' });
  }

  return { criterion: 'sitemap_completeness', criterion_label: 'Sitemap Completeness', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P1' };
}

// Criterion 13: RSS Feed
function checkRssFeed(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  let score = 0;

  // Check for RSS link tag in homepage
  const hasRssLink = data.homepage && /<link[^>]*type="application\/(?:rss|atom)\+xml"/i.test(data.homepage.text);
  if (hasRssLink) {
    score += 3;
    findings.push({ severity: 'info', detail: 'RSS/Atom feed link tag found in homepage <head>' });
  } else {
    findings.push({ severity: 'high', detail: 'No RSS/Atom feed link tag in homepage', fix: 'Add <link rel="alternate" type="application/rss+xml" href="/feed"> to your <head>' });
  }

  // Check for valid feed content
  const feed = data.rssFeed;
  if (feed && feed.status === 200) {
    const feedText = feed.text;
    const isValidFeed = feedText.includes('<rss') || feedText.includes('<feed') || feedText.includes('<channel');
    if (isValidFeed) {
      score += 3;
      findings.push({ severity: 'info', detail: 'Valid RSS/Atom feed content detected' });

      // Count items
      const itemCount = (feedText.match(/<item[\s>]|<entry[\s>]/gi) || []).length;
      if (itemCount >= 5) {
        score += 4;
        findings.push({ severity: 'info', detail: `Feed contains ${itemCount} items` });
      } else if (itemCount > 0) {
        score += 2;
        findings.push({ severity: 'low', detail: `Feed contains only ${itemCount} item(s)`, fix: 'Publish more content to populate your RSS feed with at least 5 items' });
      }
    } else {
      findings.push({ severity: 'medium', detail: 'Feed URL returned content but not valid RSS/Atom XML', fix: 'Ensure your feed outputs valid RSS 2.0 or Atom XML' });
    }
  } else if (!hasRssLink) {
    findings.push({ severity: 'medium', detail: 'No accessible RSS/Atom feed found', fix: 'Create an RSS feed to help AI engines discover and index new content automatically' });
  }

  return { criterion: 'rss_feed', criterion_label: 'RSS/Atom Feed', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P3' : 'P2' };
}

// Criterion 14: Table & List Extractability
function checkTableListExtractability(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'table_list_extractability', criterion_label: 'Table & List Extractability', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  // Use combined HTML so blog tables/lists count
  const html = getCombinedHtml(data);
  let score = 0;

  // Tables with headers
  const tables = html.match(/<table[\s>]/gi) || [];
  const tablesWithHeaders = (html.match(/<table[\s\S]*?<\/table>/gi) || []).filter(t => /<th[\s>]/i.test(t));
  if (tablesWithHeaders.length >= 1) {
    score += 3;
    findings.push({ severity: 'info', detail: `${tablesWithHeaders.length} table(s) with <th> headers found` });
  } else if (tables.length > 0) {
    score += 1;
    findings.push({ severity: 'medium', detail: `${tables.length} table(s) found but without <th> header cells`, fix: 'Add <th> header cells to tables for better AI extraction' });
  } else {
    findings.push({ severity: 'low', detail: 'No HTML tables found', fix: 'Use comparison tables with <th> headers for structured data AI engines can extract' });
  }
  if (tablesWithHeaders.length >= 2) {
    score += 1;
    findings.push({ severity: 'info', detail: 'Multiple well-structured tables present' });
  } else if (tablesWithHeaders.length === 1) {
    findings.push({ severity: 'low', detail: 'Only 1 table with headers found', fix: 'Add more comparison or data tables with <th> headers to increase extractable structured content' });
  }

  // Ordered lists
  const olCount = (html.match(/<ol[\s>]/gi) || []).length;
  if (olCount >= 1) {
    score += 2;
    findings.push({ severity: 'info', detail: `${olCount} ordered list(s) found - good for step-by-step content` });
  } else {
    findings.push({ severity: 'low', detail: 'No ordered lists (<ol>) found', fix: 'Use <ol> for sequential content (steps, rankings, processes)' });
  }

  // Unordered lists
  const ulCount = (html.match(/<ul[\s>]/gi) || []).length;
  if (ulCount >= 1) {
    score += 2;
    findings.push({ severity: 'info', detail: `${ulCount} unordered list(s) found` });
  } else {
    findings.push({ severity: 'low', detail: 'No unordered lists (<ul>) found', fix: 'Use <ul> for feature lists, benefits, and bullet-point content' });
  }

  // List items count
  const liCount = (html.match(/<li[\s>]/gi) || []).length;
  if (liCount >= 10) {
    score += 1;
    findings.push({ severity: 'info', detail: `${liCount} list items - substantial extractable content` });
  }

  // Definition lists
  const dlCount = (html.match(/<dl[\s>]/gi) || []).length;
  if (dlCount >= 1) {
    score += 1;
    findings.push({ severity: 'info', detail: `${dlCount} definition list(s) found` });
  } else {
    findings.push({ severity: 'low', detail: 'No definition lists (<dl>) found', fix: 'Use <dl>/<dt>/<dd> for term-definition pairs to improve AI extractability' });
  }

  return { criterion: 'table_list_extractability', criterion_label: 'Table & List Extractability', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 15: Definition Patterns
function checkDefinitionPatterns(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'definition_patterns', criterion_label: 'Definition Patterns', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  // Use combined HTML for definition pattern detection
  const combinedHtml = getCombinedHtml(data);
  const text = combinedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const html = combinedHtml;
  let score = 0;

  // "X is" / "X are" / "X refers to" / "defined as" patterns
  const definitionPatterns = [
    /\b\w[\w\s]{2,30}\bis\s+(?:a|an|the)\s/gi,
    /\b\w[\w\s]{2,30}\bare\s+(?:a|an|the)\s/gi,
    /\brefers?\s+to\b/gi,
    /\bdefined\s+as\b/gi,
    /\bknown\s+as\b/gi,
    /\bmeans?\s+that\b/gi,
  ];

  let patternCount = 0;
  for (const pattern of definitionPatterns) {
    const matches = text.match(pattern) || [];
    patternCount += matches.length;
  }

  if (patternCount >= 3) {
    score += 5;
    findings.push({ severity: 'info', detail: `${patternCount} definition-style patterns found (e.g., "X is a...", "refers to", "defined as")` });
  } else if (patternCount >= 1) {
    score += 3;
    findings.push({ severity: 'low', detail: `Only ${patternCount} definition pattern(s) found`, fix: 'Start key descriptions with clear definition patterns like "X is a..." or "X refers to..."' });
  } else {
    findings.push({ severity: 'medium', detail: 'No definition patterns found', fix: 'Add clear definitions using patterns like "[Term] is [definition]" that AI engines can extract as snippets' });
  }

  // Early placement (in first 2000 chars of text content)
  const earlyText = text.slice(0, 2000);
  const earlyDefinitions = definitionPatterns.some(p => p.test(earlyText));
  // Reset lastIndex since we used global flags
  definitionPatterns.forEach(p => { p.lastIndex = 0; });
  if (earlyDefinitions) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Definition patterns appear early in page content - good for snippet extraction' });
  } else {
    findings.push({ severity: 'low', detail: 'No definition patterns in the first 2000 characters of content', fix: 'Place key definitions early on the page where AI engines prioritize extraction' });
  }

  // <dfn> or <abbr> usage
  const hasDfn = /<dfn[\s>]/i.test(html);
  const hasAbbr = /<abbr[\s>]/i.test(html);
  if (hasDfn || hasAbbr) {
    score += 1;
    findings.push({ severity: 'info', detail: `Semantic definition elements found: ${[hasDfn && '<dfn>', hasAbbr && '<abbr>'].filter(Boolean).join(', ')}` });
  } else {
    findings.push({ severity: 'low', detail: 'No <dfn> or <abbr> elements found', fix: 'Use <dfn> for term definitions and <abbr> for abbreviations to help AI parse terminology' });
  }

  // Glossary or definition-list patterns
  if (/<dl[\s>]/i.test(html) || /glossary|definitions|terminology/i.test(html)) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Glossary or definition list structure detected' });
  } else {
    findings.push({ severity: 'low', detail: 'No glossary or definition list found', fix: 'Add a glossary section using <dl>/<dt>/<dd> for key industry terms' });
  }

  return { criterion: 'definition_patterns', criterion_label: 'Definition Patterns', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 16: Direct Answer Density
function checkDirectAnswerDensity(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'direct_answer_density', criterion_label: 'Direct Answer Paragraphs', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  // Use combined HTML for Q&A pair and paragraph detection
  const html = getCombinedHtml(data);
  let score = 0;

  // Q&A pairs: question heading followed by paragraph
  const qaPairs = html.match(/<h[2-4][^>]*>[^<]*\?<\/h[2-4]>\s*<p[^>]*>/gi) || [];
  if (qaPairs.length >= 3) {
    score += 6;
    findings.push({ severity: 'info', detail: `${qaPairs.length} question-answer pairs found (question heading + direct answer paragraph)` });
  } else if (qaPairs.length >= 1) {
    score += 3;
    findings.push({ severity: 'low', detail: `${qaPairs.length} question-answer pair(s) found`, fix: 'Add more question headings (H2/H3) immediately followed by concise answer paragraphs' });
  } else {
    findings.push({ severity: 'high', detail: 'No direct question-answer pairs found', fix: 'Structure content with question headings (e.g., "What is X?") immediately followed by a concise answer paragraph' });
  }

  // Snippet-zone paragraphs (40-150 words - ideal for AI extraction)
  const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const snippetZoneParagraphs = paragraphs.filter(p => {
    const text = p.replace(/<[^>]*>/g, '').trim();
    const wordCount = text.split(/\s+/).length;
    return wordCount >= 40 && wordCount <= 150;
  });
  if (snippetZoneParagraphs.length >= 3) {
    score += 2;
    findings.push({ severity: 'info', detail: `${snippetZoneParagraphs.length} paragraphs in snippet zone (40-150 words) - ideal for AI extraction` });
  } else if (snippetZoneParagraphs.length >= 1) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${snippetZoneParagraphs.length} paragraph(s) in optimal snippet length`, fix: 'Write more paragraphs in the 40-150 word range for AI snippet extraction' });
  } else {
    findings.push({ severity: 'medium', detail: 'No paragraphs in the optimal snippet zone (40-150 words)', fix: 'Write self-contained paragraphs of 40-150 words that directly answer common questions' });
  }

  // Direct answer openers
  const text = data.homepage.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const directOpeners = /\b(yes|no|the answer is|in short|simply put|to summarize)\b/gi;
  const openerCount = (text.match(directOpeners) || []).length;
  if (openerCount >= 2) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Direct answer openers found (e.g., "Yes,", "In short,")' });
  } else {
    findings.push({ severity: 'low', detail: 'Few or no direct answer openers found', fix: 'Start answers with direct phrases like "Yes,", "No,", "In short," to signal definitive answers to AI engines' });
  }

  return { criterion: 'direct_answer_density', criterion_label: 'Direct Answer Paragraphs', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P2' : 'P1' };
}

// Criterion 17: Content Licensing
function checkContentLicensing(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  let score = 0;

  // ai.txt exists (ignore HTML catch-all responses)
  const aiTxt = data.aiTxt;
  if (aiTxt && aiTxt.status === 200 && aiTxt.text.length > 20 && !isHtmlResponse(aiTxt)) {
    score += 4;
    findings.push({ severity: 'info', detail: `ai.txt file found (${aiTxt.text.length} characters)` });
  } else {
    findings.push({ severity: 'high', detail: 'No ai.txt file found', fix: 'Create /ai.txt to declare your AI usage policy and content permissions for AI crawlers' });
  }

  const html = data.homepage?.text || '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Policy language on page
  const hasPolicyLanguage = /content\s+policy|terms\s+of\s+use|usage\s+rights|permission|copyright\s+policy|licensing|creative\s+commons/i.test(text);
  if (hasPolicyLanguage) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Content policy or licensing language found on page' });
  } else {
    findings.push({ severity: 'low', detail: 'No content policy or licensing language visible', fix: 'Add clear content usage terms or licensing information' });
  }

  // Schema license property
  const hasLicenseSchema = /license|copyrightHolder|copyrightYear/i.test(html) && /application\/ld\+json/i.test(html);
  if (hasLicenseSchema) {
    score += 2;
    findings.push({ severity: 'info', detail: 'License or copyright properties found in schema markup' });
  } else {
    findings.push({ severity: 'low', detail: 'No license or copyright properties in schema', fix: 'Add license, copyrightHolder, and copyrightYear to your schema markup' });
  }

  // TDM (Text and Data Mining) or Creative Commons
  const hasTdmOrCC = /tdm|text\s+and\s+data\s+mining|creative\s+commons|CC\s+BY|creativecommons\.org/i.test(html + (aiTxt?.text || ''));
  if (hasTdmOrCC) {
    score += 2;
    findings.push({ severity: 'info', detail: 'TDM or Creative Commons licensing references found' });
  } else {
    findings.push({ severity: 'low', detail: 'No TDM or Creative Commons licensing references found', fix: 'Add Text and Data Mining (TDM) permissions or Creative Commons licensing to signal AI-friendly content use' });
  }

  return { criterion: 'content_licensing', criterion_label: 'Content Licensing & AI Permissions', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 4 ? 'P3' : 'P2' };
}

// Criterion 18: Author Schema Depth
function checkAuthorSchemaDepth(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'author_schema_depth', criterion_label: 'Author & Expert Schema', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  // Use combined HTML for author detection
  const combinedHtml = getCombinedHtml(data);
  const html = data.homepage.text;
  const text = combinedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  let score = 0;

  // Person schema (check combined - blog posts often have author schema)
  const hasPersonSchema = /"@type"\s*:\s*"Person"/i.test(combinedHtml);
  if (hasPersonSchema) {
    score += 3;
    findings.push({ severity: 'info', detail: 'Person schema found in JSON-LD' });
  } else {
    findings.push({ severity: 'medium', detail: 'No Person schema found', fix: 'Add Person schema for authors with name, jobTitle, knowsAbout, and sameAs properties' });
  }

  // jobTitle or knowsAbout properties
  const hasJobTitle = /jobTitle|knowsAbout|expertise|hasCredential/i.test(combinedHtml);
  if (hasJobTitle) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Author credential properties found (jobTitle/knowsAbout)' });
  } else {
    findings.push({ severity: 'low', detail: 'No jobTitle or knowsAbout in author schema', fix: 'Add jobTitle and knowsAbout to Person schema to establish expertise' });
  }

  // sameAs links (social profiles)
  const hasSameAs = /sameAs/i.test(combinedHtml) && hasPersonSchema;
  if (hasSameAs) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Author sameAs social profile links found' });
  } else {
    findings.push({ severity: 'low', detail: 'No sameAs links to author social profiles', fix: 'Add sameAs URLs (LinkedIn, GitHub) to Person schema to strengthen entity connections' });
  }

  // Visible byline
  const hasByline = /written\s+by|authored?\s+by|by\s+[A-Z][a-z]+\s+[A-Z]/i.test(text) ||
    /class="[^"]*author[^"]*"/i.test(html) ||
    /rel="author"/i.test(html);
  if (hasByline) {
    score += 2;
    findings.push({ severity: 'info', detail: 'Visible author byline or attribution found' });
  } else {
    findings.push({ severity: 'medium', detail: 'No visible author byline found', fix: 'Add visible author names with credentials to establish E-E-A-T' });
  }

  // <address> element for contact
  if (/<address[\s>]/i.test(combinedHtml)) {
    score += 1;
    findings.push({ severity: 'info', detail: '<address> element found for contact information' });
  } else {
    findings.push({ severity: 'low', detail: 'No <address> element found for contact information', fix: 'Add an <address> element with contact details to reinforce entity identity' });
  }

  return { criterion: 'author_schema_depth', criterion_label: 'Author & Expert Schema', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 19: Fact Density
function checkFactDensity(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'fact_density', criterion_label: 'Fact & Data Density', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  const text = data.homepage.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  let score = 0;

  // Numeric data points (percentages, money, counts)
  const dataPoints = text.match(/\d+(?:\.\d+)?(?:\s*%|\s*\$|\s*USD|\s*EUR)/g) || [];
  const countPhrases = text.match(/\d+(?:,\d{3})*\+?\s+(?:users?|clients?|customers?|companies|businesses|patients?|members?|employees?|projects?|downloads?)/gi) || [];
  const totalDataPoints = dataPoints.length + countPhrases.length;

  if (totalDataPoints >= 6) {
    score += 5;
    findings.push({ severity: 'info', detail: `${totalDataPoints} quantitative data points found on homepage` });
  } else if (totalDataPoints >= 3) {
    score += 3;
    findings.push({ severity: 'info', detail: `${totalDataPoints} quantitative data points found` });
  } else if (totalDataPoints >= 1) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${totalDataPoints} quantitative data point(s) found`, fix: 'Add more specific numbers, percentages, and metrics to strengthen credibility' });
  } else {
    findings.push({ severity: 'high', detail: 'No quantitative data points found', fix: 'Add specific statistics (percentages, counts, comparisons) that AI engines can cite' });
  }

  // Year references (suggest sourced/dated claims)
  const yearRefs = text.match(/(?:19|20)\d{2}/g) || [];
  const uniqueYears = [...new Set(yearRefs)];
  if (uniqueYears.length >= 2) {
    score += 2;
    findings.push({ severity: 'info', detail: `${uniqueYears.length} different year references found - suggests dated, verifiable claims` });
  } else if (uniqueYears.length === 1) {
    score += 1;
    findings.push({ severity: 'low', detail: 'Only 1 year reference found on page', fix: 'Add more dated references and timestamps to demonstrate current, verifiable information' });
  } else {
    findings.push({ severity: 'low', detail: 'No year references found on page', fix: 'Include specific years and dates to provide verifiable, time-anchored facts' });
  }

  // Attribution phrases (source citations)
  const attributions = text.match(/according\s+to|source:|study\s+(?:by|from)|research\s+(?:by|from|shows)|data\s+from|report\s+(?:by|from)|published\s+(?:by|in)/gi) || [];
  if (attributions.length >= 1) {
    score += 2;
    findings.push({ severity: 'info', detail: `${attributions.length} source attribution(s) found (e.g., "according to", "study by")` });
  } else {
    findings.push({ severity: 'low', detail: 'No source attributions found', fix: 'Add citations like "According to [source]" or "Research from [org] shows" for credibility' });
  }

  // Units of measurement
  const units = text.match(/\d+\s*(?:hours?|minutes?|days?|weeks?|months?|years?|miles?|km|lbs?|kg|mg|sq\s*ft|acres?|gallons?|liters?)/gi) || [];
  if (units.length >= 2) {
    score += 1;
    findings.push({ severity: 'info', detail: `${units.length} measurement units found (hours, miles, etc.) - adds factual precision` });
  } else {
    findings.push({ severity: 'low', detail: 'Few or no units of measurement found', fix: 'Include specific measurements (hours, miles, sq ft, etc.) to add factual precision AI engines can extract' });
  }

  return { criterion: 'fact_density', criterion_label: 'Fact & Data Density', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 20: Canonical URL
function checkCanonicalUrl(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'canonical_url', criterion_label: 'Canonical URL Strategy', score: 0, status: 'not_found', findings, fix_priority: 'P1' };
  }

  const html = data.homepage.text;
  let score = 0;

  // Canonical link present (handle either attribute order: rel before href OR href before rel)
  const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i)
    || html.match(/<link[^>]*href="([^"]*)"[^>]*rel="canonical"[^>]*>/i);
  if (canonicalMatch) {
    score += 4;
    findings.push({ severity: 'info', detail: `Canonical URL found: ${canonicalMatch[1].slice(0, 80)}` });

    // Self-referencing (canonical points to the same domain)
    const canonicalUrl = canonicalMatch[1];
    if (canonicalUrl.includes(data.domain)) {
      score += 3;
      findings.push({ severity: 'info', detail: 'Canonical URL is self-referencing (points to same domain)' });
    } else {
      findings.push({ severity: 'medium', detail: 'Canonical URL points to a different domain', fix: 'Ensure canonical URL points to the authoritative version of this page' });
    }

    // HTTPS canonical
    if (canonicalUrl.startsWith('https://')) {
      score += 2;
      findings.push({ severity: 'info', detail: 'Canonical URL uses HTTPS' });
    } else {
      findings.push({ severity: 'medium', detail: 'Canonical URL does not use HTTPS', fix: 'Update canonical URL to use https://' });
    }
  } else {
    findings.push({ severity: 'high', detail: 'No canonical URL tag found', fix: 'Add <link rel="canonical" href="https://yoursite.com/page"> to prevent duplicate content issues' });
  }

  // Check for duplicate canonical tags (match either attribute order)
  const allCanonicals = html.match(/<link[^>]*(?:rel="canonical"|rel='canonical')[^>]*>/gi) || [];
  if (allCanonicals.length > 1) {
    score -= 1;
    findings.push({ severity: 'high', detail: `${allCanonicals.length} canonical tags found - must have exactly one`, fix: 'Remove duplicate canonical tags, keeping only one per page' });
  } else if (allCanonicals.length === 1) {
    score += 1;
    findings.push({ severity: 'info', detail: 'Single canonical tag present (no duplicates)' });
  }

  return { criterion: 'canonical_url', criterion_label: 'Canonical URL Strategy', score: Math.max(0, Math.min(10, score)), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P1' };
}

// ─── Helper: analyze sitemap lastmod dates for content velocity ──────────────

export interface SitemapDateAnalysis {
  recentCount: number;
  isUniform: boolean;
  uniformDetail?: string;
  totalWithDates: number;
  distinctRecentDays: number;
}

export function countRecentSitemapDates(sitemapText: string): SitemapDateAnalysis {
  const lastmodMatches = sitemapText.match(/<lastmod>([^<]+)<\/lastmod>/gi) || [];
  if (lastmodMatches.length === 0) {
    return { recentCount: 0, isUniform: false, totalWithDates: 0, distinctRecentDays: 0 };
  }

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Parse all dates and group by day
  const dayCounts: Record<string, number> = {};
  let recentCount = 0;
  const recentDays = new Set<string>();

  for (const match of lastmodMatches) {
    const dateStr = match.replace(/<\/?lastmod>/gi, '').trim();
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const dayKey = date.toISOString().split('T')[0];
    dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;

    if (date >= ninetyDaysAgo) {
      recentCount++;
      recentDays.add(dayKey);
    }
  }

  // Detect uniform pattern: if most common day has >80% of all dated URLs
  const totalWithDates = Object.values(dayCounts).reduce((a, b) => a + b, 0);
  const maxDayCount = Math.max(...Object.values(dayCounts));
  const isUniform = totalWithDates >= 5 && maxDayCount / totalWithDates > 0.8;

  let uniformDetail: string | undefined;
  if (isUniform) {
    const topDay = Object.entries(dayCounts).find(([, count]) => count === maxDayCount)![0];
    uniformDetail = `${maxDayCount} of ${totalWithDates} URLs share lastmod date ${topDay} - likely auto-generated by build system`;
  }

  return {
    recentCount,
    isUniform,
    uniformDetail,
    totalWithDates,
    distinctRecentDays: recentDays.size,
  };
}

// ─── Blog URL extraction from sitemap ────────────────────────────────────────

const BLOG_PATH_PATTERNS = /\/(?:blog|articles?|insights?|guides?|resources?|news|posts?|learn|help|how-?to|tutorials?|case-stud|whitepapers?)\b/i;

const EXCLUDE_PATH_PATTERNS = /\/(?:tag|category|author|page|feed|wp-content|wp-admin|wp-json|cart|checkout|login|search|api|static|assets|_next)\b/i;

/**
 * Extract blog/content URLs from a sitemap XML string.
 * Includes URLs matching common blog path patterns, plus deep paths (2+ segments).
 * Sorts by lastmod descending (newest first), returns top N.
 */
export function extractBlogUrlsFromSitemap(sitemapText: string, domain: string, limit: number = 5): string[] {
  const urlBlocks = sitemapText.match(/<url>([\s\S]*?)<\/url>/gi) || [];
  const candidates: { url: string; lastmod: string }[] = [];
  const cleanDomain = domain.replace(/^www\./, '').toLowerCase();

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();

    // Must be same domain
    try {
      const parsed = new URL(url);
      const urlDomain = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (urlDomain !== cleanDomain) continue;

      // Skip root URL
      if (parsed.pathname === '/' || parsed.pathname === '') continue;

      const path = parsed.pathname.toLowerCase();

      // Exclude unwanted paths
      if (EXCLUDE_PATH_PATTERNS.test(path)) continue;

      // Include blog-like paths OR deep paths (2+ segments)
      const segments = path.split('/').filter(Boolean);
      const isBlogPath = BLOG_PATH_PATTERNS.test(path);
      const isDeepPath = segments.length >= 2;

      if (!isBlogPath && !isDeepPath) continue;
    } catch {
      continue;
    }

    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/i);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : '';

    candidates.push({ url, lastmod });
  }

  // Sort by lastmod descending (newest first), URLs without lastmod go last
  candidates.sort((a, b) => {
    if (a.lastmod && b.lastmod) return b.lastmod.localeCompare(a.lastmod);
    if (a.lastmod) return -1;
    if (b.lastmod) return 1;
    return 0;
  });

  return candidates.slice(0, limit).map(c => c.url);
}

/**
 * Extract the best sub-sitemap URL from a sitemapindex.
 * WordPress often uses sitemapindex pointing to post-sitemap.xml, page-sitemap.xml, etc.
 * Returns null if not a sitemapindex.
 */
export function extractSubSitemapUrl(sitemapText: string): string | null {
  if (!sitemapText.includes('<sitemapindex')) return null;

  const sitemapLocs = sitemapText.match(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi) || [];
  if (sitemapLocs.length === 0) return null;

  const urls = sitemapLocs.map(block => {
    const match = block.match(/<loc>([^<]+)<\/loc>/i);
    return match ? match[1].trim() : '';
  }).filter(Boolean);

  // Prefer post/blog/article sub-sitemap
  const preferred = urls.find(u => /post|blog|article/i.test(u));
  return preferred || urls[0] || null;
}

// Criterion 21: Content Velocity
function checkContentVelocity(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];
  const sitemap = data.sitemapXml;
  let score = 0;

  if (!sitemap || sitemap.status !== 200) {
    findings.push({ severity: 'medium', detail: 'No sitemap available to assess content velocity', fix: 'Create a sitemap.xml with lastmod dates to signal content publishing frequency' });
    return { criterion: 'content_velocity', criterion_label: 'Content Publishing Velocity', score: 0, status: 'fail', findings, fix_priority: 'P2' };
  }

  const analysis = countRecentSitemapDates(sitemap.text);

  if (analysis.totalWithDates === 0) {
    findings.push({ severity: 'medium', detail: 'No lastmod dates in sitemap', fix: 'Add lastmod dates to sitemap entries to signal content freshness' });
    return { criterion: 'content_velocity', criterion_label: 'Content Publishing Velocity', score: 2, status: 'fail', findings, fix_priority: 'P2' };
  }

  score += 2;
  findings.push({ severity: 'info', detail: `${analysis.totalWithDates} pages have lastmod dates` });

  // Use distinct recent days when lastmod dates are uniform (build-system artifact)
  const effectiveCount = analysis.isUniform ? analysis.distinctRecentDays : analysis.recentCount;

  if (analysis.isUniform) {
    findings.push({ severity: 'medium', detail: analysis.uniformDetail!, fix: 'Set genuine lastmod dates per page reflecting actual content changes, not build timestamps' });
  }

  if (effectiveCount >= 20) {
    score += 8;
    findings.push({ severity: 'info', detail: `${effectiveCount} ${analysis.isUniform ? 'distinct dates' : 'pages updated'} in last 90 days - excellent content velocity` });
  } else if (effectiveCount >= 10) {
    score += 5;
    findings.push({ severity: 'info', detail: `${effectiveCount} ${analysis.isUniform ? 'distinct dates' : 'pages updated'} in last 90 days - good velocity` });
  } else if (effectiveCount >= 5) {
    score += 3;
    findings.push({ severity: 'info', detail: `${effectiveCount} ${analysis.isUniform ? 'distinct dates' : 'pages updated'} in last 90 days` });
  } else if (effectiveCount >= 1) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${effectiveCount} ${analysis.isUniform ? 'distinct date(s)' : 'page(s) updated'} in last 90 days`, fix: 'Publish or update content more frequently to signal active maintenance' });
  } else {
    findings.push({ severity: 'medium', detail: 'No pages updated in the last 90 days', fix: 'Update existing content and publish new pages regularly' });
  }

  return { criterion: 'content_velocity', criterion_label: 'Content Publishing Velocity', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// Criterion 22: Schema Coverage (depth across types)
function checkSchemaCoverage(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'schema_coverage', criterion_label: 'Schema Coverage & Depth', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  // Use combined HTML for schema coverage (blog posts add Article, Person, FAQPage etc.)
  const combinedHtml = getCombinedHtml(data);
  const html = data.homepage.text;
  const ldJsonMatches = combinedHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let score = 0;

  if (ldJsonMatches.length === 0) {
    findings.push({ severity: 'critical', detail: 'No JSON-LD found - cannot assess schema coverage', fix: 'Add JSON-LD schema markup to improve AI engine understanding' });
    return { criterion: 'schema_coverage', criterion_label: 'Schema Coverage & Depth', score: 0, status: 'fail', findings, fix_priority: 'P1' };
  }

  const allSchemaText = ldJsonMatches.join(' ');
  const allSchemaLower = allSchemaText.toLowerCase();

  // Count distinct schema properties
  const propertyMatches = allSchemaText.match(/"[a-zA-Z@]+"\s*:/g) || [];
  const uniqueProperties = new Set(propertyMatches.map(p => p.replace(/[":\s]/g, '').toLowerCase()));

  if (uniqueProperties.size >= 15) {
    score += 2;
    findings.push({ severity: 'info', detail: `${uniqueProperties.size} unique schema properties used - rich schema depth` });
  } else if (uniqueProperties.size >= 5) {
    score += 2;
    findings.push({ severity: 'info', detail: `${uniqueProperties.size} unique schema properties found` });
  } else {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${uniqueProperties.size} schema properties`, fix: 'Add more properties to your schema types for richer AI understanding' });
  }

  // Organization depth (name, url, logo, contactPoint, sameAs, address, etc.)
  const orgProps = ['name', 'url', 'logo', 'contactpoint', 'sameas', 'address', 'telephone', 'description', 'founder', 'foundingdate'];
  const orgPropsFound = orgProps.filter(p => allSchemaLower.includes(`"${p}"`));
  if (orgPropsFound.length >= 5) {
    score += 2;
    findings.push({ severity: 'info', detail: `Organization schema has ${orgPropsFound.length}/10 key properties` });
  } else if (orgPropsFound.length >= 3) {
    score += 1;
    findings.push({ severity: 'low', detail: `Organization schema has only ${orgPropsFound.length}/10 key properties`, fix: 'Add more Organization properties: logo, contactPoint, sameAs, address' });
  } else {
    findings.push({ severity: 'medium', detail: `Organization schema has only ${orgPropsFound.length} key properties`, fix: 'Add essential Organization properties: name, url, logo, contactPoint, sameAs, address, telephone' });
  }

  // Article schema depth
  const articleProps = ['headline', 'datepublished', 'datemodified', 'author', 'image', 'description', 'publisher'];
  const articlePropsFound = articleProps.filter(p => allSchemaLower.includes(`"${p}"`));
  if (articlePropsFound.length >= 4) {
    score += 2;
    findings.push({ severity: 'info', detail: `Article schema has ${articlePropsFound.length}/7 key properties` });
  } else if (articlePropsFound.length >= 2) {
    score += 1;
    findings.push({ severity: 'low', detail: `Article schema has only ${articlePropsFound.length}/7 key properties`, fix: 'Add headline, datePublished, dateModified, author, image, and publisher to Article schema' });
  } else {
    findings.push({ severity: 'medium', detail: 'Article schema missing or has fewer than 2 key properties', fix: 'Add Article schema with headline, datePublished, author, and publisher properties' });
  }

  // @id linking (connected schema graph)
  const hasIdLinking = /"@id"\s*:/i.test(allSchemaText);
  if (hasIdLinking) {
    score += 2;
    findings.push({ severity: 'info', detail: '@id linking found - schema types are connected in a graph' });
  } else {
    findings.push({ severity: 'low', detail: 'No @id linking between schema types', fix: 'Use @id references to connect schema types (e.g., article.publisher -> organization)' });
  }

  // Number of distinct types
  const schemaTypes = ['organization', 'localbusiness', 'faqpage', 'service', 'article', 'webpage', 'website', 'breadcrumblist', 'howto', 'product', 'person', 'event', 'offer', 'review', 'aboutpage'];
  const foundTypes = schemaTypes.filter(t => allSchemaLower.includes(`"${t}"`));
  if (foundTypes.length >= 3) {
    score += 2;
    findings.push({ severity: 'info', detail: `${foundTypes.length} distinct schema types used: ${foundTypes.join(', ')}` });
  } else if (foundTypes.length >= 2) {
    score += 1;
    findings.push({ severity: 'low', detail: `Only ${foundTypes.length} distinct schema types used`, fix: 'Add more schema types (FAQPage, BreadcrumbList, Service) for comprehensive AI understanding' });
  } else {
    findings.push({ severity: 'medium', detail: `Only ${foundTypes.length} schema type(s) found - limited coverage`, fix: 'Add multiple schema types (Organization, WebSite, FAQPage, BreadcrumbList) for comprehensive AI understanding' });
  }

  return { criterion: 'schema_coverage', criterion_label: 'Schema Coverage & Depth', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P1' };
}

// Criterion 23: Speakable Schema (voice assistant readiness)
function checkSpeakableSchema(data: SiteData): CriterionResult {
  const findings: AuditFinding[] = [];

  if (!data.homepage) {
    findings.push({ severity: 'critical', detail: 'Could not fetch homepage' });
    return { criterion: 'speakable_schema', criterion_label: 'Speakable Schema', score: 0, status: 'not_found', findings, fix_priority: 'P2' };
  }

  const combinedHtml = getCombinedHtml(data);
  const ldJsonMatches = combinedHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let score = 0;

  if (ldJsonMatches.length === 0) {
    findings.push({ severity: 'critical', detail: 'No JSON-LD found - cannot assess speakable schema', fix: 'Add JSON-LD schema markup with SpeakableSpecification to indicate voice-readable content sections' });
    return { criterion: 'speakable_schema', criterion_label: 'Speakable Schema', score: 0, status: 'fail', findings, fix_priority: 'P2' };
  }

  const allSchemaText = ldJsonMatches.join(' ');
  const allSchemaLower = allSchemaText.toLowerCase();

  // Detect SpeakableSpecification type or "speakable" property
  const hasSpeakableType = /speakablespecification/i.test(allSchemaLower);
  const hasSpeakableProperty = /"speakable"\s*:/i.test(allSchemaText);
  const hasSpeakable = hasSpeakableType || hasSpeakableProperty;

  if (!hasSpeakable) {
    findings.push({ severity: 'medium', detail: 'No SpeakableSpecification schema found - voice assistants cannot identify readable sections', fix: 'Add SpeakableSpecification schema with cssSelector or xpath targeting key content sections (headlines, summaries, FAQ answers)' });
    return { criterion: 'speakable_schema', criterion_label: 'Speakable Schema', score: 0, status: 'fail', findings, fix_priority: 'P2' };
  }

  // Base: speakable detected
  score += 4;
  findings.push({ severity: 'info', detail: 'SpeakableSpecification schema detected - voice assistants can identify readable content' });

  // Check for cssSelector or xpath targeting
  const hasCssSelector = /"cssselector"/i.test(allSchemaLower);
  const hasXpath = /"xpath"/i.test(allSchemaLower);
  if (hasCssSelector || hasXpath) {
    score += 3;
    const targetType = hasCssSelector && hasXpath ? 'cssSelector and xpath' : hasCssSelector ? 'cssSelector' : 'xpath';
    findings.push({ severity: 'info', detail: `Speakable uses ${targetType} targeting for precise content selection` });
  } else {
    findings.push({ severity: 'low', detail: 'Speakable schema lacks cssSelector or xpath targeting', fix: 'Add cssSelector (e.g., ".article-headline, .article-summary") or xpath to precisely target speakable sections' });
  }

  // Check blog sample coverage
  if (data.blogSample && data.blogSample.length > 0) {
    const blogHtml = data.blogSample.map(p => p.text).join('\n');
    const blogHasSpeakable = /speakablespecification/i.test(blogHtml) || /"speakable"\s*:/i.test(blogHtml);
    if (blogHasSpeakable) {
      score += 3;
      findings.push({ severity: 'info', detail: 'Speakable schema also found in blog/content pages - comprehensive voice coverage' });
    } else {
      findings.push({ severity: 'low', detail: 'Speakable schema only on homepage, not found in blog/content pages', fix: 'Add SpeakableSpecification to article pages to make blog content voice-assistant readable' });
    }
  } else {
    // No blog samples - can't check, give partial credit
    findings.push({ severity: 'info', detail: 'No blog pages sampled - blog speakable coverage not assessed' });
  }

  return { criterion: 'speakable_schema', criterion_label: 'Speakable Schema', score: Math.min(10, score), status: score >= 7 ? 'pass' : score >= 4 ? 'partial' : 'fail', findings, fix_priority: score >= 7 ? 'P3' : 'P2' };
}

// ─── Raw data summary extraction (for AI narrative) ─────────────────────────

export function extractRawDataSummary(data: SiteData): RawDataSummary {
  const html = data.homepage?.text || '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Schema types
  const ldJsonMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const allSchemaText = ldJsonMatches.join(' ').toLowerCase();
  const schemaTypes = ['organization', 'localbusiness', 'faqpage', 'service', 'article', 'webpage', 'website', 'breadcrumblist', 'howto', 'product'];
  const foundSchemaTypes = schemaTypes.filter(t =>
    allSchemaText.includes(`"${t}"`) || allSchemaText.includes(`"@type":"${t}"`)
  );

  // Links
  const linkMatches = html.match(/<a[^>]*href="([^"]*)"[^>]*>/gi) || [];
  const internalLinks = linkMatches.filter(l => {
    const href = l.match(/href="([^"]*)"/)?.[1] || '';
    return href.startsWith('/') || href.includes(data.domain);
  });
  const externalLinks = linkMatches.filter(l => {
    const href = l.match(/href="([^"]*)"/)?.[1] || '';
    return href.startsWith('http') && !href.includes(data.domain);
  });

  // robots.txt AI crawlers
  const robotsText = (data.robotsTxt?.text || '').toLowerCase();
  const aiCrawlers = ['gptbot', 'claudebot', 'perplexitybot', 'anthropic', 'chatgpt'];
  const mentionedCrawlers = aiCrawlers.filter(c => robotsText.includes(c));
  const blockedCrawlers = mentionedCrawlers.filter(c => {
    const sectionRegex = new RegExp(`user-agent:\\s*${c}[^\\S\\n]*\\n([\\s\\S]*?)(?=user-agent:|$)`, 'i');
    const match = sectionRegex.exec(data.robotsTxt?.text || '');
    if (!match) return false;
    const section = match[1];
    if (/^allow:\s*\/\s*$/im.test(section)) return false;
    return /^disallow:\s*\/\s*$/im.test(section);
  });

  // Headings
  const hTagContent = (html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || []).map(h => h.replace(/<[^>]*>/g, ''));
  const questionHeadings = hTagContent.filter(h => h.includes('?') || /^(what|how|why|when|who|where|can|do|does|is|are|should)\s/i.test(h));
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;

  // Images
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithAlt = images.filter(img => /alt="[^"]+"/i.test(img));

  // Semantic elements
  const semanticChecks = ['main', 'article', 'nav', 'header', 'footer', 'section', 'time'];
  const foundElements = semanticChecks.filter(el => new RegExp(`<${el}[\\s>]`, 'i').test(html));

  return {
    domain: data.domain,
    protocol: data.protocol,
    homepage_length: html.length,
    homepage_text_length: text.trim().length,
    has_https: data.protocol === 'https',
    llms_txt_status: data.llmsTxt && !isHtmlResponse(data.llmsTxt) ? data.llmsTxt.status : null,
    llms_txt_length: data.llmsTxt?.status === 200 && !isHtmlResponse(data.llmsTxt) ? (data.llmsTxt.text.length) : 0,
    robots_txt_status: data.robotsTxt && !isHtmlResponse(data.robotsTxt) ? data.robotsTxt.status : null,
    robots_txt_snippet: (data.robotsTxt?.text || '').slice(0, 500),
    robots_txt_ai_crawlers: mentionedCrawlers,
    robots_txt_blocked_crawlers: blockedCrawlers,
    schema_types_found: foundSchemaTypes,
    schema_block_count: ldJsonMatches.length,
    faq_page_status: data.faqPage?.status ?? null,
    faq_page_length: data.faqPage?.status === 200 ? data.faqPage.text.length : 0,
    sitemap_status: data.sitemapXml?.status ?? null,
    internal_link_count: internalLinks.length,
    external_link_count: externalLinks.length,
    question_headings_count: questionHeadings.length,
    h1_count: h1Count,
    has_meta_description: /<meta[^>]*name="description"[^>]*>/i.test(html),
    has_title: /<title[^>]*>[^<]+<\/title>/i.test(html),
    has_phone: (() => {
      const phoneMatch = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);
      if (!phoneMatch) return false;
      // Context validation: tel: link, schema telephone, or nearby keywords
      return /href="tel:/i.test(html) || /"telephone"/i.test(html) ||
        /\b(phone|call|tel:|contact\s*us|fax|dial)\b/i.test(text);
    })(),
    has_address: /\d+\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|blvd|boulevard|lane|ln|way|court|ct)/i.test(text),
    has_org_schema: /organization|localbusiness/i.test(html),
    has_social_links: /sameas|linkedin\.com|facebook\.com|twitter\.com|x\.com/i.test(html),
    semantic_elements_found: foundElements,
    img_count: images.length,
    img_with_alt_count: imagesWithAlt.length,
    has_lang_attr: /lang="[a-z]{2}"/i.test(html),
    has_aria: /role="|aria-/i.test(html),
    has_breadcrumbs: /breadcrumb|aria-label="breadcrumb"/i.test(html),
    has_nav: /<nav[\s>]/i.test(html),
    has_footer: /<footer[\s>]/i.test(html),
    has_case_studies: /case\s+stud|testimonial|success\s+stor|client\s+stor/i.test(text),
    has_statistics: /\d+%|\d+\s*(patients|clients|customers|cases|years|professionals|specialists|companies|users|businesses|domains|audits)/i.test(text),
    has_expert_attribution: /written\s+by|authored\s+by|expert|specialist|board.certified|licensed/i.test(text),
    has_blog_section: /href="[^"]*\/(?:blog|articles|insights|guides|resources)\b[^"]*"/i.test(html),
    // New criteria fields
    has_date_modified_schema: /dateModified/i.test(html),
    time_element_count: (html.match(/<time[\s>]/gi) || []).length,
    sitemap_url_count: (data.sitemapXml?.text?.match(/<loc>/gi) || []).length,
    has_rss_feed: !!(data.rssFeed && data.rssFeed.status === 200 && !isHtmlResponse(data.rssFeed)),
    table_count: (html.match(/<table[\s>]/gi) || []).length,
    ordered_list_count: (html.match(/<ol[\s>]/gi) || []).length,
    unordered_list_count: (html.match(/<ul[\s>]/gi) || []).length,
    definition_pattern_count: (text.match(/\brefers?\s+to\b|\bdefined\s+as\b|\bknown\s+as\b/gi) || []).length,
    has_ai_txt: !!(data.aiTxt && data.aiTxt.status === 200 && !isHtmlResponse(data.aiTxt)),
    has_person_schema: /"@type"\s*:\s*"Person"/i.test(html),
    fact_data_point_count: (text.match(/\d+(?:\.\d+)?(?:\s*%|\s*\$|\s*USD)/g) || []).length,
    has_canonical: /<link[^>]*rel="canonical"/i.test(html),
    has_license_schema: /license|copyrightHolder/i.test(html) && /application\/ld\+json/i.test(html),
    sitemap_recent_lastmod_count: (() => {
      const analysis = countRecentSitemapDates(data.sitemapXml?.text || '');
      return analysis.isUniform ? analysis.distinctRecentDays : analysis.recentCount;
    })(),
    // Speakable schema fields
    has_speakable_schema: /speakablespecification/i.test(ldJsonMatches.join(' ')) || /"speakable"\s*:/i.test(ldJsonMatches.join(' ')),
    speakable_selector_count: (ldJsonMatches.join(' ').match(/"cssselector"|"xpath"/gi) || []).length,
    // Blog sample fields
    blog_sample_count: data.blogSample?.length ?? 0,
    blog_sample_urls: data.blogSample?.map(p => p.finalUrl || '').filter(Boolean) ?? [],
    blog_sample_schema_types: (() => {
      if (!data.blogSample || data.blogSample.length === 0) return [];
      const blogHtml = data.blogSample.map(p => p.text).join('\n');
      const blogLd = blogHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      const blogSchema = blogLd.join(' ').toLowerCase();
      const types = ['organization', 'localbusiness', 'faqpage', 'service', 'article', 'webpage', 'website', 'breadcrumblist', 'howto', 'product', 'person'];
      return types.filter(t => blogSchema.includes(`"${t}"`));
    })(),
    blog_sample_question_headings: (() => {
      if (!data.blogSample || data.blogSample.length === 0) return 0;
      const blogHtml = data.blogSample.map(p => p.text).join('\n');
      const hTags = (blogHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || []).map(h => h.replace(/<[^>]*>/g, ''));
      return hTags.filter(h => h.includes('?') || /^(what|how|why|when|who|where|can|do|does|is|are|should)\s/i.test(h)).length;
    })(),
    blog_sample_faq_schema_found: (() => {
      if (!data.blogSample || data.blogSample.length === 0) return false;
      const blogHtml = data.blogSample.map(p => p.text).join('\n');
      return /faqpage/i.test(blogHtml) && /application\/ld\+json/i.test(blogHtml);
    })(),
  };
}

// ─── Main audit function ────────────────────────────────────────────────────

/**
 * Run all 23 criteria checks using pre-fetched site data.
 * All functions are synchronous (no HTTP calls) - data was already fetched.
 */
export function auditSiteFromData(data: SiteData): CriterionResult[] {
  return [
    checkLlmsTxt(data),
    checkSchemaMarkup(data),
    checkQAFormat(data),
    checkCleanHTML(data),
    checkEntityConsistency(data),
    checkRobotsTxt(data),
    checkFAQSection(data),
    checkOriginalData(data),
    checkInternalLinking(data),
    checkSemanticHTML(data),
    checkContentFreshness(data),
    checkSitemapCompleteness(data),
    checkRssFeed(data),
    checkTableListExtractability(data),
    checkDefinitionPatterns(data),
    checkDirectAnswerDensity(data),
    checkContentLicensing(data),
    checkAuthorSchemaDepth(data),
    checkFactDensity(data),
    checkCanonicalUrl(data),
    checkContentVelocity(data),
    checkSchemaCoverage(data),
    checkSpeakableSchema(data),
  ];
}

/**
 * Legacy entry point: fetches data and runs all checks.
 * Used by analyzer.ts for the /api/aeo/analyze endpoint.
 */
export async function auditSite(targetUrl: string): Promise<CriterionResult[]> {
  const url = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
  const domain = url.hostname.replace(/^www\./, '');
  const data = await prefetchSiteData(domain);
  return auditSiteFromData(data);
}
